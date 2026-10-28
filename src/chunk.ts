/** Tidy extracted text: one space between words, at most one blank line between paragraphs. */
export function tidy(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split text into passages of about `size` characters for search, breaking at paragraphs, then sentences, then
 * words. Each passage repeats the end of the one before it, so an answer that spans a break is still found.
 */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = tidy(text);
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const pieces = splitTo(clean, size);
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > size) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      const cut = tail.search(/\s/);
      current = (cut >= 0 ? tail.slice(cut + 1) : "") + "\n\n" + piece;
      if (current.length > size) current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Break text into pieces no longer than `size`, preferring paragraph, then sentence, then word boundaries. */
function splitTo(text: string, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= size) { out.push(para); continue; }
    let buf = "";
    for (const sentence of para.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) ?? [para]) {
      if (sentence.length > size) {
        if (buf) { out.push(buf.trim()); buf = ""; }
        for (let i = 0; i < sentence.length; i += size) out.push(sentence.slice(i, i + size).trim());
        continue;
      }
      if (buf.length + sentence.length > size) { out.push(buf.trim()); buf = ""; }
      buf += sentence;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.filter(Boolean);
}

/** Normalise a link for crawling: absolute, no fragment, no trailing slash; null if it isn't a page on `base`'s site. */
export function sameSiteUrl(href: string, base: URL, scope: string): string | null {
  let u: URL;
  try { u = new URL(href, base); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.host !== base.host || !u.pathname.startsWith(scope)) return null;
  // llms.txt files repeat the whole site in one file, so they'd crowd out the pages they copy.
  if (/\/llms(-full|-small)?\.txt$/i.test(u.pathname)) return null;
  if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|zip|gz|mp4|mp3|woff2?|ttf|pdf)$/i.test(u.pathname)) return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|fbclid$|gclid$)/.test(k)) u.searchParams.delete(k);
  return u.href.replace(/(?<=[^/])\/$/, "");
}
