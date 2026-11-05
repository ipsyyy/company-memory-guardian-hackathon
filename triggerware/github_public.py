import httpx
from runtime import generator

@generator
async def fetch():
    url = "https://api.github.com/repos/langchain-ai/langchain/issues"

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            url,
            params={
                "state": "all",
                "sort": "updated",
                "per_page": 20
            },
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "company-memory-guardian"
            }
        )
        response.raise_for_status()
        items = response.json()

    rows = []
    for item in items:
        if "pull_request" in item:
            continue

        rows.append([
            item["number"],
            item["title"],
            item["state"],
            item["updated_at"],
            item["html_url"]
        ])

    return {
        "rows": rows,
        "state": {},
        "exhausted": True
    }
