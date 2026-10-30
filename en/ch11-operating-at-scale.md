# Chapter 11 — Operating at Scale: Cost, Latency, and Capacity

A team integrated the memory service into an internal knowledge assistant, and users grew from 40 to 400.
In the first month the bill did not change, because model calls were covered by a fixed few batch jobs.
In the third month the bill rose sixfold, and the team's first reaction was "the model got more expensive"; the actual cause was that memories per user rose from 200 to 1,400, so the candidate set for every recall grew, and the reranker's call volume grew with it.
In the sixth month, `recall` p95 latency went from 300 milliseconds to 2.4 seconds, and users began bypassing the assistant to search directly.

Nothing in this curve broke suddenly.
Every component was growing along its own slope, only the slopes differ: storage grows monotonically with writes, cost grows with the candidate set, latency grows with the candidate set and the number of reranking passes.
The work of operating at scale is to lay these four slopes out and compute them, rather than waiting for them to cross.

The cost structure of a memory system is very different from a conventional web service.
A conventional service's cost grows mainly with request count, and adding machines dilutes it.
A memory system's cost has four independent curves, one of which (storage) rises monotonically forever, and another (model calls for writes) grows with content length rather than request count.
Cramming them into one "QPS × unit cost" model guarantees a wrong number.

This chapter proceeds as cost structure → single-file boundary → tiering and degradation → latency budget → capacity planning → operational metrics.
Everywhere a concrete number appears, it will be marked as an assumption or a measurement, because this is the chapter most prone to "fake numbers that look professional".

## 11.1 Four Cost Structures

A memory system's expenditure splits into four items, each growing with a different variable.

| Cost item | Grows with | Trigger | Levers |
| --- | --- | --- | --- |
| Model calls for writes | Write count × content length | One single-pass extraction per `add` | Batch merging, rule extractor as fallback |
| Embedding generation | Write count × chunk count | One vectorization per memory | Built-in embedder, lower dimensions, deferred vectorization |
| Retrieval fusion computation | Candidate set size × signal count | Every `recall` | Smaller `top_k`, disable reranking, budget truncation |
| Storage | Cumulative write volume, only increasing | Continuous | Tiered compression, export and archive, deletion |

Table 11-1 — Driver variables and levers for the four costs

**Model calls for writes** is the only cost that gets more expensive as content gets longer.
Single-pass ADD-only extraction means one call per write, unlike a two-stage pipeline that may call two or three times, but the cost is still proportional to input length: an 8,000-token conversation costs an order of magnitude more than a 300-token one.
The levers are batch merging (compressing multiple turns of the same session into one call) and the rule extractor as fallback (`add()` still works with no model).

**Embedding generation** grows with write count and is weakly correlated with content length.
It is easily overlooked, because in many designs embedding calls are cheaper than LLM calls, but at the scale of "20 writes per session" the number of embedding calls is 20 times the number of LLM calls.
The built-in 128-dim deterministic embedder reduces this cost to zero, at the price of recall quality (as noted in Chapter 8).

**Retrieval fusion computation** grows with candidate set size, and this is the most underestimated item.
Five signals (semantic, BM25, entity graph, time, tags) each run over the candidate set, and fusion plus calibration run again; the candidate set is not `top_k` but a multiple of it — the recall stage must take more candidates than the final result, or fusion is meaningless.
With a reranker configured, one more model call is added, and its input length equals the candidate set length.

**Storage** is the only monotonically increasing item, and it is irreversible.
Tiered compression can lower the byte count per memory but cannot bring it to zero; the risk here is not the bill but single-file size (elaborated in the next section).

For a horizontal order-of-magnitude reference: Mem0 officially states about 6,900 tokens per retrieval, versus 25,000+ for a full-context approach.
What this comparison shows is not who is more economical but that "stuffing memory into context" and "recalling from memory" differ by more than three times in token volume — and tokens are the main constituent of retrieval cost.

## 11.2 The Boundary at Tens of Gigabytes per File

How large SQLite can grow is the wrong question.
The right question is: at what write concurrency and aggregation pattern does a single file start to become the bottleneck.

There are two criteria, and neither is data volume.

**The first criterion is write concurrency.**
As Chapter 9 noted, WAL lets reads and writes not block each other, but only one write transaction is permitted at a time, so a single file means serialized writes.
If a scope must bear dozens of writes per second, the queue will pile up and `flush` wait times will grow linearly.
This has nothing to do with whether the file is 1 GB or 50 GB — a 1 GB file clogs just the same under write concurrency.

**The second criterion is the frequency of cross-scope aggregation.**
Under physical isolation, one cross-tenant statistic is N file opens.
If such queries are routine (a platform-wide report every hour), file count itself is the cost.
Again unrelated to single-file size — a hundred thousand 10 MB files are harder to aggregate than a hundred 10 GB files.

Conversely, if a deployment satisfies two conditions — writes are naturally dispersed by scope, and aggregate queries are rare — then a single file growing to tens of gigabytes will not be a problem.
SQLite's B-tree depth grows logarithmically with data volume, and indexed query complexity is nearly constant; what actually degrades is full-table-scan operations (for example an unindexed `LIKE`), and memory-system recall goes through indexes.

When to change the backend:

- Write concurrency exceeds what a single write transaction can bear, and cannot be resolved by partitioning by scope
- Multiple replicas must write simultaneously (SQLite has no cross-machine replication)
- Cross-scope aggregation becomes a core feature rather than an auxiliary report
- Row-level permissions are needed for logical isolation (in which case the physical-isolation file model actually gets in the way)

The cost must be stated clearly: the cost of changing the backend is not migrating data but losing the property "backup is copying files".
Once you move to a service-type database, backup, restore, and isolation acceptance all need rebuilt processes, so the decision point for changing the backend should be pushed as late as possible.
The way to push it is partitioning by scope (already built in) and export-and-archive (the cold tier).

## 11.3 Hot/Cold Tiering and the Economics of Degradation

The purpose of tiering is not to save disk but to align "recall cost" with "memory value".

The semantics of the three tiers:

- **Hot tier**: recently accessed, high-confidence, repeatedly recalled entries. Fully indexed, all signals participate in fusion.
- **Warm tier**: access frequency has declined but value remains. Index retained, possibly down-weighted during fusion.
- **Cold tier**: long unaccessed. Compressed into pointer plus structured facts plus content atoms, restored by `expand` when needed.

The key design is "degrade rather than delete": low-value memories are demoted and compressed, not silently deleted.
The cost is that storage does not actually go down — compression reduces byte count, not entry count.
The benefit is reversibility: a demoted memory can still be restored byte-for-byte by `expand`, so users never encounter "the system clearly knows this but says it does not".

The Free tier's 30-day cold-layer window needs precise understanding: it **imposes a time window on the cold tier only**; cold-tier memories older than 30 days no longer appear in recall results, while hot and warm tiers are retained no matter how old.

The reason for this design is worth writing down: if a time window were imposed on hot/warm as well, the penalty would fall precisely on active users — they accumulate the most memories and would lose the most.
Cutting only the cold tier means cutting only "things already not in use", with no impact on active users' experience.
Conversely, the Free tier is insufficient for needs like "that conversation three months ago", because that memory has most likely already sunk to the cold tier.

The economics of degradation has another easily overlooked contrast: soft ranking weighting is not deletion.
As of October 2026, Mem0's memory decay uses a scaling factor of 0.3×–1.5× (recently accessed near 1.5×, idle for months near the 0.3× floor).
Three qualifiers must all hold for accuracy: Platform-only, opt-in and off by default, and a soft ranking bias rather than a filter; the official documentation states explicitly that it neither deletes nor hides.
So it and "tiered degradation" are two different mechanisms: the former adjusts ranking weight, the latter changes storage form and visibility window.

## 11.4 Latency Budget

The time for one `recall` consists of five segments, whose cost magnitudes differ widely.

| Stage | Cost source | Magnitude | Optimisation |
| --- | --- | --- | --- |
| Query vectorization | One embedding model call | Dominated by network round trip | Cache query vectors, local embedder |
| BM25 keyword | Local FTS5 query | Milliseconds, no network | None needed |
| Entity graph traversal | Local SQLite multi-hop | Related to hop count | Limit hop count |
| Time and tags | Index lookup | Milliseconds | None needed |
| Fusion and calibration | Pure computation | Linear in candidate set size | Shrink the candidate set |
| Reranking (optional) | One model call | Related to candidate set length | Disable, or rerank only the top-N |

Table 11-2 — Cost and optimisation of each stage of a recall

The three local signals (BM25, graph, time and tags) together are usually in the millisecond range; they are not the bottleneck.
The real cost is in two places: the one network round trip for query vectorization, and the one model call for the reranker.
The latter's input length equals the candidate set length, so it is affected by both "how large the candidate set is" and "how long the candidates are".
This explains a common phenomenon: raising `top_k` from 5 to 20 increases latency more than expected — expanding the candidate set does not merely return 15 more items, it makes the reranker read the body text of 15 more.

Progressive disclosure is the most effective structural optimisation here.
`recall_catalog` returns only titles, one-line summaries, and expansion cost, with no body text; the caller judges which few are relevant, then expands one or two with `expand_memory`.
Injection cost drops from "O(all candidates)" to "O(catalogue) + O(a few bodies)", an order-of-magnitude drop from 25,000+ tokens to the thousand-token range.
The cost is one extra decision for the caller: it must be able to judge "which one is worth expanding".
If the caller is a loop incapable of judgement, progressive disclosure only adds a round trip with no benefit.

## 11.5 Capacity Planning

The table below gives an estimation method, not a conclusion.
Every number is an assumption, and the last column states its sensitivity to the result.

| Input assumption | Value | Derivation | Sensitivity |
| --- | --- | --- | --- |
| Daily active users | 1,000 | — | High: directly scales writes and recalls linearly |
| Memories per user | 500 | 500,000 total | Medium: affects storage and candidate set |
| Daily writes per user | 20 | 20,000 added per day | High: main driver of write cost |
| Daily recalls per user | 30 | 30,000 recalls per day | High: main driver of retrieval cost |
| Body text per memory | 200 characters | About 0.6 KB | Low: little difference after compression |
| Per memory including index and graph | About 3 KB | About 1.5 GB total | Medium: declines with tiered compression |

Table 11-3 — Input assumptions and sensitivity for capacity estimation

Three conclusions can be drawn from this table.

**Storage is not the bottleneck.** 500,000 memories is about 1.5 GB, well within the comfort zone of a single SQLite file; the real pressure comes from "entry count never stops growing", not from per-entry size.
At 20,000 added per day, one year is 7.3 million entries, about 22 GB — still within what a single file can carry, but already approaching the range where partitioning by scope or archiving is needed.

**Write cost grows with entry count, not user count.** 20,000 writes per day means 20,000 extraction calls (unless the rule extractor is used) plus 20,000 embedding calls.
This is the most sensitive part of the table: if per-user daily writes rise from 20 to 60, write cost triples directly, while user count is unchanged.

**Recall cost grows linearly with the candidate set, not with recall count.** 30,000 recalls per day with a candidate set of 100 each means 3 million candidates participating in fusion.
If total memories rise from 500,000 to 5 million, the candidate set need not grow (depending on the index) when `top_k` is unchanged, but the reranker's input length changes with body length rather than entry count.
So the sensitivity here is "medium", yet it is the most easily misestimated.

## 11.6 Operational Metrics

Three classes of metrics each answer one question: is the system healthy, how is it performing, and is recall quality degrading.

**`doctor` answers "is it healthy".**
It checks integrity, counts, disk, and backend status.
The key output is the result of `verify_integrity()`: `{valid, total, first_broken_at}`.
A value in `first_broken_at` means the audit chain broke at some record and must be located immediately — this is usually not a software bug but someone bypassing the interface to modify the database directly.

**`stats` answers "how is it performing".**
It gives cumulative statistics on writes, recalls, token savings, and other dimensions.
Its main use is reconciliation: the difference in write counts and model call counts before and after an incident verifies the "no double billing" item in the recovery drill checklist of Chapter 9.

**`recall_health` answers "is recall quality degrading".**
It is a read-only metric set with fairly fine-grained coverage: call count, empty-result rate, count removed by the relevance floor, average returned count, average top1 score, confidence-band distribution, channel hit distribution, latency percentiles, vector backend success and failure, capsule cache hit rate, graph edge scale, and details of the last 20 rounds.

Three of them most deserve alerting:

- **Empty-result rate** rising means either the index is broken or queries have drifted from the content distribution
- **Relevance-floor removal count** rising means a large number of candidates are judged irrelevant — usually because the embedding model changed or the content language changed
- **Vector backend success and failure** showing failures means lexical fallback is already in play, in which case recall quality has dropped but no error is raised

The last item is the most dangerous failure form.
The five signals carry lexical fallback: when embeddings are unavailable BM25 still works, recall does not fail, it only degrades in quality.
Without monitoring this item, the system will keep returning poor recalls in a state that "looks normal".

The cost is that all three classes of metrics need somewhere to run and someone to look at them.
In the self-hosted form that is your own responsibility; in the SaaS form the platform provides the data, but "what counts as abnormal" still has to be defined by you.
Metrics do not produce value in themselves; they produce value when used to make decisions.

## 11.7 Chapter Summary

This chapter establishes three judgements.

First, the cost of a memory system is four independent curves, not one.
Model calls for writes grow with content length, embeddings with entry count, retrieval fusion with the candidate set, and storage only increases.
Compressing them into one "QPS × unit price" model guarantees a deviating number.
This judgement fails when "all built-in components are used and the data volume is very small" — then all four costs approach zero and the model does not apply.

Second, the single-file boundary is set by write concurrency and the frequency of cross-scope aggregation, not by data volume.
A 1 GB file clogs under write concurrency; a 50 GB file does not under dispersed writes.
The decision point for changing the backend should be pushed as late as possible, because what is replaced is not only storage but the property "backup is copying files".

Third, the goal of tiering and degradation is to align recall cost with memory value, not to save disk.
Degrading rather than deleting preserves reversibility, and the Free tier imposes a 30-day window on the cold tier only, avoiding punishing active users.
The cost is that storage does not truly go down: compression reduces bytes, not entries.

The question this chapter does not answer: when total memory grows to the point where "recall itself becomes the main cost", which layer should be optimised.
Candidate set, reranking, or injection format — the benefit ratio among the three depends on the specific corpus, and no general answer can be given.
This requires controlled experiments on real data, and the experimental method is itself a separate problem.

---
