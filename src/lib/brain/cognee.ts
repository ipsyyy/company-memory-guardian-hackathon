import { supabaseService } from "../supabase-service";

type CogneeChunk = {
  text: string;
  source_urls: string[];
};

type CogneeResponse = {
  chunks: CogneeChunk[];
};

export type CogneeEvidence = {
  title: string;
  url: string;
  type: string;
  state: string;
  similarity: number;
  content: string;
};

function normalizeUrl(url: string): string {
  return url.replace(/\\/g, "").split("#")[0];
}

export async function searchCognee(
  question: string
): Promise<CogneeEvidence[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("http://127.0.0.1:8000/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) throw new Error("Cognee search failed");

    const data = (await response.json()) as CogneeResponse;

    const candidates = (data.chunks ?? []).flatMap((chunk) =>
      (chunk.source_urls ?? []).map((url) => ({
        url: normalizeUrl(url),
        content: chunk.text,
      }))
    );

    const unique = new Map<string, string>();

    for (const candidate of candidates) {
      if (
        /^https:\/\/github\.com\/langchain-ai\/langchain\/(issues|pull)\/\d+$/.test(
          candidate.url
        ) &&
        !unique.has(candidate.url)
      ) {
        unique.set(candidate.url, candidate.content);
      }
    }

    const urls = [...unique.keys()].slice(0, 15);
    if (!urls.length) return [];

    const { data: records, error } = await supabaseService
      .from("github_records")
      .select("id,title,source_url,record_type,state,body")
      .in("source_url", urls);

    if (error) throw error;

    return (records ?? []).map((record) => ({
      title: record.title,
      url: record.source_url,
      type: record.record_type,
      state: record.state,
      similarity: 0,
      content: [
        `GitHub record: ${record.title}`,
        `URL: ${record.source_url}`,
        `Status: ${record.state}`,
        `Original discussion: ${record.body ?? ""}`,
      ].join("\n").slice(0, 6500),
    }));
  } finally {
    clearTimeout(timeout);
  }
}
