import { str, type Env } from "./env.ts";

export interface Settings { name: string; color: string; textColor: string; greeting: string; starters: string[] }

/** Text on the brand colour: white or near-black, whichever has more contrast. */
export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0603 ? "#ffffff" : "#1c1917";
}

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare("select key, value from settings").all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const color = /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : "#1c1917";
  return {
    name: s.name || env.SITE_NAME || "Support",
    color,
    textColor: textOn(color),
    greeting: s.greeting || "Hi! How can we help?",
    starters: s.starters ? (JSON.parse(s.starters) as string[]) : [],
  };
}

export async function saveSettings(env: Env, input: Record<string, unknown>) {
  const color = str(input.color, 7);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("colour must look like #1c1917");
  const starters = Array.isArray(input.starters) ? input.starters.map((x) => str(x, 120)).filter(Boolean).slice(0, 4) : [];
  const values: [string, string][] = [["name", str(input.name, 60)], ["color", color], ["greeting", str(input.greeting, 300)], ["starters", JSON.stringify(starters)]];
  await env.DB.batch(values.map(([k, v]) => env.DB.prepare("insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value").bind(k, v)));
  return getSettings(env);
}
