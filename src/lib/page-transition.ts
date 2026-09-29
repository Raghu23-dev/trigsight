/**
 * Shared directional view-transition config, applied identically to every
 * page.tsx that participates in navigation. One object rather than a copy per
 * page, so the CSS classes named here (`nav-forward` / `nav-back`, defined in
 * globals.css) can never drift out of sync with what a page actually passes.
 *
 * `default: "none"` on every key is what keeps unrelated transitions — the
 * Skills/Projects scroll-reveal, a Suspense boundary resolving — from
 * triggering a directional slide that was never meant for them.
 */
export const PAGE_TRANSITION = {
  enter: { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" },
  exit: { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" },
  default: "none",
} as const;
