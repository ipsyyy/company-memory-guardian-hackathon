import { config } from 'dotenv';
config({ path: '.env.local', override: true, quiet: true });

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const repo = 'langchain-ai/langchain';
const company = 'LangChain Public Engineering';
const target = 500;
const checkpoint = '.curated-500-state.json';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const headers: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'company-memory-guardian'
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function github<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (res.ok) return await res.json() as T;

    const body = (await res.text()).slice(0, 300);
    if (![403, 429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`GitHub ${res.status}: ${body}`);
    }

    const reset = Number(res.headers.get('x-ratelimit-reset') || 0);
    const remaining = Number(res.headers.get('x-ratelimit-remaining') || 1);
    const delay = remaining === 0
      ? Math.max(1000, reset * 1000 - Date.now() + 1500)
      : Math.min(60000, 2000 * 2 ** attempt);

    console.log(`GitHub ${res.status}; retry in ${Math.ceil(delay / 1000)}s`);
    await sleep(delay);
  }
  throw new Error(`GitHub retries exhausted: ${path}`);
}

type Item = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user?: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  pull_request?: unknown;
};

type Comment = {
  id: number;
  body: string | null;
  user?: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at?: string;
  submitted_at?: string;
  state?: string;
};

async function pages<T>(path: string, maxPages = 5): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const batch = await github<T[]>(
      `${path}${sep}per_page=100&page=${page}`
    );
    result.push(...batch);
    if (batch.length < 100) break;
  }
  return result;
}

const hash = (s: string) =>
  createHash('sha256').update(s).digest('hex');

async function main() {
  const { data: companies, error: companyError } = await db
    .from('companies')
    .select('id')
    .eq('name', company)
    .limit(1);

  if (companyError) throw companyError;
  if (!companies?.length) throw new Error('Company not found');
  const companyId = companies[0].id;

  const { data: existing, error: existingError } = await db
    .from('github_records')
    .select('github_id,body,source_url,title')
    .eq('company_id', companyId)
    .limit(10000);

  if (existingError) throw existingError;

  const eligible = new Set(
    (existing || [])
      .filter(r => r.source_url && r.title && (r.body || '').length >= 200)
      .map(r => String(r.github_id))
  );

  const state: { done: string[]; failed: Record<string, string> } =
    existsSync(checkpoint)
      ? JSON.parse(await readFile(checkpoint, 'utf8'))
      : { done: [], failed: {} };

  const done = new Set(state.done);
  const save = async () => {
    state.done = [...done];
    await writeFile(checkpoint, JSON.stringify(state, null, 2));
  };

  console.log(`Starting: ${eligible.size}/${target} eligible records`);

  const queries = [
    'repo:langchain-ai/langchain is:issue comments:>=3 created:2026-01-01..2026-10-28',
    'repo:langchain-ai/langchain is:pr comments:>=3 created:2026-01-01..2026-10-28',
    'repo:langchain-ai/langchain is:issue comments:>=2 created:2025-01-01..2025-12-31',
    'repo:langchain-ai/langchain is:pr comments:>=2 created:2025-01-01..2025-12-31'
  ];

  for (const query of queries) {
    if (eligible.size >= target) break;

    console.log(`Searching: ${query}`);
    const params = new URLSearchParams({
      q: query,
      sort: 'comments',
      order: 'desc',
      per_page: '100'
    });

    const first = await github<{
      items: Item[];
      total_count: number;
      incomplete_results: boolean;
    }>(`/search/issues?${params}`);

    if (first.incomplete_results) {
      console.warn('Search results may be incomplete.');
    }

    const candidates = [...first.items];
    const maxPages = Math.min(10, Math.ceil(first.total_count / 100));

    for (let page = 2; page <= maxPages; page++) {
      const next = await github<{ items: Item[] }>(
        `/search/issues?${params}&page=${page}`
      );
      candidates.push(...next.items);
    }

    for (const item of candidates) {
      if (eligible.size >= target) break;

      const id = String(item.id);
      if (eligible.has(id) || done.has(id)) continue;
      if (!item.body || item.body.length < 200) continue;

      try {
        const { data: record, error: recordError } = await db
          .from('github_records')
          .upsert({
            company_id: companyId,
            github_id: item.id,
            record_type: item.pull_request ? 'pull_request' : 'issue',
            number: item.number,
            title: item.title,
            body: item.body,
            state: item.state,
            author: item.user?.login ?? null,
            source_url: item.html_url,
            github_created_at: item.created_at,
            github_updated_at: item.updated_at,
            synced_at: new Date().toISOString()
          }, { onConflict: 'company_id,github_id' })
          .select('id')
          .single();

        if (recordError) throw recordError;

        const comments = await pages<Comment>(
          `/repos/${repo}/issues/${item.number}/comments`
        );

        for (let i = 0; i < comments.length; i += 100) {
          const rows = comments.slice(i, i + 100).map(c => ({
            company_id: companyId,
            github_record_id: record.id,
            github_comment_id: c.id,
            author: c.user?.login ?? null,
            body: c.body,
            source_url: c.html_url,
            github_created_at: c.created_at,
            github_updated_at: c.updated_at ?? c.created_at,
            synced_at: new Date().toISOString()
          }));

          const result = await db.from('github_comments')
            .upsert(rows, { onConflict: 'company_id,github_comment_id' });

          if (result.error) throw result.error;
        }

        let reviewCount = 0;

        if (item.pull_request) {
          for (const [kind, path] of [
            ['review', `/repos/${repo}/pulls/${item.number}/reviews`],
            ['review_comment', `/repos/${repo}/pulls/${item.number}/comments`]
          ] as const) {
            const events = await pages<Comment>(path);
            reviewCount += events.length;

            for (let i = 0; i < events.length; i += 100) {
              const rows = events.slice(i, i + 100).map(c => ({
                company_id: companyId,
                github_record_id: record.id,
                event_kind: kind,
                github_event_id: c.id,
                author: c.user?.login ?? null,
                body: c.body,
                state: c.state ?? null,
                source_url: c.html_url ??
                  `https://github.com/${repo}/pull/${item.number}`,
                github_created_at: c.submitted_at ?? c.created_at ?? null,
                github_updated_at:
                  c.updated_at ?? c.submitted_at ?? c.created_at ?? null,
                synced_at: new Date().toISOString()
              }));

              const result = await db.from('github_review_events')
                .upsert(rows, {
                  onConflict: 'company_id,event_kind,github_event_id'
                });

              if (result.error) throw result.error;
            }
          }
        }

        const fingerprint = hash(JSON.stringify([
          item.title, item.body, item.state, item.updated_at,
          comments.length, reviewCount
        ]));

        const { data: job, error: jobError } = await db
          .from('github_embedding_jobs')
          .select('content_hash')
          .eq('github_record_id', record.id)
          .maybeSingle();

        if (jobError) throw jobError;

        if (job?.content_hash !== fingerprint) {
          const result = await db.from('github_embedding_jobs')
            .upsert({
              github_record_id: record.id,
              company_id: companyId,
              content_hash: fingerprint,
              status: 'pending',
              attempts: 0,
              last_error: null,
              updated_at: new Date().toISOString()
            }, { onConflict: 'github_record_id' });

          if (result.error) throw result.error;
        }

        eligible.add(id);
        done.add(id);
        delete state.failed[id];
        await save();

        console.log(
          `[${eligible.size}/${target}] #${item.number} ` +
          `${item.pull_request ? 'PR' : 'issue'} ` +
          `(${comments.length} comments, ${reviewCount} reviews)`
        );
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : JSON.stringify(error);

        state.failed[id] = message;
        await save();
        console.error(`Failed #${item.number}: ${message}`);
      }
    }
  }

  console.log(`Finished: ${eligible.size}/${target} eligible records`);
  console.log(`Failures: ${Object.keys(state.failed).length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
