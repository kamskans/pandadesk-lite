import { chunkText, sameSiteUrl, tidy } from "./chunk.ts";
import { HttpError, now, type Env } from "./env.ts";

const EMBED_MODEL = "@cf/baai/bge-m3";
const PAGES_PER_RUN = 3;
const MAX_PAGE_BYTES = 2_000_000;
const RESYNC_SECONDS = 86400;
const USER_AGENT = "PandaDeskLite/0.1 (+https://pandadesk.app)";

export interface Passage { id: number; title: string; url: string | null; text: string; pinned: boolean }

// ---------- Reading pages ----------

const SKIP = "head, script, style, noscript, svg, template, iframe, nav, footer, form, button, select";
const BLOCK = "p, div, section, article, main, li, tr, pre, blockquote, dd, dt, table, ul, ol, h4, h5, h6";

/** Text, title and links of an HTML page, without menus, footers and scripts. */
export async function extractHtml(res: Response) {
  const parts: string[] = [];
  const links: string[] = [];
  let title = "";
  let skip = 0;
  const end = (el: Element, fn: () => void) => { try { el.onEndTag(fn); } catch { /* void element */ } };
  await new HTMLRewriter()
    .on("title", { text(t) { title += t.text; } })
    .on(SKIP, { element(el) { skip++; end(el, () => { skip--; }); } })
    .on(BLOCK, { element(el) { parts.push("\n"); end(el, () => { parts.push("\n"); }); } })
    .on("h1, h2, h3", { element(el) { parts.push("\n\n## "); end(el, () => { parts.push("\n\n"); }); } })
    .on("br", { element() { parts.push("\n"); } })
    .on("a[href]", { element(el) { links.push(el.getAttribute("href")!); } })
    .onDocument({ text(t) { if (!skip) parts.push(t.text); } })
    .transform(res)
    .arrayBuffer();
  return { title: decode(tidy(title)), text: decode(tidy(parts.join(""))), links };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m);

async function fetchPage(url: string) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain,text/markdown;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_PAGE_BYTES) throw new Error("page is too large");
  const type = res.headers.get("content-type") ?? "";
  if (/html/.test(type)) return { final: res.url || url, ...(await extractHtml(res)) };
  if (/text\/(plain|markdown)/.test(type)) {
    const text = (await res.text()).slice(0, MAX_PAGE_BYTES);
    return { final: res.url || url, title: new URL(url).pathname.split("/").pop() || url, text: tidy(text), links: [] as string[] };
  }
  throw new Error(`can't read ${type || "this kind of file"}`);
}

/** The part of the site to read: the start page's folder ("/docs" for https://site.com/docs/intro.html). */
export function scopeOf(start: URL) {
  const path = start.pathname.replace(/\/[^/]*\.[a-z0-9]+$/i, "").replace(/\/+$/, "");
  return path || "/";
}

async function sitemapUrls(start: URL, scope: string, max: number) {
  const found = new Set<string>();
  const queue = [`${start.origin}/sitemap.xml`];
  for (let i = 0; i < queue.length && i < 6 && found.size < max; i++) {
    try {
      const res = await fetch(queue[i], { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 5_000_000);
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));
      if (/<sitemapindex/i.test(xml)) { queue.push(...locs); continue; }
      for (const loc of locs) {
        const u = sameSiteUrl(loc, start, scope);
        if (u) found.add(u);
        if (found.size >= max) break;
      }
    } catch { /* no sitemap: links on the pages are followed instead */ }
  }
  return [...found];
}

// ---------- Sources ----------

const maxPages = (env: Env) => Math.max(1, Math.min(5000, Number(env.MAX_PAGES) || 300));

export async function addWebsite(env: Env, raw: string) {
  let start: URL;
  try { start = new URL(raw.includes("://") ? raw : `https://${raw}`); } catch { throw new HttpError(400, "that isn't a web address"); }
  if (!/^https?:$/.test(start.protocol)) throw new HttpError(400, "use an http or https address");
  const url = sameSiteUrl(start.href, start, "/") ?? start.href;
  const t = now();
  const src = await env.DB.prepare("insert into sources (kind, url, title, status, created_at, synced_at) values ('website', ?, ?, 'reading', ?, ?) returning id")
    .bind(url, start.host + (scopeOf(start) === "/" ? "" : scopeOf(start)), t, t).first<{ id: number }>();
  const urls = [url, ...(await sitemapUrls(start, scopeOf(start), maxPages(env)))].slice(0, maxPages(env));
  await env.DB.batch(urls.map((u) => env.DB.prepare("insert or ignore into pages (source_id, url, updated_at) values (?, ?, ?)").bind(src!.id, u, t)));
  return src!.id;
}

export async function addText(env: Env, title: string, text: string) {
  if (!title || !text) throw new HttpError(400, "add a title and some text");
  const src = await env.DB.prepare("insert into sources (kind, title, body, status, created_at, synced_at) values ('text', ?, ?, 'ready', ?, ?) returning id")
    .bind(title, text, now(), now()).first<{ id: number }>();
  await index(env, chunkText(text).map((c) => ({ source_id: src!.id, title, text: c })));
  return src!.id;
}

export async function removeSource(env: Env, id: number) {
  await dropChunks(env, "source_id = ?", [id]);
  await env.DB.prepare("delete from sources where id = ?").bind(id).run();
}

export async function savePinned(env: Env, question: string, answer: string, id?: number) {
  if (!question || !answer) throw new HttpError(400, "add a question and an answer");
  let pid = id;
  if (pid) {
    await env.DB.prepare("update pinned set question = ?, answer = ? where id = ?").bind(question, answer, pid).run();
    await dropChunks(env, "pinned_id = ?", [pid]);
  } else {
    pid = (await env.DB.prepare("insert into pinned (question, answer, created_at) values (?, ?, ?) returning id").bind(question, answer, now()).first<{ id: number }>())!.id;
  }
  await index(env, [{ pinned_id: pid, title: question, text: `${question}\n\n${answer}` }]);
  return pid;
}

export async function removePinned(env: Env, id: number) {
  await dropChunks(env, "pinned_id = ?", [id]);
  await env.DB.prepare("delete from pinned where id = ?").bind(id).run();
}

// ---------- Indexing ----------

interface NewChunk { source_id?: number; page_id?: number; pinned_id?: number; url?: string; title: string; text: string }

/** Turn passages into numbers that capture their meaning. Null when Workers AI isn't available. */
export async function embed(env: Env, texts: string[]): Promise<number[][] | null> {
  if (!env.AI || !texts.length) return null;
  try {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 20) {
      const res = (await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + 20) })) as { data?: number[][] };
      if (!res.data) return null;
      out.push(...res.data);
    }
    return out;
  } catch (err) {
    console.warn("embedding failed, search will use keywords only:", (err as Error).message);
    return null;
  }
}

async function index(env: Env, chunks: NewChunk[]) {
  if (!chunks.length) return;
  const rows = await env.DB.batch(chunks.map((c) =>
    env.DB.prepare("insert into chunks (source_id, page_id, pinned_id, url, title, text) values (?, ?, ?, ?, ?, ?) returning id")
      .bind(c.source_id ?? null, c.page_id ?? null, c.pinned_id ?? null, c.url ?? null, c.title, c.text)));
  const ids = rows.map((r) => (r.results[0] as { id: number }).id);
  const vectors = env.VECTORS && (await embed(env, chunks.map((c) => `${c.title}\n${c.text}`)));
  if (vectors) {
    try {
      await env.VECTORS!.upsert(vectors.map((values, i) => ({ id: String(ids[i]), values })));
    } catch (err) { console.warn("couldn't save to Vectorize:", (err as Error).message); }
  }
}

async function dropChunks(env: Env, where: string, params: unknown[]) {
  const { results } = await env.DB.prepare(`select id from chunks where ${where}`).bind(...params).all<{ id: number }>();
  if (!results.length) return;
  if (env.VECTORS) {
    try {
      for (let i = 0; i < results.length; i += 500) await env.VECTORS.deleteByIds(results.slice(i, i + 500).map((r) => String(r.id)));
    } catch (err) { console.warn("couldn't remove from Vectorize:", (err as Error).message); }
  }
  await env.DB.prepare(`delete from chunks where ${where}`).bind(...params).run();
}

/** Read the next few pages waiting to be read. Pages a crashed run left half-done are picked up after 5 minutes. */
export async function processPending(env: Env) {
  const t = now();
  const { results: pages } = await env.DB.prepare(
    `update pages set status = 'working', updated_at = ?1 where id in (
       select id from pages where status = 'pending' or (status = 'working' and updated_at < ?2) order by id limit ?3)
     returning id, source_id, url, hash`,
  ).bind(t, t - 300, PAGES_PER_RUN).all<{ id: number; source_id: number; url: string; hash: string | null }>();
  for (const page of pages) await readPage(env, page);
  const sources = [...new Set(pages.map((p) => p.source_id))];
  for (const id of sources) {
    await env.DB.prepare(
      `update sources set status = case when exists (select 1 from pages where source_id = ?1 and status in ('pending', 'working')) then 'reading' else 'ready' end
       where id = ?1`,
    ).bind(id).run();
  }
  return pages.length;
}

async function readPage(env: Env, page: { id: number; source_id: number; url: string; hash: string | null }) {
  const src = await env.DB.prepare("select url from sources where id = ?").bind(page.source_id).first<{ url: string }>();
  if (!src) return;
  try {
    const got = await fetchPage(page.url);
    const start = new URL(src.url);
    const scope = scopeOf(start);
    const links = [...new Set(got.links.map((l) => sameSiteUrl(l, new URL(got.final), scope)).filter((u): u is string => !!u))];
    if (links.length) {
      const { n } = (await env.DB.prepare("select count(*) as n from pages where source_id = ?").bind(page.source_id).first<{ n: number }>())!;
      const room = maxPages(env) - n;
      if (room > 0) {
        await env.DB.batch(links.slice(0, room).map((u) => env.DB.prepare("insert or ignore into pages (source_id, url, updated_at) values (?, ?, ?)").bind(page.source_id, u, now())));
      }
    }
    const hash = await digest(got.text);
    if (hash !== page.hash) {
      await dropChunks(env, "page_id = ?", [page.id]);
      const title = got.title || page.url;
      await index(env, chunkText(got.text).map((text) => ({ source_id: page.source_id, page_id: page.id, url: page.url, title, text })));
    }
    await env.DB.prepare("update pages set status = 'done', title = ?, hash = ?, error = null, updated_at = ? where id = ?").bind(got.title, hash, now(), page.id).run();
  } catch (err) {
    await dropChunks(env, "page_id = ?", [page.id]);
    await env.DB.prepare("update pages set status = 'error', error = ?, updated_at = ? where id = ?").bind((err as Error).message.slice(0, 200), now(), page.id).run();
  }
}

const digest = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Once a day, read every website again; pages that haven't changed keep their passages. */
export async function queueResync(env: Env, sourceId?: number) {
  const t = now();
  const where = sourceId ? "id = ?1" : "kind = 'website' and (synced_at is null or synced_at < ?2)";
  const { results } = await env.DB.prepare(`update sources set synced_at = ?3, status = 'reading' where ${where} returning id`).bind(sourceId ?? 0, t - RESYNC_SECONDS, t).all<{ id: number }>();
  for (const { id } of results) await env.DB.prepare("update pages set status = 'pending' where source_id = ? and status != 'working'").bind(id).run();
  return results.length;
}

// ---------- Search ----------

/** Words for a keyword search, quoted so punctuation in the question can't break the query. */
export function ftsQuery(q: string) {
  const words = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].filter((w) => !STOP.has(w)).slice(0, 12);
  return words.map((w) => `"${w}"`).join(" OR ");
}
const STOP = new Set(("the a an and or but is are was were be been to of in on for with at by from how what when where why who which can could " +
  "would should will do does did i you my your it its this that these those me we our us have has had get got there any some about " +
  "please thanks hi hello there not no yes if so just also").split(" "));

/** The passages that best answer `q`: search by meaning and by keyword, merged (reciprocal rank fusion). */
export async function search(env: Env, q: string, k = 6): Promise<Passage[]> {
  const scores = new Map<number, number>();
  const add = (id: number, rank: number) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank));
  const fts = ftsQuery(q);
  if (fts) {
    const { results } = await env.DB.prepare("select rowid as id from chunks_fts where chunks_fts match ? order by bm25(chunks_fts, 2.0, 1.0) limit 20").bind(fts).all<{ id: number }>();
    results.forEach((r, i) => add(r.id, i));
  }
  if (env.VECTORS) {
    const [vec] = (await embed(env, [q])) ?? [];
    if (vec) {
      try {
        const { matches } = await env.VECTORS.query(vec, { topK: 20 });
        // Below this the passage is rarely about the question; leaving it out keeps answers on topic.
        matches.filter((m) => m.score >= 0.45).forEach((m, i) => add(Number(m.id), i * 0.8));
      } catch (err) { console.warn("Vectorize query failed:", (err as Error).message); }
    }
  }
  const ids = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, k * 2).map(([id]) => id);
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(`select id, title, url, text, pinned_id from chunks where id in (${ids.map(() => "?").join(",")})`).bind(...ids)
    .all<{ id: number; title: string; url: string | null; text: string; pinned_id: number | null }>();
  // Pinned answers were written by the team for exactly these questions, so they rank higher, but only as a boost:
  // a pinned answer that shares one word with the question shouldn't beat the page that answers it.
  const rank = (r: { id: number; pinned_id: number | null }) => scores.get(r.id)! * (r.pinned_id !== null ? 1.5 : 1);
  return results
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, k)
    .map((r) => ({ id: r.id, title: r.title, url: r.url, text: r.text, pinned: r.pinned_id !== null }));
}
