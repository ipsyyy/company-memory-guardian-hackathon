import OpenAI from "openai";
import { supabaseService as supabaseAdmin } from "../supabase-service";

const OWNER = "langchain-ai";
const REPO = "langchain";
const REPOSITORY = `${OWNER}/${REPO}`;
const API = `https://api.github.com/repos/${REPOSITORY}`;
const COMPANY = "LangChain Public Engineering";
const PAGE_SIZE = 30;

type GitHubUser = { login: string } | null;
type Issue = {
  id: number; number: number; title: string; body: string | null;
  state: string; user: GitHubUser; html_url: string;
  created_at: string; updated_at: string; pull_request?: unknown;
};
type Comment = {
  id: number; body: string | null; user: GitHubUser; html_url: string;
  created_at: string; updated_at: string;
};

async function github<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "company-memory-guardian",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`GitHub API ${response.status}: ${details}`);
  }
  return (await response.json()) as T;
}

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

async function embedAndStore(companyId: string, recordId: string, text: string) {
  const input = text.slice(0, 7000).trim();
  if (!input) return;
  const openai = new OpenAI();
  const result = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });
  const { error: removeError } = await supabaseAdmin
    .from("document_chunks")
    .delete()
    .eq("github_record_id", recordId);
  if (removeError) throw removeError;
  const { error } = await supabaseAdmin.from("document_chunks").insert({
    company_id: companyId,
    document_id: null,
    github_record_id: recordId,
    chunk_index: 0,
    content: input,
    embedding: result.data[0].embedding,
  });
  if (error) throw error;
}

export async function syncLangChain(options?: { maxPages?: number; commentsPerRecord?: number }) {
  const maxPages = Math.max(1, Math.min(options?.maxPages ?? 2, 10));
  const commentsPerRecord = Math.max(0, Math.min(options?.commentsPerRecord ?? 10, 100));
  const { data: found, error: findError } = await supabaseAdmin
    .from("companies").select("id").eq("name", COMPANY).limit(1);
  if (findError) throw findError;
  let companyId: string = found?.[0]?.id;
  if (!companyId) {
    const { data, error } = await supabaseAdmin
      .from("companies").insert({ name: COMPANY }).select("id").single();
    if (error) throw error;
    companyId = data.id;
  }

  const { data: previous, error: stateError } = await supabaseAdmin
    .from("github_sync_state").select("last_synced_at")
    .eq("company_id", companyId).maybeSingle();
  if (stateError) throw stateError;
  const since = previous?.last_synced_at as string | null;
  const startedAt = new Date().toISOString();
  let fetched = 0, created = 0, updated = 0, skipped = 0, commentsSaved = 0;
  let pages = 0;

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({ state: "all", sort: "updated", direction: "desc", per_page: String(PAGE_SIZE), page: String(page) });
    const issues = await github<Issue[]>(`/issues?${params}`);
    if (!issues.length) break;
    pages++;
    for (const issue of issues) {
      // GitHub's issues endpoint includes pull requests, so both are collected.
      if (since && new Date(issue.updated_at).getTime() <= new Date(since).getTime()) {
        skipped++;
        continue;
      }
      fetched++;
      const type = issue.pull_request ? "pull_request" : "issue";
      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("github_records").select("id, github_updated_at")
        .eq("company_id", companyId).eq("github_id", issue.id).maybeSingle();
      if (lookupError) throw lookupError;
      const { data: saved, error: upsertError } = await supabaseAdmin
        .from("github_records")
        .upsert({
          company_id: companyId, github_id: issue.id, record_type: type,
          number: issue.number, title: issue.title, body: issue.body,
          state: issue.state, author: issue.user?.login ?? null,
          source_url: issue.html_url, github_created_at: issue.created_at,
          github_updated_at: issue.updated_at, synced_at: startedAt,
        }, { onConflict: "company_id,github_id" })
        .select("id").single();
      if (upsertError) throw upsertError;
      if (existing) updated++; else created++;

      let comments: Comment[] = [];
      if (commentsPerRecord > 0) {
        comments = await github<Comment[]>(`/issues/${issue.number}/comments?per_page=${commentsPerRecord}`);
        if (comments.length) {
          const { error: commentError } = await supabaseAdmin.from("github_comments").upsert(
            comments.map((c) => ({
              company_id: companyId, github_record_id: saved.id,
              github_comment_id: c.id, author: c.user?.login ?? null,
              body: c.body, source_url: c.html_url,
              github_created_at: c.created_at, github_updated_at: c.updated_at,
              synced_at: startedAt,
            })),
            { onConflict: "company_id,github_comment_id" }
          );
          if (commentError) throw commentError;
          commentsSaved += comments.length;
        }
      }
      const evidence = [
        `Repository: ${REPOSITORY}`, `Type: ${type}`, `Title: ${issue.title}`,
        `Status: ${issue.state}`, `Author: ${issue.user?.login ?? "unknown"}`,
        `Source: ${issue.html_url}`, `Description:\n${compact(issue.body)}`,
        ...comments.map((c) => `Comment by ${c.user?.login ?? "unknown"} (${c.html_url}): ${compact(c.body)}`),
      ].join("\n\n");
      await embedAndStore(companyId, saved.id, evidence);
    }
    if (issues.length < PAGE_SIZE) break;
    if (since && issues.every((issue) => new Date(issue.updated_at).getTime() <= new Date(since).getTime())) break;
  }

  // Do not advance the cursor if we stopped at a page limit with more changes possible.
  // This prevents skipping records between batches; duplicates are handled by upsert.
  const lastSyncedAt = pages < maxPages ? startedAt : since;
  const { error: syncError } = await supabaseAdmin.from("github_sync_state").upsert({
    company_id: companyId, repository: REPOSITORY,
    last_synced_at: lastSyncedAt, updated_at: startedAt,
  }, { onConflict: "company_id" });
  if (syncError) throw syncError;
  return { repository: REPOSITORY, companyId, pages, fetched, created, updated, skipped, commentsSaved, cursorAdvanced: lastSyncedAt === startedAt };
}
