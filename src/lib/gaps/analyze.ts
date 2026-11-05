import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
type RecordRow = { id: string; number: number; title: string; body: string | null; author: string | null; state: string | null; record_type: string; source_url: string };
type CommentRow = { github_record_id: string; author: string | null; body: string | null; source_url: string };
export type GapFinding = { id: string; recordNumber: number; recordTitle: string; recordUrl: string; category: "missing_reasoning" | "unanswered_question" | "concentrated_discussion"; confidence: "low" | "medium"; headline: string; explanation: string; evidenceUrls: string[]; participants: number; commentCount: number };

const questionPattern = /\?|\b(how|why|what|when|could someone|any update|is there a way)\b/i;
const rationalePattern = /\b(because|reason|rationale|trade.?off|instead of|due to|decided|decision|we chose|chosen|motivation)\b/i;
const bots = /\[bot\]$|^dependabot$|^github-actions$/i;

export function analyzeKnowledgeGaps(records: RecordRow[], comments: CommentRow[]): GapFinding[] {
  const grouped = new Map<string, CommentRow[]>();
  for (const comment of comments) grouped.set(comment.github_record_id, [...(grouped.get(comment.github_record_id) ?? []), comment]);
  const findings: GapFinding[] = [];
  for (const record of records) {
    const thread = grouped.get(record.id) ?? [];
    const participants = new Set([record.author, ...thread.map(c => c.author)].filter((v): v is string => Boolean(v) && !bots.test(v!)).map(v => v.toLowerCase()));
    const discussion = [record.body ?? "", ...thread.map(c => c.body ?? "")].join("\n");
    const urls = [record.source_url, ...thread.slice(0, 3).map(c => c.source_url)].filter(u => /^https:\/\/github\.com\//.test(u));
    const base = { recordNumber: record.number, recordTitle: record.title, recordUrl: record.source_url, evidenceUrls: [...new Set(urls)], participants: participants.size, commentCount: thread.length };
    // Signals are deliberately narrow: public activity cannot establish internal knowledge ownership.
    if (record.record_type === "pull_request" && record.state === "closed" && thread.length > 0 && !rationalePattern.test(discussion)) {
      findings.push({ ...base, id: `${record.id}:reasoning`, category: "missing_reasoning", confidence: "low", headline: "Decision rationale not explicit in sampled discussion", explanation: "This closed pull request has discussion, but the sampled text does not explicitly describe a reason or trade-off. It may exist in code reviews, commits, or discussions not ingested.", });
    }
    if (record.record_type === "issue" && record.state === "open" && questionPattern.test(`${record.title}\n${record.body ?? ""}`) && thread.length === 0) {
      findings.push({ ...base, id: `${record.id}:question`, category: "unanswered_question", confidence: "medium", headline: "Open question without sampled replies", explanation: "The issue asks a question and no comments were synchronized for it. This is a review candidate, not proof that no answer exists elsewhere.", });
    }
    if (thread.length >= 2 && participants.size === 1) {
      findings.push({ ...base, id: `${record.id}:concentration`, category: "concentrated_discussion", confidence: "low", headline: "Discussion visible from one contributor", explanation: "The issue author and sampled comments show one distinct non-bot contributor. This may indicate a handoff documentation risk, not exclusive knowledge or internal ownership.", });
    }
  }
  return findings.sort((a,b) => (a.confidence === "medium" ? -1 : 0) - (b.confidence === "medium" ? -1 : 0) || a.recordNumber - b.recordNumber);
}

export async function getKnowledgeGaps() {
  const { data: sync, error: syncError } = await db.from("github_sync_state").select("company_id").eq("repository", "langchain-ai/langchain").limit(1);
  if (syncError) throw syncError;
  const companyId = sync?.[0]?.company_id;
  if (!companyId) throw new Error("No LangChain GitHub sync found. Run npm run sync:github.");
  const { data: records, error: recordError } = await db.from("github_records").select("id,number,title,body,author,state,record_type,source_url").eq("company_id", companyId).order("github_updated_at", { ascending: false }).limit(150);
  if (recordError) throw recordError;
  const rows = (records ?? []) as RecordRow[];
  let comments: CommentRow[] = [];
  if (rows.length) {
    const { data, error } = await db.from("github_comments").select("github_record_id,author,body,source_url").eq("company_id", companyId).in("github_record_id", rows.map(r => r.id)).limit(1000);
    if (error) throw error;
    comments = (data ?? []) as CommentRow[];
  }
  const findings = analyzeKnowledgeGaps(rows, comments);
  return { repository: "langchain-ai/langchain", scannedRecords: rows.length, scannedComments: comments.length, findings, summary: { missingReasoning: findings.filter(f => f.category === "missing_reasoning").length, unansweredQuestions: findings.filter(f => f.category === "unanswered_question").length, concentratedDiscussion: findings.filter(f => f.category === "concentrated_discussion").length }, limitations: "Heuristic signals based on a bounded sample of public GitHub issues and issue-style comments. Review comments, commits, discussions, and private knowledge may be absent. Findings are not confirmed organizational risks." };
}
