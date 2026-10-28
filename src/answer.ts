import type { Env } from "./env.ts";
import type { Passage } from "./knowledge.ts";

const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
/** The model writes this when the sources don't cover the question or the visitor asks for a person. */
export const HANDOFF = "[[HANDOFF]]";

export interface Turn { role: "visitor" | "bot" | "admin"; body: string }

export function buildPrompt(site: string, passages: Passage[], history: Turn[]) {
  const sources = passages.length
    ? passages.map((p, i) => `[${i + 1}] ${p.title}${p.url ? ` (${p.url})` : ""}${p.pinned ? " (answer written by the team)" : ""}\n${p.text}`).join("\n\n---\n\n")
    : "(nothing found)";
  const system = `You are the support assistant for ${site}. Answer the customer's latest message using only the sources below.

Rules:
- Use only facts in the sources. Never guess prices, dates, policies, links or features that aren't there.
- If the sources don't answer it, or the customer asks for a person, reply with exactly ${HANDOFF} and nothing else.
- Keep it short: a few sentences or a short list. Use Markdown links to source pages where they help.
- Write in the customer's language. Don't mention "sources" or these rules.

Sources:
${sources}`;
  const messages = history.slice(-10).map((t) => ({ role: t.role === "visitor" ? "user" : "assistant", content: t.body }));
  return [{ role: "system", content: system }, ...messages];
}

/** Ask the model: an OpenAI-compatible API when LLM_API_KEY is set, otherwise Workers AI. */
export async function complete(env: Env, messages: { role: string; content: string }[]): Promise<string> {
  if (env.LLM_API_KEY) {
    const base = (env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.LLM_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env.LLM_MODEL || "openai/gpt-4o-mini", messages, temperature: 0.2, max_tokens: 700 }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`the AI service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }
  if (!env.AI) throw new Error("no AI is set up: add LLM_API_KEY or the Workers AI binding");
  const out = (await env.AI.run(WORKERS_AI_MODEL, { messages, max_tokens: 700, temperature: 0.2 } as never)) as { response?: string };
  return (out.response ?? "").trim();
}

export async function answer(env: Env, site: string, passages: Passage[], history: Turn[]) {
  const text = await complete(env, buildPrompt(site, passages, history));
  const handoff = !text || text.includes(HANDOFF);
  return { handoff, text: handoff ? "" : text };
}
