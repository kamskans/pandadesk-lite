import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../public/md.js", import.meta.url), "utf8"))();
const render = (globalThis as unknown as { renderMarkdown: (s: string) => string }).renderMarkdown;

test("escapes HTML", () => {
  assert.equal(render("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assert.ok(!render("<img src=x onerror=alert(1)>").includes("<img"));
});

test("links only to http, https and mailto", () => {
  assert.match(render("[docs](https://x.com/a?b=1&c=2)"), /<a href="https:\/\/x.com\/a\?b=1&amp;c=2"/);
  assert.ok(!render("[x](javascript:alert(1))").includes("<a"));
  assert.match(render("see https://y.com."), /<a href="https:\/\/y.com"[^>]*>https:\/\/y.com<\/a>\./);
});

test("lists, bold and code", () => {
  assert.equal(render("- one\n- **two**"), "<ul><li>one</li><li><strong>two</strong></li></ul>");
  assert.equal(render("```\na <b>\n```"), "<pre><code>a &lt;b&gt;\n</code></pre>");
  assert.equal(render("use `npm i`"), "<p>use <code>npm i</code></p>");
});
