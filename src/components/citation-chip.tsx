import type { ResolvedCitation } from "../lib/citation-token";

/**
 * A citation chip.
 *
 * The href is a `#:~:text=` fragment built at build time from a verified passage,
 * so clicking it scrolls the source page to the exact supporting sentence and the
 * browser highlights it via ::target-text.
 *
 * The quoted text is shown inline rather than hidden behind a footnote marker.
 * Roughly 1% of readers click a citation, so its value is as a visible trust
 * signal — hiding the quote forfeits that for the 99%.
 */
export function CitationChip({ citation }: { citation: ResolvedCitation }) {
  return (
    <a
      href={citation.href}
      className="group mt-3 block rounded border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent-dim hover:bg-surface-raised focus-visible:border-accent"
    >
      <span className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="mt-px size-1.5 shrink-0 rounded-full bg-pass"
          title="Passage verified at build time"
        />
        <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
          {citation.docId.replace(/^work\//, "")}
        </span>
      </span>
      <q className="mt-1.5 block text-sm leading-relaxed text-fg-muted before:content-[''] after:content-[''] group-hover:text-fg">
        {citation.quote}
      </q>
    </a>
  );
}
