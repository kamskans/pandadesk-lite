import { useEffect, useState } from "react";
import { api, input, primary } from "./api";
import { go } from "./router";

interface Pinned { id: number; question: string; answer: string }

export default function Answers({ id }: { id?: string }) {
  const [list, setList] = useState<Pinned[] | null>(null);
  useEffect(() => { api<{ pinned: Pinned[] }>("/knowledge").then((r) => setList(r.pinned)).catch(() => {}); }, [id]);
  if (id) return list ? <Editor initial={id === "new" ? null : list.find((p) => String(p.id) === id) ?? null} /> : null;
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pinned answers</h1>
          <p className="text-sm text-stone-500">Official answers to specific questions. They rank above your website and text, so the AI answers from them first.</p>
        </div>
        <a href="#/answers/new" className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">New answer</a>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {list?.map((a) => (
          <a key={a.id} href={`#/answers/${a.id}`} className="block border-b border-stone-100 px-4 py-3 last:border-0 hover:bg-stone-50">
            <div className="truncate font-medium">{a.question}</div>
            <div className="truncate text-sm text-stone-500">{a.answer.replace(/[*_`#>]/g, "")}</div>
          </a>
        ))}
        {list && !list.length && <p className="p-6 text-center text-sm text-stone-400">No pinned answers yet. Add one for the questions customers ask most.</p>}
      </div>
    </div>
  );
}

function Editor({ initial }: { initial: Pinned | null }) {
  const [v, setV] = useState({ question: initial?.question ?? "", answer: initial?.answer ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError(null);
    try { await api("/pinned", { body: { id: initial?.id, ...v } }); go("answers"); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a href="#/answers" className="text-sm text-stone-500 hover:text-stone-900">← Pinned answers</a>
      <h1 className="mt-3 text-2xl font-semibold">{initial ? "Edit answer" : "New pinned answer"}</h1>
      <label className="mt-6 block">
        <span className="text-sm font-medium">Question</span>
        <span className="block text-xs text-stone-500">As customers ask it. Similar wordings match too.</span>
        <input value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} className={`mt-1 ${input}`} />
      </label>
      <label className="mt-4 block">
        <span className="text-sm font-medium">Answer</span>
        <span className="block text-xs text-stone-500">The AI uses it for this question and similar ones. Markdown works.</span>
        <textarea value={v.answer} onChange={(e) => setV({ ...v, answer: e.target.value })} rows={8} className={`mt-1 ${input}`} />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={busy} className={primary}>Save</button>
        {initial && (
          <button onClick={async () => { if (confirm("Delete this pinned answer?")) { await api(`/pinned/${initial.id}`, { method: "DELETE" }); go("answers"); } }}
            className="text-sm text-red-600 hover:underline">Delete</button>
        )}
      </div>
    </div>
  );
}
