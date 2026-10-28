import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";
import { api } from "./api";

interface Me { llm: string; vectors: boolean; email: boolean; notify: string | null }

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

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/me").then(setMe).catch(() => {}); }, []);
  if (!me) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-stone-500">These are set with environment variables on your Worker (<code>npx wrangler secret put NAME</code>). See the README for each one.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <Row on title="AI model">Answers use {me.llm}. Set <code>LLM_API_KEY</code>, <code>LLM_BASE_URL</code> and <code>LLM_MODEL</code> to use your own provider.</Row>
        <Row on={me.vectors} title="Search by meaning">{me.vectors ? "On (Cloudflare Vectorize)." : "Off: create the Vectorize index from the README. Keyword search still works."}</Row>
        <Row on={me.email} title="Email to visitors">{me.email ? "Your replies are also emailed to visitors who left their address (Resend)." : <>Off: set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to email visitors your replies.</>}</Row>
        <Row on={!!me.notify} title="Alerts to you">{me.notify ? `New hand-offs are emailed to ${me.notify}.` : <>Off: set <code>NOTIFY_EMAIL</code> to be emailed when someone is waiting for a reply.</>}</Row>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">Export</h2>
        <p className="text-sm text-stone-500">Download your sources, pinned answers and chat settings as JSON.</p>
        <a href="/api/admin/export" download="pandadesk-export.json" className="inline-block rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-50">Download export</a>
      </section>
    </div>
  );
}
