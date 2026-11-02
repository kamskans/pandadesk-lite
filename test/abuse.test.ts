import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedCountries, countryBlocked, freeWork, nearDuplicate, screen } from "../src/abuse.ts";
import { answer, buildPrompt, MAX_MESSAGE_CHARS } from "../src/answer.ts";
import type { Env } from "../src/env.ts";

// A chat that used the bot as a free image and video generator, in Urdu and Hindi (names removed).
const PROMPT = "Professional 9:16 vertical broadcast news studio set, ultra-HD 8K resolution, hyper-realistic, pristine and crystal-clear lighting. Deep vibrant red and bright blue color scheme with metallic silver accents. At the very top, a breaking news header ticker with bold Urdu text: \"حق سچ کی آواز\". In the center, a large luminous white glass screen. On the left side, a modern executive news desk. Glossy reflective floor, red and blue LED studio strip lights, crystal clear and sharp broadcast quality, zero blur.";
const MOTION = "Full HD (1920x1080) cinematic motion graphics video with a heavy, raw, and thunderous broadcast aesthetic. The background is a moving texture of hammered dark metal and glowing molten rock. At the top, a monumental gold and iron text banner. At the bottom, a continuous scrolling text ribbon with thick metallic silver Urdu text. Super sharp broadcast-quality font with a heavy shadow.";

test("free work: pasted generation prompts and 'make this for me' are caught before the AI", () => {
  for (const t of [PROMPT, MOTION, "make this for me in full HD", "Generate an image of a lion on a mountain", "write me an essay about climate change"]) {
    assert.equal(freeWork(t), true, t.slice(0, 40));
  }
});

test("free work: product questions about HD, 4K or images still reach the AI", () => {
  for (const t of ["How do I export my video in full HD or 4K?", "Can you generate an image for my thumbnail?", "My 9:16 export looks blurry, is it 1080x1920?"]) {
    assert.equal(freeWork(t), false, t);
  }
});

test("screen: abuse, link floods, free work and reworded repeats", () => {
  assert.equal(screen("you are a useless idiot", []), "abuse");
  assert.equal(screen("this damn export keeps failing", []), null, "swearing about a problem is fine");
  assert.equal(screen("cheap http://a.example http://b.example http://c.example", []), "links");
  assert.equal(screen(PROMPT, []), "free_work");
  const earlier = ["I need the red and blue banner with Urdu tickers today please", "I need the red and blue banner with the Urdu tickers today"];
  assert.equal(screen("i need red and blue banner with Urdu tickers today please!!", earlier), "repeat");
  assert.equal(screen("How do I import?", ["How do I export?", "How do I export?"]), null);
  assert.equal(nearDuplicate("How do I export?", "How do I import?"), false);
});

test("countries: BLOCKED_COUNTRIES is matched against Cloudflare's country, unknown is never blocked", () => {
  const env = { BLOCKED_COUNTRIES: "pk, BD;xx1" } as unknown as Env;
  assert.deepEqual(blockedCountries(env), ["PK", "BD"]);
  const from = (country?: string) => Object.assign(new Request("https://example.com"), { cf: country ? { country } : undefined });
  assert.equal(countryBlocked(from("PK"), env), true);
  assert.equal(countryBlocked(from("US"), env), false);
  assert.equal(countryBlocked(from("XX"), env), false);
  assert.equal(countryBlocked(from(), env), false, "local dev has no country");
  assert.equal(countryBlocked(from("PK"), {} as Env), false, "off by default");
});

test("the model sees at most 2000 characters of each message, and can flag off-topic requests", async () => {
  const long = "How do I export? " + "More detail. ".repeat(400);
  const [, user] = buildPrompt("Acme", [], [{ role: "visitor", body: long }]);
  assert.ok(user.content.length <= MAX_MESSAGE_CHARS + 20);
  assert.match(user.content, /\(message cut\)$/);
  assert.match(buildPrompt("Acme", [], [])[0].content, /\[\[OFFTOPIC\]\]/);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "[[OFFTOPIC]]" } }] }))) as typeof fetch;
  try {
    const out = await answer({ LLM_API_KEY: "test" } as Env, "Acme", [], [{ role: "visitor", body: "banner taiyar karke dena hai full HD mein" }]);
    assert.deepEqual(out, { handoff: false, offTopic: true, text: "" });
  } finally {
    globalThis.fetch = realFetch;
  }
});
