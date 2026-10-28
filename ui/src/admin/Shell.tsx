import { useState } from "react";
import { BookOpen, CodeXml, ExternalLink, FlaskConical, Inbox, Library, LogOut, Menu, Palette, Pin, Settings, Sparkles, X, type LucideIcon } from "lucide-react";
import { LogoMark } from "../Logo";
import { api } from "./api";

function NavItem({ href, icon: Icon, label, badge, active, onNavigate }: {
  href: string; icon: LucideIcon; label: string; badge?: number; active: boolean; onNavigate: () => void;
}) {
  return (
    <a href={`#/${href}`} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-stone-900/[0.07] text-stone-900" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"}`}>
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-stone-900" : "text-stone-400 group-hover:text-stone-700"}`} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {!!badge && <span className="rounded-full bg-stone-900 px-1.5 text-[11px] font-semibold tabular-nums text-white">{badge}</span>}
    </a>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{title}</p>
      {children}
    </div>
  );
}

export default function Shell({ page, name, waiting, children }: { page: string; name: string; waiting: number; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const close = () => setMenu(false);
  const item = (href: string, icon: LucideIcon, label: string, badge?: number) =>
    <NavItem href={href} icon={icon} label={label} badge={badge} active={page === href} onNavigate={close} />;
  return (
    <div className="flex h-dvh flex-col bg-stone-50 md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-stone-200 bg-white md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center border-b border-stone-100">
          <div className="flex h-14 min-w-0 flex-1 items-center gap-2.5 px-4">
            <LogoMark className="h-7 w-7 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-tight font-semibold">{name}</span>
              <span className="block text-[11px] text-stone-500">PandaDesk Lite</span>
            </span>
          </div>
          <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={menu ? "Close menu" : "Open menu"}
            className="mr-2 rounded-lg p-2 text-stone-600 hover:bg-stone-100 md:hidden">
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <nav className={`${menu ? "flex" : "hidden"} flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 md:flex`}>
          <NavSection title="Support">
            {item("inbox", Inbox, "Inbox", waiting)}
          </NavSection>
          <NavSection title="Knowledge">
            {item("sources", Library, "Sources")}
            {item("answers", Pin, "Pinned answers")}
            {item("test", FlaskConical, "Test answers")}
          </NavSection>
          <NavSection title="Configuration">
            {item("install", CodeXml, "Install")}
            {item("appearance", Palette, "Chat appearance")}
            {item("settings", Settings, "Settings")}
          </NavSection>
          <div className="mt-auto space-y-3">
            <a href="https://pandadesk.app/?ref=lite-admin" target="_blank" rel="noopener"
              className="block rounded-xl border border-stone-200 bg-stone-50 p-3 text-[13px] text-stone-600 hover:border-stone-300">
              <span className="flex items-center gap-1.5 font-semibold text-stone-900"><Sparkles className="h-3.5 w-3.5" aria-hidden /> PandaDesk Cloud</span>
              <span className="mt-1 block">Team inbox, an AI agent that looks up your customers&apos; data, reports, and setup from your coding agent.</span>
            </a>
            <a href="https://pandadesk.app/docs" target="_blank" rel="noopener"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900">
              <BookOpen className="h-4 w-4 text-stone-400" aria-hidden /> Docs
            </a>
          </div>
        </nav>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 md:flex">
          <a href="/chat" target="_blank" rel="noopener" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open the chat
          </a>
          <button type="button" onClick={async () => { await api("/logout", { method: "POST" }).catch(() => {}); window.dispatchEvent(new Event("pandadesk:signed-out")); }}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
            <LogOut className="h-4 w-4 text-stone-400" aria-hidden /> Sign out
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
