import { ViewTransition } from "react";
import Link from "next/link";
import { Scene } from "../components/scene";
import { Reveal } from "../components/reveal";
import { MDX } from "../components/mdx";
import { pageBySlug, projects, skills, work } from "../lib/content";
import { PAGE_TRANSITION } from "../lib/page-transition";
import allowlist from "../generated/citation-allowlist.json";
import payload from "../generated/payload.json";

/**
 * The status strip is not decoration. The site's argument is that claims should be
 * verifiable, so the verification state is surfaced as UI rather than buried in a
 * README. These numbers are generated at build time — the citation count comes from
 * the verifier's own output, so it cannot drift from reality.
 */
const VERIFIED_CITATIONS = Object.keys(allowlist).length;
const PAYLOAD_KB = payload.initialJsKb;
const PAYLOAD_BUDGET_KB = payload.budgetKb;

export default function Home() {
  return (
    <ViewTransition {...PAGE_TRANSITION}>
    <main className="mx-auto max-w-4xl px-6 py-24">
      {/* The scene sits behind the hero, never over it, and is aria-hidden.
          Height is fixed so it cannot become the largest contentful paint. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42vh] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <Scene />
      </div>

      <header>
        {(() => {
          const home = pageBySlug("home");
          if (!home) throw new Error("content/home.mdx is missing");
          return (
            <>
              <p className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
                {home.eyebrow}
              </p>
              <h1 className="mt-6 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-fg">
                {home.headline}
              </h1>
              <div className="mt-6 max-w-2xl">
                <MDX code={home.body} />
              </div>
            </>
          );
        })()}
      </header>

      <section
        aria-label="Site verification status"
        className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3"
      >
        <Stat
          label="Claims bound to source"
          value={`${VERIFIED_CITATIONS}`}
          note="verified at build"
          state="pass"
        />
        <Stat
          label="Initial JS"
          value={`${PAYLOAD_KB} KB`}
          note={`budget ${PAYLOAD_BUDGET_KB} KB`}
          state={PAYLOAD_KB <= PAYLOAD_BUDGET_KB ? "pass" : "fail"}
        />
        <Stat
          label="Unverifiable claims"
          value="0"
          note="build fails otherwise"
          state="pass"
        />
      </section>

      <nav className="mt-12 flex flex-wrap gap-2">
        <Link
          href="/ask"
          transitionTypes={["nav-forward"]}
          className="rounded border border-border bg-surface px-3 py-2 font-mono text-2xs uppercase tracking-wider text-fg-muted transition-colors hover:border-accent-dim hover:text-fg"
        >
          Ask about the work →
        </Link>
      </nav>

      {/* Projects lead. They are the only work here with a live instance, a public repo and a
          benchmark a reader can re-run — so burying them under generically-described employer
          work would put the weakest evidence first. */}
      <section className="mt-20">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
            Projects
          </h2>
          <Link
            href="/projects"
            transitionTypes={["nav-forward"]}
            className="font-mono text-2xs text-accent hover:underline"
          >
            All three →
          </Link>
        </div>
        <ul className="mt-6 space-y-px">
          {projects.map((p, i) => (
            <li key={p.id}>
              <Reveal delayMs={i * 60}>
                <Link
                  href={p.path}
                  transitionTypes={["nav-forward"]}
                  className="card-hover block border border-border bg-surface p-5 hover:border-accent-dim hover:bg-surface-raised"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
                      {p.category}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-lg leading-snug tracking-tight text-fg">
                    {p.title}
                  </h3>
                  <p className="mt-2 font-mono text-sm leading-relaxed text-pass">
                    {p.headline}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.summary}</p>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
          Selected work
        </h2>
        <ul className="mt-8 divide-y divide-border border-t border-border">
          {work.map((w, i) => (
            <li key={w.id}>
              <Reveal delayMs={i * 50}>
                <Link
                  href={w.path}
                  transitionTypes={["nav-forward"]}
                  className="card-hover group flex flex-col gap-2 py-7 hover:bg-surface/40 sm:flex-row sm:items-baseline sm:gap-8"
                >
                  <span className="w-40 shrink-0 font-mono text-2xs uppercase tracking-wider text-accent">
                    {w.category}
                  </span>
                  <span className="flex-1">
                    <span className="block font-display text-lg tracking-tight text-fg group-hover:text-accent">
                      {w.title}
                    </span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-fg-muted">
                      {w.summary}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-fg-subtle">
                    {w.period}
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
          Skills
        </h2>
        <div className="mt-8 space-y-6">
          {skills.map((group, i) => (
            <Reveal key={group.id} delayMs={i * 40}>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <h3 className="w-40 shrink-0 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                  {group.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span key={item} className="skill-chip">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
    </ViewTransition>
  );
}

function Stat({
  label,
  value,
  note,
  state,
}: {
  label: string;
  value: string;
  note: string;
  state: "pass" | "fail";
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-lg text-fg">{value}</span>
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${state === "pass" ? "bg-pass" : "bg-fail"}`}
        />
      </div>
      <p className="mt-1.5 font-mono text-2xs uppercase leading-snug tracking-wider text-fg-subtle">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-2xs text-fg-subtle">{note}</p>
    </div>
  );
}
