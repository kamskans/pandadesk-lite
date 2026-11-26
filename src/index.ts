import { handleAdmin } from "./admin.ts";
import { handleChat } from "./chat.ts";
import { allowedOrigins, withConfig } from "./config.ts";
import { HttpError, fail, type Env } from "./env.ts";
import { processPending, queueResync } from "./knowledge.ts";

export default {
  async fetch(req, workerEnv, ctx): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      // AI and email settings saved on the admin page take over from the Worker's own.
      const env = parts[0] === "api" ? await withConfig(workerEnv) : workerEnv;
      if (parts[0] === "api" && parts[1] === "admin") return await handleAdmin(req, env, ctx, parts.slice(2));
      if (parts[0] === "api") return await handleChat(req, env, parts.slice(1));
      if (url.pathname === "/admin" || url.pathname === "/admin/") return env.ASSETS.fetch(new Request(new URL("/admin.html", url), req));
      if (url.pathname === "/chat" || url.pathname === "/chat.html") {
        // The asset server maps /chat to chat.html itself (and redirects /chat.html to /chat).
        const page = await env.ASSETS.fetch(new Request(new URL("/chat", url), req));
        // With allowed sites set, only they (and this Worker's own pages) may frame the chat.
        const allowed = allowedOrigins(await withConfig(workerEnv));
        if (!allowed.length) return page;
        const res = new Response(page.body, page);
        res.headers.set("content-security-policy", `frame-ancestors 'self' ${allowed.join(" ")}`);
        return res;
      }
      return env.ASSETS.fetch(req);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      console.error(err);
      return fail(500, "something went wrong");
    }
  },

  async scheduled(_event, workerEnv, ctx) {
    ctx.waitUntil((async () => {
      const env = await withConfig(workerEnv);
      await queueResync(env);
      await processPending(env);
      await env.DB.prepare("delete from rate where reset_at < unixepoch() - 86400").run();
    })());
  },
} satisfies ExportedHandler<Env>;
