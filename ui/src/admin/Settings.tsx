import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";
import { api, primary } from "./api";

interface Me { llm: string; vectors: boolean; email: boolean; emailProvider: string; notify: string | null; aiDailyLimit: number; blockedCountries: string[]; identity: boolean; allowedOrigins: string[] }
type Source = "admin" | "worker" | null;
interface Secret { set: boolean; hint: string | null; source: Source }
interface Plain { value: string; source: Source }
interface Config {
  LLM_API_KEY: Secret; LLM_BASE_URL: Plain; LLM_MODEL: Plain;
  RESEND_API_KEY: Secret; BREVO_API_KEY: Secret; EMAIL_FROM: Plain; NOTIFY_EMAIL: Plain;
  AI_DAILY_LIMIT: Plain; BLOCKED_COUNTRIES: Plain; IDENTITY_SECRET: Secret; ALLOWED_ORIGINS: Plain;
}
type PlainName = "LLM_BASE_URL" | "LLM_MODEL" | "EMAIL_FROM" | "NOTIFY_EMAIL" | "AI_DAILY_LIMIT" | "BLOCKED_COUNTRIES" | "ALLOWED_ORIGINS";
type SecretName = "LLM_API_KEY" | "RESEND_API_KEY" | "BREVO_API_KEY" | "IDENTITY_SECRET";

const field = "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
const countryName = (code: string) => { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; } catch { return code; } };

function Row({ on, title, children }: { on: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${on ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>
        {on ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm text-stone-500">{children}</div>
      </div>
    </div>
  );
}

function Label({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{title}</span>
      {note && <span className="block text-xs text-stone-500">{note}</span>}
      {children}
    </label>
  );
}

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [plain, setPlain] = useState<Partial<Record<PlainName, string>>>({});
  const [loaded, setLoaded] = useState<Partial<Record<PlainName, string>>>({});
  // Keys are never shown again: a typed value replaces the saved one, "" removes it, undefined leaves it alone.
  const [keys, setKeys] = useState<Partial<Record<SecretName, string>>>({});
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [m, c] = await Promise.all([api<Me>("/me"), api<Config>("/config")]);
    setMe(m); setCfg(c); setKeys({});
    const values = { LLM_BASE_URL: c.LLM_BASE_URL.value, LLM_MODEL: c.LLM_MODEL.value, EMAIL_FROM: c.EMAIL_FROM.value, NOTIFY_EMAIL: c.NOTIFY_EMAIL.value, AI_DAILY_LIMIT: c.AI_DAILY_LIMIT.value, BLOCKED_COUNTRIES: c.BLOCKED_COUNTRIES.value, ALLOWED_ORIGINS: c.ALLOWED_ORIGINS.value };
    setPlain(values); setLoaded(values);
  };
  useEffect(() => { load().catch(() => {}); }, []);
  if (!me || !cfg) return null;

  const text = (name: PlainName, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={plain[name] ?? ""} onChange={(e) => setPlain({ ...plain, [name]: e.target.value })} className={field} {...props} />
  );
  const secret = (name: SecretName, placeholder: string) => {
    const s = cfg[name];
    const removing = keys[name] === "";
    return (
      <span className="mt-1 flex items-center gap-2">
        <input type="password" autoComplete="off" value={keys[name] ?? ""} onChange={(e) => setKeys({ ...keys, [name]: e.target.value || undefined })}
          placeholder={removing ? "Will be removed when you save" : s.set ? `Saved (${s.hint}). Type a new one to replace it.` : placeholder}
          className={`${field} mt-0 font-mono`} />
        {s.source === "admin" && !removing && (
          <button type="button" onClick={() => setKeys({ ...keys, [name]: "" })} className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50">Remove</button>
        )}
      </span>
    );
  };
  const fromWorker = (s: Source) => (s === "worker" ? " Currently set on the Worker; a value saved here takes over." : "");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-stone-500">Everything here is optional and can be changed any time. Values saved here take over from the Worker&apos;s own variables of the same name.</p>
      </div>

      <form className="space-y-8" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setState(null);
        try {
          // Only send what changed, so the Worker's own values keep applying to anything left alone.
          const changed = Object.fromEntries(Object.entries(plain).filter(([k, v]) => v.trim() !== (loaded[k as PlainName] ?? "")).map(([k, v]) => [k, v.trim()]));
          await api("/config", { body: { ...changed, ...keys } });
          await load();
          setState({ ok: "Saved. New chats use these settings straight away." });
        } catch (err) { setState({ error: (err as Error).message }); }
        setBusy(false);
      }}>
        <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
          <div>
            <h2 className="font-semibold">AI model</h2>
            <p className="text-sm text-stone-500">Answers use {me.llm}. Without a key, Cloudflare Workers AI answers for free within your Cloudflare plan.</p>
          </div>
          <Label title="API key" note={<>From OpenRouter, OpenAI, Anthropic or any OpenAI-compatible API.{fromWorker(cfg.LLM_API_KEY.source)}</>}>
            {secret("LLM_API_KEY", "sk-or-…")}
          </Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label title="API address">{text("LLM_BASE_URL", { placeholder: "https://openrouter.ai/api/v1" })}</Label>
            <Label title="Model">{text("LLM_MODEL", { placeholder: "openai/gpt-4o-mini" })}</Label>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
          <div>
            <h2 className="font-semibold">Email</h2>
            <p className="text-sm text-stone-500">Sent with <a href="https://www.brevo.com" target="_blank" rel="noreferrer" className="underline">Brevo</a> or <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">Resend</a> (add one key; Brevo is used if both are set): your replies go to visitors who left their address, and you get an alert when someone is waiting.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label title="Brevo API key" note={fromWorker(cfg.BREVO_API_KEY.source) || undefined}>{secret("BREVO_API_KEY", "xkeysib-…")}</Label>
            <Label title="Resend API key" note={fromWorker(cfg.RESEND_API_KEY.source) || undefined}>{secret("RESEND_API_KEY", "re_…")}</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label title="Send from" note="An address on a domain verified with your email provider.">{text("EMAIL_FROM", { placeholder: "Support <help@yourdomain.com>" })}</Label>
            <Label title="Send alerts to" note="Where you're told someone is waiting.">{text("NOTIFY_EMAIL", { type: "email", placeholder: "you@yourdomain.com" })}</Label>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="font-semibold">Limits</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label title="AI answers per day" note="After this, new questions come straight to you.">{text("AI_DAILY_LIMIT", { inputMode: "numeric", placeholder: "500" })}</Label>
            <Label title="Blocked countries" note={<>Two-letter codes, e.g. <code>PK, BD</code>. A VPN can get around it.</>}>{text("BLOCKED_COUNTRIES", { placeholder: "None" })}</Label>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
          <div>
            <h2 className="font-semibold">Your site</h2>
            <p className="text-sm text-stone-500">Optional. Limit where the chat appears, and let your own app tell the chat who a signed-in visitor is.</p>
          </div>
          <Label title="Allowed sites" note={<>Full addresses, e.g. <code>https://app.example.com</code>. Empty: any site can show the chat.</>}>{text("ALLOWED_ORIGINS", { placeholder: "Any site" })}</Label>
          <Label title="Identity secret" note={<>Shared with your app&apos;s server, which signs each signed-in visitor (see the README). At least 16 characters.{fromWorker(cfg.IDENTITY_SECRET.source)}</>}>{secret("IDENTITY_SECRET", "e.g. from openssl rand -hex 32")}</Label>
        </section>

        <div className="flex items-center gap-3">
          <button disabled={busy} className={primary}>{busy ? "Saving…" : "Save settings"}</button>
          {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
          {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">Status</h2>
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <Row on title="AI model">Answers use {me.llm}.</Row>
          <Row on={me.vectors} title="Search by meaning">{me.vectors ? "On (Cloudflare Vectorize)." : "Off: create the Vectorize index from the README. Keyword search still works."}</Row>
          <Row on={me.email} title="Email to visitors">{me.email ? `Your replies are also emailed (with ${me.emailProvider}) to visitors who left their address.` : "Off: add a Brevo or Resend key and a sender above."}</Row>
          <Row on={!!me.notify && me.email} title="Alerts to you">{me.notify && me.email ? `New hand-offs are emailed to ${me.notify}.` : "Off: add a Brevo or Resend key, a sender and an alert address above."}</Row>
          <Row on title="Daily AI limit">Up to {me.aiDailyLimit} AI answers a day, then new questions come straight to you.</Row>
          <Row on={me.blockedCountries.length > 0} title="Blocked countries">{me.blockedCountries.length
            ? <>The chat doesn&apos;t appear for visitors from {me.blockedCountries.map(countryName).join(", ")}.</>
            : "Off: the chat is available everywhere."}</Row>
          <Row on={me.allowedOrigins.length > 0} title="Allowed sites">{me.allowedOrigins.length ? <>The chat only appears on {me.allowedOrigins.join(", ")}.</> : "Off: any site can show the chat."}</Row>
          <Row on={me.identity} title="Signed-in visitors">{me.identity ? "On: visitors your app signs in are named in the inbox and aren't asked for their email." : "Off: visitors are anonymous until they leave their email."}</Row>
          <Row on title="Abuse protection">Abuse, link spam, repeated messages and requests to make images or other work for free get a short reply with no AI call. The third closes the chat and blocks the visitor&apos;s address for a day (a month the second time). Each chat gets at most 15 AI answers, and each address 40 a day.</Row>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Export</h2>
        <p className="text-sm text-stone-500">Download your sources, pinned answers and chat settings as JSON. Keys aren&apos;t included.</p>
        <a href="/api/admin/export" download="pandadesk-export.json" className="inline-block rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-50">Download export</a>
      </section>
    </div>
  );
}
