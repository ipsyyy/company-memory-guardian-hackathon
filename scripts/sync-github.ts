import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true, quiet: true });

async function main() {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
  for (const name of required) {
    if (!process.env[name]) throw new Error(`Missing ${name} in .env.local`);
  }
  const { syncLangChain } = await import("../src/lib/github/sync");
  const pages = Number(process.env.SYNC_PAGES ?? "1");
  const comments = Number(process.env.SYNC_COMMENTS ?? "5");
  const result = await syncLangChain({ maxPages: pages, commentsPerRecord: comments });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
