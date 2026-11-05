"use client";

import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = {
  citation: string;
  title: string;
  url: string;
  type: string;
  state: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const examples = [
  "What concerns have contributors raised about AI-agent identity and authorization?",
  "What solutions have been proposed for preventing unauthorized agent actions?",
  "What trade-offs were discussed around agent security and governance?",
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function ask(event?: FormEvent<HTMLFormElement>, suggested?: string) {
    event?.preventDefault();

    const text = (suggested ?? question).trim();
    if (!text || loading) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: text },
    ]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to answer.");
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources ?? [],
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Company Memory Guardian</h1>
            <p className="text-sm text-slate-400">
              Evidence-backed engineering intelligence
            </p>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm">
            <a href="/" className="text-cyan-400">Ask Brain</a>
            <a href="/guardian" className="hover:text-cyan-400">Guardian</a>
            <a href="/graph" className="hover:text-cyan-400">Knowledge Graph</a>
            <a href="/gaps" className="hover:text-cyan-400">Knowledge Gaps</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-105px)] max-w-4xl flex-col px-5 py-8">
        {messages.length === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-5 rounded-2xl border border-cyan-800 bg-cyan-950/40 px-5 py-3 text-cyan-300">
              LangChain Public Engineering
            </div>
            <h2 className="mb-3 text-3xl font-semibold">
              Ask your company&apos;s memory
            </h2>
            <p className="mb-6 max-w-xl text-slate-400">
              Explore real GitHub engineering discussions, proposed solutions,
              technical risks, and engineering history.
            </p>
            <div className="mb-8 max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5 text-left">
              <h3 className="mb-2 font-semibold text-cyan-400">
                What this Company Brain knows
              </h3>
              <p className="text-sm leading-6 text-slate-300">
                This demo uses indexed public discussions from the
                LangChain GitHub repository. Ask about documented
                technical problems, proposed solutions, and engineering
                trade-offs.
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Knowledge boundary: indexed public GitHub evidence only.
                No access to private meetings, internal documents,
                or undocumented decisions.
              </p>
            </div>
            <p className="mb-3 text-sm font-medium text-slate-300">
              Try asking
            </p>
            <div className="grid w-full gap-3 sm:grid-cols-3">
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => ask(undefined, example)}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-left text-sm hover:border-cyan-500"
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="flex-1 space-y-7 pb-8">
            {messages.map((message, index) => (
              <article
                key={index}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl bg-slate-800 p-4"
                    : "rounded-2xl border border-slate-800 bg-slate-900 p-5"
                }
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                  {message.role === "user" ? "You" : "Company Brain"}
                </div>
                <div className="brain-answer text-sm leading-7">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>

                {message.sources && message.sources.length > 0 && (
                  <div className="mt-5 border-t border-slate-700 pt-4">
                    <h3 className="mb-3 text-sm font-semibold">
                      GitHub evidence
                    </h3>
                    <div className="space-y-2">
                      {message.sources.map((source, sourceIndex) => (
                        <a
                          key={`${source.url}-${sourceIndex}`}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg border border-slate-700 p-3 text-sm hover:border-cyan-500"
                        >
                          <span className="mr-2 text-cyan-400">
                            {source.citation}
                          </span>
                          {source.title}
                          <span className="ml-2 text-xs text-slate-400">
                            ({source.type})
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
            {loading && (
              <p className="animate-pulse text-sm text-slate-400">
                Searching engineering evidence...
              </p>
            )}
          </section>
        )}

        <form onSubmit={ask} className="sticky bottom-0 bg-slate-950 py-4">
          <div className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about engineering history, decisions, or risks..."
              maxLength={1000}
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {loading ? "Thinking..." : "Ask"}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            Answers are generated from synchronized public GitHub evidence.
          </p>
        </form>
      </main>
    </div>
  );
}
