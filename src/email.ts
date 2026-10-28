import type { Env } from "./env.ts";

/** Send an email with Resend if it's set up; otherwise do nothing. */
export async function sendEmail(env: Env, to: string, subject: string, text: string, replyTo?: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn("email not sent:", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.warn("email not sent:", (err as Error).message);
    return false;
  }
}
