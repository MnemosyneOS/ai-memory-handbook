# Chapter 16 — Benchmarks: A Reproducible Methodology

A team spent six weeks selecting a memory system. They compared four candidates, built a scoring sheet from each vendor's published benchmark numbers, and chose the one with the highest score. After rollout, recall quality was noticeably worse than the demo. Going back to the published numbers, they found that one candidate's score was produced on a dataset version that had since been revised, another's judge was a lenient matcher rather than an exact one, and a third allowed unlimited multi-hop retrieval while their production path allowed exactly one recall.

None of the three had lied. All three had published a number. The team's error was treating a number as a fact rather than as a claim whose scope had not been stated.

This chapter addresses how to read a benchmark score, and how to build one that others can check. It first establishes the three tiers of benchmark credibility, then lists the five things a reproducible benchmark repository must contain, then states the three red lines that separate a benchmark from an advertisement, and finally turns to a case that is deliberately uncomfortable: our own benchmark's reproducibility gap.

## 16.1 The three tiers of benchmark credibility

### 16.1.1 Publishing only a headline score: you can only believe it

The lowest tier is a single number with no accompanying conditions. The reader can only accept or reject it.

The problem is not that the number is necessarily wrong; it is that when two such numbers disagree, there is no way to locate the source of the disagreement. It could be the dataset version, the judge implementation, the prompt template, the number of retrieval rounds, or whether multi-hop was permitted. Any one of these can produce a gap of a dozen points.

The deeper issue is an inversion of the burden of proof. Publishing only a score places the burden on the reader: to doubt it, the reader must rebuild the whole evaluation, which is more expensive than accepting it. The result is that unverifiable scores carry disproportionate weight in selection.

### 16.1.2 Publishing the methodology: you can judge comparability

The middle tier publishes the score together with the methodology. This means disclosing four things: the dataset name and version; the judge type and judging prompt; the number of retrieval rounds and whether multi-hop is permitted; and whether the run was complete.

With these four, a reader can judge whether the score is structurally comparable to their own scenario, even without being able to recompute the number.

A medical follow-up team used exactly this method to avoid a bad selection. The candidate system's high score came from "unlimited multi-hop retrieval", whereas their production path allowed a single recall. After aligning the conditions and re-estimating, the candidate's advantage shrank to within 2 points — not enough to justify the migration cost.

The value of this tier is that **it turns the incomparable into the comparable**, and the mechanism is making the conditions explicit. Its limitation is equally clear: the methodology is self-reported, and self-report can be selectively omitted. Omission tends to happen on the most disadvantageous item. The cost is that the reader still needs professional judgement to spot the omission.

### 16.1.3 Distributing the harness: you can recompute

The third tier puts the evaluation code, adapters, dataset download scripts, and machine-readable results into a public repository. Anyone can `git clone` and re-run with one command. The score then changes from a "claim" into a "verifiable computation".

The first change recomputability brings is that **disagreements can be localized to a specific link in the chain**. When two people get different scores, they can diff the intermediate artefacts and determine whether the difference comes from the data version or the adapter implementation. The second change is that the benchmark itself becomes subject to review: whether the scorer favours anyone, whether the data leaked, whether the baseline was weakened — all of it is exposed in the code.

The cost is a transfer of effort. Maintaining a recomputable benchmark takes far more work than writing an evaluation report, and once it is public, any inconsistency will be pointed out. Most teams are unwilling to bear that cost, which is precisely why the third tier is rare.

| Tier | What is published | What the reader can do | Main risk |
| --- | --- | --- | --- |
| First | Headline score only | Accept or reject | Cannot localize disagreement; burden of proof inverted |
| Second | Score plus methodology | Judge whether the scenario is comparable | Methodology is self-reported and can be selectively omitted |
| Third | Score plus methodology plus harness | Recompute and diff intermediate artefacts | High maintenance cost; defects fully exposed |

Table 16-1 — The three tiers of benchmark credibility and what each permits

## 16.2 The five things a reproducible benchmark repository must contain

Reproducibility is not an attitude; it is a specific set of files. If any one of the following five is missing, the recomputation chain breaks at some link — and the breaking point is usually exactly where manipulation is easiest.

### 16.2.1 A unified scorer

The scorer is the only code that computes scores, and no per-system scoring logic is permitted. This constraint targets a common practice: giving each system under test a scoring code path "adapted to its output format". On the surface this is format compatibility; in reality the scoring standard has already split. One system's long answer is judged as "contains the answer", another's short answer as "incomplete". The two scores are incomparable and nobody notices.

More insidious than format splitting is **accepting a system's self-reported relevance score**. Most memory systems attach a `score` field to retrieval results. If the scorer ranks directly by that field, the system under test is grading itself. The correct approach is to recompute from ground truth: take the list of ids the system returns, judge hits against the golden labels, and compute hit@k and MRR yourself. This constraint will lower some systems' scores, because it exposes "self-reported score is high but the ranking is wrong".

The cost is that the scorer must understand each dataset's label format. The work is substantial and prone to mismatch when the dataset is extended.

### 16.2.2 A unified adapter interface

The adapter interface exposes only three methods, and it is the sole contact surface between the system under test and the harness.

```python
class Adapter:
    def add(self, session: dict) -> None: ...
    def search(self, query: str, k: int) -> list[str]: ...
    def reset(self) -> None: ...
```

`add` ingests one session, `search` returns a list of memory ids, and `reset` clears state. The force of these three methods is that they deny the system under test any information beyond the question itself, and deny it state that persists across questions. There was once a shortcut: ingest the entire dataset at once and search globally, letting questions hint at each other to raise the hit rate. The combination of `reset` and per-question `add` closes that route.

The cost is that a three-method interface cannot express designs that require query context at write time. Some architectures need an additional adaptation layer to plug in.

### 16.2.3 A naive full-context baseline

There must be a naive baseline: stuff the entire history into the prompt with no retrieval at all. The point of this baseline is not to be a token competitor but to establish a lower bound — if a memory system cannot beat full-context injection, the problem is the system, not the baseline.

This baseline is the single most effective check against self-deception. Many memory systems, measured honestly, do not beat full-context injection on short conversations, because on short conversations retrieval mainly adds a chance of missing something.

### 16.2.4 Machine-readable output

Results must be written as machine-readable JSON in addition to a human-readable table. Two runs can then be diffed directly, and a regression becomes a diff rather than an argument.

The absence of machine-readable output is a strong signal in itself: it means the numbers cannot be recomputed from the published artefacts, and every re-evaluation requires re-running the whole pipeline.

### 16.2.5 Data download scripts with checksums

Raw datasets should not be committed to git. They should be fetched by scripts that verify integrity.

This matters because dataset versions drift. If the repository hard-codes numbers rather than fetching and checksumming the data, a silent upstream revision will invalidate every published score without anyone noticing.

### 16.2.6 Summary of the five

| Item | What it prevents | Consequence if missing |
| --- | --- | --- |
| Unified scorer | Per-system scoring, self-grading | Scores are not comparable |
| Three-method adapter | Cross-question state, extra information | Hit rate inflated by leakage |
| Naive baseline | Weak baselines flattering the system | Cannot tell whether the system beats no retrieval |
| Machine-readable output | Numbers not recomputable | Every re-evaluation means re-running everything |
| Download scripts with checksums | Silent dataset drift | Published scores silently invalidated |

Table 16-2 — The five essentials and what each one prevents

## 16.3 The three red lines

These three lines separate a benchmark from an advertisement.

**First, do not fill in cells you have not measured.** An empty cell is better than a wrong number. The temptation is strong: a table with gaps looks incomplete, and a plausible estimate looks better. But a single estimated cell contaminates the credibility of every measured cell in the same table.

**Second, a stranger must be able to run it with one command.** `git clone` followed by one command must work on a clean machine. If it requires a private credential, a manual download, or undocumented environment setup, it is not a benchmark — it is a demo.

**Third, adapters must be open.** Anyone must be able to add their own system. That is what makes it a benchmark rather than a vendor page. A benchmark that only ever measures its own author's system is an advertisement with extra steps.

## 16.4 We did not get full marks ourselves

This section is the centre of gravity of the chapter, and it concerns our own product.

Mnemosyne OS's repository README publishes four scores: LongMemEval 96.2, LoCoMo 94.8, BEAM 1M 68.5, BEAM 10M 53.9, alongside Mem0's published comparison values of 94.4 / 92.5 / 64.1 / 48.6. These numbers came from real runs, but their recomputability status must be stated separately; it cannot be conflated with the magnitude of the numbers.

Three details need to be laid out one by one.

**First**, the benchmark repository's `results/2026-10-24.md` labels itself a **seed result table**. Its stated purpose is to carry the scores already published in the main repository's README so that the two never drift. In other words, that file exists to prevent divergence, not to provide new run evidence.

**Second**, the only machine-readable run record currently committed to the repository is a **naive baseline run on the Chinese CN-Scenarios dataset**: hit@5 of 0.0 over 6 questions. The value of that record is that it proves the pipeline runs end to end and emits schema-conformant JSON. It does not constitute support for any published score.

**Third**, the harness skeleton is complete: the scorer contains no per-system logic, the adapters implement the three-method interface, the naive baseline is included, output is machine-readable JSON, and the data download scripts with checksums are in place, with `scripts/verify_harness.py` available for self-check. All five essentials are present. What is missing is the step of "re-running the four scores with this machinery and committing the records".

> **The benchmark skeleton is reproducible, but the README scores have not yet been independently recomputed by a complete in-repository run.**

This sentence has three functions.

**For the reader**, it downgrades 96.2 from a fact to a claim pending verification, and prevents treating a tier-two result as if it were tier three. If you are making a selection decision, cite it as a claim awaiting recomputation, not as a verified measurement.

**For our own team**, it turns the gap into a concrete to-do — "commit one complete run record" — rather than the vaguer "improve the algorithm". A gap with a name can be closed.

**For this chapter's argument**, it is a self-referential test. If the maintainers of a benchmark leave a gap between "the skeleton is complete" and "the numbers are recomputable", then any vendor material that gives only conclusions deserves the same scrutiny.

The cost of publishing this state is real: readers will discount our scores, and competitors will cite it as an attack point. That cost should be paid. A benchmark that only talks about reproducibility when it suits it is not a benchmark.

## 16.5 What metadata an honest score should carry

A score without metadata is a claim. A score with metadata is evidence. At minimum:

- **Judge type**: strict or flexible matching, and the judging prompt if an LLM judge is used
- **Completeness**: whether this is a full run or a partial run with carried-over rows
- **Data scope**: dataset version, question count, and whether any questions were excluded
- **Conditions**: retrieval rounds, whether multi-hop was permitted, context budget
- **Environment**: hardware, concurrency, and the commit hash of the evaluated code

The fifth item is the one most often omitted and the one that matters most for reproducing a result.

## 16.6 Five questions to ask any vendor's score

1. Which dataset version, and how many questions?
2. Which judge, and is the judging prompt published?
3. How many retrieval rounds were allowed, and was multi-hop permitted?
4. Is this a complete run, or does it include carried-over rows?
5. Can I clone your harness and recompute it with one command?

If the answer to the fifth is no, then the first four only tell you what conditions the vendor chose to disclose.

## 16.7 Chapter Summary

This chapter establishes three judgments.

**First, the credibility of a benchmark is a three-tier structure.** A score carries no credibility on its own; the process attached to it does. Putting results from all three tiers into one table and ranking them is the most common error in selection, and it systematically favours whoever discloses least.

**Second, reproducibility is not an attitude but five specific files.** A unified scorer, a three-method adapter, a naive baseline, machine-readable output, and download scripts with checksums. If any is missing, the recomputation chain breaks at exactly the point where manipulation is easiest — and the scorer, the adapter, and the baseline are the three most frequently simplified away.

**Third, the boundary between a benchmark and an advertisement is whether a third party can modify and refute it.** Not filling in unmeasured cells, one-command reproducibility, and open adapters are the operational form of that boundary.

The conclusion of 16.4 should be treated as the chapter's model rather than its exception: a team's honesty about its own scores should be no lower than the standard it demands of others. The gap this chapter leaves open — published scores not yet recomputed by a complete in-repository run — is one that can be closed within one or two complete runs. Until it is closed, those scores should be cited as claims pending verification.
