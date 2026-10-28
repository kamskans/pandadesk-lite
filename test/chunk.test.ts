import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, sameSiteUrl, tidy } from "../src/chunk.ts";

test("tidy collapses spaces and blank lines", () => {
  assert.equal(tidy("  a   b \n\n\n\n c  "), "a b\n\nc");
});

test("short text is one passage", () => {
  assert.deepEqual(chunkText("Refunds take five days."), ["Refunds take five days."]);
});

test("long text is split under the size, with overlap, keeping every word", () => {
  const paras = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} says something useful about topic ${i}. It has two sentences.`);
  const chunks = chunkText(paras.join("\n\n"), 300, 60);
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.length <= 300, `chunk too long: ${c.length}`);
  for (let i = 0; i < 30; i++) assert.ok(chunks.some((c) => c.includes(`topic ${i}.`)), `lost paragraph ${i}`);
});

test("a single huge word-free run is still cut", () => {
  const chunks = chunkText("x".repeat(2500), 1000, 100);
  assert.ok(chunks.every((c) => c.length <= 1000));
  assert.equal(chunks.join("").replace(/\s/g, "").length >= 2500, true);
});

test("sameSiteUrl keeps pages on the site and drops the rest", () => {
  const base = new URL("https://docs.example.com/guide/start");
  assert.equal(sameSiteUrl("/guide/billing/?utm_source=x#top", base, "/guide"), "https://docs.example.com/guide/billing");
  assert.equal(sameSiteUrl("https://other.com/guide", base, "/guide"), null);
  assert.equal(sameSiteUrl("/blog/post", base, "/guide"), null);
  assert.equal(sameSiteUrl("/guide/logo.png", base, "/guide"), null);
  assert.equal(sameSiteUrl("mailto:a@b.com", base, "/"), null);
});
