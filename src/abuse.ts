import { now, type Env } from "./env.ts";
import { sha256 } from "./security.ts";

/**
 * Cheap checks on every visitor message before any AI call, and the blocks they lead to. Three strikes in a chat
 * (abuse, spam, or asking the bot to do free work like generating images) close it and block the visitor's address.
 */
export const STRIKES_TO_CLOSE = 3;
const BLOCK_SECONDS = 86_400;
/** A second block on the same address lasts this long. Addresses can be shared, so it isn't forever. */
const REPEAT_BLOCK_SECONDS = 30 * 86_400;

// Insults aimed at someone, threats and slurs. Swearing about a problem ("this damn export") is not abuse.
const ABUSIVE = [
  /\b(fuck|screw)\s+(you|u|off|yourself|this bot)\b/i,
  /\byou(?:'re| are| r|r)?\s+(?:a |an |such a |so )?(?:fucking |stupid |useless |dumb )*(idiot|moron|stupid|dumb|useless|piece of (?:shit|crap)|bitch|cunt|asshole|loser|trash)\b/i,
  /\b(go )?(kill|hang) yourself\b|\bkys\b/i,
  /\bi(?:'ll| will| am going to| gonna)\s+(?:find|hurt|kill|beat)\s+(?:you|u)\b/i,
  /\b(cunt|whore|slut|n[i1]gg(?:er|a)|f[a@]gg?ot)\b/i,
];

// Pasted image or video generation prompts: long text stacked with render-quality words. A product question that
// mentions "4K" once stays well under the bar.
const PROMPT_WORDS = [
  /\b(?:ultra[- ]?hd|uhd)\b/i, /\b(?:4|8|16)k(?: resolution)?\b/i, /\b\d{3,4}\s?[x×]\s?\d{3,4}\b/i, /\bhyper[- ]?(?:realistic|detailed)\b/i,
  /\bphoto[- ]?realistic\b/i, /\bcinematic\b/i, /\bcrystal[- ]clear\b/i, /\bzero blur\b/i, /\bsuper sharp\b/i, /\bbroadcast[- ]quality\b/i,
  /\bhighly detailed\b/i, /\boctane render\b|\bunreal engine\b/i, /\bvolumetric (?:light|lighting)\b/i, /--ar \d+:\d+/i,
  /\b(?:9:16|16:9)\b/, /\bglossy reflective\b/i, /\bstudio (?:strip )?lights?\b/i,
];
// Asking the bot to do the work: "make this for me in full HD", "generate an image of", "write me an essay".
const FREE_WORK = [
  /\b(?:make|create|generate|render|produce|design|draw|build|edit)\s+(?:this|it|that|these|them|one|me)\b.{0,60}\bfor me\b/i,
  /\b(?:make|create|generate|render|produce|design|draw)\s+(?:this|it|that|me\s+(?:a|an))\b.{0,40}\b(?:in|at)\s+(?:full\s*hd|hd|4k|8k|1080p)\b/i,
  // Only as an instruction at the start: "Can you generate an image?" is a question about the product.
  /^(?:(?:please|pls|plz|sir|sar)[\s,]+)?(?:generate|create|draw|design)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|logo|banner|thumbnail|poster|wallpaper)\s+(?:of|for|with)\b/i,
  /^(?:(?:please|pls|plz|sir|sar)[\s,]+)?write\s+(?:me\s+)?(?:an?\s+)?(?:essay|poem|story|article|blog post|cover letter|assignment)\b/i,
];

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export function freeWork(text: string) {
  if (FREE_WORK.some((re) => re.test(text))) return true;
  return text.length >= 300 && PROMPT_WORDS.filter((re) => re.test(text)).length >= 3;
}

/** The same message reworded: most of the words (as a set) are shared. Short messages only count when identical. */
export function nearDuplicate(a: string, b: string) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(na.split(" ")), wb = new Set(nb.split(" "));
  if (wa.size < 6 || wb.size < 6) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared) >= 0.75;
}

export type Strike = "abuse" | "links" | "repeat" | "free_work";

/** Which rule a message breaks, if any. `earlier` is the visitor's earlier messages in this chat, oldest first. */
export function screen(text: string, earlier: string[]): Strike | null {
  if (ABUSIVE.some((re) => re.test(text))) return "abuse";
  if ((text.match(/\bhttps?:\/\/\S+|\bwww\.\S+/gi) ?? []).length >= 3) return "links";
  if (freeWork(text)) return "free_work";
  const recent = earlier.slice(-2);
  if (recent.length === 2 && recent.every((m) => nearDuplicate(m, text))) return "repeat";
  return null;
}

export const STRIKE_REPLIES: Record<Strike, (site: string) => string> = {
  abuse: (site) => `I'm here to help with ${site} questions, and happy to keep going if we keep it respectful.`,
  links: () => "I can't open links here. What can I help you with?",
  repeat: () => "I got your message. Is there something else I can help with?",
  free_work: (site) => `I can only answer questions about ${site} here. I can't create images, videos or other work for you.`,
};

/** Per-site hash of the visitor's address, so blocks match it without storing the address itself. */
export const ipKey = (ip: string) => (ip && ip !== "local" ? sha256(`pandadesk-lite:${ip}`) : Promise.resolve(null));

export async function blocked(env: Env, ip: string) {
  const key = await ipKey(ip);
  if (!key) return false;
  return !!(await env.DB.prepare("select 1 from blocks where ip_hash = ? and until > ?").bind(key, now()).first());
}

/** Block the address for a day; a second block lasts a month. */
export async function block(env: Env, ip: string) {
  const key = await ipKey(ip);
  if (!key) return;
  const prior = await env.DB.prepare("select times from blocks where ip_hash = ?").bind(key).first<{ times: number }>();
  const times = (prior?.times ?? 0) + 1;
  await env.DB.prepare(
    "insert into blocks (ip_hash, until, times, created_at) values (?1, ?2, ?3, ?4) on conflict (ip_hash) do update set until = ?2, times = ?3, created_at = ?4",
  ).bind(key, now() + (times >= 2 ? REPEAT_BLOCK_SECONDS : BLOCK_SECONDS), times, now()).run();
}

/** Two-letter codes from BLOCKED_COUNTRIES ("PK, BD"). */
export const blockedCountries = (env: Env) =>
  (env.BLOCKED_COUNTRIES ?? "").toUpperCase().split(/[\s,;]+/).filter((c) => /^[A-Z]{2}$/.test(c));

/** Cloudflare tells the Worker each visitor's country. Unknown ("XX", Tor "T1", local dev) is never blocked. */
export function countryBlocked(req: Request, env: Env) {
  const list = blockedCountries(env);
  if (!list.length) return false;
  const country = String((req as Request & { cf?: { country?: string } }).cf?.country ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(country) && country !== "XX" && list.includes(country);
}
