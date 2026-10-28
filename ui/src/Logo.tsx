/** The PandaDesk mark: a panda face drawn as a chat bubble. */
export function LogoMark({ className = "h-7 w-7", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx="15" cy="14" r="9" fill="#1c1917" />
      <circle cx="49" cy="14" r="9" fill="#1c1917" />
      <path
        d="M32 9c15.5 0 26 9.6 26 22.5S47.5 54 32 54c-3.3 0-6.4-.4-9.2-1.2L11 58l2.7-9.6C9 44.4 6 38.4 6 31.5 6 18.6 16.5 9 32 9z"
        fill="#fff" stroke="#1c1917" strokeWidth="4" strokeLinejoin="round"
      />
      <ellipse cx="21.8" cy="31" rx="5.6" ry="8.4" transform="rotate(38 21.8 31)" fill="#1c1917" />
      <ellipse cx="42.2" cy="31" rx="5.6" ry="8.4" transform="rotate(-38 42.2 31)" fill="#1c1917" />
      <circle cx="23.4" cy="29.4" r="2.2" fill="#fff" />
      <circle cx="40.6" cy="29.4" r="2.2" fill="#fff" />
      <path d="M28.6 39.6h6.8c.9 0 1.3 1 .7 1.7L33 44.4a1.4 1.4 0 0 1-2 0l-3.1-3.1c-.6-.7-.2-1.7.7-1.7z" fill="#1c1917" />
    </svg>
  );
}

export function Logo({ className = "", markClassName = "h-7 w-7" }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-stone-900 ${className}`}>
      <LogoMark className={markClassName} />
      PandaDesk
    </span>
  );
}
