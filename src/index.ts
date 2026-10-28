import { handleAdmin } from "./admin.ts";
import { handleChat } from "./chat.ts";
import { HttpError, fail, type Env } from "./env.ts";
import { processPending, queueResync } from "./knowledge.ts";

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (parts[0] === "api" && parts[1] === "admin") return await handleAdmin(req, env, ctx, parts.slice(2));
      if (parts[0] === "api") return await handleChat(req, env, parts.slice(1));
      if (url.pathname === "/admin" || url.pathname === "/admin/") return env.ASSETS.fetch(new Request(new URL("/admin.html", url), req));
      if (url.pathname === "/chat") return env.ASSETS.fetch(new Request(new URL("/chat.html", url), req));
      return env.ASSETS.fetch(req);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      console.error(err);
      return fail(500, "something went wrong");
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      await queueResync(env);
      await processPending(env);
      await env.DB.prepare("delete from rate where reset_at < unixepoch() - 86400").run();
    })());
  },
} satisfies ExportedHandler<Env>;
