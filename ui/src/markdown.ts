import { Marked } from "marked";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (href: string) => (/^(https?:|mailto:|\/|#)/i.test(href.trim()) ? href : "#");

// Answers can quote anything on your website, so raw HTML is escaped and only http(s), mailto and relative links stay.
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) { return escape(text); },
    link({ href, title, tokens }) {
      const t = title ? ` title="${escape(title)}"` : "";
      return `<a href="${escape(safeUrl(href))}"${t} target="_blank" rel="noopener noreferrer">${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, text }) {
      return `<img src="${escape(safeUrl(href))}" alt="${escape(text)}" loading="lazy" />`;
    },
  },
});

export const renderMarkdown = (src: string) => md.parse(src, { async: false }) as string;
