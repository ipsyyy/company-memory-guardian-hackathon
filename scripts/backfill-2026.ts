import { config } from 'dotenv';
config({path:'.env.local',override:true,quiet:true});
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const repo='langchain-ai/langchain', company='LangChain Public Engineering';
const from='2026-01-01', to='2026-10-28';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const base='https://api.github.com';
const headers:Record<string,string>={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'company-memory-guardian'};
if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function get<T>(path:string):Promise<T>{
 for(let attempt=0;attempt<7;attempt++){
  let res:Response;
  try{res=await fetch(base+path,{headers,cache:'no-store'});}catch(e){if(attempt===6)throw e;await pause(1500*2**attempt);continue;}
  if(res.ok)return await res.json() as T;
  const body=(await res.text()).slice(0,240);
  const remaining=Number(res.headers.get('x-ratelimit-remaining')??'1');
  const reset=Number(res.headers.get('x-ratelimit-reset')??'0');
  if([403,429,500,502,503,504].includes(res.status)&&attempt<6){
   const delay=remaining===0?Math.max(1000,reset*1000-Date.now()+1500):Math.min(120000,2000*2**attempt);
   console.error(`GitHub ${res.status} ${path}; retrying after ${Math.ceil(delay/1000)}s: ${body}`);
   await pause(delay);continue;
  }
  throw new Error(`GitHub ${res.status} ${path}: ${body}`);
 }
 throw new Error('GitHub retries exhausted');
}
const qs=(v:Record<string,string|number>)=>new URLSearchParams(Object.entries(v).map(([k,x])=>[k,String(x)])).toString();
async function allPages<T>(path:string,maxPages=100):Promise<T[]>{
 const result:T[]=[];
 for(let page=1;page<=maxPages;page++){
  const separator=path.includes('?')?'&':'?';
  const chunk=await get<T[]>(`${path}${separator}per_page=100&page=${page}`);
  result.push(...chunk);
  if(chunk.length<100)return result;
 }
 throw new Error(`Exceeded ${maxPages} pages for ${path}; refusing silent truncation`);
}
type Item={id:number;number:number;title:string;body:string|null;state:string;user?:{login:string}|null;html_url:string;created_at:string;updated_at:string;pull_request?:unknown};
type Comment={id:number;body:string|null;user?:{login:string}|null;html_url:string;created_at:string;updated_at?:string;state?:string;submitted_at?:string};
type Search={total_count:number;incomplete_results:boolean;items:Item[]};
async function ensureCompany(){const q=await db.from('companies').select('id').eq('name',company).limit(1);if(q.error)throw q.error;if(q.data?.[0])return q.data[0].id as string;const c=await db.from('companies').insert({name:company}).select('id').single();if(c.error)throw c.error;return c.data.id as string;}
function hash(s:string){return createHash('sha256').update(s).digest('hex');}
async function storeComments(companyId:string,recordId:string,number:number,pr:boolean){
 const issueComments=await allPages<Comment>(`/repos/${repo}/issues/${number}/comments`);
 for(let i=0;i<issueComments.length;i+=100){const rows=issueComments.slice(i,i+100).map(c=>({company_id:companyId,github_record_id:recordId,github_comment_id:c.id,author:c.user?.login??null,body:c.body,source_url:c.html_url,github_created_at:c.created_at,github_updated_at:c.updated_at??c.created_at,synced_at:new Date().toISOString()}));const r=await db.from('github_comments').upsert(rows,{onConflict:'company_id,github_comment_id'});if(r.error)throw r.error;}
 let reviewCount=0;
 if(pr){
  for(const [kind,path] of [['review',`/repos/${repo}/pulls/${number}/reviews`],['review_comment',`/repos/${repo}/pulls/${number}/comments`]] as const){
   const events=await allPages<Comment>(path);reviewCount+=events.length;
   for(let i=0;i<events.length;i+=100){const rows=events.slice(i,i+100).map(c=>({company_id:companyId,github_record_id:recordId,event_kind:kind,github_event_id:c.id,author:c.user?.login??null,body:c.body,state:c.state??null,source_url:c.html_url??`https://github.com/${repo}/pull/${number}`,github_created_at:c.submitted_at??c.created_at??null,github_updated_at:c.updated_at??c.submitted_at??c.created_at??null,synced_at:new Date().toISOString()}));const r=await db.from('github_review_events').upsert(rows,{onConflict:'company_id,event_kind,github_event_id'});if(r.error)throw r.error;}
  }
 }
 return {comments:issueComments.length,reviews:reviewCount};
}
async function storeItem(companyId:string,item:Item){
 const previous=await db.from('github_records').select('id,github_updated_at').eq('company_id',companyId).eq('github_id',item.id).maybeSingle();if(previous.error)throw previous.error;
 // Skip unchanged records only when their embedding job already exists.
 // This avoids skipping records from the older prototype import.
 if(previous.data != null && Date.parse(previous.data.github_updated_at ?? '') === Date.parse(item.updated_at)){
  const existingJob=await db.from('github_embedding_jobs')
   .select('github_record_id')
   .eq('github_record_id',previous.data.id)
   .maybeSingle();
  if(existingJob.error)throw existingJob.error;
  if(existingJob.data)return {created:false,comments:0,reviews:0,skipped:true};
 }
 // New or changed records require a full discussion refresh.
 const record=await db.from('github_records').upsert({company_id:companyId,github_id:item.id,record_type:item.pull_request?'pull_request':'issue',number:item.number,title:item.title,body:item.body,state:item.state,author:item.user?.login??null,source_url:item.html_url,github_created_at:item.created_at,github_updated_at:item.updated_at,synced_at:new Date().toISOString()},{onConflict:'company_id,github_id'}).select('id').single();if(record.error)throw record.error;
 const counts=await storeComments(companyId,record.data.id,item.number,Boolean(item.pull_request));
 const fingerprint=hash(JSON.stringify([item.title,item.body,item.state,item.updated_at,counts.comments,counts.reviews]));
 const job=await db.from('github_embedding_jobs').select('content_hash,status').eq('github_record_id',record.data.id).maybeSingle();if(job.error)throw job.error;
 if(job.data?.content_hash!==fingerprint){const r=await db.from('github_embedding_jobs').upsert({github_record_id:record.data.id,company_id:companyId,content_hash:fingerprint,status:'pending',attempts:0,last_error:null,updated_at:new Date().toISOString()},{onConflict:'github_record_id'});if(r.error)throw r.error;}
 return {created:!previous.data, ...counts};
}
const statePath='.backfill-2026-state.json';
type State={completed:string[];failed:Record<string,string>;processed:number;comments:number;reviews:number};
async function loadState():Promise<State>{if(!existsSync(statePath))return {completed:[],failed:{},processed:0,comments:0,reviews:0};return JSON.parse(await readFile(statePath,'utf8')) as State;}
async function save(s:State){await writeFile(statePath,JSON.stringify(s,null,2));}
function daysBetween(){const a: string[]=[];for(let d=new Date(`${from}T00:00:00Z`);d<=new Date(`${to}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1))a.push(d.toISOString().slice(0,10));return a;}
async function run(){
 const companyId=await ensureCompany();const state=await loadState();const maxDays=Number(process.env.BACKFILL_MAX_DAYS??'0');const maxRecords=Number(process.env.BACKFILL_MAX_RECORDS??'0');let days=0,records=0,created=0,skipped=0;
 for(const day of daysBetween()){
  if(state.completed.includes(day) && process.env.BACKFILL_RECHECK_COMPLETED !== '1')continue;
  if(maxDays>0&&days>=maxDays)break;
  const items: Item[] = [];
  for (const kind of ['issue', 'pr'] as const) {
   const q = `repo:${repo} is:${kind} created:${day}..${day}`;
   const first = await get<Search>(
    `/search/issues?${qs({q,per_page:100,page:1,sort:'created',order:'asc'})}`
   );
   if(first.incomplete_results)
    throw new Error(`Incomplete GitHub search for ${day} ${kind}`);
   if(first.total_count > 1000)
    throw new Error(`${day} ${kind} has over 1000 results; subdivide by hours`);

   const category = [...first.items];
   for(let page=2;category.length<first.total_count;page++){
    const part=await get<Search>(
     `/search/issues?${qs({q,per_page:100,page,sort:'created',order:'asc'})}`
    );
    if(part.incomplete_results)
     throw new Error(`Incomplete search: ${day} ${kind} page ${page}`);
    category.push(...part.items);
   }
   if(category.length!==first.total_count)
    throw new Error(`${day} ${kind}: ${category.length}/${first.total_count}`);
   items.push(...category);
  }
  console.log(`${day}: ${items.filter(i=>!i.pull_request).length} issues, ${items.filter(i=>!!i.pull_request).length} PRs`);
  for(const item of items){
   const key=`${day}:${item.id}`;
   if(state.failed[key]==='done' && process.env.BACKFILL_RECHECK_COMPLETED !== '1')continue;
   try{const r=await storeItem(companyId,item);state.processed++;state.comments+=r.comments;state.reviews+=r.reviews;records++;if(r.created)created++;if(r.skipped)skipped++;state.failed[key]='done';await save(state);}
   catch(e){
    const message = e instanceof Error
      ? `${e.message}\n${e.stack ?? ''}`
      : JSON.stringify(e, Object.getOwnPropertyNames(e));
    state.failed[key]=message;await save(state);throw new Error(`Stopped at ${day} #${item.number}: ${String(e)}. Rerun to resume.`);}
   if(maxRecords>0&&records>=maxRecords){console.log(JSON.stringify({status:'paused',day,records,created,comments:state.comments,reviews:state.reviews,daysCompleted:state.completed.length},null,2));return;}
  }
  if(!state.completed.includes(day))state.completed.push(day);for(const key of Object.keys(state.failed))if(key.startsWith(`${day}:`))delete state.failed[key];await save(state);days++;
  console.log(`${day}: ${items.length} records; total completed days ${state.completed.length}/${daysBetween().length}; total processed ${state.processed}`);
 }
 console.log(JSON.stringify({status:state.completed.length===daysBetween().length?'complete':'paused',daysCompleted:state.completed.length,totalDays:daysBetween().length,processed:state.processed,createdThisRun:created,unchangedSkippedThisRun:skipped,commentsProcessed:state.comments,reviewsProcessed:state.reviews,failed:Object.keys(state.failed).filter(k=>state.failed[k]!=='done')},null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
