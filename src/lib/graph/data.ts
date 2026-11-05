import { createClient } from "@supabase/supabase-js";
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type RecordRow = { id: string; number: number; title: string; author: string | null; state: string | null; record_type: string; source_url: string; github_created_at: string | null };
type CommentRow = { id: string; github_record_id: string; author: string | null; source_url: string; body: string | null };
type GraphNode = { data: { id: string; label: string; kind: string; url?: string; details?: string; state?: string } };
type GraphEdge = { data: { id: string; source: string; target: string; label: string } };

export async function getKnowledgeGraph() {
  const { data: syncStates, error: syncError } = await supabaseAdmin.from("github_sync_state").select("company_id").eq("repository", "langchain-ai/langchain").limit(1);
  if (syncError) throw syncError;
  const companyId = syncStates?.[0]?.company_id;
  if (!companyId) return { nodes: [], edges: [], stats: { issues: 0, pullRequests: 0, authors: 0, comments: 0 } };
  const { data: records, error: recordError } = await supabaseAdmin.from("github_records")
    .select("id,number,title,author,state,record_type,source_url,github_created_at")
    .eq("company_id", companyId).order("github_created_at", { ascending: false }).limit(150);
  if (recordError) throw recordError;
  const rows = (records ?? []) as RecordRow[];
  const ids = rows.map((r) => r.id);
  const comments: CommentRow[] = [];
  if (ids.length) {
    const { data, error } = await supabaseAdmin.from("github_comments")
      .select("id,github_record_id,author,source_url,body")
      .eq("company_id", companyId).in("github_record_id", ids).limit(500);
    if (error) throw error;
    comments.push(...((data ?? []) as CommentRow[]));
  }
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const people = new Set<string>();
  for (const record of rows) {
    const rid = `record:${record.id}`;
    nodes.push({ data: { id: rid, label: `#${record.number} ${record.title}`.slice(0, 85), kind: record.record_type, url: record.source_url, details: record.title, state: record.state ?? undefined } });
    if (record.author) {
      const pid = `person:${record.author.toLowerCase()}`;
      if (!people.has(pid)) { people.add(pid); nodes.push({ data: { id: pid, label: record.author, kind: "person", url: `https://github.com/${encodeURIComponent(record.author)}`, details: "Public GitHub contributor; not an inferred internal owner" } }); }
      edges.push({ data: { id: `authored:${record.id}`, source: pid, target: rid, label: "opened" } });
    }
  }
  for (const comment of comments) {
    const cid = `comment:${comment.id}`;
    const rid = `record:${comment.github_record_id}`;
    nodes.push({ data: { id: cid, label: (comment.body || "Comment").replace(/\s+/g, " ").slice(0, 65), kind: "comment", url: comment.source_url, details: (comment.body || "").slice(0, 1500) } });
    edges.push({ data: { id: `comment-on:${comment.id}`, source: cid, target: rid, label: "comment on" } });
    if (comment.author) {
      const pid = `person:${comment.author.toLowerCase()}`;
      if (!people.has(pid)) { people.add(pid); nodes.push({ data: { id: pid, label: comment.author, kind: "person", url: `https://github.com/${encodeURIComponent(comment.author)}`, details: "Public GitHub contributor; not an inferred internal owner" } }); }
      edges.push({ data: { id: `comment-by:${comment.id}`, source: pid, target: cid, label: "wrote" } });
    }
  }
  return { nodes, edges, stats: { issues: rows.filter((r) => r.record_type === "issue").length, pullRequests: rows.filter((r) => r.record_type === "pull_request").length, authors: people.size, comments: comments.length } };
}
