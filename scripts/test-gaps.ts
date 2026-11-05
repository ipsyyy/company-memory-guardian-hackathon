import { config } from "dotenv";
config({ path: ".env.local", override: true, quiet: true });
async function main() {
  const { analyzeKnowledgeGaps, getKnowledgeGaps } = await import("../src/lib/gaps/analyze");
  const sample = [
    { id: "a", number: 1, title: "Why does this fail?", body: "How do I fix this?", author: "alice", state: "open", record_type: "issue", source_url: "https://github.com/langchain-ai/langchain/issues/1" },
    { id: "b", number: 2, title: "Fix config", body: "Change configuration", author: "bob", state: "closed", record_type: "pull_request", source_url: "https://github.com/langchain-ai/langchain/pull/2" },
    { id: "c", number: 3, title: "Another issue", body: "It fails", author: "carol", state: "open", record_type: "issue", source_url: "https://github.com/langchain-ai/langchain/issues/3" },
  ];
  const sampleComments = [
    { github_record_id: "b", author: "bob", body: "Changed", source_url: "https://github.com/langchain-ai/langchain/pull/2#issuecomment-1" },
    { github_record_id: "c", author: "carol", body: "More detail", source_url: "https://github.com/langchain-ai/langchain/issues/3#issuecomment-2" },
    { github_record_id: "c", author: "carol", body: "Reproduced", source_url: "https://github.com/langchain-ai/langchain/issues/3#issuecomment-3" },
  ];
  const unit = analyzeKnowledgeGaps(sample, sampleComments);
  for (const category of ["missing_reasoning", "unanswered_question", "concentrated_discussion"]) if (!unit.some(f => f.category === category)) throw new Error(`Missing heuristic test category: ${category}`);
  const actual = await getKnowledgeGaps();
  if (actual.scannedRecords === 0) throw new Error("No real records scanned");
  for (const f of actual.findings) if (!f.recordUrl.startsWith("https://github.com/langchain-ai/langchain/")) throw new Error(`Invalid citation: ${f.id}`);
  console.log(JSON.stringify({ syntheticRuleChecks: unit.length, scannedRecords: actual.scannedRecords, scannedComments: actual.scannedComments, findings: actual.findings.length, summary: actual.summary, sourceLinksValid: true }, null, 2));
  console.log("Knowledge gaps test passed.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
