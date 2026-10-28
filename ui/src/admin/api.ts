export class SignedOut extends Error {}

export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") { window.dispatchEvent(new Event("pandadesk:signed-out")); throw new SignedOut(data.error); }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export function ago(t: number) {
  const s = Date.now() / 1000 - t;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const time = (t: number) => new Date(t * 1000).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
export const when = (t: number | null) => (t ? new Date(t * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "never");

export const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-500";
export const primary = "rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50";
