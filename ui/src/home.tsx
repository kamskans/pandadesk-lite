import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Check } from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import "./index.css";

const REPO = "https://github.com/kamskans/pandadesk-lite";
const DEPLOY = `https://deploy.workers.cloudflare.com/?url=${REPO}`;
const CLOUD = "https://pandadesk.app/?ref=lite-home";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900";

const STEPS = [
  { title: "Deploy to Cloudflare", body: "One click creates the Worker, database and search index on your own account. Set an admin password; add an AI key if you like." },
  { title: "Add your website", body: "Give it your docs or help pages. It reads them, follows the links or sitemap, and reads them again every day." },
  { title: "Paste one script tag", body: "The chat appears on your site. It answers from your pages and passes anything else to you." },
];

const FEATURES = [
  { title: "Answers from your pages", body: "Every reply comes from your website, pasted text or pinned answers, with a link to the page it used." },
  { title: "Won't guess", body: "When your pages don't cover a question, it says so and hands the chat to you instead of making something up." },
  { title: "Search by meaning", body: "Questions find the right page even in other words or another language, with keyword search alongside." },
  { title: "Hand-off to you", body: "The visitor leaves their email, you get an alert, and you reply from the inbox. They see it in the chat and by email." },
  { title: "Pinned answers", body: "Write the exact answer for refunds, pricing or policy, and it's used first whenever someone asks." },
  { title: "Your look", body: "Your colour, greeting and starter questions, with a live preview while you change them." },
];

const KEYS = `# Required: the password for /admin
npx wrangler secret put ADMIN_PASSWORD

# Optional: any OpenAI-compatible API (OpenRouter, OpenAI, Anthropic…)
npx wrangler secret put LLM_API_KEY
# Without it, answers use Cloudflare Workers AI.

# Optional: email visitors your replies, and alert you (Resend)
npx wrangler secret put RESEND_API_KEY`;

const LITE = ["One website, one admin", "AI answers from your website and text", "Pinned answers", "Hand-off by email, simple inbox", "Your own Cloudflare account and keys", "Free and open source (AGPL-3.0)"];
const CLOUD_FEATURES = ["Several apps, each with its own help center", "Team inbox: assign, labels, snooze, saved replies", "An AI agent that looks up your customers' own data", "Learns from your team's replies, finds unanswered questions", "Reports, ratings, business hours, webhooks", "Set up and run from Claude Code, Cursor or Codex"];

function Home() {
  return (
    <div className="min-h-dvh text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5">
        <a href="/" aria-label="PandaDesk Lite home" className={`rounded-md ${focus}`}>
          <span className="inline-flex items-center gap-2"><Logo className="text-lg" markClassName="h-8 w-8" /><span className="rounded-full bg-stone-900 px-2 py-0.5 text-[11px] font-semibold text-white">Lite</span></span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-stone-600 md:flex">
          <a href="#how" className={`rounded hover:text-stone-900 ${focus}`}>How it works</a>
          <a href="#keys" className={`rounded hover:text-stone-900 ${focus}`}>Your keys</a>
          <a href="#cloud" className={`rounded hover:text-stone-900 ${focus}`}>Lite or Cloud</a>
          <a href={REPO} className={`rounded hover:text-stone-900 ${focus}`}>GitHub</a>
        </nav>
        <a href="/admin" className={`rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:border-stone-400 ${focus}`}>Admin</a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-16 lg:pb-28">
          <div>
            <h1 className="text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.1rem]">
              AI support chat for your website, on your own Cloudflare.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-stone-600">
              PandaDesk Lite answers your visitors from your docs, links the page it used, and passes anything it can&apos;t answer to you. Free and open source, with your own keys.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={DEPLOY} className={`rounded-lg bg-stone-900 px-5 py-3 font-medium text-white hover:bg-stone-800 ${focus}`}>Deploy to Cloudflare</a>
              <a href={REPO} className={`rounded-lg border border-stone-300 bg-white px-5 py-3 font-medium hover:border-stone-400 ${focus}`}>View on GitHub</a>
            </div>
            <p className="mt-5 text-sm text-stone-500">No sign-up and no monthly fee. It runs on Cloudflare&apos;s free plan for small sites.</p>
          </div>
          <div>
            <div className="h-[560px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
              <iframe src="/chat?inline=1" title="Live chat demo" className="h-full w-full" />
            </div>
            <p className="mt-3 text-center text-sm text-stone-500">This is the real chat. Ask it something.</p>
          </div>
        </section>

        <section id="how" className="scroll-mt-8 border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">Running in ten minutes</h2>
            <p className="mt-3 max-w-xl text-stone-600">Everything lives on your Cloudflare account: the chat, your content and your conversations.</p>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3 lg:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">{i + 1}</span>
                    {i < STEPS.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-stone-300 sm:block" />}
                  </div>
                  <h3 className="mt-5 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="lg:sticky lg:top-10 lg:self-start">
              <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">Answers you can trust it to give</h2>
              <p className="mt-4 text-stone-600">It only says what your pages say, and it stops the moment they don&apos;t.</p>
            </div>
            <dl className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="border-t border-stone-300 pt-5">
                  <dt className="font-semibold">{f.title}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-stone-600">{f.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="keys" className="scroll-mt-8 border-t border-stone-200 bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 lg:grid-cols-2 lg:gap-16 lg:py-24">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">Your keys, your data</h2>
              <p className="mt-4 max-w-md text-stone-600">Settings are environment variables on your Worker. Use the AI provider you already pay for, or none at all: Cloudflare&apos;s own models work out of the box.</p>
              <ul className="mt-6 space-y-2 text-[15px] text-stone-700">
                <li className="flex gap-2.5"><LogoMark className="mt-0.5 h-4 w-4 shrink-0" />Conversations stay in your own D1 database</li>
                <li className="flex gap-2.5"><LogoMark className="mt-0.5 h-4 w-4 shrink-0" />Search by meaning with Cloudflare Vectorize</li>
                <li className="flex gap-2.5"><LogoMark className="mt-0.5 h-4 w-4 shrink-0" />Export everything as JSON whenever you want</li>
              </ul>
            </div>
            <pre className="overflow-x-auto rounded-2xl bg-stone-900 p-5 text-[13px] leading-relaxed text-stone-100 sm:p-6"><code>{KEYS}</code></pre>
          </div>
        </section>

        <section id="cloud" className="scroll-mt-8 px-3 pb-20 sm:px-5">
          <div className="mx-auto max-w-6xl rounded-[28px] bg-stone-900 px-6 py-16 text-stone-100 sm:px-12 lg:py-20">
            <h2 className="text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">Lite for one site. Cloud for a team.</h2>
            <p className="mt-4 max-w-xl leading-relaxed text-stone-300">PandaDesk Lite is the same chat and dashboard as PandaDesk Cloud, for one website and one person. When you need more, Cloud is hosted for you.</p>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10 sm:p-8">
                <div className="text-sm font-medium text-stone-400">PandaDesk Lite</div>
                <div className="mt-1 text-xl font-semibold text-white">Free, self-hosted</div>
                <ul className="mt-6 space-y-2.5 text-[15px] text-stone-300">
                  {LITE.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden />{f}</li>)}
                </ul>
                <a href={DEPLOY} className={`mt-8 inline-block rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15 ${focus}`}>Deploy to Cloudflare</a>
              </div>
              <div className="rounded-2xl bg-white/[0.08] p-6 ring-1 ring-emerald-300/30 sm:p-8">
                <div className="text-sm font-medium text-emerald-300">PandaDesk Cloud</div>
                <div className="mt-1 text-xl font-semibold text-white">Everything in Lite, plus</div>
                <ul className="mt-6 space-y-2.5 text-[15px] text-stone-200">
                  {CLOUD_FEATURES.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />{f}</li>)}
                </ul>
                <a href={CLOUD} className={`mt-8 inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 ${focus}`}>See PandaDesk Cloud</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-stone-500">
          <span className="flex items-center gap-2"><LogoMark className="h-5 w-5" /> PandaDesk Lite · open source under AGPL-3.0</span>
          <span className="flex gap-5">
            <a href={REPO} className={`rounded hover:text-stone-900 ${focus}`}>GitHub</a>
            <a href={CLOUD} className={`rounded hover:text-stone-900 ${focus}`}>PandaDesk Cloud</a>
            <a href="/admin" className={`rounded hover:text-stone-900 ${focus}`}>Admin</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Home /></StrictMode>);
