# PandaDesk Lite

An AI support chat for one website, running on your own Cloudflare account with your own keys.

It reads your website and docs and answers visitors' questions from them. When it can't answer, or someone asks for a person, it takes their email and passes the chat to you. You reply from a small admin page.

- **Chat widget:** one script tag, your colour, greeting and starter questions.
- **Answers from your content:** it reads your website (using the sitemap when there is one) every day. You can also paste in text and pin answers to common questions.
- **Search by meaning and by keyword,** with links to the pages each answer came from.
- **Hand-off to you:** the visitor leaves their email, you're emailed, and you reply from `/admin`. They see your reply in the chat and by email.
- **Your keys:** any OpenAI-compatible API (OpenRouter, OpenAI, Anthropic, Groq…), or Workers AI with no key at all.

It's built for one site with one admin. For a team inbox, an agent that looks up your customers' own data, several apps, or setup from your coding agent, see [PandaDesk Cloud](https://pandadesk.app).

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kamskans/pandadesk-lite)

Or from your machine:

```bash
git clone https://github.com/kamskans/pandadesk-lite && cd pandadesk-lite
npm install
npx wrangler login
# Search by meaning needs a Vectorize index; without it, search uses keywords only.
npx wrangler vectorize create pandadesk-lite --dimensions=1024 --metric=cosine
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

The Worker's home page describes PandaDesk Lite and has a live demo of your chat; change it in `ui/src/home.tsx`. Then open `https://<your-worker>.workers.dev/admin`, sign in, add your AI key under **Settings** if you have one, add your website under **Knowledge**, and copy the snippet from **Install** into your site:

```html
<script src="https://<your-worker>.workers.dev/widget.js" async></script>
```

## Settings

The only thing you need to deploy is **`ADMIN_PASSWORD`**, the password for `/admin` (the Deploy button asks for it). Changing it signs you out everywhere.

Everything else is optional and set on the admin page under **Settings**, any time after deploying:

| Setting | Default | |
|---|---|---|
| AI API key | none | Any OpenAI-compatible API (OpenRouter, OpenAI, Anthropic, Groq…). Without it, answers use Workers AI (Llama 3.3 70B). |
| AI API address, model | `https://openrouter.ai/api/v1`, `openai/gpt-4o-mini` | The API that key belongs to, and the model name for it. |
| Brevo or Resend API key, send from | none | Send email through [Brevo](https://www.brevo.com) or [Resend](https://resend.com): your replies to visitors, and alerts to you. Brevo is used if both are set. |
| Send alerts to | none | Where you're emailed when someone is waiting for a reply, and at 80% and 100% of the daily AI limit. |
| AI answers per day | `500` | After that, new questions go straight to you. |
| Blocked countries | none | Two-letter country codes to turn the chat off for, e.g. `PK, BD`. The button doesn't appear there. Cloudflare provides each visitor's country, though a VPN can get around it. |
| Allowed sites | any site | Full addresses of the sites that may show the chat, e.g. `https://app.example.com`. Other sites get no button, can't start a chat and can't frame the chat page. |
| Identity secret | none | Lets your own app tell the chat who a signed-in visitor is. See [Signed-in visitors](#signed-in-visitors). |

Keys saved on the admin page are stored in your D1 database and never shown again, only their last 4 characters.

If you'd rather keep them on the Worker, each has a secret or variable of the same name: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `BREVO_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL`, `AI_DAILY_LIMIT`, `BLOCKED_COUNTRIES`, `ALLOWED_ORIGINS` and `IDENTITY_SECRET` (`npx wrangler secret put NAME`, or `vars` in `wrangler.jsonc`). A value saved on the admin page takes over from the Worker's; remove it there to use the Worker's again.

## Signed-in visitors

If your app has its own sign-in, it can tell the chat who the visitor is. Their name and email then show in your inbox, and they aren't asked for an email when the chat is passed to you.

1. Set an **Identity secret** on the Settings page (e.g. `openssl rand -hex 32`) and give the same value to your app's server.
2. On your server, sign the signed-in user, valid for an hour:

   ```js
   import { createHmac } from "node:crypto";
   const issuedAt = Math.floor(Date.now() / 1000);
   const email = user.email.trim().toLowerCase();
   const payload = ["pandadesk-lite-identity:v1", email, user.id, issuedAt].join("\n");
   const signature = createHmac("sha256", process.env.PANDADESK_IDENTITY_SECRET).update(payload).digest("hex");
   // send { email, userId: user.id, name, issuedAt, signature } to the page
   ```

3. On the page, before or after the widget script:

   ```html
   <script>
     window.PandaDesk = window.PandaDesk || function () { (window.PandaDesk.q = window.PandaDesk.q || []).push(arguments) };
     PandaDesk("identify", identity); // the object from your server
   </script>
   ```

Only your server can sign, so a visitor can't pretend to be someone else. A saved chat that belongs to a different email (someone else signed in on the same browser) is never reopened; a new chat starts instead.

## How it works

One Cloudflare Worker serves the home page, the widget, the chat, the admin page and the API. The pages are React and Tailwind, built from `ui/` into `dist/` with Vite before every `wrangler dev` and `wrangler deploy`.

- **Data:** conversations and knowledge are stored in **D1**. Passages are indexed in D1's full-text search and in **Vectorize**.
- **Embeddings:** made with Workers AI (`@cf/baai/bge-m3`, multilingual).
- **Abuse protection:** abuse, link spam, repeated messages and requests to make images or other work for free get a short reply with no AI call. The third closes the chat and blocks the visitor's address (stored hashed) for a day, or a month the second time. Each chat gets at most 15 AI answers and each address 40 a day. Once a chat is handed to you, the AI stops answering it.
- **Background work:** a cron trigger runs every 10 minutes. It reads pages that are waiting and re-reads each website once a day. While the Knowledge page is open, pages are read straight away.

On the Workers Free plan, small sites work fine. Large sites read faster on Workers Paid.

## Develop

```bash
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD
npm run dev                      # builds ui/, then http://localhost:8787/admin
npm test && npm run typecheck
```

Workers AI and Vectorize run on Cloudflare even in local development, so `wrangler dev` asks you to sign in for them. Leaving them out of `wrangler.jsonc` locally falls back to keyword search. Add an AI key under Settings (or `LLM_API_KEY` in `.dev.vars`) to answer without Workers AI.

## License

[AGPL-3.0](LICENSE). You can use, change and self-host this freely. If you run a changed version as a service for others, you must publish your changes under the same license.

"PandaDesk" and the PandaDesk logo are trademarks of Kamal Kannan and aren't covered by the code license. If you publish a fork, please give it a different name.
