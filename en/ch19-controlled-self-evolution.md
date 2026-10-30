# Chapter 19 — Controlled Self-Evolution: From Storage to Experience

A team building automated testing added an experience library to its agent in early 2026. Over three months it accumulated more than two hundred "effective practices", one of which was: "when a front-end element fails to locate, switch to full-path XPath". That experience worked repeatedly in a React project and was tagged high-confidence. In the fourth month the team onboarded a project rendered with Canvas, and the agent switched to XPath as the experience instructed — but elements in Canvas have no DOM node at all. It tried eleven times in that direction, spent the whole task budget on locating, and finally timed out.

The problem was not the experience itself; that experience was correct in its original setting. The problem was that no applicability conditions were recorded when it was stored, so it degraded from "effective in React projects" to "always do this when locating fails". The experience degenerated from a specific method into a universal dogma, and not a single step in that degeneration was wrong.

This case illustrates the central contradiction of self-evolving systems: distilling experience from trajectories can substantially improve efficiency, but the distillation process itself loses context. What is lost is the most critical thing — the applicability conditions — and those conditions are precisely what determines whether the experience is usable. An experience without preconditions is more dangerous than no experience, because it makes the agent more confident in the wrong direction.

In May 2026, Luo et al., in a survey published in ACL 2026 Findings, formalized the evolution of memory mechanisms into three stages (arXiv:2605.06716, submitted 2026-05-07): **storage (trajectory preservation) → reflection (trajectory refinement) → experience (trajectory abstraction)**. The value of this framework is that it splits "memory" from a single action into three operations of different natures, each with a different failure mode. Storage fails by loss, reflection fails by incorrect merging, and experience fails by over-generalization.

The technical threshold rises across the three stages and the degree of commoditization falls. Storage is already a standard capability — every memory system offers writing and recall. Reflection requires judgement, and most systems do only summarization. Experience requires precondition modelling, which only a few systems provide today.

This chapter follows that three-stage structure. 19.2 to 19.4 explain the mechanism and boundary of each layer, 19.5 uses a concrete case to show why preconditions are a necessary condition for the experience layer, 19.6 sets out the release constraints for controlled self-evolution, and 19.7 discusses the three failure modes.

## 19.1 The three-stage framework

### 19.1.1 The division of labour

**Storage (trajectory preservation)** addresses "keeping what happened". The operations are writing and recall; the criteria are fidelity and retrievability.

**Reflection (trajectory refinement)** addresses "organizing what happened into a more useful form". The operations are summarization, conflict resolution, merging, and consolidation; the criteria are information density and consistency.

**Experience (trajectory abstraction)** addresses "extracting reusable methods from what happened". The operations are experience distillation and precondition validation; the criterion is transfer correctness — effective in the new scenario, and not triggered in scenarios where it does not apply.

The three layers are progressive, not substitutive. The experience layer cannot replace the storage layer, because abstraction loses detail and detail is irreplaceable during troubleshooting; nor can the reflection layer be skipped, because raw unorganized trajectories cannot support abstraction.

### 19.1.2 Each layer fails differently

| Stage | Core operations | Criteria | Main failure mode |
| --- | --- | --- | --- |
| Storage | Write, recall | Fidelity, retrievability | Loss, accumulation of write noise |
| Reflection | Summarize, resolve conflicts, merge, consolidate | Information density, consistency | Incorrect merging, summary drift |
| Experience | Distil experience, validate preconditions | Transfer correctness | Over-generalization, dogmatization |

Table 19-1 — Operations, criteria, and failure modes of the three-stage framework

The way to use this table is: when the system misbehaves, first determine which layer the failure occurred in. If the correct information was never stored, it is a storage problem, and changing summaries or experience will not help; if the information was stored but incorrectly merged, it is a reflection problem, and adding experience only amplifies the error; if an experience was triggered in the wrong scenario, it is an experience-layer problem, and changing retrieval thresholds is useless.

## 19.2 The storage layer: trajectory preservation

The storage layer's capabilities are `retain`, `recall`, and the client-compatible `add_memory`. The design goal of this layer is that "what happened" is neither lost nor unfindable.

Two design decisions at this layer in Mnemosyne deserve explanation. The first is **single-pass ADD-only extraction**: one write, one model call, append only, never modify or delete. The benefit is that a bad extraction only introduces noise and can never destroy a true fact — because with no overwrite operation, there is no path by which "wrong content replaces correct content". The cost is that the store accumulates redundancy over time, which must be brought under control by later deduplication and consolidation.

The second is the **dual time axis**: `observation_date` is separate from write time. The benefit is distinguishing "when the fact held" from "when it was recorded", which is the basis of recency correctness. The cost is that the writer must supply the observation time correctly; when omitted it degrades to write time, and the degradation is silent.

This layer has been commoditized. Every memory system offers writing and recall, and capability differences lie mainly in retrieval quality rather than storage semantics. This means **the storage layer is not a differentiator** — treat it as a necessary condition during selection, not as a basis for choosing.

The cost here is equally clear: ADD-only means the store only grows, so long-running deployments necessarily face capacity and noise problems; the dual time axis requires cooperation from the caller, and the advantage disappears without it.

## 19.3 The reflection layer: trajectory refinement

The reflection layer's operations are summarization, conflict resolution, merging, and consolidation. Its job is to turn a pile of raw memories into something with structure and consistency.

### 19.3.1 Session summarization: seven factors plus verbatim anchors

`session_summarize` produces a session summary structured around seven factors: goal, constraints, decisions, open items, artefacts, failures, and preferences. Open items are stored as independent entries rather than folded into the summary, because an unresolved item that gets buried in a narrative is functionally forgotten.

**Verbatim anchors.** Key conclusions in the summary retain their original wording rather than being fully rewritten into paraphrase. This solves the summary drift problem: when the summary conflicts with the original, the anchor lets a human judge whether the summary is wrong or the memory is wrong.

**Incremental update separated from rebuild.** The summary supports incremental update to save cost, and also supports `rebuild=true` to discard the old summary and rebuild from the original to resist drift. The trade-off is a direct exchange between cost and accuracy.

### 19.3.2 Conflict resolution: six kinds, four actions

`conflict_resolve` classifies conflicts into six kinds — temporal update, preference change, scope difference, precision difference, logical contradiction, and source conflict — and chooses among four actions: ADD, NOOP, UPDATE, KEEP_BOTH.

The default is `dry_run=true`, which produces only a plan without changing data. With `scope=audit` it scans the whole store and reports only genuine conflicts, defined as sharing both entity and predicate. This constraint is what keeps the false-positive rate usable: an earlier version that reported 14 conflicts of which 13 were noise was worse than reporting only 1, because the former trains users to ignore the alert.

The cost is a dependency on the predicate vocabulary and on entity normalization. Better precision means more misses when the vocabulary does not cover an expression.

### 19.3.3 Consolidation: three paths, idempotent

`memory_consolidate` implements three paths: episodic to semantic (the same fact appearing in three or more distinct sessions), episodic to procedural (the same class of task succeeding twice or more, inducing a playbook with preconditions), and failure to anti-pattern (a failed, rolled-back, or reverted attempt becoming a taboo entry).

Idempotence matters here: re-running consolidation on the same batch of sources must not produce duplicates. Without that property, consolidation becomes a source of noise rather than a remedy.

## 19.4 The experience layer: trajectory abstraction

The experience layer's capabilities are `playbook_save` and `playbook_recall`, plus `code_change_record` and `code_archaeology` for code evolution.

### 19.4.1 Preconditions are mandatory

`playbook_save` requires `preconditions` as a mandatory field with three parts: `must` (conditions under which it applies), `must_not` (conditions under which it does not), and `typical_env` (the typical environment).

Making this mandatory is a deliberate friction. It forces the caller to think about applicability at save time, which is exactly the moment when the context is still available. Deferring it to later means the context is gone.

### 19.4.2 Recall validates preconditions

`playbook_recall` does not simply return matching experiences. It checks the current environment against `must` and `must_not`, returns only the entries that pass, and reports `applicable` and `blocked_by`.

The `blocked_by` field is the important one: it tells the caller not just that an experience does not apply, but why. That turns a silent non-trigger into a diagnosable event.

### 19.4.3 Code evolution memory

`code_change_record` records the intent, constraints, impact surface, and rejected approaches of a change. `code_archaeology` retrieves the change chain, the last three intents, whether the change was ever rolled back, and known constraints for a given file or symbol.

The value of this pair is not "what was changed" — git already records that — but "why it was not done the other way". That knowledge is gone within six months otherwise.

## 19.5 Why an experience without preconditions is dangerous

Return to the automated-testing team. The experience "when locating fails, switch to XPath" was recorded without preconditions. Three things then happened in sequence.

First, at recall time the experience matched on the symptom (locating failed) rather than on the condition (DOM-based rendering). Second, because it was tagged high-confidence, it outranked the agent's own fresh analysis. Third, because the agent had no way to know the experience did not apply, it retried in that direction eleven times instead of reconsidering.

The general form of this failure: **an experience is retrieved by similarity of symptom, but applied under a condition that similarity does not capture.** Preconditions are the mechanism that closes the gap, and they can only be captured at save time.

The negative-transfer cost is asymmetric. A missing experience costs some efficiency; a misapplied experience costs the whole task, and it does so while increasing the agent's confidence.

## 19.6 The boundary of controlled self-evolution

Any memory, experience, skill, or patch generated by a model must be treated as a **candidate change**. It enters production only after passing:

1. **Reproducible evaluation** against a fixed dataset with a fixed judge version
2. **Security review** for injected instructions, credentials, and forged facts
3. **Versioning**, so the change can be identified and reverted
4. **Canary release**, so the blast radius of a bad change is bounded
5. **Rollback capability**, tested before the change is deployed

The critical constraint is: **model inference must never be written directly into organizational rules.** An interaction may propose a candidate fact or a candidate model revision; a responsible maintainer validates it before it takes effect.

This constraint explains why the optimization phase must feed back into the build phase rather than directly into production. Without a gate, "self-evolution" degenerates into "unapproved self-modification".

## 19.7 Three failure modes of self-evolution

**Failure mode one: the experience library becomes a dogma library.** As experiences accumulate, the agent relies increasingly on historical practice and explores less. The symptom is that the exploration rate falls while the reuse rate rises, and novel problems take longer to solve.

**Failure mode two: over-abstraction loses the detail that mattered.** A distillation that compresses five successful cases into one rule often drops the one condition that distinguished them. The symptom is that the rule works in four of the five original cases.

**Failure mode three: without evaluation, degradation is invisible.** An experience that used to help starts hurting after the environment changes, and nothing detects it because nothing measures per-experience outcomes. The symptom is a slow decline that no dashboard shows.

All three share a common remedy: measure the outcome of each experience application, and demote experiences whose success rate falls below a threshold. `playbook_save` supports this write-back mode — recording whether an application succeeded or deviated, and returning `should_demote=true` when the success rate falls too low.

## 19.8 Chapter Summary

This chapter establishes three judgments.

**First, the three stages fail differently: loss, incorrect merging, and over-generalization.** Troubleshooting must first locate the layer. Changing summaries when the information was never stored, or adding experience when information was incorrectly merged, both waste the cycle.

**Second, the storage layer has been commoditized and is not a basis for selection.** The differentiation lies in the judgment quality of the reflection layer and the precondition modelling of the experience layer. Making `preconditions` mandatory is the dividing line between an "experience" and a "suggestion".

**Third, any model-generated memory, skill, or patch is a candidate change** that must pass reproducible evaluation, security review, versioning, canary release, and rollback before entering production. Model inference must never be written directly into organizational rules.

This chapter concludes the Optimization part. The Practice part turns to comparison and selection: given everything established so far, how should a team actually choose among the systems available in 2026, and what does it cost to move from one to another?
