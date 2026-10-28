import { useEffect, useState } from "react";

/** The admin is one page; the part after # is the route, e.g. #/inbox/abc. */
export function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export const go = (path: string) => { location.hash = `#/${path}`; };
