import Link from "next/link";

/**
 * Site header.
 *
 * The only piece of persistent chrome on the site. Before this existed, the only way
 * to reach GitHub, LinkedIn, email, or a résumé was to already know the URL — every
 * page was an island reachable only by an inline "← Home" link. `scroll-padding-top`
 * in globals.css already assumed a fixed-height header (5rem) for anchor scrolling;
 * this is that header, sized to match.
 *
 * No client JS: it's a server component that wraps at small widths rather than
 * hiding behind a toggle, so a mobile visitor never spends a tap to see the contact
 * links that are the entire point of this component existing.
 */
const NAV_LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/ask", label: "Ask" },
];

const linkClass =
  "font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted transition-colors hover:text-fg";

export function Header() {
  return (
    <header className="sticky top-0 z-40 h-20 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-full max-w-4xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.14em] text-fg transition-colors hover:text-accent"
          aria-label="Raghuram P — home"
        >
          <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="var(--color-bg)" stroke="var(--color-border-strong)" />
            <circle cx="16" cy="16" r="3" fill="var(--color-accent)" />
            <path
              d="M16 5v5M16 22v5M5 16h5M22 16h5"
              stroke="var(--color-accent-dim)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Raghuram P
        </Link>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          <a href="https://github.com/Raghu23-dev" className={linkClass} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a
            href="https://linkedin.com/in/raghuram-p"
            className={`${linkClass} hidden sm:inline`}
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="/static/resume.pdf"
            className="rounded border border-border bg-surface px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-fg-muted transition-colors hover:border-accent-dim hover:text-fg"
          >
            Résumé
          </a>
        </div>
      </div>
    </header>
  );
}
