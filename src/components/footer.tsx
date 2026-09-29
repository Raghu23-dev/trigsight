import Link from "next/link";
import { footer } from "../lib/content";
import allowlist from "../generated/citation-allowlist.json";
import payload from "../generated/payload.json";

/**
 * Site footer. Repeats the contact set from the header — a visitor who scrolls to
 * the end of a case study shouldn't have to scroll back to the top to reach it —
 * plus the same build-verified numbers the homepage stat strip shows, read from
 * the same generated files so the two can never disagree.
 *
 * Link data lives in `content/chrome/footer.mdx`. `mailto:` links never open a new
 * tab even though they're marked `external` (not a Next.js route) — that
 * distinction, not the `external` flag alone, decides whether `target="_blank"`
 * applies.
 */
export function Footer() {
  const verifiedCitations = Object.keys(allowlist).length;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {footer.links.map((l) => {
              const className = "font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg";
              if (!l.external) {
                return (
                  <Link key={l.href} href={l.href} transitionTypes={["nav-forward"]} className={className}>
                    {l.label}
                  </Link>
                );
              }
              const isMailto = l.href.startsWith("mailto:");
              return (
                <a
                  key={l.href}
                  href={l.href}
                  {...(isMailto ? {} : { target: "_blank", rel: "noreferrer" })}
                  className={className}
                >
                  {l.label}
                </a>
              );
            })}
          </nav>

          <p className="font-mono text-2xs text-fg-subtle">
            {verifiedCitations}/{verifiedCitations} claims bound to source &middot;{" "}
            {payload.initialJsKb} KB initial JS
          </p>
        </div>
      </div>
    </footer>
  );
}
