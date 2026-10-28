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
npx wrangler secret put LLM_API_KEY      # optional: leave out to use Workers AI
npm run deploy
```

Then open `https://<your-worker>.workers.dev/admin`, sign in, add your website under **Knowledge**, and copy the snippet from **Install** into your site:

```html
<script src="https://<your-worker>.workers.dev/widget.js" async></script>
```

## Settings

Secrets (`npx wrangler secret put NAME`, or `.dev.vars` locally; see `.dev.vars.example`):

| Name | |
|---|---|
| `ADMIN_PASSWORD` | Required. Password for `/admin`. Changing it signs you out everywhere. |
| `LLM_API_KEY` | Key for `LLM_BASE_URL`. Without it, answers use Workers AI (Llama 3.3 70B). |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Send email through [Resend](https://resend.com): your replies to visitors, and alerts to you. |
| `NOTIFY_EMAIL` | Optional. Where to email you when someone is waiting for a reply. |

Variables (in `wrangler.jsonc`):

| Name | Default | |
|---|---|---|
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Any OpenAI-compatible API. |
| `LLM_MODEL` | `openai/gpt-4o-mini` | The model name for that API. |
| `SITE_NAME` | `Support` | Default chat title. You can change it in the admin. |
| `MAX_PAGES` | `300` | Most pages read per website. |

## How it works

One Cloudflare Worker serves the widget, the chat, the admin page and the API. The chat and admin are React and Tailwind, built from `ui/` into `dist/` with Vite before every `wrangler dev` and `wrangler deploy`.

- **Data:** conversations and knowledge are stored in **D1**. Passages are indexed in D1's full-text search and in **Vectorize**.
- **Embeddings:** made with Workers AI (`@cf/baai/bge-m3`, multilingual).
- **Background work:** a cron trigger runs every 10 minutes. It reads pages that are waiting and re-reads each website once a day. While the Knowledge page is open, pages are read straight away.

On the Workers Free plan, small sites work fine. Large sites read faster on Workers Paid.

## Develop

```bash
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD
npm run dev                      # builds ui/, then http://localhost:8787/admin
npm test && npm run typecheck
```

Workers AI and Vectorize run on Cloudflare even in local development, so `wrangler dev` asks you to sign in for them. Leaving them out of `wrangler.jsonc` locally falls back to keyword search. Set `LLM_API_KEY` to answer without Workers AI.

## License

[AGPL-3.0](LICENSE). You can use, change and self-host this freely. If you run a changed version as a service for others, you must publish your changes under the same license.

"PandaDesk" and the PandaDesk logo are trademarks of Kamal Kannan and aren't covered by the code license. If you publish a fork, please give it a different name.
