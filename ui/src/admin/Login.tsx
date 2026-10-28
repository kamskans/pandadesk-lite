import { useState } from "react";
import { Logo } from "../Logo";
import { api } from "./api";

export default function Login({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo className="text-xl" markClassName="h-9 w-9" /></div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="mb-5 text-xl font-semibold">Sign in</h1>
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError(null);
            try { await api("/login", { body: { password } }); onIn(); } catch (err) { setError((err as Error).message); setBusy(false); }
          }}>
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Admin password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-500" />
            </label>
            {error && <p className="text-sm text-red-600">{error === "wrong password" ? "That password isn't right." : error}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-stone-900 py-2.5 font-medium text-white hover:bg-stone-800 disabled:opacity-60">{busy ? "One moment…" : "Sign in"}</button>
            <p className="text-center text-xs text-stone-500">The password is the <code>ADMIN_PASSWORD</code> secret on your Worker.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
