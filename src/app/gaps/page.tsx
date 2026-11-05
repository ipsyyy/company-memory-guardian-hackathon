"use client";
import { useEffect, useState } from "react";
type Finding = { id: string; recordNumber: number; recordTitle: string; recordUrl: string; category: string; confidence: string; headline: string; explanation: string; evidenceUrls: string[]; participants: number; commentCount: number };
type Result = { scannedRecords: number; scannedComments: number; findings: Finding[]; summary: { missingReasoning: number; unansweredQuestions: number; concentratedDiscussion: number }; limitations: string };
const labels: Record<string,string> = { missing_reasoning: "Missing reasoning", unanswered_question: "Unanswered question", concentrated_discussion: "Discussion concentration" };
export default function GapsPage() {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => { fetch("/api/gaps").then(async r => { if (!r.ok) throw new Error("Could not load knowledge gaps"); return r.json(); }).then(setData).catch(e => setError(String(e))); }, []);
  const visible = (data?.findings ?? []).filter(f => filter === "all" || f.category === filter);
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-5 md:p-8"><div className="max-w-5xl mx-auto">
    <nav className="hidden"><a href="/">Home</a><a href="/graph">Knowledge graph</a></nav>
    <h1 className="text-3xl font-bold mt-5">Knowledge Gaps &amp; Handoff Signals</h1>
    <p className="text-slate-400 mt-2">Evidence-linked review candidates from public LangChain GitHub activity. No private employee knowledge is inferred.</p>
    {error && <p role="alert" className="text-red-400 mt-5">{error}</p>}
    {!data && !error && <p className="mt-6">Analyzing GitHub discussions…</p>}
    {data && <><div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">{[["Records scanned", data.scannedRecords],["Missing reasoning",data.summary.missingReasoning],["Unanswered questions",data.summary.unansweredQuestions],["Concentrated discussions",data.summary.concentratedDiscussion]].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-900 p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-slate-400">{label}</p></div>)}</div>
      <div className="flex flex-wrap gap-2 mb-5">{["all", ...Object.keys(labels)].map(key => <button key={key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-sm ${filter === key ? "bg-sky-600" : "bg-slate-800"}`}>{key === "all" ? "All findings" : labels[key]}</button>)}</div>
      <div className="space-y-4">{visible.length === 0 && <p className="text-slate-400">No findings match this filter in the synchronized sample.</p>}{visible.map(f => <article key={f.id} className="rounded-xl border border-slate-700 bg-slate-900 p-5"><div className="flex flex-wrap gap-2 text-xs mb-3"><span className="rounded bg-slate-700 px-2 py-1">{labels[f.category]}</span><span className="rounded bg-slate-800 px-2 py-1">{f.confidence} confidence</span></div><h2 className="font-semibold text-lg">{f.headline}</h2><p className="text-sm text-slate-300 mt-2">#{f.recordNumber} — {f.recordTitle}</p><p className="text-sm text-slate-400 mt-3">{f.explanation}</p><p className="text-xs text-slate-500 mt-3">Visible contributors: {f.participants} · Synchronized comments: {f.commentCount}</p><a href={f.recordUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sky-400 underline mt-3">Inspect original GitHub record ↗</a></article>)}</div>
      <p className="text-xs text-slate-500 mt-8 border-t border-slate-800 pt-4">{data.limitations}</p></>}
  </div></main>;
}
