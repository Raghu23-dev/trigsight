import type { Metadata } from "next";
import Link from "next/link";
import { Chat } from "../../components/chat";
import allowlist from "../../generated/citation-allowlist.json";

export const metadata: Metadata = {
  title: "Ask",
  description:
    "Ask about the engineering. Answers are grounded in the case studies, and every citation links to the exact sentence supporting it.",
};

export default function AskPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <Link
        href="/"
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle transition-colors hover:text-accent"
      >
        ← index
      </Link>

      <h1 className="mt-10 font-display text-2xl tracking-tight text-fg">
        Ask about the engineering
      </h1>
      <p className="mt-4 leading-relaxed text-fg-muted">
        This answers from the case studies on this site and nothing else. If
        something is not covered it will say so rather than guess.
      </p>

      <Chat allowlist={allowlist} />
    </main>
  );
}
