import type { Env } from "./env.ts";

/** "Support <help@site.com>" → { name, email }. */
export function parseFrom(raw: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  return m ? { ...(m[1] ? { name: m[1].replace(/^"|"$/g, "") } : {}), email: m[2].trim() } : { email: raw.trim() };
}

/** Whether email can be sent: a Brevo or Resend key, and a sender. */
export const emailReady = (env: Env) => !!((env.BREVO_API_KEY || env.RESEND_API_KEY) && env.EMAIL_FROM);

/** Send an email with Brevo or Resend (Brevo wins when both are set); otherwise do nothing. */
export async function sendEmail(env: Env, to: string, subject: string, text: string, replyTo?: string) {
  if (!emailReady(env) || !to) return false;
  const brevo = !!env.BREVO_API_KEY;
  try {
    const res = brevo
      ? await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: parseFrom(env.EMAIL_FROM!), to: [{ email: to }], subject, textContent: text, ...(replyTo ? { replyTo: { email: replyTo } } : {}) }),
          signal: AbortSignal.timeout(10_000),
        })
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
          signal: AbortSignal.timeout(10_000),
        });
    if (!res.ok) console.warn(`email not sent (${brevo ? "Brevo" : "Resend"}):`, res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.warn("email not sent:", (err as Error).message);
    return false;
  }
}
