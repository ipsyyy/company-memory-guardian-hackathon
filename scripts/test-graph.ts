import { config } from "dotenv";
config({ path: ".env.local", override: true, quiet: true });
async function main() {
  const { getKnowledgeGraph } = await import("../src/lib/graph/data");
  const result = await getKnowledgeGraph();
  const nodeIds = new Set(result.nodes.map((n) => n.data.id));
  if (!result.nodes.length || !result.edges.length) throw new Error("Graph has no nodes or edges");
  for (const edge of result.edges) if (!nodeIds.has(edge.data.source) || !nodeIds.has(edge.data.target)) throw new Error(`Broken edge: ${edge.data.id}`);
  for (const node of result.nodes) if ((node.data.kind === "issue" || node.data.kind === "pull_request" || node.data.kind === "comment") && !node.data.url?.startsWith("https://github.com/")) throw new Error(`Missing GitHub citation: ${node.data.id}`);
  console.log(JSON.stringify({ stats: result.stats, nodes: result.nodes.length, edges: result.edges.length, validEdges: true, sourceLinks: true }, null, 2));
  console.log("Knowledge graph test passed.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
