import Link from "next/link";
import { Scene } from "../components/scene";
import { work } from "../lib/content";
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
    <main className="mx-auto max-w-4xl px-6 py-24">
      {/* The scene sits behind the hero, never over it, and is aria-hidden.
          Height is fixed so it cannot become the largest contentful paint. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42vh] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <Scene />
      </div>

      <header>
        <p className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
          Raghuram P · GenAI Full-Stack Engineer
        </p>
        <h1 className="mt-6 max-w-3xl font-display text-4xl leading-[1.05] tracking-tight text-fg">
          I build the AI tools other engineers build with.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
          Multi-agent orchestration, hybrid retrieval and real-time streaming
          backbones — shipped to production and used daily across enterprise
          environments.
        </p>
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
          className="rounded border border-border bg-surface px-3 py-2 font-mono text-2xs uppercase tracking-wider text-fg-muted transition-colors hover:border-accent-dim hover:text-fg"
        >
          Ask about the work →
        </Link>
      </nav>

      <section className="mt-20">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
          Selected work
        </h2>
        <ul className="mt-8 divide-y divide-border border-t border-border">
          {work.map((w) => (
            <li key={w.id}>
              <Link
                href={w.path}
                className="group flex flex-col gap-2 py-7 transition-colors hover:bg-surface/40 sm:flex-row sm:items-baseline sm:gap-8"
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
            </li>
          ))}
        </ul>
      </section>
    </main>
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
