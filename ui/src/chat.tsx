import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Messenger, { type ChatConfig } from "./Messenger";
import "./index.css";

// Inside the widget's iframe the chat talks to the launcher; ?inline=1 (the home page demo) shows it as a page.
const embedded = window.parent !== window && !new URLSearchParams(location.search).has("inline");

function Chat() {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c: ChatConfig) => { setConfig(c); document.title = c.name; })
      .catch(() => setConfig({ name: "Support", color: "#1c1917", textColor: "#ffffff", greeting: "Hi! How can we help?", starters: [], branding: true }));
  }, []);
  // In the widget iframe the chat fills the frame; opened on its own it fills the window.
  return config ? <div className="h-dvh"><Messenger config={config} embedded={embedded} /></div> : null;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Chat /></StrictMode>);
