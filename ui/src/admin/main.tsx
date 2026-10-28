import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { api } from "./api";
import { useRoute } from "./router";
import Shell from "./Shell";
import Login from "./Login";
import Inbox from "./Inbox";
import Sources from "./Sources";
import Answers from "./Answers";
import Test from "./Test";
import Install from "./Install";
import Appearance from "./Appearance";
import Settings from "./Settings";

function App() {
  const [auth, setAuth] = useState<"checking" | "in" | "out">("checking");
  const [name, setName] = useState("Support");
  const [waiting, setWaiting] = useState(0);
  const route = useRoute();
  const check = useCallback(() => {
    api("/me").then(() => { setAuth("in"); api<{ name: string }>("/settings").then((s) => setName(s.name)).catch(() => {}); }).catch(() => setAuth("out"));
  }, []);
  useEffect(() => {
    check();
    const out = () => setAuth("out");
    window.addEventListener("pandadesk:signed-out", out);
    return () => window.removeEventListener("pandadesk:signed-out", out);
  }, [check]);
  // Links in alert emails point at #/c/<id>.
  useEffect(() => { if (route[0] === "c" && route[1]) location.hash = `#/inbox/all/${route[1]}`; }, [route]);
  const onCount = useCallback((n: number) => setWaiting(n), []);

  if (auth === "checking") return null;
  if (auth === "out") return <Login onIn={check} />;
  const [page = "inbox", a, b] = route;
  return (
    <Shell page={page} name={name} waiting={waiting}>
      {page === "inbox" && <Inbox tab={a} id={b} onCount={onCount} />}
      {page === "sources" && <Sources />}
      {page === "answers" && <Answers id={a} />}
      {page === "test" && <Test />}
      {page === "install" && <Install />}
      {page === "appearance" && <Appearance onSaved={setName} />}
      {page === "settings" && <Settings />}
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
