import { HttpError, str, type Env } from "./env.ts";

/**
 * Settings you can change on the admin page after deploying, instead of setting them on the Worker first.
 * A value saved on the admin page wins; otherwise the Worker's secret or variable of the same name is used.
 * They're stored in D1 under "cfg:NAME". Keys are never sent back to the browser, only their last 4 characters.
 */
export const FIELDS = {
  LLM_API_KEY: { secret: true, max: 500 },
  LLM_BASE_URL: { secret: false, max: 300 },
  LLM_MODEL: { secret: false, max: 200 },
  RESEND_API_KEY: { secret: true, max: 500 },
  EMAIL_FROM: { secret: false, max: 200 },
  NOTIFY_EMAIL: { secret: false, max: 200 },
  AI_DAILY_LIMIT: { secret: false, max: 7 },
  BLOCKED_COUNTRIES: { secret: false, max: 500 },
} as const;
export type Field = keyof typeof FIELDS;
const NAMES = Object.keys(FIELDS) as Field[];

async function saved(env: Env): Promise<Partial<Record<Field, string>>> {
  const { results } = await env.DB.prepare("select key, value from settings where key like 'cfg:%'").all<{ key: string; value: string }>();
  const out: Partial<Record<Field, string>> = {};
  for (const r of results) {
    const name = r.key.slice(4) as Field;
    if (name in FIELDS && r.value) out[name] = r.value;
  }
  return out;
}

/** The Worker's env with anything saved on the admin page laid over it. */
export async function withConfig(env: Env): Promise<Env> {
  try {
    return { ...env, ...(await saved(env)) };
  } catch {
    return env; // before the first migration there's no settings table yet
  }
}

const hint = (v: string) => (v.length > 8 ? `…${v.slice(-4)}` : "set");

/** What the Settings page shows: each value (or a hint for keys) and where it comes from. */
export async function configStatus(env: Env) {
  const mine = await saved(env);
  const worker = env as unknown as Record<string, string | undefined>;
  return Object.fromEntries(NAMES.map((name) => {
    const own = mine[name];
    const fromWorker = worker[name] || undefined;
    const value = own ?? fromWorker;
    const source = own ? "admin" : fromWorker ? "worker" : null;
    return [name, FIELDS[name].secret ? { set: !!value, hint: value ? hint(value) : null, source } : { value: value ?? "", source }];
  }));
}

function check(name: Field, v: string) {
  if (!v) return v;
  if (name === "LLM_BASE_URL") {
    let u: URL;
    try { u = new URL(v); } catch { throw new HttpError(400, "the AI API address must be a full URL, like https://openrouter.ai/api/v1"); }
    if (u.protocol !== "https:") throw new HttpError(400, "the AI API address must start with https://");
    return v.replace(/\/+$/, "");
  }
  if (name === "NOTIFY_EMAIL" && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) throw new HttpError(400, "the alert address doesn't look like an email address");
  if (name === "EMAIL_FROM" && !/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/.test(v)) throw new HttpError(400, "the sender should be an address, like Support <help@yourdomain.com>");
  if (name === "AI_DAILY_LIMIT") {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new HttpError(400, "the daily AI limit must be a whole number");
    return String(n);
  }
  if (name === "BLOCKED_COUNTRIES") {
    const codes = v.toUpperCase().split(/[\s,;]+/).filter(Boolean);
    const bad = codes.find((c) => !/^[A-Z]{2}$/.test(c));
    if (bad) throw new HttpError(400, `"${bad}" isn't a two-letter country code`);
    return [...new Set(codes)].join(", ");
  }
  return v;
}

/**
 * Save what the Settings page sent. A field left out stays as it is; an empty string removes the admin page's value,
 * so the Worker's own setting (if any) applies again.
 */
export async function saveConfig(env: Env, input: Record<string, unknown>) {
  const writes: D1PreparedStatement[] = [];
  for (const name of NAMES) {
    if (!(name in input) || input[name] === undefined || input[name] === null) continue;
    if (typeof input[name] !== "string") throw new HttpError(400, `${name} must be text`);
    const v = check(name, str(input[name], FIELDS[name].max));
    writes.push(v
      ? env.DB.prepare("insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value").bind(`cfg:${name}`, v)
      : env.DB.prepare("delete from settings where key = ?").bind(`cfg:${name}`));
  }
  if (writes.length) await env.DB.batch(writes);
}
