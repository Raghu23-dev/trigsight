# Real embeddings — measured 2026-08-21

`text-embedding-3-small`, 1536 dimensions, cosine, served by Upstash Vector.
34 chunks indexed. 30 hand-written golden queries, k=5.

## Results

| Config | Backend | recall@5 | MRR |
|---|---|---|---|
| Lexical only | BM25 | 0.933 | 0.729 |
| Hybrid | BM25 + local trigram | 0.967 | 0.831 |
| **Hybrid** | **BM25 + real embeddings** | **0.967** | **0.889** |

Three consecutive runs of the embedding config returned identical figures, so the MRR
gain is stable rather than a lucky sample.

## What this settles, and what it does not

**Recall did not improve. MRR did**, by +0.058 over the stand-in and +0.160 over
lexical-only. That distinction matters: real embeddings do not find *more* relevant
chunks at this corpus size, they rank the ones they find *higher*. Since only the top six
chunks reach the model, ranking is the metric that changes answers.

**Kill condition 3 is not triggered.** It was pre-registered as "if hybrid cannot clear
0.85 recall@5, report that a small corpus does not need a vector leg." Hybrid clears it,
and the embedding row improves ranking, so the vector leg earns its place — narrowly, and
on MRR rather than recall.

**Honest caveat on the margin.** At 34 chunks and 30 queries, one query is worth 0.033 of
recall. A recall difference of 0.034 between lexical and hybrid is therefore *one query*.
That is not a robust margin, and this table should not be read as proving hybrid superior
in general — only that it is not worse, and ranks better, on this corpus.

## A prediction of mine that was wrong

`bench/retrieval/results/2026-08-21.md` recorded a falsifiable prediction: the one missed
query — *"what happens when two compactions run at once"* — would be closed by a real
embedding model, because the prose says "concurrent attempts" rather than "at once".

**It was not.** The query still misses with real embeddings, and the reason is more
interesting than the prediction.

Probing the vector leg directly, the correct chunk (`work/context-compaction#3`, which
contains "a transaction-scoped advisory lock serialises concurrent attempts, and the loser
declines rather than queueing") does not appear in the top 5 at all. Instead the leg
returns chunks about compaction *generally* and about unrelated concurrency.

The cause is **chunking, not embedding**. That chunk is 1,340 characters, and the answer
sits 871 characters into it, under a heading of "What I built". Its dominant topics are
structural digests and regex-versus-parser reasoning; the advisory-lock sentence is one
clause near the end. A single 1536-dimension vector for that chunk is an average of five
different ideas, and the one being asked about contributes roughly a fifth of it.

No embedding model fixes that. The fix is smaller chunks, or sentence-window retrieval
where a matched sentence pulls in its neighbours rather than the whole section.

**Recorded rather than fixed**, deliberately: the current numbers meet every criterion, and
changing the chunker now would invalidate the comparison this table exists to make. It is
the first entry on the improvement list, with a specific hypothesis attached — split on
paragraph boundaries within a section and re-measure.

## The lesson worth keeping

The instinct on a retrieval miss is to reach for a better model. The measurement said the
model was not the problem. Had I not probed the vector leg in isolation, I would have
"fixed" this by upgrading embeddings and the query would still have missed — with a more
expensive index and a wrong conclusion recorded as a fact.

## Reproduce

```bash
vercel env pull .env.local
tsx bench/retrieval/index-upstash.ts   # reset + index 34 chunks
tsx bench/retrieval/eval.ts --k 5      # all three configs
```
