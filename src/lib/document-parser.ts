import "server-only";
import { PDFParse } from "pdf-parse";

const supportedExtensions = [".pdf", ".txt", ".md", ".csv", ".json"];

export async function parseDocument(file: File): Promise<string> {
  const filename = file.name.toLowerCase();

  if (!supportedExtensions.some((ext) => filename.endsWith(ext))) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (filename.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  const text = buffer.toString("utf-8");

  if (filename.endsWith(".json")) {
    return JSON.stringify(JSON.parse(text), null, 2);
  }

  return text.trim();
}
