"use client";
import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";

type GraphItem = { data: { id: string; label: string; kind?: string; url?: string; details?: string; state?: string; source?: string; target?: string } };
type GraphData = { nodes: GraphItem[]; edges: GraphItem[]; stats: { issues: number; pullRequests: number; authors: number; comments: number } };
export default function GraphPage() {
  const container = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [selected, setSelected] = useState<GraphItem["data"] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => { fetch("/api/graph").then(async (r) => { if (!r.ok) throw new Error("Could not fetch graph"); return r.json(); }).then(setGraph).catch((e) => setError(String(e))); }, []);
  useEffect(() => {
    if (!graph || !container.current) return;
    const visibleNodes = graph.nodes.filter((n) => filter === "all" || n.data.kind === filter || n.data.kind === "person");
    const allowed = new Set(visibleNodes.map((n) => n.data.id));
    const visibleEdges = graph.edges.filter((e) => allowed.has(e.data.source || "") && allowed.has(e.data.target || ""));
    const cy = cytoscape({ container: container.current, elements: [...visibleNodes, ...visibleEdges],
      style: [
        { selector: "node", style: { "label": "data(label)", "font-size": 9, "text-wrap": "ellipsis", "text-max-width": "115px", "color": "#dbeafe", "text-valign": "bottom", "text-margin-y": 6, "background-color": "#64748b", "width": 19, "height": 19 } },
        { selector: 'node[kind="issue"]', style: { "background-color": "#3b82f6", "width": 28, "height": 28 } },
        { selector: 'node[kind="pull_request"]', style: { "background-color": "#a855f7", "width": 28, "height": 28 } },
        { selector: 'node[kind="person"]', style: { "background-color": "#14b8a6", "width": 22, "height": 22 } },
        { selector: 'node[kind="comment"]', style: { "background-color": "#f59e0b", "width": 11, "height": 11, "font-size": 7 } },
        { selector: "edge", style: { "width": 1, "line-color": "#475569", "opacity": 0.5, "curve-style": "bezier" } },
        { selector: ":selected", style: { "border-width": 3, "border-color": "#fff" } },
      ], layout: { name: "cose", animate: false, nodeRepulsion: () => 15000, idealEdgeLength: () => 95, fit: true, padding: 35 }, minZoom: 0.1, maxZoom: 3 });
    cy.on("tap", "node", (event) => setSelected(event.target.data()));
    cy.on("tap", (event) => { if (event.target === cy) setSelected(null); });
    return () => cy.destroy();
  }, [graph, filter]);
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-5 md:p-8">
    <div className="max-w-7xl mx-auto"><a href="/" className="hidden">← Company Memory Guardian</a>
      <h1 className="text-3xl font-bold mt-4">LangChain Knowledge Graph</h1>
      <p className="text-slate-400 mt-2 mb-6">Real public GitHub relationships. Click a node to inspect its source.</p>
      {graph && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{Object.entries(graph.stats).map(([k,v]) => <div key={k} className="bg-slate-900 rounded-lg p-3"><div className="text-2xl font-bold">{v}</div><div className="text-sm text-slate-400">{k}</div></div>)}</div>}
      <div className="flex gap-2 mb-4 flex-wrap">{["all","issue","pull_request","comment"].map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-md text-sm ${filter===f ? "bg-sky-600" : "bg-slate-800"}`}>{f.replace("_", " ")}</button>)}</div>
      {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"><div ref={container} className="h-[650px] rounded-xl border border-slate-700 bg-slate-900" aria-label="Interactive knowledge graph" />
      <aside className="rounded-xl bg-slate-900 border border-slate-700 p-5 break-words"><h2 className="font-semibold text-lg mb-3">Node details</h2>{selected ? <><p className="text-xs uppercase text-sky-400 mb-2">{selected.kind?.replace("_", " ")}</p><p className="font-semibold mb-3">{selected.label}</p>{selected.state && <p className="text-sm text-slate-400 mb-3">State: {selected.state}</p>}<p className="text-sm text-slate-300 whitespace-pre-wrap max-h-80 overflow-auto">{selected.details}</p>{selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-5 text-sky-400 underline">View original GitHub source ↗</a>}</> : <p className="text-slate-400 text-sm">Select an issue, pull request, contributor, or comment. Drag nodes, zoom, and pan to explore.</p>}</aside></div>
      <p className="text-xs text-slate-500 mt-4">Relationships represent public GitHub authorship and comments only; they do not establish internal ownership or decision authority.</p>
    </div></main>;
}
