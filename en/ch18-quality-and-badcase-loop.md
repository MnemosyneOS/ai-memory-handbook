# Chapter 18 — Memory Quality Measurement and the Badcase Loop

A team building SaaS customer support shipped its memory feature in May 2026. Three months later the customer success manager noticed a pattern: the longer a tenant had been using the system, the worse the assistant's answers became. New tenants rated 4.6 in their first week; by week twelve the rating had fallen to 3.9. The team's first reaction was "the model regressed", but the model version had not changed. The second reaction was "retrieval got slower" — latency had indeed risen 40% — but pushing latency back down did not restore satisfaction.

The real cause was found only in the third week: this tenant's memory store had accumulated 2,300 memories, of which more than 400 were expired product policies. At retrieval time those old entries were semantically close to the new ones, were recalled together with them, and consumed half the injection budget. The assistant was not remembering the wrong thing; it was **being drowned by its own history**.

This problem cannot be detected at selection time at all. It appears only after the system has run long enough, and it comes with no error message. The self-built evaluation set from the previous chapter cannot catch it either, because the evaluation set is static while this problem is cumulative.

What makes memory quality peculiar is that it is not a single metric. High recall accuracy may coexist with runaway injection cost; high abstention accuracy may coexist with falling recall coverage; high deletion thoroughness may coexist with collateral damage from cascade invalidation. Six dimensions pull against each other, and optimizing any single one to its extreme breaks another. That is why "memory system quality" cannot be compressed into one score.

The boundary of existing practice lies here as well. Most systems expose only recall accuracy and latency, because those two are easiest to measure. But the ones that actually determine long-term experience — recency correctness, source traceability, deletion thoroughness — often have no measurement interface. Not because nobody wants to measure them, but because there is no collection point.

This chapter is organized as observe → measure → attribute → fix. 18.1 unpacks the six dimensions and their conflicts. 18.2 explains what `recall_health` can observe, in particular how it answers "is recall degrading as the session gets longer". 18.3 addresses the mistake measurement systems most often make: substituting 0 for "no data". 18.4 gives the four-step Badcase loop, 18.5 is a directly usable attribution table, and 18.6 discusses the Pareto boundary between quality and cost.

## 18.1 Memory quality is not a single metric

### 18.1.1 The six dimensions and their definitions

**Recall accuracy.** Given a query, how many of the returned memories are relevant, and how many of the relevant memories were returned. This is the most frequently reported metric and the easiest to optimize one-sidedly — raising the number of returned items raises recall, at the cost of precision and injection cost.

**Abstention accuracy.** When the store contains no relevant information, does the system explicitly say it does not know, rather than assembling an answer from something merely similar. This dimension is almost never reported, yet it is the direct embodiment of the judgment that "remembering wrongly is more dangerous than not remembering".

**Recency correctness.** When the same fact exists in multiple versions, is the currently valid version the one returned. This requires the system to distinguish "write time" from "fact effective time" and to perform temporal judgement at retrieval.

**Source traceability.** Whether a returned memory can be traced back to the specific turns of the original conversation. It determines whether an error can be attributed — a memory that cannot be traced can only be deleted wholesale when something goes wrong, with no way to tell whether extraction or judgement failed.

**Deletion thoroughness.** After the user requests deletion, whether the content has disappeared from all derived structures, including summaries, graph nodes, caches, and compressed capsules. When the cascade is incomplete, deletion is nominal.

**Injection cost.** The number of tokens consumed to make the model use memory, plus the resulting latency and expense. It conflicts directly with the previous five: raising recall coverage, adding context, and including more historical versions all push cost up.

### 18.1.2 The conflicts between dimensions are structural

The six dimensions are not parallel; they pull against each other. The most direct way to raise recall accuracy is to widen the returned set, but that pushes injection cost up and precision down; raising recency correctness requires adding temporal judgement at retrieval, which adds latency; raising source traceability requires storing turn ranges on every memory, which adds storage and write overhead.

A concrete set of conflicts illustrates the structure.

| Dimension A | Dimension B | Conflict mechanism | Common misjudgement |
| --- | --- | --- | --- |
| Recall accuracy | Injection cost | Widening the returned set fills the budget | Treating cost as an engineering optimization |
| Abstention accuracy | Recall coverage | Raising the abstention threshold misses memories that do exist | Treating a high abstention rate as conservatism |
| Recency correctness | Latency | Temporal judgement needs extra retrieval and comparison | Treating latency as a post-hoc optimization |
| Source traceability | Write throughput | Storing turn ranges adds write overhead | Treating traceability as a nice-to-have |
| Deletion thoroughness | Recall continuity | Cascade delete may damage shared summaries | Treating deletion as merely a flag |

Table 18-1 — The structural conflicts among the six quality dimensions

The way to use this table is: before optimizing any one dimension, confirm which one it squeezes and whether that one is already near its limit. For a system with 92% recall accuracy whose injection budget is already full, further recall optimization yields close to zero, because the newly recalled content cannot be injected anyway.

The cost must be stated: observing six dimensions simultaneously requires six collection points, which is substantial engineering. Most teams should watch only two in the early stage — recall accuracy and abstention accuracy — and add the rest when a specific problem appears. The cost of comprehensive observation is a dashboard nobody looks at.

## 18.2 What `recall_health` can observe

`recall_health` is a read-only tool: it does not change retrieval parameters, does not trigger recomputation, and only reports recall behaviour that has already happened. This design constraint matters: a "health check" that changes system state cannot be used in production, because the act of observing contaminates the object observed.

What it reports falls into four groups.

**Call volume and result distribution.** Number of calls, empty-result rate, average number of returned items, average top-1 score. The empty-result rate is the most easily overlooked signal: a sudden rise usually means the write path has broken (extractor failed, embedding unavailable) rather than that retrieval has worsened.

**Volume removed by the relevance floor.** The count of items excluded by the relevance floor. Combined with the empty-result rate, this number distinguishes two failure modes: a high removal count with a normal return count means the store contains a large amount of marginally related content; a high removal count with a falling return count means the semantic space of queries and of the store have drifted apart.

**Channel hit distribution.** Which of the five signal paths produced the hits. If keyword retrieval's share keeps rising while semantic retrieval's share keeps falling, the embedding service may be degraded — the system still returns results, so nothing looks broken, but recall quality has quietly changed.

**Latency percentiles.** p50, p95, and p99, plus the vector-backend success rate. The success rate matters more than the latency: a backend that silently fails and falls back to lexical retrieval will show acceptable latency while recall degrades.

### 18.2.1 How it answers "is recall degrading over session length"

This is the question the SaaS support team needed answered and could not.

The approach is to bucket the metric by session length: recall accuracy for sessions of 1–10 turns, 11–30 turns, 31–60 turns, and beyond. If accuracy falls monotonically across buckets while the query distribution stays stable, the problem is cumulative dilution — expired or marginal content crowding out the relevant entries.

A second cut is by store size: accuracy against number of memories in the store. If accuracy falls as the store grows, the cause is candidate dilution rather than query drift.

Neither cut requires new instrumentation; both are re-aggregations of data `recall_health` already records. That is the point of collecting at the right granularity.

### 18.2.2 What it deliberately does not measure

`recall_health` does not measure answer quality. It measures recall behaviour. A system can have perfect recall health and still give bad answers, because the model may ignore the injected memory or the prompt may bury it.

Conflating recall health with answer quality leads teams to optimize the wrong layer. The diagnostic rule is: if recall health is normal and answers are bad, the problem is in the prompt or the model; if recall health is abnormal, fix that first.

## 18.3 The most common mistake in measurement systems: 0 instead of "no data"

### 18.3.1 Why the distinction matters

A metric that returns `0` when there is no data is not merely imprecise; it is actively misleading in three ways.

**It pollutes aggregates.** Averaging a bucket that contains "no data" zeros with buckets that contain real zeros drags the average down and makes the system look worse than it is.

**It hides collection failures.** If a collection point stops reporting and the pipeline silently substitutes 0, the dashboard shows a quality collapse that never happened — or, worse, a quality collapse that did happen but is attributed to the wrong cause.

**It destroys trend judgement.** A series that mixes "0 because nothing happened" with "0 because nothing was recorded" cannot be used to detect regressions.

### 18.3.2 The honest design

Mnemosyne's `memory_metrics` returns, for insufficient data, an object with `value: null` and `status: "insufficient_data"` plus a `need` field describing what is missing. The design is deliberately awkward: it makes the dashboard look incomplete.

That awkwardness is the point. A dashboard that looks complete while three of its panels are fabricated zeros is worse than one that visibly says "not enough data".

The cost is real: reports look worse, stakeholders ask why a panel is empty, and there is pressure to "just show 0". Resisting that pressure is a discipline, not a technical decision.

### 18.3.3 A practical rule

For every metric, record three things: the value, the sample size, and the collection status. Then apply a simple rule — never plot a metric whose sample size is below a stated threshold; show a gap instead.

This rule is more useful than any particular metric definition, because it applies to every metric added later.

## 18.4 The four-step Badcase loop

### 18.4.1 Step one: discovery

Badcases come from two sources: user feedback and trace inspection. User feedback is the louder source and the less representative one — users report the cases that annoy them, not the cases that are most frequent. Trace inspection is quieter and more representative, but requires knowing what to look for.

The practical combination is: use feedback to identify a category, then use traces to measure how often that category occurs.

### 18.4.2 Step two: attribution

Attribution is the step that determines whether the loop is worth running at all. A badcase can originate at three distinct points:

- **Extraction error**: the memory was written incorrectly, or the wrong thing was written
- **Retrieval error**: the right memory exists but was not returned, or the wrong one was ranked first
- **Judgement error**: the right memory was returned but the model used it incorrectly

These three have completely different fixes, and applying the wrong fix wastes the entire cycle. The diagnostic question is simple and decisive: does the correct memory exist in the store, and was it returned?

### 18.4.3 Step three: fix

Each attribution maps to a specific class of fix.

Extraction errors are fixed by changing the extractor, the prompt, or the write-time validation. Retrieval errors are fixed by changing the signal weights, the relevance floor, or the candidate pool. Judgement errors are fixed by changing the prompt assembly, the ordering, or the model.

The temptation is to fix everything at once. That makes the next measurement uninterpretable, because you no longer know which change moved the number.

### 18.4.4 Step four: regression

After a fix, re-run the same badcase set with the same judge version. Without this step the loop is not closed — the team believes it fixed something but has no evidence.

The regression set should be versioned alongside the code, so that a future change can be checked against every badcase ever fixed. This is the memory system's equivalent of a unit test suite, and it should be treated with the same seriousness.

## 18.5 An attribution table you can use directly

| Symptom | Most likely cause | How to verify | Fix action |
| --- | --- | --- | --- |
| Answers ignore a fact the user definitely stated | Extraction error, or write admission rejected it | Query the store for the fact; check the write log | Adjust extractor or write validation |
| Old fact returned when a newer one exists | Recency correctness failure | Compare `observation_date` with the returned entry | Enable temporal judgement at retrieval |
| Right memory exists but never appears in results | Retrieval error, candidate dilution | Search the store directly; compare with recall output | Raise candidate pool or adjust signal weights |
| Answers get worse as the tenant ages | Cumulative dilution by expired entries | Bucket recall accuracy by store size | Add tiering and expiry |
| System answers confidently when it should not | No abstention testing | Test with out-of-store queries | Add abstention and lower the relevance floor |
| Deleted content still influences answers | Incomplete cascade | Run cascade `dry_run` and inspect derivations | Record dependencies at write time |
| Latency rises without recall improving | Fusion or reranker overhead | Measure per-signal latency | Trim signals or cache high-frequency queries |

Table 18-2 — Badcase attribution: symptom, cause, verification, fix

The table's value is that each row ends in a verification step rather than a guess. Attribution without verification is just a more confident form of guessing.

## 18.6 The Pareto boundary between quality and cost

### 18.6.1 The three levers

There are three ways to spend money on memory quality, and they are not interchangeable.

**A stronger embedder** raises the quality of the semantic channel. Its cost scales with write volume and with query volume.

**A reranker** raises the quality of the final ordering. Its cost scales with query volume only, and it is the most expensive per query.

**More candidate retrieval** raises the chance that the right memory is in the pool. Its cost scales with the pool size at every query.

### 18.6.2 How to choose

The choice depends on where the loss is.

If the right memory is frequently absent from the candidate pool, raising the pool size is the only lever that helps; a stronger embedder or reranker cannot reorder something that was never retrieved.

If the right memory is in the pool but ranked below irrelevant entries, a reranker helps directly.

If recall is broadly mediocre across categories, the embedder is the place to start, because it improves the pool itself rather than the ordering of a bad pool.

### 18.6.3 Why there is no universal answer

There is no public cross-system cost-quality curve for memory systems. That means the Pareto frontier must be measured locally: fix a query set with ground truth, measure recall and cost under three configurations, and pick the one that sits on your own frontier.

The measurement takes a few days. It is the only way to answer a question that otherwise gets answered by vendor recommendation, which is structurally biased.

## 18.7 Chapter Summary

This chapter establishes three judgments.

**First, memory quality is six dimensions in structural conflict, not one metric.** Recall accuracy, abstention accuracy, recency correctness, source traceability, deletion thoroughness, injection cost. Optimizing any one to its extreme squeezes another, so the first step is to identify the bottleneck rather than to improve the easiest thing to measure.

**Second, the honesty of a measurement system shows in what it returns when data is insufficient.** Substituting 0 for "no data" simultaneously pollutes aggregates, hides collection failures, and destroys trend judgement. The cost is an uglier dashboard, and that cost must be paid.

**Third, the value of the Badcase loop lies in attribution, not in the fix.** Landing on one of "extraction error / retrieval error / judgement error" is the only precondition for a fix that can be reverted and verified. Fixing everything at once makes the next measurement uninterpretable.

This chapter leaves an open question: the loop described here assumes the team knows which dimension matters for its scenario. That assumption fails when the scenario is new, or when the team has never measured anything. Chapter 19 addresses what happens when the system starts to learn from its own history — and why that learning must be controlled.
