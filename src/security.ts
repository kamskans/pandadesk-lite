import { HttpError, now, type Env } from "./env.ts";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

/** Compare two strings in time that doesn't depend on where they differ. */
export function same(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export const randomToken = (bytes = 24) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);

const COOKIE = "pd_admin";
const SESSION_DAYS = 14;

/** The admin session is `<expiry>.<HMAC of expiry>`, signed with the admin password: changing it signs everyone out. */
export async function adminCookie(env: Env) {
  const exp = now() + SESSION_DAYS * 86400;
  const value = `${exp}.${await hmac(env.ADMIN_PASSWORD!, `admin:${exp}`)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearAdminCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function isAdmin(req: Request, env: Env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([0-9a-f]{64})`).exec(req.headers.get("cookie") ?? "");
  if (!m || Number(m[1]) < now()) return false;
  return same(m[2], await hmac(env.ADMIN_PASSWORD, `admin:${m[1]}`));
}

/** Count one use of `key`; false once it has been used `limit` times in the window. */
export async function hit(env: Env, key: string, limit: number, windowSeconds: number) {
  const t = now();
  const row = await env.DB.prepare(
    `insert into rate (key, count, reset_at) values (?1, 1, ?2)
     on conflict (key) do update set
       count = case when reset_at <= ?3 then 1 else count + 1 end,
       reset_at = case when reset_at <= ?3 then ?2 else reset_at end
     returning count`,
  ).bind(key, t + windowSeconds, t).first<{ count: number }>();
  return (row?.count ?? 0) <= limit;
}

export async function limit(env: Env, key: string, max: number, windowSeconds: number) {
  if (!(await hit(env, key, max, windowSeconds))) throw new HttpError(429, "too many requests, try again in a little while");
}

export const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") ?? "local";
