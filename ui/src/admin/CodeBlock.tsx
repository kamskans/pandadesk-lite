import { useState } from "react";

export default function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-stone-900 p-4 pr-20 text-[13px] leading-relaxed text-stone-100"><code>{code}</code></pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute top-2.5 right-2.5 rounded-md bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20"
      >{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
