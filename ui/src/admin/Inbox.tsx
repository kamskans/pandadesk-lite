import { useCallback, useEffect, useState } from "react";
import { Bot, Check, ChevronDown, Clock, Lock, Search, Trash2 } from "lucide-react";
import { renderMarkdown } from "../markdown";
import { ago, api, time } from "./api";
import { go } from "./router";

interface Row { id: string; email: string | null; name: string | null; status: string; unread: number; page_url: string | null; updated_at: number; last: string | null }
interface Conversation { id: string; email: string | null; name: string | null; status: string; page_url: string | null; created_at: number }
interface Message { id: number; role: "visitor" | "bot" | "admin" | "note"; body: string; sources: { title: string; url: string }[]; created_at: number }

const TABS = [["active", "Open"], ["bot", "AI handling"], ["closed", "Resolved"], ["all", "All"]] as const;
const STATUS: Record<string, string> = { bot: "AI handling", waiting: "Waiting", open: "Open", closed: "Resolved" };
const who = (c: { email: string | null; name: string | null }) => c.name || c.email || "Visitor";

/** Poll `fn` every `ms` while the page is visible. */
function usePoll(fn: () => void, ms: number) {
  useEffect(() => {
    fn();
    const t = setInterval(() => { if (document.visibilityState === "visible") fn(); }, ms);
    return () => clearInterval(t);
  }, [fn, ms]);
}

export default function Inbox({ tab = "active", id, onCount }: { tab?: string; id?: string; onCount: (n: number) => void }) {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className={id ? "hidden md:flex" : "flex min-h-0 flex-1 md:flex-none"}><List tab={tab} activeId={id} onCount={onCount} /></div>
      {id ? <Thread key={id} id={id} tab={tab} /> : <div className="hidden flex-1 items-center justify-center text-sm text-stone-400 md:flex">Pick a conversation</div>}
    </div>
  );
}

function List({ tab, activeId, onCount }: { tab: string; activeId?: string; onCount: (n: number) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    api<{ conversations: Row[] }>(`/conversations?status=${tab}`).then((r) => {
      setRows(r.conversations);
      if (tab === "active") onCount(r.conversations.filter((c) => c.unread > 0).length);
    }).catch(() => {});
  }, [tab, onCount]);
  usePoll(load, 5000);
  const shown = (rows ?? []).filter((r) => !q || `${r.email ?? ""} ${r.name ?? ""} ${r.last ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex min-h-0 w-full flex-col border-stone-200 bg-white md:w-96 md:shrink-0 md:border-r">
      <div className="flex gap-1 border-b border-stone-200 p-2">
        {TABS.map(([t, label]) => (
          <a key={t} href={`#/inbox/${t}`}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] ${t === tab ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>{label}</a>
        ))}
      </div>
      <div className="border-b border-stone-200 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or messages" aria-label="Search conversations"
            className="w-full rounded-md border border-stone-200 py-1.5 pr-2 pl-8 text-[13px] outline-none focus:border-stone-400" />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((c) => (
          <li key={c.id} className={`border-b border-stone-100 ${c.id === activeId ? "bg-stone-100" : "hover:bg-stone-50"}`}>
            <a href={`#/inbox/${tab}/${c.id}`} className="block min-w-0 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{who(c)}</span>
                <span className="ml-auto shrink-0 text-xs text-stone-400">{ago(c.updated_at)}</span>
                {c.unread > 0 && <span className="shrink-0 rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold tabular-nums text-white" title="Unread messages">{c.unread}</span>}
              </div>
              <p className="mt-0.5 truncate text-[13px] text-stone-500">{c.last}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-500">
                {c.status !== "open" && <span className="rounded bg-stone-100 px-1.5 py-px">{STATUS[c.status]}</span>}
                {c.status === "waiting" && <span className="flex items-center gap-0.5 text-amber-700" title="Waiting for a reply"><Clock className="h-3 w-3" />{ago(c.updated_at)}</span>}
                {c.page_url && <span className="ml-auto truncate">{safePath(c.page_url)}</span>}
              </div>
            </a>
          </li>
        ))}
        {rows && !shown.length && <li className="p-6 text-center text-sm text-stone-400">{q ? "No matches." : tab === "active" ? "No one is waiting for a reply." : "Nothing here."}</li>}
      </ul>
    </div>
  );
}

const safePath = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };

function Thread({ id, tab }: { id: string; tab: string }) {
  const [data, setData] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(() => {
    api<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`).then(setData).catch((e) => { if (!(e as Error).message.includes("sign in")) setMissing(true); });
  }, [id]);
  usePoll(load, 3000);
  if (missing) return <div className="flex flex-1 items-center justify-center text-sm text-stone-400">This conversation was deleted.</div>;
  if (!data) return <div className="flex-1" />;
  const c = data.conversation;
  const name = who(c);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold">{name.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{name}</div>
            <div className="flex items-center gap-1.5 truncate text-xs text-stone-500">
              Chat{c.email ? ` · ${c.email}` : ""}
              <span className="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600">{STATUS[c.status]}</span>
              {c.page_url && <a href={c.page_url} target="_blank" rel="noopener" className="truncate hover:underline">from {safePath(c.page_url)}</a>}
            </div>
          </div>
          <div className="ml-auto"><Controls id={c.id} status={c.status} tab={tab} reload={load} /></div>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {data.messages.map((m) => m.role === "note" ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[75%] rounded-2xl border border-dashed border-yellow-400 bg-yellow-50 px-4 py-2.5 text-[15px] text-yellow-950">
              <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-yellow-700"><Lock className="h-3 w-3" /> Private note · {time(m.created_at)}</div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          </div>
        ) : (
          <div key={m.id} className={`flex flex-col ${m.role === "visitor" ? "items-start" : "items-end"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] ${m.role === "visitor" ? "bg-white shadow-sm" : m.role === "bot" ? "bg-violet-50 ring-1 ring-violet-200" : "bg-stone-900 text-white"}`}>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
                {m.role === "visitor" ? name : m.role === "bot" ? "AI answer" : "You"} · {time(m.created_at)}
              </div>
              <div className="prose-pc prose-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} />
              {m.sources.length > 0 && <div className="mt-1.5 text-xs text-violet-700">Sources: {m.sources.map((s) => s.title).join(", ")}</div>}
            </div>
          </div>
        ))}
      </div>
      <Composer id={c.id} hasEmail={!!c.email} onSent={load} />
    </section>
  );
}

const menuItem = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50";

function Controls({ id, status, tab, reload }: { id: string; status: string; tab: string; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = async (s: string) => { setOpen(false); setBusy(true); await api(`/conversations/${id}/status`, { body: { status: s } }).catch(() => {}); setBusy(false); reload(); };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    setTimeout(() => document.addEventListener("click", close, { once: true }));
    return () => document.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative flex">
      <button type="button" disabled={busy} onClick={() => set(status === "closed" ? "open" : "closed")}
        className="flex items-center gap-1.5 rounded-l-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-60">
        {status === "closed" ? "Reopen" : <><Check className="h-3.5 w-3.5" /> Resolve</>}
      </button>
      <button type="button" aria-label="More options" aria-expanded={open} onClick={() => setOpen(!open)}
        className="rounded-r-md border-l border-white/20 bg-stone-900 px-1.5 text-white"><ChevronDown className="h-4 w-4" /></button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {status !== "open" && <button type="button" className={menuItem} onClick={() => set("open")}>Mark as open</button>}
          {status !== "bot" && <button type="button" className={menuItem} onClick={() => set("bot")}><Bot className="h-3.5 w-3.5 text-stone-400" /> Hand back to the AI</button>}
          <button type="button" className={`${menuItem} border-t border-stone-100 text-red-600`}
            onClick={async () => { if (confirm("Delete this conversation? This can't be undone.")) { await api(`/conversations/${id}`, { method: "DELETE" }); go(`inbox/${tab}`); } }}>
            <Trash2 className="h-3.5 w-3.5" /> Delete conversation
          </button>
        </div>
      )}
    </div>
  );
}

function Composer({ id, hasEmail, onSent }: { id: string; hasEmail: boolean; onSent: () => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = mode === "note";
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(null);
    try { await api(`/conversations/${id}/reply`, { body: { body: text, note } }); setText(""); onSent(); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className={`border-t p-3 ${note ? "border-yellow-300 bg-yellow-50" : "border-stone-200 bg-white"}`}>
      <div className="mb-2 flex gap-1 text-[13px]">
        <button type="button" onClick={() => setMode("reply")} aria-pressed={!note}
          className={`rounded-md px-2.5 py-1 ${!note ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>Reply</button>
        <button type="button" onClick={() => setMode("note")} aria-pressed={note}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${note ? "bg-yellow-400 text-yellow-950" : "text-stone-600 hover:bg-stone-100"}`}>
          <Lock className="h-3 w-3" /> Private note
        </button>
        {!note && <span className="ml-auto self-center text-xs text-stone-400">{hasEmail ? "Shown in the chat and sent by email" : "Shown in the chat"}</span>}
      </div>
      <textarea value={text} rows={3} onChange={(e) => setText(e.target.value)}
        placeholder={note ? "Write a private note. Only you see it." : "Write a reply…"}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
        className={`w-full resize-none rounded-lg border px-3 py-2 outline-none ${note ? "border-yellow-300 bg-white focus:border-yellow-500" : "border-stone-200 focus:border-stone-400"}`} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {error && <span className="text-[13px] text-red-600">{error}</span>}
        <button onClick={send} disabled={busy || !text.trim()}
          className={`ml-auto rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40 ${note ? "bg-yellow-400 text-yellow-950" : "bg-stone-900 text-white"}`}>
          {busy ? "…" : note ? "Add note" : "Send"} <span className={`ml-1 text-xs ${note ? "text-yellow-800" : "text-stone-400"}`}>⌘↵</span>
        </button>
      </div>
    </div>
  );
}
