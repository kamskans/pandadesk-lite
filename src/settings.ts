import { str, type Env } from "./env.ts";

export interface Settings { name: string; color: string; greeting: string; starters: string[] }

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare("select key, value from settings").all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    name: s.name || env.SITE_NAME || "Support",
    color: /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : "#2f6f4f",
    greeting: s.greeting || "Hi! Ask me anything about us, or leave a message for the team.",
    starters: s.starters ? (JSON.parse(s.starters) as string[]) : [],
  };
}

export async function saveSettings(env: Env, input: Record<string, unknown>) {
  const color = str(input.color, 7);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("colour must look like #2f6f4f");
  const starters = Array.isArray(input.starters) ? input.starters.map((x) => str(x, 120)).filter(Boolean).slice(0, 4) : [];
  const values: [string, string][] = [["name", str(input.name, 60)], ["color", color], ["greeting", str(input.greeting, 300)], ["starters", JSON.stringify(starters)]];
  await env.DB.batch(values.map(([k, v]) => env.DB.prepare("insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value").bind(k, v)));
  return getSettings(env);
}
