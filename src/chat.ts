import { answer, type Turn } from "./answer.ts";
import { block, blocked, countryBlocked, ipKey, screen, STRIKE_REPLIES, STRIKES_TO_CLOSE, type Strike } from "./abuse.ts";
import { sendEmail } from "./email.ts";
import { HttpError, body, json, now, str, type Env } from "./env.ts";
import { ftsQuery, search } from "./knowledge.ts";
import { clientIp, hit, limit, randomToken, same, sha256 } from "./security.ts";
import { getSettings } from "./settings.ts";

export interface Conversation { id: string; token_hash: string; email: string | null; name: string | null; status: string; unread: number; strikes: number; page_url: string | null; created_at: number; updated_at: number }

/** AI turns one chat may use, and one address per day, before the team takes over. */
export const AI_TURNS_PER_CHAT = 15;
export const AI_TURNS_PER_ADDRESS_DAY = 40;
const UNAVAILABLE = "Chat isn't available in your region.";
const PAUSED = "This chat is paused after repeated abusive or spam messages. Try again later.";
export interface Message { id: number; role: string; body: string; sources: string | null; created_at: number }

const visible = (m: Message) => ({ id: m.id, role: m.role, body: m.body, sources: m.sources ? JSON.parse(m.sources) : [], at: m.created_at });

async function visitorConversation(req: Request, env: Env, id: string) {
  const conv = await env.DB.prepare("select * from conversations where id = ?").bind(id).first<Conversation>();
  const token = req.headers.get("x-visitor-token") ?? "";
  if (!conv || !token || !same(conv.token_hash, await sha256(token))) throw new HttpError(404, "conversation not found");
  return conv;
}

async function addMessage(env: Env, conversationId: string, role: string, text: string, sources: unknown[] | null = null) {
  return (await env.DB.prepare("insert into messages (conversation_id, role, body, sources, created_at) values (?, ?, ?, ?, ?) returning *")
    .bind(conversationId, role, text, sources ? JSON.stringify(sources) : null, now()).first<Message>())!;
}

export { addMessage };

const adminLink = (req: Request, id: string) => `${new URL(req.url).origin}/admin#/c/${id}`;

/** Hand the chat to the team: mark it waiting and email them (at most once every 15 minutes per chat). */
async function handOff(req: Request, env: Env, conv: Conversation, latest: string) {
  await env.DB.prepare("update conversations set status = 'waiting', unread = unread + 1, updated_at = ? where id = ?").bind(now(), conv.id).run();
  await notifyTeam(req, env, conv, latest);
}

async function notifyTeam(req: Request, env: Env, conv: Conversation, latest: string) {
  if (!env.NOTIFY_EMAIL) return;
  const key = `notify:${conv.id}`;
  const recent = await env.DB.prepare("select reset_at from rate where key = ? and reset_at > ?").bind(key, now()).first();
  if (recent) return;
  await env.DB.prepare("insert into rate (key, count, reset_at) values (?, 1, ?) on conflict (key) do update set count = 1, reset_at = excluded.reset_at").bind(key, now() + 900).run();
  const who = conv.email ?? "A visitor";
  await sendEmail(env, env.NOTIFY_EMAIL, `${who} is waiting for a reply`, `${who} wrote:\n\n${latest}\n\nReply: ${adminLink(req, conv.id)}`, conv.email ?? undefined);
}

/** Count one AI answer against the site's daily limit, and email you at 80% and 100% (once a day each). */
async function spendDailyAnswer(req: Request, env: Env) {
  const max = Math.max(0, Number(env.AI_DAILY_LIMIT ?? 500) || 0);
  const ok = await hit(env, "ai:day", max, 86_400);
  const row = await env.DB.prepare("select count from rate where key = 'ai:day'").first<{ count: number }>();
  const used = row?.count ?? 0;
  const level = max > 0 && used >= max ? 100 : max > 0 && used >= Math.ceil(max * 0.8) ? 80 : 0;
  if (level && env.NOTIFY_EMAIL && (await hit(env, `ai-alert:${level}`, 1, 86_400))) {
    const text = level === 100
      ? `Your chat has used all ${max} of today's AI answers. For the next 24 hours, new questions go to you without an AI answer.`
      : `Your chat has used ${used} of today's ${max} AI answers. After ${max}, new questions go to you without an AI answer.`;
    await sendEmail(env, env.NOTIFY_EMAIL, level === 100 ? "AI answers used up for today" : "80% of today's AI answers used",
      `${text}\n\nIf that's more than usual, check the inbox for a visitor sending a lot of messages. Change the limit with AI_DAILY_LIMIT.\n\n${new URL(req.url).origin}/admin`);
  }
  return ok;
}

export async function handleChat(req: Request, env: Env, path: string[]): Promise<Response> {
  const ip = clientIp(req);
  // Turned off for this visitor's country: the widget doesn't mount on a 403 from /config.
  if (countryBlocked(req, env)) return json({ error: UNAVAILABLE, unavailable: true }, 403, { "access-control-allow-origin": "*" });
  if (path[0] === "config" && req.method === "GET") {
    const s = await getSettings(env);
    // The widget script reads the colour from the customer's own site, so this public endpoint allows any origin.
    return json({ ...s, branding: true }, 200, { "access-control-allow-origin": "*" });
  }
  if (path[0] !== "conversations") throw new HttpError(404, "not found");

  if (path.length === 1 && req.method === "POST") {
    await limit(env, `start:${ip}`, 20, 3600);
    if (await blocked(env, ip)) throw new HttpError(403, PAUSED);
    const input = await body(req, 5000);
    const id = crypto.randomUUID();
    const token = randomToken();
    const t = now();
    await env.DB.prepare("insert into conversations (id, token_hash, page_url, created_at, updated_at) values (?, ?, ?, ?, ?)")
      .bind(id, await sha256(token), str(input.pageUrl, 500) || null, t, t).run();
    return json({ id, token, status: "bot" });
  }

  const conv = await visitorConversation(req, env, path[1]);
  const action = path[2];

  if (action === "messages" && req.method === "GET") {
    const after = Number(new URL(req.url).searchParams.get("after")) || 0;
    const { results } = await env.DB.prepare("select * from messages where conversation_id = ? and id > ? and role != 'note' order by id limit 200").bind(conv.id, after).all<Message>();
    return json({ status: conv.status, email: conv.email, messages: results.map(visible) });
  }

  if (action === "messages" && req.method === "POST") {
    await limit(env, `msg:${ip}`, 30, 600);
    await limit(env, `msg:${conv.id}`, 60, 3600);
    if (conv.strikes >= STRIKES_TO_CLOSE || (await blocked(env, ip))) throw new HttpError(403, PAUSED);
    const text = str((await body(req, 10_000)).body, 4000);
    if (!text) throw new HttpError(400, "write a message first");
    const mine = await addMessage(env, conv.id, "visitor", text);
    const out = [visible(mine)];
    if (conv.status === "closed") {
      await env.DB.prepare("update conversations set status = 'waiting', unread = unread + 1, updated_at = ? where id = ?").bind(now(), conv.id).run();
      await notifyTeam(req, env, conv, text);
      return json({ status: "waiting", messages: out });
    }
    if (conv.status !== "bot") {
      await env.DB.prepare("update conversations set unread = unread + 1, updated_at = ? where id = ?").bind(now(), conv.id).run();
      await notifyTeam(req, env, conv, text);
      return json({ status: conv.status, messages: out });
    }
    const { results: past } = await env.DB.prepare("select role, body from messages where conversation_id = ? and role != 'note' order by id desc limit 10").bind(conv.id).all<Turn>();
    const history = past.reverse();
    const asked = history.filter((t) => t.role === "visitor").map((t) => t.body);
    const site = (await getSettings(env)).name;

    /** A calm reply with no AI call; the third strike closes the chat and blocks the address. */
    const strike = async (kind: Strike, reply?: string) => {
      const row = await env.DB.prepare("update conversations set strikes = strikes + 1, updated_at = ? where id = ? returning strikes").bind(now(), conv.id).first<{ strikes: number }>();
      if ((row?.strikes ?? 1) >= STRIKES_TO_CLOSE) {
        await env.DB.prepare("update conversations set status = 'closed' where id = ?").bind(conv.id).run();
        await block(env, ip);
        out.push(visible(await addMessage(env, conv.id, "bot", "This chat has been closed.")));
        return json({ status: "closed", messages: out });
      }
      out.push(visible(await addMessage(env, conv.id, "bot", reply ?? STRIKE_REPLIES[kind](site))));
      return json({ status: "bot", messages: out });
    };
    const rule = screen(text, asked.slice(0, -1));
    if (rule) return strike(rule);

    // Caps per chat and per address, then the site's daily limit: past any of them, you take over without the AI.
    const addr = await ipKey(ip);
    const capped = !(await hit(env, `ai:chat:${conv.id}`, AI_TURNS_PER_CHAT, 30 * 86_400))
      || (!!addr && !(await hit(env, `ai:ip:${addr}`, AI_TURNS_PER_ADDRESS_DAY, 86_400)))
      || !(await spendDailyAnswer(req, env));
    if (capped) {
      await handOff(req, env, conv, text);
      const msg = conv.email ? "I've passed your question to the team. They'll reply here and by email." : "I've passed your question to the team. Leave your email and they'll get back to you.";
      out.push(visible(await addMessage(env, conv.id, "bot", msg)));
      return json({ status: "waiting", messages: out });
    }
    let reply: { handoff: boolean; offTopic?: boolean; text: string };
    let passages: Awaited<ReturnType<typeof search>> = [];
    try {
      // Search for the latest message; a short follow-up ("and for teams?") also needs the one before it.
      passages = await search(env, text);
      if (passages.length < 2 && asked.length > 1 && ftsQuery(text).split(" OR ").length <= 1) passages = await search(env, asked.slice(-2).join("\n"));
      reply = await answer(env, site, passages, history);
    } catch (err) {
      console.error("answering failed:", (err as Error).message);
      reply = { handoff: true, text: "" };
    }
    if (reply.offTopic) return strike("free_work");
    if (reply.handoff) {
      await handOff(req, env, conv, text);
      const msg = conv.email
        ? "I'm not sure about that, so I've passed it to the team. They'll reply here and by email."
        : "I'm not sure about that, so I've passed it to the team. Leave your email and they'll get back to you.";
      out.push(visible(await addMessage(env, conv.id, "bot", msg)));
      return json({ status: "waiting", messages: out });
    }
    // Link the pages the answer most likely came from; a pinned answer on top has no page to link.
    const cited = passages[0]?.url ? passages.slice(0, 2).filter((p) => p.url).map((p) => ({ title: p.title, url: p.url })) : [];
    const unique = cited.filter((c, i) => cited.findIndex((x) => x.url === c.url) === i);
    out.push(visible(await addMessage(env, conv.id, "bot", reply.text, unique)));
    await env.DB.prepare("update conversations set updated_at = ? where id = ?").bind(now(), conv.id).run();
    return json({ status: "bot", messages: out });
  }

  if (action === "human" && req.method === "POST") {
    if (conv.status === "bot" || conv.status === "closed") await handOff(req, env, conv, "Asked to talk to a person.");
    const msg = conv.email ? "Okay, I've let the team know. They'll reply here and by email." : "Okay, I've let the team know. Leave your email so they can get back to you.";
    return json({ status: "waiting", messages: [visible(await addMessage(env, conv.id, "bot", msg))] });
  }

  if (action === "email" && req.method === "POST") {
    await limit(env, `email:${ip}`, 10, 3600);
    const input = await body(req, 2000);
    const email = str(input.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "that email doesn't look right");
    await env.DB.prepare("update conversations set email = ?, name = coalesce(?, name), updated_at = ? where id = ?").bind(email, str(input.name, 100) || null, now(), conv.id).run();
    const msg = await addMessage(env, conv.id, "bot", `Thanks! The team will reply to ${email}.`);
    const { results } = await env.DB.prepare("select body from messages where conversation_id = ? and role = 'visitor' order by id desc limit 1").bind(conv.id).all<{ body: string }>();
    await notifyTeam(req, env, { ...conv, email }, results[0]?.body ?? "(no message)");
    return json({ status: conv.status, email, messages: [visible(msg)] });
  }

  throw new HttpError(404, "not found");
}
