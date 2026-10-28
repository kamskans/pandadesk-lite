(() => {
  const app = document.getElementById("app");

  // h("div.card", {onclick}, child, ...) builds an element; strings become text, never HTML.
  function h(spec, props, ...kids) {
    const [tag, ...classes] = spec.split(".");
    const e = document.createElement(tag || "div");
    if (classes.length) e.className = classes.join(" ");
    if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "html") e.innerHTML = v;
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
    return e;
  }

  async function api(path, opts = {}) {
    const res = await fetch(`/api/admin${path}`, { ...opts, headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("sign in first"); }
    if (!res.ok) throw new Error(data.error || "something went wrong");
    return data;
  }

  function toast(msg) {
    const t = h("div.toast", msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  const ago = (t) => {
    const s = Math.floor(Date.now() / 1000) - t;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(t * 1000).toLocaleDateString();
  };

  // A button that shows it's busy while its action runs, and reports errors.
  const action = (label, fn, cls = "") => {
    const b = h(`button.btn${cls ? "." + cls : ""}`, { type: "button" }, label);
    b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message); } finally { b.disabled = false; } };
    return b;
  };

  function showLogin() {
    clearInterval(timer);
    const pw = h("input", { type: "password", autocomplete: "current-password", required: true, id: "pw" });
    const form = h("form.card.stack.login", h("h1", "Sign in"), h("div", h("label", { for: "pw" }, "Admin password"), pw), h("button.btn.primary", { type: "submit" }, "Sign in"));
    form.onsubmit = async (e) => {
      e.preventDefault();
      try { await api("/login", { method: "POST", body: { password: pw.value } }); route(); } catch (err) { toast(err.message); }
    };
    app.replaceChildren(form);
    pw.focus();
  }

  let timer = null;
  let waiting = 0;

  function shell(active, content) {
    const link = (hash, label, extra) => h(`a${active === hash ? ".on" : ""}`, { href: `#/${hash}` }, label, extra || "");
    app.replaceChildren(h("div.layout",
      h("nav",
        h("div.brand", "Support admin"),
        link("inbox", "Inbox", waiting ? h("span.count", waiting) : ""),
        link("knowledge", "Knowledge"),
        link("test", "Test answers"),
        link("settings", "Chat settings"),
        link("install", "Install"),
        h("div.foot",
          h("div", "Need a team inbox, an agent that looks up customer data, or setup from your coding agent? "),
          h("a", { href: "https://pandadesk.app/?ref=lite-admin", target: "_blank", rel: "noopener" }, "PandaDesk Cloud"),
          h("div", { style: "margin-top:10px" }, action("Sign out", async () => { await api("/logout", { method: "POST" }); showLogin(); })))),
      h("main", content)));
  }

  // ---------- Inbox ----------
  async function inbox(filter = "active", openId) {
    const { conversations } = await api(`/conversations?status=${filter}`);
    if (filter === "active") waiting = conversations.filter((c) => c.status === "waiting").length;
    const tabs = [["active", "Waiting & open"], ["bot", "Answered by AI"], ["closed", "Closed"], ["all", "All"]];
    const list = h("div.list", conversations.length ? conversations.map((c) =>
      h(`a${c.id === openId ? ".on" : ""}`, { href: `#/inbox/${filter}/${c.id}` },
        h("div.who", h("span", c.email || "Visitor"), h("span.muted", { style: "font-weight:400;font-size:12.5px" }, ago(c.updated_at))),
        h("div.row", h(`span.tag.${c.status}`, c.status), c.unread ? h("span.tag.waiting", `${c.unread} new`) : ""),
        h("div.last", c.last || ""))) : h("div.empty", filter === "active" ? "No one is waiting for a reply." : "No conversations here yet."));
    const thread = h("div.thread", h("div.empty", "Pick a conversation."));
    shell("inbox", [h("h1", "Inbox"), h("div.tabs", tabs.map(([k, l]) => h(`a${k === filter ? ".on" : ""}`, { href: `#/inbox/${k}` }, l))), h("div.inbox", list, thread)]);
    if (openId) await showThread(thread, openId, filter);
  }

  async function showThread(box, id, filter) {
    const { conversation: c, messages } = await api(`/conversations/${id}`);
    const msgs = h("div.messages", messages.map((m) =>
      h(`div.m.${m.role}`, h("div.by", { "aria-hidden": "true" }, { visitor: c.email || "Visitor", bot: "AI", admin: "You", note: "Private note" }[m.role]), h("div", { html: window.renderMarkdown(m.body) }))));
    const text = h("textarea", { placeholder: c.email ? `Reply to ${c.email}…` : "Reply in the chat…", "aria-label": "Reply" });
    const note = h("input", { type: "checkbox", id: "note", style: "width:auto" });
    const status = (s, label) => action(label, async () => { await api(`/conversations/${id}/status`, { method: "POST", body: { status: s } }); route(); });
    box.replaceChildren(
      h("div.top",
        h("strong", c.email || "Visitor"), h(`span.tag.${c.status}`, c.status),
        c.page_url ? h("a.muted", { href: c.page_url, target: "_blank", rel: "noopener", style: "font-size:13px" }, new URL(c.page_url).pathname) : "",
        h("span", { style: "flex:1" }),
        c.status === "closed" ? status("open", "Reopen") : status("closed", "Close"),
        c.status !== "bot" ? status("bot", "Hand back to AI") : "",
        action("Delete", async () => { if (confirm("Delete this conversation? This can't be undone.")) { await api(`/conversations/${id}`, { method: "DELETE" }); location.hash = `#/inbox/${filter}`; } }, "danger")),
      msgs,
      h("div.reply", text, h("div.row",
        h("label", { for: "note", style: "font-weight:400;display:flex;gap:6px;align-items:center;margin:0" }, note, "Private note"),
        h("span", { style: "flex:1" }),
        h("span.hint", c.email ? "The visitor sees it in the chat and gets it by email (if email is set up)." : "The visitor sees it in the chat."),
        action("Send", async () => {
          if (!text.value.trim()) return;
          const out = await api(`/conversations/${id}/reply`, { method: "POST", body: { body: text.value, note: note.checked } });
          if (out.emailed) toast("Sent, and emailed to the visitor.");
          route();
        }, "primary"))));
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ---------- Knowledge ----------
  async function knowledge() {
    const { sources, pinned } = await api("/knowledge");
    const url = h("input", { type: "url", placeholder: "https://docs.example.com", required: true, id: "url" });
    const addSite = h("form.card.stack",
      h("div", h("label", { for: "url" }, "Website"), url, h("div.hint", "Reads the pages under this address (using the sitemap if there is one) and reads them again every day.")),
      h("div", h("button.btn.primary", { type: "submit" }, "Add website")));
    addSite.onsubmit = async (e) => { e.preventDefault(); try { await api("/sources", { method: "POST", body: { kind: "website", url: url.value } }); route(); } catch (err) { toast(err.message); } };

    const tTitle = h("input", { id: "tt", required: true, placeholder: "Refund policy" });
    const tBody = h("textarea", { id: "tb", required: true, rows: 5, placeholder: "Paste text or Markdown" });
    const addTxt = h("form.card.stack", h("div", h("label", { for: "tt" }, "Text"), tTitle), tBody, h("div", h("button.btn.primary", { type: "submit" }, "Add text")));
    addTxt.onsubmit = async (e) => { e.preventDefault(); try { await api("/sources", { method: "POST", body: { kind: "text", title: tTitle.value, text: tBody.value } }); route(); } catch (err) { toast(err.message); } };

    const pages = h("div");
    const rows = sources.map((s) => h("tr",
      h("td", h("strong", s.title), s.url ? h("div", h("a.muted", { href: s.url, target: "_blank", rel: "noopener", style: "font-size:13px" }, s.url)) : h("div.muted", "Text")),
      h("td", h(`span.tag${s.status === "reading" ? ".waiting" : ""}`, s.status === "reading" ? `reading ${s.done}/${s.pages}` : "ready"), s.failed ? h("div", h("span.tag.error", `${s.failed} failed`)) : ""),
      h("td", `${s.passages} passages`),
      h("td", h("div.row", s.kind === "website" ? [
        action("Pages", async () => {
          const { pages: list } = await api(`/sources/${s.id}/pages`);
          pages.replaceChildren(h("h2", `Pages of ${s.title}`), h("div.card", h("table", list.map((p) => h("tr", h("td", h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.title || p.url)), h("td", h(`span.tag${p.status === "error" ? ".error" : ""}`, p.status), p.error ? h("div.hint", p.error) : ""))))));
          pages.scrollIntoView({ behavior: "smooth" });
        }),
        action("Read again", async () => { await api(`/sources/${s.id}/resync`, { method: "POST" }); route(); }),
      ] : "", action("Remove", async () => { if (confirm(`Remove ${s.title}?`)) { await api(`/sources/${s.id}`, { method: "DELETE" }); route(); } }, "danger")))));

    const q = h("input", { id: "pq", required: true, placeholder: "Do you offer refunds?" });
    const a = h("textarea", { id: "pa", required: true, rows: 3, placeholder: "Yes, within 30 days of purchase…" });
    let editing = null;
    const savePin = h("button.btn.primary", { type: "submit" }, "Save answer");
    const addPin = h("form.card.stack", h("div", h("label", { for: "pq" }, "Question"), q), h("div", h("label", { for: "pa" }, "Answer"), a, h("div.hint", "Used first whenever someone asks something like this.")), h("div", savePin));
    addPin.onsubmit = async (e) => { e.preventDefault(); try { await api("/pinned", { method: "POST", body: { id: editing, question: q.value, answer: a.value } }); route(); } catch (err) { toast(err.message); } };

    shell("knowledge", [
      h("h1", "Knowledge"),
      h("p.muted", "What the AI answers from. It only answers from what's here, and passes anything else to you."),
      h("div.grid2", addSite, addTxt),
      h("h2", "Sources"),
      sources.length ? h("div.card", h("table", h("tr", h("th", "Source"), h("th", "Status"), h("th", "Search"), h("th", "")), rows)) : h("div.card.empty", "Nothing yet. Add your website or docs above."),
      pages,
      h("h2", "Pinned answers"),
      addPin,
      pinned.length ? h("div.card", { style: "margin-top:10px" }, h("table", pinned.map((p) => h("tr",
        h("td", h("strong", p.question), h("div", { html: window.renderMarkdown(p.answer) })),
        h("td", h("div.row", action("Edit", async () => { editing = p.id; q.value = p.question; a.value = p.answer; savePin.textContent = "Update answer"; q.focus(); }),
          action("Remove", async () => { await api(`/pinned/${p.id}`, { method: "DELETE" }); route(); }, "danger"))))))) : "",
    ]);
    if (sources.some((s) => s.status === "reading")) timer = setTimeout(() => location.hash.startsWith("#/knowledge") && route(), 4000);
  }

  // ---------- Test ----------
  function test() {
    const q = h("input", { id: "q", required: true, placeholder: "How do I reset my password?" });
    const out = h("div");
    const form = h("form.card.stack", h("div", h("label", { for: "q" }, "Ask a question as a customer would"), q), h("div", h("button.btn.primary", { type: "submit" }, "Ask")));
    form.onsubmit = async (e) => {
      e.preventDefault();
      out.replaceChildren(h("p.muted", "Thinking…"));
      try {
        const r = await api("/test", { method: "POST", body: { question: q.value } });
        out.replaceChildren(
          h("h2", "Answer"),
          h("div.card", r.handoff ? h("p", h("strong", "Passed to the team. "), "The knowledge doesn't cover this, so the visitor would be asked for their email.") : h("div", { html: window.renderMarkdown(r.text) })),
          h("h2", "Passages it used"),
          r.passages.length ? h("div.stack", r.passages.map((p) => h("div.card", h("strong", p.title), p.pinned ? h("span.tag.open", { style: "margin-left:6px" }, "pinned") : "", p.url ? h("div", h("a.muted", { href: p.url, target: "_blank", rel: "noopener", style: "font-size:13px" }, p.url)) : "", h("p.muted", { style: "white-space:pre-wrap;margin-bottom:0" }, p.text.slice(0, 600))))) : h("p.muted", "None found."));
      } catch (err) { out.replaceChildren(h("p", err.message)); }
    };
    shell("test", [h("h1", "Test answers"), form, out]);
    q.focus();
  }

  // ---------- Settings ----------
  async function settings() {
    const [s, me] = await Promise.all([api("/settings"), api("/me")]);
    const field = (id, label, input, hint) => h("div", h("label", { for: id }, label), input, hint ? h("div.hint", hint) : "");
    const name = h("input", { id: "name", value: s.name, maxlength: 60 });
    const color = h("input", { id: "color", type: "color", value: s.color, style: "width:80px;height:40px;padding:2px" });
    const greeting = h("textarea", { id: "greeting", rows: 2, maxlength: 300 }, s.greeting);
    const starters = [0, 1, 2, 3].map((i) => h("input", { value: s.starters[i] || "", maxlength: 120, "aria-label": `Starter question ${i + 1}` }));
    const form = h("form.card.stack",
      field("name", "Name", name, "Shown at the top of the chat."),
      field("color", "Colour", color),
      field("greeting", "Greeting", greeting),
      h("div", h("label", "Starter questions"), h("div.stack", starters), h("div.hint", "Shown as buttons before the visitor writes anything.")),
      h("div", h("button.btn.primary", { type: "submit" }, "Save")));
    form.onsubmit = async (e) => {
      e.preventDefault();
      try { await api("/settings", { method: "POST", body: { name: name.value, color: color.value, greeting: greeting.value, starters: starters.map((x) => x.value) } }); toast("Saved."); } catch (err) { toast(err.message); }
    };
    const ok = (yes, good, bad) => h("tr", h("td", yes ? "✓" : "–"), h("td", yes ? good : bad));
    shell("settings", [h("h1", "Chat settings"), form,
      h("h2", "Set up with environment variables"),
      h("div.card", h("table",
        ok(true, `Answers use ${me.llm}.`, ""),
        ok(me.vectors, "Search by meaning is on (Vectorize).", "Search by meaning is off: create the Vectorize index (see the README). Keyword search still works."),
        ok(me.email, "Email is set up (Resend).", "Email is off: set RESEND_API_KEY and EMAIL_FROM to email visitors your replies."),
        ok(!!me.notify, `New hand-offs are emailed to ${me.notify}.`, "Set NOTIFY_EMAIL to be emailed when someone asks for a person.")))]);
  }

  // ---------- Install ----------
  function install() {
    const snippet = `<script src="${location.origin}/widget.js" defer></script>`;
    shell("install", [h("h1", "Install"),
      h("p", "Add this before ", h("code", "</body>"), " on every page where the chat should appear:"),
      h("pre.snippet", snippet),
      action("Copy", async () => { await navigator.clipboard.writeText(snippet); toast("Copied."); }),
      h("p.muted", "Preview: ", h("a", { href: "/chat", target: "_blank" }, "open the chat on its own page"), "."),
      h("h2", "Export"),
      h("p.muted", "Download your sources, pinned answers and settings as JSON."),
      h("a.btn", { href: "/api/admin/export", download: "pandadesk-export.json", style: "text-decoration:none;display:inline-block" }, "Download export")]);
  }

  async function route() {
    clearTimeout(timer);
    const [view = "inbox", a, b] = location.hash.replace(/^#\/?/, "").split("/");
    try {
      if (view === "c") return void (location.hash = `#/inbox/active/${a}`);
      if (view === "knowledge") return await knowledge();
      if (view === "test") return test();
      if (view === "settings") return await settings();
      if (view === "install") return install();
      await inbox(a || "active", b);
    } catch (err) { if (err.message !== "sign in first") toast(err.message); }
  }

  window.addEventListener("hashchange", route);
  route();
})();
