import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

os.environ["LLM_PROVIDER"] = "openai"
os.environ["LLM_MODEL"] = "gpt-4o-mini"
os.environ["LLM_API_KEY"] = os.environ["OPENAI_API_KEY"]
os.environ["EMBEDDING_PROVIDER"] = "openai"
os.environ["EMBEDDING_MODEL"] = "text-embedding-3-small"
os.environ["EMBEDDING_API_KEY"] = os.environ["OPENAI_API_KEY"]
os.environ["TELEMETRY_DISABLED"] = "true"

import cognee
from cognee.api.v1.search.search import SearchType

async def main():
    query = (
        "Cryptographic agent identity intent verification "
        "kill switch production deployments"
    )

    results = await cognee.search(
        query_type=SearchType.CHUNKS,
        query_text=query
    )

    print("\nCHUNK RESULTS:", flush=True)

    for result in results[:5]:
        items = result.get("search_result", []) if isinstance(result, dict) else []
        for item in items[:5]:
            text = item.get("text", "")
            print("\n--- Retrieved chunk ---")
            print(text[:1200])
            print("Source metadata:", item.get("metadata"))


asyncio.run(main())
