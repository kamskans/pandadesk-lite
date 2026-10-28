import { useCallback, useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdown";
import { LogoMark } from "./Logo";

export interface ChatConfig { name: string; color: string; textColor: string; greeting: string; starters: string[]; branding: boolean }

interface ServerMessage { id: number; role: "visitor" | "bot" | "admin"; body: string; at: number }
interface Message { id: number; role: "visitor" | "ai" | "agent"; body: string }
type Status = "ai" | "open" | "closed";

const KEY = "pandadesk:conversation";
const load = (): { id: string; token: string } | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };
const save = (v: { id: string; token: string } | null) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* private mode */ } };

const toMessage = (m: ServerMessage): Message => ({ id: m.id, role: m.role === "visitor" ? "visitor" : m.role === "admin" ? "agent" : "ai", body: m.body });
const toStatus = (s: string): Status => (s === "bot" ? "ai" : s === "closed" ? "closed" : "open");

/**
 * The chat a visitor sees. In the widget it fills the iframe; in the admin's appearance preview (`preview`) it only
 * shows the greeting and starter questions and never talks to the server.
 */
export default function Messenger({ config, embedded = true, preview = false }: { config: ChatConfig; embedded?: boolean; preview?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("ai");
  const [email, setEmail] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const conv = useRef(preview ? null : load());
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const shown = useRef(!embedded);
  const sending = useRef(false);
  const lastPoll = useRef(0);
  const seenReplies = useRef<number | null>(null);
  const page = useRef<string | null>(null);

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`/api${path}`, {
      ...init, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(conv.current ? { "x-visitor-token": conv.current.token } : {}), ...init.headers },
    }).catch(() => null);
    if (res?.status === 404 && conv.current) { save(null); conv.current = null; setMessages([]); setStatus("ai"); }
    return res;
  }, []);

  const apply = useCallback((data: { status: string; email?: string | null; messages: ServerMessage[] }, replace: boolean) => {
    setStatus(toStatus(data.status));
    if (data.email !== undefined) setEmail(data.email);
    if (data.status !== "bot") setHandedOff(true);
    setMessages((prev) => {
      const next = replace ? data.messages.map(toMessage) : [...prev, ...data.messages.map(toMessage).filter((m) => !prev.some((p) => p.id === m.id))];
      if (embedded) {
        const replies = next.filter((m) => m.role !== "visitor").length;
        if (shown.current || seenReplies.current === null) seenReplies.current = replies;
        window.parent?.postMessage({ pandadesk: true, type: "unread", unread: !shown.current && replies > (seenReplies.current ?? replies) }, "*");
      }
      return next;
    });
  }, [embedded]);

  const poll = useCallback(async () => {
    if (!conv.current || sending.current) return;
    lastPoll.current = Date.now();
    const res = await call(`/conversations/${conv.current.id}/messages`);
    if (res?.ok && !sending.current) apply(await res.json(), true);
  }, [call, apply]);

  useEffect(() => {
    if (preview) return;
    page.current = new URLSearchParams(location.search).get("page") || (window.parent === window ? location.href : null);
    if (window.parent === window) shown.current = true;
    poll();
    // Every 3 seconds while the chat is open; every 45 while it's closed, just enough to show an unread dot.
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (shown.current || Date.now() - lastPoll.current > 45_000) poll();
    }, 3000);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !e.data?.pandadesk) return;
      if (e.data.type === "focus") { shown.current = true; input.current?.focus(); poll(); }
      if (e.data.type === "hidden") shown.current = false;
    };
    window.addEventListener("message", onMessage);
    if (embedded) window.parent?.postMessage({ pandadesk: true, type: "ready", brandColor: config.color }, "*");
    return () => { clearInterval(t); window.removeEventListener("message", onMessage); };
  }, [poll, preview, embedded, config.color]);

  // Scroll the message list only: scrollIntoView would also scroll the page around an embedded chat.
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages.length, pending]);

  async function send(text?: string) {
    const body = (text ?? draft).trim();
    if (!body || pending || preview) return;
    if (text === undefined) setDraft("");
    setPending(body); setError(null);
    sending.current = true;
    if (!conv.current) {
      const res = await call("/conversations", { method: "POST", body: JSON.stringify({ pageUrl: page.current }) });
      if (res?.ok) { const c = await res.json(); conv.current = { id: c.id, token: c.token }; save(conv.current); }
    }
    const res = conv.current ? await call(`/conversations/${conv.current.id}/messages`, { method: "POST", body: JSON.stringify({ body }) }) : null;
    if (res?.ok) apply(await res.json(), false);
    else {
      const data = await res?.json().catch(() => null);
      setError(res?.status === 429 ? "You're sending messages too fast. Wait a moment." : data?.error ?? "Couldn't send. Try again.");
      setDraft(body);
    }
    sending.current = false;
    setPending(null);
  }

  async function askPerson() {
    if (!conv.current) return;
    const res = await call(`/conversations/${conv.current.id}/human`, { method: "POST", body: "{}" });
    if (res?.ok) apply(await res.json(), false);
  }

  const brand = config.color;
  const ink = config.textColor;
  const botName = config.name;
  const hasAiAnswer = messages.some((m) => m.role === "ai");

  return (
    <div className={`flex ${embedded ? "h-dvh" : "h-full"} flex-col bg-white text-[15px] text-stone-900`} style={{ ["--brand" as string]: brand, ["--brand-ink" as string]: ink, ["--brand-link" as string]: ink === "#ffffff" ? brand : "#1c1917" }}>
      <header className="flex items-center gap-3 px-4 py-3.5" style={{ background: brand, color: ink }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10 font-semibold">{botName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{config.name}</div>
          <div className="text-xs opacity-80">{status !== "ai" ? "The team will reply here" : "AI answers instantly · the team steps in"}</div>
        </div>
        {embedded && (
          <button aria-label="Close" onClick={() => window.parent?.postMessage({ pandadesk: true, type: "close" }, "*")} className="rounded-md p-1.5 hover:bg-black/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </header>

      <div ref={log} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <Bubble side="left" label={botName}>{config.greeting}</Bubble>
        {!messages.length && !pending && config.starters.length > 0 && (
          <div className="flex flex-col items-end gap-1.5" aria-label="Suggested questions">
            {config.starters.map((q) => (
              <button key={q} type="button" onClick={() => send(q)}
                className="max-w-[85%] rounded-full border px-3.5 py-1.5 text-left text-[14px] hover:opacity-80"
                style={{ borderColor: brand, color: "var(--brand-link)" }}>{q}</button>
            ))}
          </div>
        )}
        {messages.map((m) =>
          m.role === "visitor" ? (
            <Bubble key={m.id} side="right" brand={brand} ink={ink}>{m.body}</Bubble>
          ) : (
            <Bubble key={m.id} side="left" label={m.role === "agent" ? "Support" : botName}>
              <div className="prose-pc prose-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} />
            </Bubble>
          ),
        )}
        {pending && (
          <>
            <Bubble side="right" brand={brand} ink={ink}>{pending}</Bubble>
            <div className="flex gap-1 px-2 py-1" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-stone-300" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          </>
        )}
        {handedOff && status !== "ai" && !email && !pending && conv.current && (
          <EmailAsk key={conv.current.id} brand={brand} conversationId={conv.current.id}
            submit={async (value) => {
              const res = await call(`/conversations/${conv.current!.id}/email`, { method: "POST", body: JSON.stringify({ email: value }) });
              if (res?.ok) { apply(await res.json(), false); return null; }
              return (await res?.json().catch(() => null))?.error ?? "Couldn't save it. Try again.";
            }} />
        )}
        {hasAiAnswer && status === "ai" && !pending && (
          <div className="pt-1 text-center">
            <button onClick={askPerson} className="rounded-full border border-stone-200 px-3 py-1.5 text-[13px] text-stone-600 hover:bg-stone-50">
              Talk to a person
            </button>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-stone-200 p-3">
        {error && <div className="mb-2 text-[13px] text-red-600">{error}</div>}
        <div className="flex items-end gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 focus-within:border-stone-400">
          <textarea
            ref={input} value={draft} rows={1} placeholder="Ask a question…" aria-label="Message"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="max-h-32 flex-1 resize-none bg-transparent py-1 outline-none placeholder:text-stone-400"
          />
          <button type="submit" disabled={!draft.trim() || !!pending} aria-label="Send"
            className="rounded-lg p-2 disabled:opacity-40" style={{ background: brand, color: ink }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        {config.branding && (
          <a href="https://pandadesk.app/?ref=lite" target="_blank" rel="noopener"
            className="mt-2 flex items-center justify-center gap-1 text-[11px] text-stone-400 hover:text-stone-600">
            <LogoMark className="h-3.5 w-3.5" /> Powered by PandaDesk
          </a>
        )}
      </form>
    </div>
  );
}

function Bubble({ side, label, brand, ink, children }: { side: "left" | "right"; label?: string; brand?: string; ink?: string; children: React.ReactNode }) {
  if (side === "right") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2" style={{ background: brand, color: ink ?? "#fff" }}>{children}</div>
      </div>
    );
  }
  return (
    <div className="max-w-[88%]">
      {label && <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</div>}
      <div className="rounded-2xl rounded-bl-md bg-stone-100 px-3.5 py-2.5">{children}</div>
    </div>
  );
}

/** After a hand-off: an optional email, so the team's reply reaches a visitor who closes the page. */
function EmailAsk({ brand, conversationId, submit }: { brand: string; conversationId: string; submit: (email: string) => Promise<string | null> }) {
  const skipKey = `pandadesk:email-skipped:${conversationId}`;
  const [skipped, setSkipped] = useState(() => { try { return localStorage.getItem(skipKey) === "1"; } catch { return false; } });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (skipped) return null;
  return (
    <form className="mx-auto max-w-[90%] rounded-xl border border-stone-200 bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setBusy(true); setError(null);
        const err = await submit(email.trim());
        if (err) { setError(err); setBusy(false); }
      }}>
      <div className="text-[13px] font-medium">Get the reply by email</div>
      <p className="mt-0.5 text-[12px] text-stone-500">Leave your email and we&apos;ll send the team&apos;s reply there too, in case you close this page.</p>
      <div className="mt-2 flex gap-1.5">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Your email" autoComplete="email"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-stone-400" />
        <button disabled={busy} className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-50" style={{ background: brand, color: "var(--brand-ink, #fff)" }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
      <button type="button" onClick={() => { try { localStorage.setItem(skipKey, "1"); } catch { /* private mode */ } setSkipped(true); }}
        className="mt-1.5 text-[12px] text-stone-500 hover:underline">No thanks</button>
    </form>
  );
}
