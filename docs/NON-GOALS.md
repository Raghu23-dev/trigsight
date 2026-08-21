# Non-Goals

Things deliberately not built, and why. Scope cut here is a **signal, not an omission** — it shows the
thesis was defended rather than diluted (pipeline step 4).

Every entry was considered and rejected on a reason, not forgotten.

| Not doing | Why | Would reconsider if |
|---|---|---|
| **Multiple switchable "experiences"** (terminal mode, game mode, voice mode) | None advances a success criterion. The comparable site ships a mode switcher whose targets 404 — a facade is worse than an absence. One site, done properly. | A mode earned its place by proving something the main site cannot. |
| **Maximalist WebGL** (multiple scenes, heavy postprocessing) | Directly conflicts with criterion 4 (≤150 KB). Award-circuit evidence favours curated over maximalist: "a cinematic site that stutters isn't cinematic, it's just slow." One purposeful scene. | The payload budget is met with room to spare. |
| **A blog CMS / headless CMS** | MDX files in-repo are version-controlled, diffable, and free. A CMS adds a network dependency and a cost for a single-author site. | Someone other than me needs to publish. |
| **Comments, guestbook, reactions** | Invites moderation and spam work; proves nothing about engineering. | Never, realistically. |
| **`llms.txt` as an SEO play** | Measured inert: 97% of such files received zero requests, and Google names and rejects both it and "GEO". Shipping `.md` variants because they are genuinely useful to agents is fine; claiming SEO benefit is not. | Search engines publish evidence they consume it. |
| **Continuous build-in-public dev-log** | No evidence it drives engineering readership, and a weekly obligation competes directly with shipping. One post per project plus one per finding instead. | The writing habit outpaces the build. |
| **Custom domain** | Cosmetic. Affects no criterion. `trigsight.vercel.app` is free and can have a domain attached later without rebuilding. | Free-tier constraints change, or the URL becomes a real credibility issue. |
| **Auth / user accounts** | The site has no per-user state worth protecting. Auth belongs in `onewayglass`, where multi-tenancy *is* the thesis. | The site gains a feature that genuinely needs identity. |
| **Streaming markdown edge cases beyond the tolerant parser** | Partial-markdown parsing is solved by existing libraries; hand-rolling one is scope with no criterion behind it. | The library fails on real output. |
| **Cross-document View Transitions** | 86% support and no Firefox. Same-document transitions are 90.2% across all three engines and zero-config in Next 16.3 — enough. | Firefox ships it. |
| **WebGPU renderer** | Firefox WebGPU is Windows-only; WebGL2 covers everyone and is not deprecated. Shaders are written in TSL so they compile to both, making this a swap rather than a rewrite later. | WebGPU reaches broad cross-browser support. |
| **Server-side rendering of the 3D scene** | Meaningless — WebGL needs a GPU context. Poster-first LCP handles the paint. | Never. |
