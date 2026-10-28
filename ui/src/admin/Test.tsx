import { useState } from "react";
import { renderMarkdown } from "../markdown";
import { api } from "./api";

interface Result { handoff: boolean; text: string; passages: { id: number; title: string; url: string | null; text: string; pinned: boolean }[] }

export default function Test() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Test answers</h1>
      <p className="text-sm text-stone-500">Ask what a customer would, and see the answer and the passages it came from. Nothing is saved.</p>
      <form className="mt-6 flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 py-3 shadow-sm focus-within:border-stone-500"
        onSubmit={async (e) => {
          e.preventDefault();
          if (q.trim().length < 2) return;
          setLoading(true); setError(null);
          try { setResult(await api<Result>("/test", { body: { question: q } })); } catch (err) { setError((err as Error).message); }
          setLoading(false);
        }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="How do I reset my password?" aria-label="Question" className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-stone-400" />
        <button disabled={loading} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">{loading ? "Thinking…" : "Ask"}</button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Answer</div>
            {result.handoff
              ? <p className="mt-2 text-stone-600">Not answered: your sources don&apos;t cover this, so the visitor would be passed to you and asked for their email.</p>
              : <div className="prose-pc mt-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.text) }} />}
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Passages found</h2>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {result.passages.map((p, i) => (
                <div key={p.id} className="border-b border-stone-100 px-4 py-3 last:border-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-stone-400 tabular-nums">{i + 1}</span>
                    <span className="truncate">{p.title}</span>
                    {p.pinned && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">Pinned</span>}
                    {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-xs text-stone-500 hover:underline">Open page ↗</a>}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[13px] text-stone-500">{p.text}</p>
                </div>
              ))}
              {!result.passages.length && <p className="p-6 text-center text-sm text-stone-400">Nothing matched.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
