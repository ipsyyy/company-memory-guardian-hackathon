import os
import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel, Field

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

app = FastAPI(title="Company Memory Guardian - Cognee")

class SearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "cognee"}

@app.post("/search")
async def search(request: SearchRequest):
    results = await cognee.search(
        query_type=SearchType.CHUNKS,
        query_text=request.question
    )

    chunks = []

    for result in results:
        items = result.get("search_result", []) if isinstance(result, dict) else []

        for item in items:
            chunk_text = item.get("text", "")
            if not chunk_text:
                continue

            urls = re.findall(
                r"https?://github\.com/langchain-ai/langchain/"
                r"(?:issues|pull)/\d+(?:#issuecomment-\d+)?",
                chunk_text
            )

            chunks.append({
                "text": chunk_text[:2500],
                "source_urls": list(dict.fromkeys(urls))
            })

    return {
        "chunks": chunks[:10],
        "count": len(chunks)
    }
