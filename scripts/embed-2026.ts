import {config} from 'dotenv';config({path:'.env.local',override:true,quiet:true});
import {createClient} from '@supabase/supabase-js';
import OpenAI from 'openai';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const ai=new OpenAI();
async function main(){const limit=Number(process.env.EMBED_MAX_RECORDS??'100');const {data:companies,error:ce}=await db.from('companies').select('id').eq('name','LangChain Public Engineering').limit(1);if(ce)throw ce;const id=companies?.[0]?.id;if(!id)throw new Error('Company missing');
 const {data:jobs,error:je}=await db.from('github_embedding_jobs').select('github_record_id,content_hash,attempts').eq('company_id',id).in('status',['pending','error']).order('updated_at',{ascending:true}).limit(limit);if(je)throw je;
 let done=0,failed=0;
 for(const job of jobs??[]){const recordId=job.github_record_id;
  try{
   const r=await db.from('github_records').select('title,body,state,source_url,author,record_type').eq('id',recordId).single();if(r.error)throw r.error;
   const c=await db.from('github_comments').select('body,source_url,author').eq('github_record_id',recordId).order('github_created_at',{ascending:true}).limit(1000);if(c.error)throw c.error;
   const v=await db.from('github_review_events').select('body,source_url,author,state').eq('github_record_id',recordId).order('github_created_at',{ascending:true}).limit(1000);if(v.error)throw v.error;
   const texts=[`Title: ${r.data.title}\nType: ${r.data.record_type}\nState: ${r.data.state}\nAuthor: ${r.data.author}\nSource: ${r.data.source_url}\nBody:\n${r.data.body??''}`,...(c.data??[]).map(x=>`Comment ${x.author}: ${x.body??''}\nSource: ${x.source_url}`),...(v.data??[]).map(x=>`Review ${x.author} (${x.state??''}): ${x.body??''}\nSource: ${x.source_url}`)];
   // Chunk per message, avoiding the previous 7,000-character truncation.
   const chunks:string[]=[];for(const t of texts){for(let i=0;i<t.length;i+=5500)chunks.push(t.slice(i,i+5500));}
   if(!chunks.length)chunks.push(`Title: ${r.data.title}\nSource: ${r.data.source_url}`);
   // Bound extreme discussions, but surface that as a warning rather than claiming full embedding coverage.
   if(chunks.length>100)console.warn(`Record ${recordId}: ${chunks.length} chunks, embedding first 100; partial coverage`);
   const batch=chunks.slice(0,100);
   const vectors:number[][]=[];
   for(let start=0;start<batch.length;start+=15){const response=await ai.embeddings.create({model:'text-embedding-3-small',input:batch.slice(start,start+15)});vectors.push(...response.data.map(x=>x.embedding));}
   const deleted=await db.from('document_chunks').delete().eq('github_record_id',recordId);if(deleted.error)throw deleted.error;
   for(let i=0;i<batch.length;i+=25){const rows=batch.slice(i,i+25).map((content,j)=>({company_id:id,document_id:null,github_record_id:recordId,chunk_index:i+j,content,embedding:vectors[i+j]}));const ins=await db.from('document_chunks').insert(rows);if(ins.error)throw ins.error;}
   const u=await db.from('github_embedding_jobs').update({status:'done',attempts:job.attempts+1,last_error:null,updated_at:new Date().toISOString()}).eq('github_record_id',recordId);if(u.error)throw u.error;done++;
  }catch(e){failed++;console.error(`Embedding failed ${recordId}:`,e);await db.from('github_embedding_jobs').update({status:'error',attempts:job.attempts+1,last_error:String(e).slice(0,1000),updated_at:new Date().toISOString()}).eq('github_record_id',recordId);}
 }
 console.log(JSON.stringify({queued:jobs?.length??0,embedded:done,failed},null,2));if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
