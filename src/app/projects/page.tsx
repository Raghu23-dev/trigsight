import type { Metadata } from "next";
import Link from "next/link";
import { projects } from "../../lib/content";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Independently built systems, each with a live instance, a public repository, a reproducible benchmark and a published limitation.",
};

/**
 * The projects index.
 *
 * Separate from /work because the evidence differs in kind. Employer work is described
 * generically and cannot be verified from outside; each of these has a running instance, a
 * public repo and a benchmark a stranger can re-run.
 *
 * Every card shows its limitation next to its headline number. That is deliberate: a section
 * listing only the good numbers would be the marketing the rest of this site argues against,
 * and the schema makes the field required so the choice cannot quietly lapse.
 */
export default function ProjectsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <Link
        href="/"
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle hover:text-fg"
      >
        ← Home
      </Link>

      <header className="mt-10">
        <h1 className="font-display text-3xl leading-tight tracking-tight text-fg">
          Projects
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fg-muted">
          Systems built to answer a measurable question. Each one is running somewhere a
          stranger can reach, its benchmark reproduces from one command, and its published
          result includes whatever came out worse than hoped.
        </p>
      </header>

      <ul className="mt-14 space-y-px">
        {projects.map((p) => (
          <li key={p.id}>
            <article className="border border-border bg-surface p-6 transition-colors hover:border-accent-dim sm:p-8">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
                  {p.category}
                </span>
                <span className="font-mono text-2xs text-fg-subtle">{p.period}</span>
              </div>

              <h2 className="mt-3 font-display text-xl leading-snug tracking-tight text-fg">
                <Link href={p.path} className="hover:text-accent">
                  {p.title}
                </Link>
              </h2>

              <p className="mt-3 max-w-2xl leading-relaxed text-fg-muted">{p.summary}</p>

              <p className="mt-5 border-l-2 border-pass pl-4 font-mono text-sm leading-relaxed text-fg">
                {p.headline}
              </p>

              {/* The limitation sits at the same visual weight as the headline, not below the
                  fold. A reader who only skims should see both. */}
              <p className="mt-3 border-l-2 border-warn pl-4 text-sm leading-relaxed text-fg-muted">
                <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                  What does not work
                </span>
                <br />
                {p.limitation}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs">
                <Link href={p.path} className="text-accent hover:underline">
                  Read the writeup →
                </Link>
                <a
                  href={p.live}
                  className="text-fg-muted hover:text-fg"
                  rel="noreferrer noopener"
                >
                  Live instance
                </a>
                <a
                  href={p.repo}
                  className="text-fg-muted hover:text-fg"
                  rel="noreferrer noopener"
                >
                  Source
                </a>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
