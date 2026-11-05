import { config } from 'dotenv';
config({ path: '.env.local', override: true, quiet: true });

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function fetchAll(table: string, columns: string, companyId: string) {
  const rows: any[] = [];

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq('company_id', companyId)
      .range(offset, offset + 499);

    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }

  return rows;
}

async function main() {
  const { data: company, error } = await db
    .from('companies')
    .select('id')
    .eq('name', 'LangChain Public Engineering')
    .single();

  if (error) throw error;

  const records = await fetchAll(
    'github_records',
    'id,number,title,body,record_type,source_url,github_updated_at',
    company.id
  );

  const comments = await fetchAll(
    'github_comments',
    'github_record_id,author,body,source_url,github_created_at',
    company.id
  );

  const reviews = await fetchAll(
    'github_review_events',
    'github_record_id,event_kind,author,body,state,source_url,github_created_at',
    company.id
  );

  const byRecord = (rows: any[]) => {
    const map = new Map<string, any[]>();
    for (const row of rows) {
      const list = map.get(row.github_record_id) || [];
      list.push(row);
      map.set(row.github_record_id, list);
    }
    return map;
  };

  const commentMap = byRecord(comments);
  const reviewMap = byRecord(reviews);

  const selected = records
    .filter(r => r.source_url && r.title && (r.body || '').length >= 200)
    .sort((a, b) =>
      (commentMap.get(b.id)?.length || 0) -
      (commentMap.get(a.id)?.length || 0)
    )
    .slice(0, 500);

  const documents = selected.map(r => {
    const discussion = [
      ...(commentMap.get(r.id) || []),
      ...(reviewMap.get(r.id) || [])
    ].filter(x => x.body)
     .sort((a, b) =>
       String(a.github_created_at || '').localeCompare(
         String(b.github_created_at || '')
       )
     )
     .slice(0, 50);

    const text = [
      `Repository: langchain-ai/langchain`,
      `Type: ${r.record_type}`,
      `Number: #${r.number}`,
      `Title: ${r.title}`,
      `Source URL: ${r.source_url}`,
      `Updated: ${r.github_updated_at}`,
      '',
      'Original description:',
      (r.body || '').slice(0, 12000),
      '',
      'Discussion and review history:',
      ...discussion.map(x =>
        `[${x.github_created_at || 'unknown'}] ${x.author || 'unknown'} ` +
        `(${x.event_kind || 'comment'})\n` +
        `Source: ${x.source_url}\n` +
        String(x.body).slice(0, 2500)
      )
    ].join('\n');

    return {
      id: String(r.id),
      number: r.number,
      title: r.title,
      source_url: r.source_url,
      text: text.slice(0, 30000)
    };
  });

  await writeFile(
    'cognee-service/data/discussions-500.json',
    JSON.stringify(documents, null, 2)
  );

  console.log(`Exported ${documents.length} discussions`);
  console.log(`Available comments: ${comments.length}`);
  console.log(`Available review events: ${reviews.length}`);
  console.log('Output: cognee-service/data/discussions-500.json');
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
