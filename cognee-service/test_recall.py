import asyncio
import json
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

async def main():
    progress = json.loads(
        (ROOT / "cognee-service/data/cognee-progress.json").read_text()
    )
    documents = json.loads(
        (ROOT / "cognee-service/data/discussions-500.json").read_text()
    )

    completed = set(progress["completed"])
    indexed = [d for d in documents if d["id"] in completed]

    if not indexed:
        raise RuntimeError("No completed discussions found")

    doc = indexed[0]
    question = f"What is GitHub issue or PR #{doc['number']} about?"

    print("Question:", question, flush=True)
    print("Expected source:", doc["source_url"], flush=True)

    results = await cognee.recall(query_text=question)

    print("\nCOGNEE ANSWER:", flush=True)
    for result in results:
        print(getattr(result, "text", str(result)), flush=True)

asyncio.run(main())
