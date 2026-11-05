import asyncio
import json
import os
import sys
import time
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

DATA = ROOT / "cognee-service/data/discussions-500.json"
STATE = ROOT / "cognee-service/data/cognee-progress.json"

async def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    documents = json.loads(DATA.read_text())
    progress = json.loads(STATE.read_text()) if STATE.exists() else {
        "completed": []
    }

    completed = set(progress["completed"])
    pending = [
        d for d in documents
        if d["id"] not in completed
    ][:limit]

    print(
        f"Already processed: {len(completed)} | "
        f"This batch: {len(pending)}",
        flush=True
    )

    start = time.monotonic()

    for index, doc in enumerate(pending, 1):
        print(
            f"[{index}/{len(pending)}] "
            f"Remembering #{doc['number']}: {doc['title'][:70]}",
            flush=True
        )

        try:
            clean_text = doc["text"].encode(
                "utf-8", errors="replace"
            ).decode("utf-8")
            await cognee.remember(clean_text)

            completed.add(doc["id"])
            STATE.write_text(json.dumps({
                "completed": sorted(completed)
            }, indent=2))

            print(
                f"Saved | Total: {len(completed)}/500",
                flush=True
            )
        except Exception as error:
            print(
                f"FAILED #{doc['number']}: {error}",
                flush=True
            )
            raise

    elapsed = time.monotonic() - start
    print(
        f"Batch complete in {elapsed:.1f}s | "
        f"Total completed: {len(completed)}/500",
        flush=True
    )

asyncio.run(main())
