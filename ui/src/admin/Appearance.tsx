import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Messenger from "../Messenger";
import { api, primary } from "./api";

const field = "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
const MAX_STARTERS = 4;
interface Look { name: string; color: string; textColor: string; greeting: string; starters: string[] }

/** Same contrast rule as the server: white or near-black text on the brand colour. */
function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0603 ? "#ffffff" : "#1c1917";
}

export default function Appearance({ onSaved }: { onSaved: (name: string) => void }) {
  const [v, setV] = useState<Look | null>(null);
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Look>("/settings").then(setV).catch(() => {}); }, []);
  if (!v) return null;
  const set = <K extends keyof Look>(k: K, value: Look[K]) => setV({ ...v, [k]: value });
  const valid = /^#[0-9a-f]{6}$/i.test(v.color);
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Chat appearance</h1>
      <p className="text-sm text-stone-500">How the chat looks on your website. The preview updates as you type.</p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <form className="min-w-0 space-y-8" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setState(null);
          try {
            const saved = await api<Look>("/settings", { body: { ...v, starters: v.starters.map((q) => q.trim()).filter(Boolean) } });
            setV(saved); onSaved(saved.name); setState({ ok: "Saved. Your website shows the new look on its next page load." });
          } catch (err) { setState({ error: (err as Error).message }); }
          setBusy(false);
        }}>
          <section className="space-y-4">
            <h2 className="font-semibold">Brand</h2>
            <label className="block">
              <span className="text-sm font-medium">Name</span>
              <span className="block text-xs text-stone-500">Shown at the top of the chat, e.g. your company or product.</span>
              <input value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={60} className={field} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Brand color</span>
              <span className="mt-1 flex items-center gap-2">
                <input type="color" value={valid ? v.color : "#1c1917"} onChange={(e) => set("color", e.target.value)} className="h-10 w-14 rounded border border-stone-300" aria-label="Brand color" />
                <input value={v.color} onChange={(e) => set("color", e.target.value)} className={`${field} mt-0 w-32 font-mono`} aria-label="Brand color hex" />
                <span className="text-xs text-stone-500">Text on it turns dark or light automatically so it stays readable.</span>
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Greeting</span>
              <input value={v.greeting} onChange={(e) => set("greeting", e.target.value)} maxLength={300} className={field} />
            </label>
          </section>
          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Starter questions</h2>
              <p className="text-sm text-stone-500">Buttons under the greeting that a visitor can click to ask. Shown until they send their first message.</p>
            </div>
            {v.starters.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={q} maxLength={80} placeholder={["What does it cost?", "How do I get started?", "Can I talk to someone?"][i % 3]}
                  onChange={(e) => set("starters", v.starters.map((x, j) => (j === i ? e.target.value : x)))}
                  aria-label={`Starter question ${i + 1}`} className={`${field} mt-0`} />
                <button type="button" aria-label={`Remove starter question ${i + 1}`} onClick={() => set("starters", v.starters.filter((_, j) => j !== i))}
                  className="rounded-md p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {v.starters.length < MAX_STARTERS && (
              <button type="button" onClick={() => set("starters", [...v.starters, ""])}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm text-stone-600 hover:border-stone-400 hover:bg-white">
                <Plus className="h-4 w-4" /> Add a question
              </button>
            )}
          </section>
          <div className="flex items-center gap-3">
            <button disabled={busy || !valid} className={primary}>{busy ? "Saving…" : "Save"}</button>
            {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
            {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
          </div>
        </form>
        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="mb-2 text-sm font-medium text-stone-500">Preview</div>
          <div className="h-[560px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
            <Messenger preview embedded={false}
              config={{ ...v, textColor: textOn(valid ? v.color : "#1c1917"), color: valid ? v.color : "#1c1917", starters: v.starters.map((q) => q.trim()).filter(Boolean), branding: true }} />
          </div>
        </div>
      </div>
    </div>
  );
}
