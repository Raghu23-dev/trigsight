import Link from "next/link";
import allowlist from "../generated/citation-allowlist.json";
import payload from "../generated/payload.json";

/**
 * Site footer. Repeats the contact set from the header — a visitor who scrolls to
 * the end of a case study shouldn't have to scroll back to the top to reach it —
 * plus the same build-verified numbers the homepage stat strip shows, read from
 * the same generated files so the two can never disagree.
 */
export function Footer() {
  const verifiedCitations = Object.keys(allowlist).length;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link
              href="/projects"
              className="font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg"
            >
              Projects
            </Link>
            <Link
              href="/about"
              className="font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg"
            >
              About
            </Link>
            <a
              href="mailto:raghu.builds@gmail.com"
              className="font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg"
            >
              Email
            </a>
            <a
              href="https://linkedin.com/in/raghuram-p"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg"
            >
              LinkedIn
            </a>
            <a
              href="https://github.com/Raghu23-dev"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-2xs uppercase tracking-[0.14em] text-fg-muted hover:text-fg"
            >
              GitHub
            </a>
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
