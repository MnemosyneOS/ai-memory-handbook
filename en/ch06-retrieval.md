# Chapter 6 — Retrieval: Multi-Signal Fusion and Budget Control

A company in food-service supply chain gave its procurement Agent memory, so that it could remember "which suppliers must not be touched". Two weeks after launch an incident occurred: the Agent placed an order with a supplier whose pesticide residue exceeded the limit, and that flag had been written into the store three months earlier. Checking the logs, retrieval had indeed returned it — ranked fifth, while the context only had room for the top three. Another case was subtler: the store held "the user is allergic to peanuts" and "the user ate peanuts yesterday with no reaction"; both were returned, and the model chose the conclusion of the latter. Semantic similarity was high for both, because they talk about the same object; but they are not saying the same thing at all.

The two cases point at two different problems: **the ranking is correct but it does not fit**, and **the ranking itself is wrong**. The former is a budget problem, the latter a signal problem, and both manifest as "the Agent answered wrong", yet the remedies are entirely different.

## 6.1 Why Pure Vectors Fail on Long-Horizon Memory

### 6.1.1 Semantic Similarity Is Not Decision Equivalence

An embedding model answers "what are these two texts talking about"; it does not answer "what do these two texts mean for this decision right now". In single-turn Q&A the two largely coincide; in long-horizon memory they frequently diverge. "I am allergic to peanuts" and "I ate peanuts yesterday and was fine" are very close in embedding space: shared subject, shared object, shared topic — any cosine-dominant ranking will place them adjacent. But the decision implications are opposite: the former is a long-term constraint that must be honoured, the latter an observation that might overturn that constraint, or might merely mean "that day it happened not to trigger". The basis for distinguishing them is not in the semantics but in three structured dimensions: **type, time, source**. Allergy is a long-term constraint, belonging to the identity or preference class; "ate it yesterday and was fine" is an event with an explicit event time. Vectors cannot see these differences. So the problem is not "the vector is not strong enough" but **it covers only one dimension** — adding dimensions does not solve it, adding signals does.

### 6.1.2 Missing Channels

Another failure has nothing to do with semantic quality; it is purely a missing channel. The built-in embedder is a random projection of term-frequency vectors: deterministic, offline, free, but without cross-word generalization — it does not know that "laptop" and "ThinkPad" are the same class, so after "I have a ThinkPad" is written, querying "what is my notebook" returns empty. That empty result must be distinguishable from "there is no such memory in the store": the former calls for configuring an embedder, the latter for a write; the two return the same value and require opposite handling. So when primary retrieval comes back empty, a narrow lexical fallback is triggered — it requires at least one shared word, and labels the hit as lexical rather than semantic, guaranteeing only that "if there is a shared word, it will be found".

## 6.2 Five Signals

### 6.2.1 What Each of the Five Channels Answers

| Channel | Answers | Strength | Weakness |
| --- | --- | --- | --- |
| Semantic | What this passage is about | Cross-word generalization, paraphrase hits | Cannot tell similarity from relevance |
| BM25 | Literal word overlap | Terminology, identifiers, model numbers | Fails on synonymous paraphrase |
| Entity graph | Which entities are involved | Multi-hop association, pronoun normalization | Depends on extraction quality |
| Time | When it happened, how recent | Temporal questions, new-versus-old tradeoffs | Noise when there is no temporal intent |
| Tags | Which topic family it belongs to | Structured backstop, cross-word-form | Requires a maintained synonym table |

Table 6-1 — Division of labour among the five retrieval signals

Fusion is not a weighted average, because the scales differ: raw BM25 scores are unbounded, cosine lies between zero and one, time decay is exponential; adding them directly lets one channel crush the rest on scale alone. So each channel is normalized first and then summed by weight, and the weights adjust with configuration — with a real embedder configured the semantic weight is highest; with only the built-in embedder, graph and keyword weights are raised relatively. There are also three structural bonuses that add points directly and do not participate in normalization: literal n-gram overlap, same-form after synonym normalization, and tag-family hits; they indicate "almost certainly relevant" rather than "relevant to some degree".

### 6.2.2 The Relevance Floor Must Be Calibrated

Fused scores have a counter-intuitive property: **the top score is always one** (an artifact of normalization), so absolute scores are meaningless — the top1 of an irrelevant query can exceed the top1 of a relevant one, and filtering relevance by a fused-score threshold is bound to fail. The floor must therefore be set on **un-normalized raw signals**: satisfying any one of — a structural tag hit, synonym equivalence, n-gram reaching the floor, raw cosine reaching the floor, content-word intersection; those satisfying none are marked low-relevance and removed after ranking. The threshold is calibrated: scanning a corpus with same-topic distractors, 0.45 admits 5 irrelevant items, 0.50 admits 2, 0.55 admits 0 while retaining every relevant item, and 0.60 begins to drop true answers; the final value is 0.55.

Caller-side code looks like this; `explain=True` attaches to each result the signals it hit, and `threshold` performs second-stage filtering at this layer.

```python
from mnemosyne import Memory

m = Memory()
hits = m.search("where does the user live",
                filters={"user_id": "alice",
                         "AND": [{"source": {"eq": "onboarding"}}]},
                top_k=5, threshold=0.1, rerank=False, explain=True)
for h in hits["results"]:
    print(h["score"], h["reason"], h["memory"])
```

`reason` is the field most worth reading in this design: it lays out "why this one was selected" as "semantic + keyword + recency", letting a suspicious result be traced to a specific channel instead of being vaguely attributed to "the model being bad".

The known boundary of the threshold must be stated: **it is sensitive to corpus distribution**. If the whole store revolves around one topic, background similarity is uniformly high, and an absolute threshold will let irrelevant items through as well; so the metrics additionally expose "median raw cosine of candidates" and "top1 raw cosine", used to detect uniformly high-scoring stores and recalibrate. Returning an empty result is a deliberate choice: for an Agent, "not found" is safer than "here are five irrelevant memories"; the cost is that the caller must handle empty results.

## 6.3 Progressive Disclosure

Recall failure has a third form: **retrieval was right, but the injection method burned the budget**. Stuffing the full text of the top-10 into context amounts to letting ten passages compete for attention when only one of them is relevant. Progressive disclosure splits it into two stages: the first returns only a catalogue, containing titles, one-line summaries, and expansion cost, with no body text; the caller picks one or two to expand, and receives the body, the unified envelope, graph neighbours, and the evidence chain.

```python
from mnemosyne import Memory
m = Memory()

cat = m.recall_catalog("last quarter's pricing decision", k=10)
# contains title / summary / expand_cost, no body text
detail = m.expand_memory(cat["results"][0]["memory_id"])
print(detail["content"], detail["neighbors"])
```

Cost drops from O(everything) to O(catalogue + a few), on the premise that **the catalogue itself is discriminative enough** — if a title and one-line summary cannot distinguish two memories, the caller can only expand everything, and the saved budget is handed straight back. The costs: one extra round trip; if the catalogue stage picks the wrong entry, no amount of accuracy downstream helps; catalogue cost grows linearly with candidate count, so raising `k` from 10 to 50 stops being cheap. The criterion is how determinate the question is: when the question is specific, direct recall is cheaper; when it is vague, catalogue plus expansion is cheaper.

## 6.4 Budget Awareness

### 6.4.1 The Budget Must Actually Participate in Selection

Early implementations had fake budgets: when the next item did not fit, a `continue` skipped it, so budgets of 120, 60, and 30 produced identical results. Truly participating in selection requires three levels of degradation: if it fits, give the body; if not, compress it into a capsule (pointer plus structured facts plus content atoms); if even the minimal capsule does not fit, put it into a citation index, returned as a pointer and not counted against the body budget. Thus "does not exceed budget" and "no facts lost" hold simultaneously.

```python
from mnemosyne import MemoryBrain

brain = MemoryBrain("./memories", enable_embeddings=True)
brain.ensure_init()

results, cost = brain.recall("that machine's specs", k=5, budget_tokens=100)
print(cost["budget_used"], cost["dropped_count"], cost["truncated"])
```

The four fields in the returned `cost` must be read together: budget limit, actual usage, dropped count, whether truncated. With only a limit and no usage, you cannot tell whether "that is all the store had" or "it was cut"; without a truncation flag, you cannot tell whether the result was silently shrunk.

### 6.4.2 Drop by Layer, Not by Mid-Sentence Truncation

The profile card's `max_tokens` is a **hard limit**; when over budget it drops by layer, in the order situation → pending → preference. The order is not arbitrary: situation has the shortest shelf life, pending items come next, preferences and constraints are the most stable and the last that should be dropped — the cost of dropping "the user is allergic to peanuts" is far higher than the cost of dropping "was reworking the reimbursement process last week".

The key point is **never truncating mid-sentence**. Half a sentence is worse than nothing, for three reasons. First, truncation changes semantic polarity: "The user is allergic to peanuts, but last time…" cut at the comma leaves a remainder that is still a complete assertion, and it may happen to be false. Second, the model cannot recognize that it has been truncated — it sees a grammatically complete sentence and uses it as complete information. Third, truncation destroys verifiability: the returned text is no longer byte-identical to the record in the store, and every hash-based check fails. So the correct action when the budget is insufficient is "inject no layer at all", not "inject a few characters less" — the same principle as the capsule degradation in 5.4: better to change the representation than to cut it in half.

## 6.5 The One-Stop Injection Path

When stringing recall, fusion, and budget together, the easiest mistake is "every step correct, inconsistent in aggregate" — recall uses one set of weights, reranking another scale, budget counts tokens by a third convention. The point of `memory_inject` is to fix these five steps into a single pipeline: query construction → four-way recall → RRF fusion → reranking → in-budget injection. RRF fuses by rank rather than weighting by score, because the channels have different units and a weighted merge inevitably crushes one side; the cost is losing the "how much stronger" information — first and second differ by one rank even when the raw score differs twofold. Four quota ledgers split the budget:

| Quota | Share | Holds | Cut first on overrun |
| --- | --- | --- | --- |
| Resident profile | 30% | Stable identity, preferences, and constraints | Not cut |
| Task-relevant | 35% | Memories relevant to this query | By marginal value |
| Experience and taboos | 20% | Reusable methods, negative memories | Low applicability |
| Pending items | 15% | To be confirmed, to be followed up | Keep only the most recent |

Table 6-2 — The four quotas of the injection pipeline

The point of separate accounts is to prevent one class of content from crowding out the entire budget. Without quotas, the recall results of one long session will squeeze out the entire "pending items" section, which is precisely what most needs raising in the next conversation. The cost is that some budget is always unspent — when one class is short, its quota does not automatically transfer to another. This waste is deliberate: dynamic reallocation would make every injection structurally different, and structural stability is itself part of predictability.

## 6.6 Failure Modes and Tuning Criteria

### 6.6.1 Threshold and Reranker

There are two directions of getting the threshold wrong, with different symptoms and different handling. Set too high, recall is insufficient: it is in the store yet the call returns empty or only one or two items; look first at the floor-removal count — close to the total candidate count means the threshold is too tight. Set too low, noise drowns the signal: every call returns a full quota with half of it irrelevant; look at the gap between top1 and the median — a small gap means the whole candidate pool sits in the same similarity band. The reranker solves a different problem: **the relevant items are all in the candidate set, but the top k are misordered**; the criterion is "recall adequate, precision inadequate"; when the candidate set contains no correct answer, the reranker can do nothing.

| Symptom | Check first | Action |
| --- | --- | --- |
| Returns empty but the store has it | Floor-removal count, embedder | Lower the threshold or configure an embedder |
| Full quota with half irrelevant | top1 versus median gap | Raise the threshold, add synonyms |
| Candidates exist but do not rank | Weights and ranks | Add a reranker |
| Results right but do not fit | Budget usage | Switch to catalogue plus expansion |

Table 6-3 — Diagnosing and handling retrieval failure modes

The fourth row is the most commonly misdiagnosed: it looks like a ranking problem ("the important one is not up front"), but it is a budget problem. The test is simple — raise `top_k` and see whether the result set contains the target entry: if it does, it is budget; if not, it is ranking.

### 6.6.2 When Not to Add a Reranker

The cost of a reranker is explicit: one extra model call, one extra stretch of latency, and its score replaces rather than fuses with the original score. Replacement is necessary — averaging two scores on different scales yields a number that represents nothing — but it also means that if the reranking judgement is wrong there is no fallback. Three situations call for not adding it: fewer than five candidates, where the gain is below the latency; exact lookup (finding an identifier, a model number), where BM25 is already sufficient; highly homogeneous corpora, where the reranker cannot distinguish differences yet still charges the full cost. There is also a frequently overlooked failure mode: behaviour when the reranker is unavailable — if its exception fails the entire retrieval, an optional accuracy improvement has become an availability risk. The correct approach is to keep the original ordering on failure.

## 6.7 Chapter Summary

This chapter establishes three judgements.

**First, pure vectors fail on long-horizon memory not because precision is insufficient but because dimensionality is insufficient.** Semantic similarity and decision equivalence coincide in short texts and diverge in long-term memory, because the discriminating basis lives in structured fields — type, time, source — that vectors cannot see. The misordering of "allergic" and "ate it yesterday and was fine" cannot be fixed by a better embedding model, only by multi-signal fusion. The condition for this to hold is that those fields are actually written and maintained (Chapter 4); when fields are missing, five signals degrade to one and a half.

**Second, the budget must participate in selection, and the degradation mode determines whether failure is observable.** Skipping what does not fit makes the budget parameter a dead letter; truncating what does not fit makes the model use half a sentence as a complete fact. The correct order is three-level degradation — body, capsule, citation index — and the cost ledger must be returned. The condition for this judgement is that the caller reads the ledger; an integrator that does not read it sees only a result set that is "sometimes bigger, sometimes smaller". It fails when the budget is smaller than the minimal capsule — then the only honest action is to return the citation index and state clearly that it does not fit.

**Third, diagnosing retrieval quality must first separate "ranking wrong" from "budget wrong".** Both symptoms read as "the Agent did not use the memory it should have used", but one requires changing signals and thresholds, the other changing the injection form. The cost of misdiagnosis is treating a budget problem as a ranking problem, so that adding weights, adding rerankers, and adding thresholds all have no effect. There is exactly one discriminator: raise `top_k` and see whether the target entry appears.

One unsolved problem is left to Chapter 7: every capability discussed in this chapter must ultimately be exposed to the Agent through some interface, and the shape of the interface itself changes how it is used — an interface with eleven tool names and one with more than fifty tools will make callers write completely different code. Once the capability surface is wide enough, "how to connect" stops being a wiring question and becomes a design question.

---
