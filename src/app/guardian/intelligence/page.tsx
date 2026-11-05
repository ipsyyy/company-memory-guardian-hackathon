"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = {
  citation: string;
  title: string;
  url: string;
  type: string;
  state: string;
};

type Analysis = {
  analysis: string;
  sources: Source[];
  evidenceCount: number;
};

const examples = [
  "What is the history of agent identity verification, and what risks were discussed?",
  "Why were cryptographic audit trails proposed, and what trade-offs were identified?",
  "What should engineers consider before changing agent authorization controls?",
];

export default function DecisionIntelligencePage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze(value: string) {
    if (!value.trim() || loading) return;

    setQuestion(value);
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/guardian/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="hidden">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-5 text-sm">
          <a href="/" className="font-semibold text-white">Company Memory Guardian</a>
          <a href="/" className="text-slate-400 hover:text-white">Company Brain</a>
          <a href="/guardian" className="text-slate-400 hover:text-white">Review Queue</a>
          <a href="/graph" className="text-slate-400 hover:text-white">Knowledge Graph</a>
          <a href="/gaps" className="text-slate-400 hover:text-white">Knowledge Gaps</a>
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
          Decision Intelligence
        </p>
        <h1 className="mt-3 text-3xl font-bold">
          Understand why engineering decisions were made
        </h1>
        <p className="mt-3 text-slate-400">
          Explore decision history, proposals, rationale, risks, and unknowns
          using public GitHub evidence.
        </p>

        <form
          className="mt-8 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void analyze(question);
          }}
        >
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Ask about an engineering decision, its history, or its risks..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm outline-none focus:border-cyan-500"
          />
          <button
            disabled={loading || !question.trim()}
            className="self-end rounded-lg bg-cyan-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Analyzing engineering history..." : "Analyze decision"}
          </button>
        </form>

        {!result && !loading && (
          <section className="mt-8">
            <p className="mb-3 text-sm text-slate-400">Try a question</p>
            <div className="space-y-3">
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => void analyze(example)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm hover:border-cyan-600"
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="mt-6 text-red-400">{error}</p>
        )}

        {result && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Decision analysis</h2>
              <span className="text-xs text-slate-400">
                {result.evidenceCount} evidence records
              </span>
            </div>

            <div className="brain-answer text-sm leading-7">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result.analysis}
              </ReactMarkdown>
            </div>

            <div className="mt-8 rounded-xl border border-cyan-900 bg-cyan-950/30 p-5">
              <h3 className="font-semibold">Considering a change?</h3>
              <p className="mt-2 text-sm text-slate-300">
                Review a simulated engineering change against documented
                GitHub proposals and record a human decision.
              </p>
              <a
                href="/guardian"
                className="mt-4 inline-block rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500"
              >
                Open human review queue
              </a>
              <p className="mt-2 text-xs text-slate-500">
                Simulation only. No GitHub changes are executed.
              </p>
            </div>

            <div className="mt-8 border-t border-slate-700 pt-5">
              <h3 className="mb-3 font-semibold">GitHub evidence</h3>
              <div className="space-y-2">
                {result.sources.map((source) => (
                  <a
                    key={source.citation}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-slate-700 p-3 text-sm hover:border-cyan-500"
                  >
                    <span className="mr-2 text-cyan-400">
                      {source.citation}
                    </span>
                    {source.title}
                    <span className="ml-2 text-xs text-slate-500">
                      {source.type} · {source.state}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <p className="mt-8 text-xs text-slate-500">
          Public GitHub proposals are not automatically confirmed company decisions.
          Missing evidence is identified rather than invented.
        </p>
      </div>
    </main>
  );
}
