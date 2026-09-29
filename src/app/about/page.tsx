import type { Metadata } from "next";
import { ViewTransition } from "react";
import Link from "next/link";
import { PAGE_TRANSITION } from "../../lib/page-transition";

export const metadata: Metadata = {
  title: "About",
  description:
    "GenAI / full-stack engineer based in Hyderabad, India. Why this site and its four projects exist, and the discipline behind them.",
};

export default function AboutPage() {
  return (
    <ViewTransition {...PAGE_TRANSITION}>
    <main className="mx-auto max-w-4xl px-6 py-20">
      <Link
        href="/"
        transitionTypes={["nav-back"]}
        className="font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle hover:text-fg"
      >
        ← Home
      </Link>

      <header className="mt-10">
        <h1 className="font-display text-3xl leading-tight tracking-tight text-fg">
          About
        </h1>
      </header>

      <div className="mt-10 max-w-2xl space-y-6 text-lg leading-relaxed text-fg-muted">
        <p>
          I&apos;m Raghuram, a GenAI / full-stack engineer based in Hyderabad, India.
          Day to day I build the infrastructure underneath AI products other
          engineers use: multi-agent orchestration on human-in-the-loop approval
          gates, hybrid retrieval pipelines, and the real-time streaming backbone
          that keeps a live generation UI in sync across pods — inside an
          enterprise platform used daily across five-plus client environments.
        </p>

        <p>
          That work is proprietary, which means the parts I&apos;m proudest of are
          invisible to anyone evaluating me from outside it. This site, and the{" "}
          <Link href="/projects" className="text-accent hover:underline">
            four projects
          </Link>{" "}
          under it, exist to make a version of that work public, measured, and
          checkable by a stranger — not asserted on a résumé.
        </p>

        <p>
          Each project follows the same order: measure the problem myself before
          citing anyone else&apos;s numbers, commit to a falsifiable thesis and
          pass/fail criteria <em>before</em> writing a feature, build only what the
          thesis needs, benchmark it, and publish whatever came out worse than
          expected alongside what worked.{" "}
          <Link href="/projects/onewayglass" className="text-accent hover:underline">
            onewayglass
          </Link>{" "}
          narrowed its own headline claim after every pre-registered test had
          already passed.{" "}
          <Link href="/projects/mcpgantlet" className="text-accent hover:underline">
            mcpgantlet
          </Link>{" "}
          found six specification violations in this site&apos;s own server before
          it found any in someone else&apos;s. I care about that order — measure,
          commit, build, verify, publish the miss — more than I care about any one
          result, and it&apos;s the discipline I bring to a team, not just a side
          project.
        </p>

        <p>
          Outside work: B.Tech in Information Technology, Vel Tech Multi Tech
          Engineering College. The fastest way to reach me is{" "}
          <a href="mailto:raghu.builds@gmail.com" className="text-accent hover:underline">
            email
          </a>
          , or find the day job and the four projects laid out on{" "}
          <a
            href="/static/resume.pdf"
            className="text-accent hover:underline"
          >
            one page
          </a>
          .
        </p>
      </div>
    </main>
    </ViewTransition>
  );
}
