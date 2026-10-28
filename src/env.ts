export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: Ai;
  VECTORS?: VectorizeIndex;
  SITE_NAME: string;
  ADMIN_PASSWORD?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  MAX_PAGES?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NOTIFY_EMAIL?: string;
}

export const now = () => Math.floor(Date.now() / 1000);

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export const fail = (status: number, error: string) => json({ error }, status);

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Read a JSON body no bigger than `max` bytes. */
export async function body<T = Record<string, unknown>>(req: Request, max = 100_000): Promise<T> {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, "request is too large");
  try { return (text ? JSON.parse(text) : {}) as T; } catch { throw new HttpError(400, "body must be JSON"); }
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
