import { useCallback, useEffect, useState } from "react";
import { api, input, when } from "./api";

interface Source { id: number; kind: "website" | "text"; url: string | null; title: string; status: string; synced_at: number | null; pages: number; done: number; failed: number; passages: number }
interface Page { id: number; url: string; title: string | null; status: string; error: string | null }

const STATUS: Record<string, string> = { reading: "bg-sky-50 text-sky-700", ready: "bg-emerald-50 text-emerald-700", error: "bg-red-50 text-red-700" };

function Status({ state }: { state: { ok?: string; error?: string } | null }) {
  return <>
    {state?.ok && <p className="mt-2 text-sm text-emerald-700">{state.ok}</p>}
    {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
  </>;
}

export default function Sources() {
  const [data, setData] = useState<{ sources: Source[] } | null>(null);
  const [vectors, setVectors] = useState<boolean | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => { api<{ sources: Source[] }>("/knowledge").then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); api<{ vectors: boolean }>("/me").then((m) => setVectors(m.vectors)).catch(() => {}); }, [load]);
  const busy = data?.sources.some((s) => s.status === "reading");
  // While pages are being read, refresh every 3 seconds (each refresh also reads the next few pages).
  useEffect(() => { if (!busy) return; const t = setInterval(load, 3000); return () => clearInterval(t); }, [busy, load]);
  const websites = data?.sources.filter((s) => s.kind === "website") ?? [];
  const texts = data?.sources.filter((s) => s.kind === "text") ?? [];
  const total = data?.sources.reduce((n, s) => n + s.passages, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Sources</h1>
      <p className="text-sm text-stone-500">Besides your pinned answers, the AI answers from your docs site and any text you add. Websites are read in the background and again every day.</p>

      {vectors !== null && (
        <div className="mt-4 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          {vectors ? <>Search by meaning is on: {total.toLocaleString("en-US")} passages indexed.</>
            : <span className="text-amber-800">Keyword search only: the Vectorize index isn&apos;t set up, so questions must share words with your content. See the README to turn on search by meaning.</span>}
        </div>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="font-semibold">Website</h2>
          <p className="mb-3 text-sm text-stone-500">We read pages on the same domain under that path (or every page in its sitemap) and read them again daily.</p>
          <WebsiteForm onAdded={load} />
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="font-semibold">Text</h2>
          <p className="mb-3 text-sm text-stone-500">Paste a policy, a how-to or notes. Markdown works.</p>
          <TextForm onAdded={load} />
        </div>
      </section>

      {websites.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Websites</h2>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            {websites.map((s) => (
              <div key={s.id} className="border-b border-stone-100 last:border-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="block max-w-full truncate text-left font-medium hover:underline">{s.title}</button>
                    <div className="truncate text-xs text-stone-500">
                      {s.done.toLocaleString("en-US")} pages · {s.passages.toLocaleString("en-US")} passages · last read {when(s.synced_at)}
                      {s.status === "reading" && <span> · {s.pages - s.done - s.failed} to go</span>}
                      {s.failed > 0 && <span className="text-red-600"> · {s.failed} failed</span>}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[s.status] ?? "bg-stone-100 text-stone-600"}`}>{s.status === "reading" ? "reading…" : s.status}</span>
                  {s.status !== "reading" && <button onClick={async () => { await api(`/sources/${s.id}/resync`, { method: "POST" }); load(); }} className="text-sm text-stone-500 hover:text-stone-900">Read again</button>}
                  <button onClick={async () => { if (confirm(`Remove ${s.title} and everything read from it?`)) { await api(`/sources/${s.id}`, { method: "DELETE" }); load(); } }} className="text-sm text-stone-400 hover:text-red-600">Remove</button>
                </div>
                {open === s.id && <Pages id={s.id} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {texts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Text</h2>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            {texts.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="truncate text-xs text-stone-500">{s.passages} {s.passages === 1 ? "passage" : "passages"}</div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Ready</span>
                <button onClick={async () => { if (confirm(`Delete ${s.title}?`)) { await api(`/sources/${s.id}`, { method: "DELETE" }); load(); } }} className="text-sm text-stone-400 hover:text-red-600">Delete</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Pages({ id }: { id: number }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  useEffect(() => { api<{ pages: Page[] }>(`/sources/${id}/pages`).then((r) => setPages(r.pages)).catch(() => {}); }, [id]);
  if (!pages) return null;
  return (
    <div className="max-h-80 overflow-y-auto border-t border-stone-100 bg-stone-50/60">
      {pages.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-2 text-sm last:border-0">
          <div className="min-w-0 flex-1">
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline">{p.title || p.url}</a>
            {p.error && <div className="truncate text-xs text-red-600">{p.error}</div>}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.status === "done" ? "bg-emerald-50 text-emerald-700" : p.status === "error" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>
            {p.status === "done" ? "Ready" : p.status === "error" ? "Failed" : "Queued"}
          </span>
        </div>
      ))}
    </div>
  );
}

function WebsiteForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setState(null);
      try { await api("/sources", { body: { kind: "website", url } }); setUrl(""); setState({ ok: "Added. Pages are being read now." }); onAdded(); }
      catch (err) { setState({ error: (err as Error).message }); }
      setBusy(false);
    }}>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://docs.example.com" className={input} />
        <button disabled={busy} className="shrink-0 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white disabled:opacity-50">{busy ? "Adding…" : "Crawl"}</button>
      </div>
      <Status state={state} />
    </form>
  );
}

function TextForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setState(null);
      try { await api("/sources", { body: { kind: "text", title, text } }); setTitle(""); setText(""); setState({ ok: "Added." }); onAdded(); }
      catch (err) { setState({ error: (err as Error).message }); }
      setBusy(false);
    }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Title, e.g. Refund policy" className={input} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} required rows={3} placeholder="Paste text or Markdown" className={input} />
      <button disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Adding…" : "Add text"}</button>
      <Status state={state} />
    </form>
  );
}
