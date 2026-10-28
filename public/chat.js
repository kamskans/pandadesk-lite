(() => {
  const $ = (id) => document.getElementById(id);
  const log = $("log"), text = $("text"), send = $("send");
  const page = new URLSearchParams(location.search).get("page") || "";
  const KEY = "pandadesk:conversation";
  let conv = null, lastId = 0, status = "bot", email = null, config = null, busy = false, poll = null;
  try { conv = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { conv = null; }

  const api = async (path, opts = {}) => {
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: { "content-type": "application/json", ...(conv ? { "x-visitor-token": conv.token } : {}), ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "something went wrong"), { status: res.status });
    return data;
  };

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  function addMessage(m) {
    if (m.id && m.id <= lastId) return;
    if (m.id) lastId = m.id;
    log.querySelector(".starters")?.remove();
    if (m.role === "admin") log.appendChild(el("div", "who", "Team"));
    const bubble = el("div", `msg ${m.role}`, window.renderMarkdown(m.body));
    if (m.sources?.length) {
      const s = el("div", "sources");
      s.append("From: ");
      m.sources.forEach((src, i) => {
        const a = el("a"); a.href = src.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = src.title || src.url;
        if (i) s.append(", ");
        s.append(a);
      });
      bubble.appendChild(s);
    }
    log.appendChild(bubble);
    renderEmailForm();
    scroll();
  }

  function renderEmailForm() {
    log.querySelector("form.email")?.remove();
    if (status !== "waiting" || email) return;
    const f = el("form", "email");
    f.innerHTML = `<label for="em">Your email, so the team can reply</label><div><input id="em" type="email" required placeholder="you@example.com" autocomplete="email"><button class="send" type="submit">Save</button></div>`;
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const out = await api(`/conversations/${conv.id}/email`, { method: "POST", body: JSON.stringify({ email: f.querySelector("input").value }) });
        email = out.email;
        out.messages.forEach(addMessage);
      } catch (err) { showError(err.message); }
    });
    log.appendChild(f);
  }

  function showError(msg) {
    const e = el("div", "error"); e.textContent = msg; log.appendChild(e); scroll();
    setTimeout(() => e.remove(), 6000);
  }

  async function ensureConversation() {
    if (conv) return;
    conv = await api("/conversations", { method: "POST", body: JSON.stringify({ pageUrl: page }) });
    localStorage.setItem(KEY, JSON.stringify({ id: conv.id, token: conv.token }));
    startPolling();
  }

  async function sendMessage(body) {
    if (busy || !body.trim()) return;
    busy = true; send.disabled = true;
    const typing = el("div", "typing", "…");
    try {
      await ensureConversation();
      addMessage({ role: "visitor", body });
      text.value = "";
      if (status === "bot") { log.appendChild(typing); scroll(); }
      const out = await api(`/conversations/${conv.id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      typing.remove();
      status = out.status;
      // The visitor's own message is already shown; record its id so polling doesn't repeat it.
      out.messages.forEach((m, i) => (i === 0 ? (lastId = Math.max(lastId, m.id)) : addMessage(m)));
      renderEmailForm();
    } catch (err) {
      typing.remove();
      showError(err.message);
    } finally { busy = false; send.disabled = false; text.focus(); }
  }

  async function refresh() {
    if (!conv) return;
    try {
      const out = await api(`/conversations/${conv.id}/messages?after=${lastId}`);
      status = out.status; email = out.email;
      out.messages.forEach(addMessage);
      renderEmailForm();
    } catch (err) {
      if (err.status === 404) { localStorage.removeItem(KEY); conv = null; }
    }
  }

  function startPolling() {
    clearInterval(poll);
    poll = setInterval(() => { if (!document.hidden && !busy) refresh(); }, 5000);
  }

  $("compose").addEventListener("submit", (e) => { e.preventDefault(); sendMessage(text.value); });
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(text.value); } });
  $("close").addEventListener("click", () => parent.postMessage("pandadesk:close", "*"));
  $("human").addEventListener("click", async () => {
    try {
      await ensureConversation();
      const out = await api(`/conversations/${conv.id}/human`, { method: "POST", body: "{}" });
      status = out.status;
      out.messages.forEach(addMessage);
    } catch (err) { showError(err.message); }
  });

  (async () => {
    config = await api("/config").catch(() => ({ name: "Support", greeting: "Hi! How can we help?", starters: [] }));
    document.documentElement.style.setProperty("--accent", config.color || "#2f6f4f");
    $("title").textContent = config.name;
    document.title = config.name;
    log.appendChild(el("div", "msg bot", window.renderMarkdown(config.greeting)));
    if (conv) { await refresh(); startPolling(); }
    if (!lastId && config.starters?.length) {
      const box = el("div", "starters");
      config.starters.forEach((q) => { const b = el("button"); b.type = "button"; b.textContent = q; b.onclick = () => sendMessage(q); box.appendChild(b); });
      log.appendChild(box);
    }
    text.focus();
  })();
})();
