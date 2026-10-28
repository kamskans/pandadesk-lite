// Small, safe Markdown for chat messages: everything is escaped first, then a few marks become HTML.
(function (root) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u) ? u : null);

  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const u = safeUrl(url.replace(/&amp;/g, "&"));
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : m;
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?;:])/g, (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function render(md) {
    const out = [];
    const blocks = String(md).replace(/\r/g, "").split(/```/);
    blocks.forEach((block, i) => {
      if (i % 2) { out.push(`<pre><code>${esc(block.replace(/^[^\n]*\n/, ""))}</code></pre>`); return; }
      for (const para of block.split(/\n{2,}/)) {
        const lines = para.split("\n").filter((l) => l.trim());
        if (!lines.length) continue;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`);
        else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`);
        else if (/^#{1,4}\s/.test(lines[0]) && lines.length === 1) out.push(`<p><strong>${inline(lines[0].replace(/^#+\s*/, ""))}</strong></p>`);
        else out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
      }
    });
    return out.join("");
  }

  root.renderMarkdown = render;
})(typeof window !== "undefined" ? window : globalThis);
