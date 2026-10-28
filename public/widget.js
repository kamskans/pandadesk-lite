// Add to your site: <script src="https://YOUR-WORKER.workers.dev/widget.js" defer></script>
(() => {
  if (window.__pandadesk) return;
  window.__pandadesk = true;
  const origin = new URL(document.currentScript.src).origin;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      button{all:unset;cursor:pointer;width:56px;height:56px;border-radius:50%;background:var(--c,#2f6f4f);display:grid;place-items:center;box-shadow:0 6px 20px rgba(20,30,25,.25);transition:transform .15s}
      button:hover{transform:scale(1.05)} button:focus-visible{outline:3px solid #fff;outline-offset:2px}
      svg{width:26px;height:26px;fill:#fff}
      iframe{position:absolute;right:0;bottom:72px;width:380px;height:min(620px,calc(100vh - 110px));border:0;border-radius:16px;box-shadow:0 12px 40px rgba(20,30,25,.25);background:#fff;display:none}
      :host(.open) iframe{display:block}
      @media (max-width:480px){iframe{position:fixed;inset:0;width:100vw;height:100dvh;border-radius:0}:host(.open) button{display:none}}
    </style>
    <iframe title="Chat" allow="clipboard-write"></iframe>
    <button aria-label="Open chat" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.4 1.1 4.6 3 6.2L4.3 21l3.9-1.9c1.2.4 2.5.6 3.8.6 5.5 0 10-3.9 10-8.7S17.5 3 12 3z"/></svg>
    </button>`;
  const button = shadow.querySelector("button");
  const frame = shadow.querySelector("iframe");
  let loaded = false;
  const toggle = (open) => {
    if (open && !loaded) { frame.src = `${origin}/chat?page=${encodeURIComponent(location.href)}`; loaded = true; }
    host.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close chat" : "Open chat");
  };
  button.addEventListener("click", () => toggle(!host.classList.contains("open")));
  window.addEventListener("message", (e) => { if (e.origin === origin && e.data === "pandadesk:close") toggle(false); });
  fetch(`${origin}/api/config`).then((r) => r.json()).then((c) => { if (c.color) host.style.setProperty("--c", c.color); }).catch(() => {});
  document.body.appendChild(host);
})();
