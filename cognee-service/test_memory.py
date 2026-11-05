import asyncio
import json
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

if not os.getenv("OPENAI_API_KEY"):
    raise RuntimeError("OPENAI_API_KEY missing")

os.environ["LLM_PROVIDER"] = "openai"
os.environ["LLM_MODEL"] = "gpt-4o-mini"
os.environ["LLM_API_KEY"] = os.environ["OPENAI_API_KEY"]
os.environ["EMBEDDING_PROVIDER"] = "openai"
os.environ["EMBEDDING_MODEL"] = "text-embedding-3-small"
os.environ["EMBEDDING_API_KEY"] = os.environ["OPENAI_API_KEY"]
os.environ["TELEMETRY_DISABLED"] = "true"

import cognee

async def main():
    record = json.loads(
        (ROOT / "cognee-service/data/github-sample.json").read_text()
    )

    source = (
        f"GitHub PR #{record['number']}\n"
        f"Title: {record['title']}\n"
        f"Source: {record['source_url']}\n"
        f"Discussion:\n{record['body'][:5000]}"
    )

    print("Remembering:", record["source_url"], flush=True)
    await cognee.remember(source)

    print("Querying Cognee...", flush=True)
    results = await cognee.recall(
        query_text=f"What is GitHub PR #{record['number']} about?"
    )

    for result in results:
        print(getattr(result, "text", str(result)))

asyncio.run(main())
