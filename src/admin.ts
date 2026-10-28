import { answer } from "./answer.ts";
import { addMessage, type Conversation, type Message } from "./chat.ts";
import { sendEmail } from "./email.ts";
import { HttpError, body, json, now, str, type Env } from "./env.ts";
import { addText, addWebsite, processPending, queueResync, removePinned, removeSource, savePinned, search } from "./knowledge.ts";
import { adminCookie, clearAdminCookie, clientIp, isAdmin, limit, same } from "./security.ts";
import { getSettings, saveSettings } from "./settings.ts";

const id = (s: string | undefined) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, "not found");
  return n;
};

export async function handleAdmin(req: Request, env: Env, ctx: ExecutionContext, path: string[]): Promise<Response> {
  if (!env.ADMIN_PASSWORD) throw new HttpError(503, "set the ADMIN_PASSWORD secret to use the admin page");
  // The session cookie is SameSite=Strict; checking Origin as well stops other sites posting to the admin API.
  if (req.method !== "GET" && req.headers.get("origin") !== new URL(req.url).origin) throw new HttpError(403, "request came from another site");

  if (path[0] === "login" && req.method === "POST") {
    await limit(env, `login:${clientIp(req)}`, 10, 900);
    const password = str((await body(req, 2000)).password, 500);
    if (!same(password, env.ADMIN_PASSWORD)) throw new HttpError(401, "wrong password");
    return json({ ok: true }, 200, { "set-cookie": await adminCookie(env) });
  }
  if (path[0] === "logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": clearAdminCookie });
  if (!(await isAdmin(req, env))) throw new HttpError(401, "sign in first");

  const [section, sub, action] = path;
  const m = req.method;

  if (section === "me") return json({ ok: true, llm: env.LLM_API_KEY ? env.LLM_MODEL : "Workers AI", vectors: !!env.VECTORS, email: !!(env.RESEND_API_KEY && env.EMAIL_FROM), notify: env.NOTIFY_EMAIL ?? null });

  if (section === "conversations" && !sub && m === "GET") {
    const status = new URL(req.url).searchParams.get("status") ?? "active";
    const where = status === "active" ? "c.status in ('waiting', 'open')" : status === "all" ? "1 = 1" : "c.status = ?1";
    const { results } = await env.DB.prepare(
      `select c.id, c.email, c.name, c.status, c.unread, c.page_url, c.updated_at,
         (select body from messages where conversation_id = c.id and role != 'note' order by id desc limit 1) as last
       from conversations c where ${where} and exists (select 1 from messages where conversation_id = c.id)
       order by c.updated_at desc limit 200`,
    ).bind(...(status === "active" || status === "all" ? [] : [status])).all();
    return json({ conversations: results });
  }

  if (section === "conversations" && sub) {
    const conv = await env.DB.prepare("select * from conversations where id = ?").bind(sub).first<Conversation>();
    if (!conv) throw new HttpError(404, "conversation not found");
    if (!action && m === "GET") {
      await env.DB.prepare("update conversations set unread = 0 where id = ?").bind(conv.id).run();
      const { results } = await env.DB.prepare("select * from messages where conversation_id = ? order by id").bind(conv.id).all<Message>();
      const { token_hash: _, ...rest } = { ...conv, unread: 0 };
      return json({ conversation: rest, messages: results.map((r) => ({ ...r, sources: r.sources ? JSON.parse(r.sources) : [] })) });
    }
    if (action === "reply" && m === "POST") {
      const input = await body(req, 20_000);
      const text = str(input.body, 8000);
      if (!text) throw new HttpError(400, "write a reply first");
      const note = input.note === true;
      const msg = await addMessage(env, conv.id, note ? "note" : "admin", text);
      let emailed = false;
      if (!note) {
        await env.DB.prepare("update conversations set status = 'open', updated_at = ? where id = ?").bind(now(), conv.id).run();
        if (conv.email) {
          const site = (await getSettings(env)).name;
          const page = conv.page_url ? `\n\nYou can also reply in the chat on ${conv.page_url}` : "";
          emailed = await sendEmail(env, conv.email, `Reply from ${site}`, `${text}${page}`, env.NOTIFY_EMAIL);
        }
      }
      return json({ message: msg, emailed });
    }
    if (action === "status" && m === "POST") {
      const status = str((await body(req, 1000)).status, 20);
      if (!["bot", "waiting", "open", "closed"].includes(status)) throw new HttpError(400, "unknown status");
      await env.DB.prepare("update conversations set status = ?, updated_at = ? where id = ?").bind(status, now(), conv.id).run();
      return json({ ok: true });
    }
    if (!action && m === "DELETE") {
      await env.DB.prepare("delete from conversations where id = ?").bind(conv.id).run();
      return json({ ok: true });
    }
  }

  if (section === "knowledge" && m === "GET") {
    const { results: sources } = await env.DB.prepare(
      `select s.id, s.kind, s.url, s.title, s.status, s.created_at, s.synced_at,
         (select count(*) from pages where source_id = s.id) as pages,
         (select count(*) from pages where source_id = s.id and status = 'done') as done,
         (select count(*) from pages where source_id = s.id and status = 'error') as failed,
         (select count(*) from chunks where source_id = s.id) as passages
       from sources s order by s.id desc`,
    ).all<{ status: string }>();
    const { results: pinned } = await env.DB.prepare("select id, question, answer, created_at from pinned order by id desc").all();
    // While someone is watching, keep reading pages rather than waiting for the next scheduled run.
    if (sources.some((s) => s.status === "reading")) ctx.waitUntil(processPending(env));
    return json({ sources, pinned });
  }

  if (section === "sources" && !sub && m === "POST") {
    const input = await body(req, 200_000);
    if (input.kind === "website") {
      const sid = await addWebsite(env, str(input.url, 2000));
      ctx.waitUntil(processPending(env));
      return json({ id: sid });
    }
    if (input.kind === "text") return json({ id: await addText(env, str(input.title, 200), str(input.text, 150_000)) });
    throw new HttpError(400, "kind must be website or text");
  }
  if (section === "sources" && sub) {
    const sid = id(sub);
    if (action === "pages" && m === "GET") {
      const { results } = await env.DB.prepare("select id, url, title, status, error, updated_at from pages where source_id = ? order by status = 'error' desc, url limit 1000").bind(sid).all();
      return json({ pages: results });
    }
    if (action === "resync" && m === "POST") {
      await queueResync(env, sid);
      ctx.waitUntil(processPending(env));
      return json({ ok: true });
    }
    if (!action && m === "DELETE") { await removeSource(env, sid); return json({ ok: true }); }
  }

  if (section === "pinned" && m === "POST") {
    const input = await body(req, 20_000);
    const pid = await savePinned(env, str(input.question, 300), str(input.answer, 5000), input.id ? id(String(input.id)) : undefined);
    return json({ id: pid });
  }
  if (section === "pinned" && sub && m === "DELETE") { await removePinned(env, id(sub)); return json({ ok: true }); }

  if (section === "test" && m === "POST") {
    const question = str((await body(req, 5000)).question, 1000);
    if (!question) throw new HttpError(400, "ask a question");
    const passages = await search(env, question);
    const reply = await answer(env, (await getSettings(env)).name, passages, [{ role: "visitor", body: question }]);
    return json({ ...reply, passages });
  }

  if (section === "settings") {
    if (m === "GET") return json(await getSettings(env));
    if (m === "POST") {
      try { return json(await saveSettings(env, await body(req, 10_000))); } catch (err) { if (err instanceof HttpError) throw err; throw new HttpError(400, (err as Error).message); }
    }
  }

  if (section === "export" && m === "GET") {
    const [sources, pinned, settings] = await Promise.all([
      env.DB.prepare("select kind, url, title, body from sources order by id").all(),
      env.DB.prepare("select question, answer from pinned order by id").all(),
      getSettings(env),
    ]);
    return json({ format: "pandadesk-lite-export", version: 1, exportedAt: new Date().toISOString(), settings, sources: sources.results, pinned: pinned.results }, 200,
      { "content-disposition": `attachment; filename="pandadesk-export.json"` });
  }

  throw new HttpError(404, "not found");
}
