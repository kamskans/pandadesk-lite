import { answer, type Turn } from "./answer.ts";
import { sendEmail } from "./email.ts";
import { HttpError, body, json, now, str, type Env } from "./env.ts";
import { ftsQuery, search } from "./knowledge.ts";
import { clientIp, limit, randomToken, same, sha256 } from "./security.ts";
import { getSettings } from "./settings.ts";

export interface Conversation { id: string; token_hash: string; email: string | null; name: string | null; status: string; unread: number; page_url: string | null; created_at: number; updated_at: number }
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

export async function handleChat(req: Request, env: Env, path: string[]): Promise<Response> {
  const ip = clientIp(req);
  if (path[0] === "config" && req.method === "GET") {
    const s = await getSettings(env);
    // The widget script reads the colour from the customer's own site, so this public endpoint allows any origin.
    return json({ ...s, branding: true }, 200, { "access-control-allow-origin": "*" });
  }
  if (path[0] !== "conversations") throw new HttpError(404, "not found");

  if (path.length === 1 && req.method === "POST") {
    await limit(env, `start:${ip}`, 20, 3600);
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
    let reply: { handoff: boolean; text: string };
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
