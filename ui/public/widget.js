/*!
 * PandaDesk Lite chat loader. Add before </body>:
 *   <script src="https://YOUR-WORKER.workers.dev/widget.js" async></script>
 * Optional: PandaDesk('open' | 'close' | 'toggle')
 */
(function () {
  if (window.__pandadeskLoaded) return;
  window.__pandadeskLoaded = true;

  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  if (!script) return;
  var origin = new URL(script.src).origin;
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var queue = (window.PandaDesk && window.PandaDesk.q) || [];
  var open = false;
  var unread = false;
  var textColor = "#fff";
  var chatIcon = '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>';

  // The chat loads only when it's wanted: on open, or on hovering the bubble so it opens instantly.
  var frame = document.createElement("iframe");
  frame.id = "pd-frame";
  frame.title = "Support chat";
  frame.setAttribute("allow", "clipboard-write");
  var frameLoaded = false;
  function loadFrame() {
    if (frameLoaded) return;
    frameLoaded = true;
    frame.src = origin + "/chat?page=" + encodeURIComponent(location.href);
    document.body.insertBefore(frame, button);
  }

  var button = document.createElement("button");
  button.id = "pd-launcher";
  button.type = "button";
  button.setAttribute("aria-label", "Open support chat");
  button.style.background = "#1c1917";

  var style = document.createElement("style");
  style.textContent =
    "#pd-launcher{position:fixed;bottom:20px;" + position + ":20px;width:56px;height:56px;border-radius:50%;border:0;padding:0;cursor:pointer;" +
    "box-shadow:0 6px 24px rgba(0,0,0,.18);z-index:2147483646;display:flex;align-items:center;justify-content:center;transition:transform .15s;overflow:visible}" +
    "#pd-launcher:hover{transform:scale(1.06)}#pd-launcher svg{width:26px;height:26px}" +
    "#pd-frame{position:fixed;bottom:88px;" + position + ":20px;width:384px;height:min(640px,calc(100vh - 112px));border:0;border-radius:16px;" +
    "box-shadow:0 12px 48px rgba(0,0,0,.2);z-index:2147483647;background:#fff;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .18s,transform .18s}" +
    "#pd-frame.pd-open{opacity:1;transform:none;pointer-events:auto}" +
    "@media (max-width:480px){#pd-frame{inset:0;width:100%;height:100%;border-radius:0}#pd-frame.pd-open~#pd-launcher{display:none}}";

  function icon(svg, width) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + textColor + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round">' + svg + "</svg>";
  }
  function dot() {
    return unread && !open ? '<span style="position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff"></span>' : "";
  }
  function draw() { button.innerHTML = (open ? icon('<path d="M6 6l12 12M18 6L6 18"/>', 2.2) : icon(chatIcon, 2)) + dot(); }
  function post(msg) { if (frame.contentWindow) frame.contentWindow.postMessage(Object.assign({ pandadesk: true }, msg), origin); }

  function setOpen(v) {
    if (v) loadFrame();
    open = v;
    if (open) unread = false;
    frame.classList.toggle("pd-open", open);
    draw();
    button.setAttribute("aria-label", open ? "Close support chat" : "Open support chat");
    post({ type: open ? "focus" : "hidden" });
  }
  button.addEventListener("click", function () { setOpen(!open); });
  button.addEventListener("pointerenter", loadFrame);
  button.addEventListener("focus", loadFrame);

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || !e.data.pandadesk) return;
    if (e.data.type === "ready" && open) post({ type: "focus" });
    if (e.data.type === "unread") { unread = !!e.data.unread && !open; draw(); }
    if (e.data.type === "close") setOpen(false);
  });

  function api(cmd) {
    if (cmd === "open") setOpen(true);
    else if (cmd === "close") setOpen(false);
    else if (cmd === "toggle") setOpen(!open);
  }
  window.PandaDesk = api;

  function mount() {
    document.head.appendChild(style);
    draw();
    document.body.appendChild(button);
    queue.forEach(function (args) { api.apply(null, args); });
  }

  fetch(origin + "/api/config")
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (cfg.color) button.style.background = cfg.color; if (cfg.textColor) textColor = cfg.textColor; })
    .catch(function () { /* keep the default look */ })
    .then(function () { if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount); });
})();
