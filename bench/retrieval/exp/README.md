# bench/retrieval/exp/

Throwaway probes kept for the record, not for CI. They supported one decision —
`results/2026-08-23-stemming.md` — and each carries a trap worth remembering.

## They cannot measure "baseline" once the fix has shipped

Both probes build their own BM25 index, but the **vector leg** and `chunk.searchText` come from
`src/`. After stemming shipped, a probe row labelled "baseline" was still partly measuring the
shipped behaviour, and printed `1.000` for a configuration that scores `0.976` when the real code is
reverted.

So a probe row is only trustworthy on the corpus and code it was written against. **The honest test
is to revert `src/lib/retrieval/bm25.ts` and run `bench/retrieval/eval.ts`**, which is how the numbers
in the writeup were produced:

```bash
# without stemming
perl -0pi -e 's/\.map\(stem\);/;/' src/lib/retrieval/bm25.ts
npx tsx bench/retrieval/eval.ts --k 5
npx tsx bench/retrieval/exp/holdout.ts
git checkout src/lib/retrieval/bm25.ts
```

## And the corpus moved underneath them

The held-out figures were first taken before `content/projects/trigsight.mdx` existed. Adding one
document changed the index and the IDF of every term in it, so a re-run gave different numbers for
reasons unrelated to stemming. Any comparison across those two points is invalid.

That is not a flaw in the probes so much as a fact about small corpora: at 71 chunks, one document is
a material fraction of the index.
