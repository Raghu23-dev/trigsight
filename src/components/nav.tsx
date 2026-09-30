import Link from "next/link";
import { nav } from "../lib/content";

const linkClass =
  "font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted transition-colors hover:text-fg";

/**
 * Site header.
 *
 * The only piece of persistent chrome on the site. Before this existed, the only way
 * to reach GitHub, LinkedIn, email, or a résumé was to already know the URL — every
 * page was an island reachable only by an inline "← Home" link. `scroll-padding-top`
 * in globals.css already assumed a fixed-height header (5rem) for anchor scrolling;
 * this is that header, sized to match.
 *
 * Link data lives in `content/chrome/nav.mdx`, not here — this component only knows
 * how to render a primary link and a contact link, in either of its two variants.
 */
export function Header() {
  const primaryLinks = [...nav.primaryLinks].sort((a, b) => a.order - b.order);

  return (
    <header
      className="sticky top-0 z-40 h-20 border-b border-border bg-bg/85 backdrop-blur"
      style={{ viewTransitionName: "site-header" }}
    >
      <div className="mx-auto flex h-full max-w-4xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          transitionTypes={["nav-back"]}
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
          {primaryLinks.map((l) => (
            <Link key={l.href} href={l.href} transitionTypes={["nav-forward"]} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          {nav.contactLinks.map((l) => {
            const hideClass = l.hiddenOnMobile ? "hidden sm:inline" : "";
            const externalAttrs = l.external ? { target: "_blank", rel: "noreferrer" } : {};
            if (l.variant === "button") {
              return (
                <a
                  key={l.href}
                  href={l.href}
                  {...externalAttrs}
                  className={`${hideClass} rounded border border-border bg-surface px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-fg-muted transition-colors hover:border-accent-dim hover:text-fg`}
                >
                  {l.label}
                </a>
              );
            }
            return (
              <a key={l.href} href={l.href} {...externalAttrs} className={`${linkClass} ${hideClass}`}>
                {l.label}
              </a>
            );
          })}
        </div>
      </div>
    </header>
  );
}
