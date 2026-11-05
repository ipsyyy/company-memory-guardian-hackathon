export function chunkText(
  text: string,
  chunkSize = 1200,
  overlap = 200
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  const chunks: string[] = [];

  if (!cleaned) return chunks;

  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    if (end < cleaned.length) {
      const boundary = cleaned.lastIndexOf("\n", end);

      if (boundary > start + chunkSize / 2) {
        end = boundary;
      }
    }

    const chunk = cleaned.slice(start, end).trim();

    if (chunk) chunks.push(chunk);

    if (end >= cleaned.length) break;

    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
