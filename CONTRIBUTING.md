# Working in this repo

## Branch model

```
main                 protected · release-only · always deployable · tagged
  └── develop        integration · every feature branch merges here first
        ├── feat/<slug>      new capability
        ├── fix/<slug>       defect
        ├── perf/<slug>      measured performance work
        ├── docs/<slug>      documentation, pipeline artifacts
        ├── chore/<slug>     tooling, deps, CI
        ├── test/<slug>      test-only additions
        └── refactor/<slug>  no behaviour change
  └── release/vX.Y.Z   cut from develop → merged to main → tagged
  └── hotfix/<slug>    cut from main → merged to BOTH main and develop
```

**Nothing lands directly on `main` or `develop`.** Every change arrives via a branch and a PR, even
solo. The history is a deliverable — a reader evaluating this repo reads the commit graph.

## Rules

1. **One PR = one reviewable idea.** A 40-file PR is invisible; a 6-file PR with a clear message is
   itself portfolio content.
2. **Every PR names the success criterion it advances** (from `docs/02-thesis.md`). A PR advancing no
   criterion is either out of scope → `docs/NON-GOALS.md`, or the thesis needs revisiting. See the PR
   template.
3. **Squash-merge** feature branches (one clean commit on `develop`). **Merge commits** (`--no-ff`) for
   release and hotfix branches so the topology stays legible.
4. **Conventional Commits**, enforced by habit and used to generate `CHANGELOG.md`:
   `feat: · fix: · perf: · docs: · test: · chore: · refactor: · ci: · build:`
   Breaking changes take `!` and a `BREAKING CHANGE:` footer.
5. **CI must be green before merge** — lint, types, both test suites, secret scan, and the citation
   verifier. The citation gate failing is a hard stop, never a warning.
6. **SemVer** with tags `vX.Y.Z` and a GitHub Release carrying the changelog and the screencast.
7. After a release or hotfix touches `main`, **sync back**: `main → develop` immediately, so the
   branches never diverge silently.

## Commit identity

Set per-repo, never relying on the global default:

```bash
git config user.name  "Raghuram P"
git config user.email "raghu2308.dev@gmail.com"
```

The machine's global default attributes to a different GitHub account, which splits the contribution
graph. Verify after the first push:

```bash
gh api "repos/Raghu23-dev/trigsight/commits?per_page=5" \
  --jq '.[] | "\(.commit.author.email) → \(if .author then .author.login else "UNATTRIBUTED" end)"'
```

Every line must read `→ Raghu23-dev`.

## Definition of done

A change is done when: tests pass · types clean · linter clean · citation verifier passes ·
docs updated (including `docs/DECISIONS.md` if a non-obvious choice was made) · CHANGELOG entry ·
deployed to a preview · **verified by actually driving it**, not merely by green CI.
