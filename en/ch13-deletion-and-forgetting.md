# Chapter 13 — The Four Semantics of Deletion and Forgetting

The previous chapter left a contradiction unresolved: a hash chain proves that a record has not been tampered with, yet it cannot prove that the fact the record described no longer exists. What it offers is precisely the opposite — a permanent tombstone.

In practice this contradiction shows up in very concrete forms. In April 2026 a consumer finance company received a request from a user exercising the right to erasure, asking that memories relating to their "income level" be cleared. Operations executed the deletion, the interface returned success, and retrieval confirmed the record was no longer findable. Three months later a compliance spot check found: the user's session summary still contained the sentence "monthly income approximately 20,000", the recommendation policy generated from that memory was still using the old parameters, and the retrieval cache still held the hit list from the last recall. The system had deleted the first layer; the other three were untouched.

The problem is not a bug in the implementation. It is that the word "delete" itself was never defined precisely. Inside a memory system it means at least four different things: marking a record as invalid, replacing the body with a placeholder, invalidating the derived conclusions that depend on it, and physically erasing it from storage. The cost, reversibility, and applicable scenario of these four operations are completely different, yet they are routinely promised under the single label of a "delete" button.

This chapter first unpacks why deletion is polysemous, then presents the four semantics side by side with their respective implementation requirements, then explains why a preview mechanism is a necessity rather than an option, then addresses the trade-off between masking and deletion, and finally confronts the industry-wide hard problem head-on — the verifiability of deletion, and why this book does not claim it has been solved.

## 13.1 Why deletion is a polysemous word

### 13.1.1 The four downstreams of one memory

Once a memory has been written, it leaves traces in four places.

The **source record** itself, stored in the main table, containing body, metadata, confidence, and time axis.

**Derived conclusions**, higher-level judgments inferred from this memory. For example, "monthly income approximately 20,000" may lead to "belongs to the upper-middle income segment", and the latter may already exist in the store as an independent entry.

The **retrieval cache**, the result set of the previous recall. The cache exists to avoid recomputation, and it holds references to or snapshots of memories.

**Dependent summaries**, aggregate artefacts such as session summaries and topic summaries. They compress several memories into a single narrative, and that narrative may contain this memory's content.

Delete only the source record, and the other three downstreams continue to influence system behaviour in the form of "shadows of facts that no longer exist". This is exactly the situation of the finance company at the start of this chapter: the source record was deleted, but the summary still cited it and the policy still used the old parameters.

### 13.1.2 The three motivations for deletion

Different motivations require different numbers of layers.

**The user says "don't keep this".** The user is usually not asking for physical erasure but for "stop letting it affect me". Masking or mark-deletion suffices here; physical deletion would instead break the continuity of the context.

**The user exercises a statutory right to erasure.** This requires physical deletion, and it requires evidence — not a verbal promise that "we deleted it", but a processing record that can be handed to a regulator.

**The system cleans up after itself.** Demoting low-value memories, archiving expired entries, merging duplicates. These operations do not need to destroy evidence; they need to be reversible and traceable.

Three motivations map to three strengths. Handling them with a single mechanism necessarily fails on one side: performing physical deletion for "don't keep this" breaks conversational continuity; performing mark-deletion for a statutory erasure right gets discovered during an audit.

### 13.1.3 Deletion versus forgetting

These two words are often used interchangeably, but they point at different things.

**Deletion** is a data operation; the result is that a record no longer exists or is no longer readable.

**Forgetting** is a description of effect; the result is that the system is no longer influenced by that information.

A system can delete a record and still "remember" — because the derived conclusion is still there, the cache is still there, the summary is still there. Conversely, a system can retain a record and still have "forgotten" — because it demoted the record to the cold tier, lowered its recall weight, and marked it superseded. The latter is equivalent to forgetting from the user's point of view, and it is cheaper and reversible.

So the right question is: do I want deletion or forgetting? Most product requirements want forgetting; most compliance requirements want deletion; and engineering implementations routinely collapse both into the same interface.

## 13.2 The four semantics and their implementation requirements

### 13.2.1 Definitions and comparison

| Operation | Effect | Reversible | Storage change | Applicable scenario |
| --- | --- | --- | --- | --- |
| Mark-delete | Record retained, status set to deleted, excluded from retrieval by default | Yes (status can be restored) | None | Routine forgetting, recovering from accidental deletion |
| Mask | Body replaced with a placeholder, skeleton and metadata retained | Yes (unmask) | Body replaced | User says "don't keep this" but context length must be preserved |
| Cascade soft-delete | Source soft-deleted + derived conclusions invalidated + cache cleared + dependent summaries marked stale | Partially (derivations must be rebuilt) | Multi-table status changes | Deleting a memory that has dependencies |
| Physical delete | Record and index erased from storage | No | Space actually released | Thorough deletion required by compliance |

Table 13-1 — The four semantics of deletion

The fourth column of this table is easy to overlook, but it determines cost. The first two layers do not touch storage, the third touches several tables, and only the fourth actually releases space. A system that can only do the fourth layer over-destroys when handling "don't keep this" requests; a system that can only do the first layer fails to meet the bar in compliance scenarios.

### 13.2.2 Implementation notes for mark-delete

The core of mark-delete is **exclusion by default rather than inclusion by default**. The retrieval path must exclude deleted records when nothing explicit is requested; otherwise "deleted but still searchable" becomes a recurring defect.

The requirement sounds simple and is in fact easy to break. Retrieval has five signal paths, and every one of them needs the exclusion condition; miss any one and you get the bizarre phenomenon where vector retrieval finds nothing but keyword retrieval finds it. This is, beyond physical isolation, the place where logical filtering most needs testing.

### 13.2.3 Implementation notes for masking

Masking replaces the body with a placeholder while retaining the record skeleton: ID, timestamps, type, source, and pointer relationships all stay unchanged.

The immediate benefit of this design is that it **does not break context length or prefix**. In inference architectures that rely on KV-Cache reuse, a changed prefix invalidates the entire cache. Masking means that a "don't keep this" operation does not trigger a full recomputation.

There are two costs. First, the skeleton and metadata remain in storage, which in a compliance context is not deletion — the metadata itself may constitute personal information. Second, masked records still occupy a slot during retrieval; if the retrieval logic does not exclude placeholders, you get "recalled an empty memory".

Unmasking requires that the original text was retained at the time. This is a switch that must be decided at design time: retaining the original makes unmasking possible but enlarges the exposure surface; not retaining makes masking effectively irreversible. Most implementations choose to retain, because the demand for unmasking turns out to be more frequent than expected.

### 13.2.4 Implementation notes for cascade delete

Cascade delete is the most complex layer, and its precondition is that **derivation relationships exist**.

Derivation relationships mean: which conclusions were inferred from this memory, which summaries cited it, which cache entries correspond to it. If this layer of relationships is not established at write time, deletion can only infer them by scanning, and the accuracy cannot be guaranteed — you will delete things you should not, and miss things you should.

So the first engineering requirement for cascade delete is not the deletion logic but **recording dependencies at write time**. This requirement is routinely deferred to "we'll add it later", and the result is that cascade delete never becomes real.

The second requirement is staged execution. The four steps (soft-delete the source, invalidate derivations, clear the cache, mark summaries stale) should not be completed in a single transaction, because rebuilding summaries can take a long time. The sensible approach is to mark first, rebuild asynchronously, and keep the affected summaries in an unavailable state until the rebuild completes.

### 13.2.5 Implementation notes for physical deletion

Physical deletion must cover every copy: the main table, indexes, caches, and snapshots within the retention policy's scope.

One boundary must be stated clearly: **physical deletion usually cannot cover copies that have already been exported**. Where a deletion-proof export exists as audit evidence, it conflicts inherently with the right to erasure. The resolution is not technical but policy-based: state explicitly which copies fall within the deletion scope, which are isolated as legally required retention, and record the fact of isolation in the audit chain.

The cost is that such policy needs legal input; engineering cannot decide it unilaterally.

## 13.3 Why a preview mechanism is a necessity

### 13.3.1 Blast radius

A deleted user preference may already have influenced the recommendations in three conversations. In e-commerce it may have changed the home-page ranking; in medical follow-up it may have changed the content of the next reminder; in finance it may have changed a risk score.

These effects persist after deletion, because they have already been written into derived conclusions, summaries, and even downstream systems.

So the real risk of a delete operation is not "deleted the wrong thing" but "deleted the right thing without knowing the impact". The purpose of a preview mechanism is to expose the impact before execution.

### 13.3.2 What a preview should contain

A usable preview contains at least four items.

**The number and list of affected derived entries.** Not "3 entries" but which three, and what they say.

**Affected summaries.** The parts of session and topic summaries that cite this memory.

**Affected cache entries.** Which queries' caches will be invalidated.

**Degree of irreversibility.** Which steps in this operation can be rolled back and which cannot.

A preview that gives only a count and no list has no practical value, because the decision-maker cannot judge whether "3 entries" are trivial or core assets.

### 13.3.3 Preview and approval working together

The value of a preview lies in supporting a decision, so it must appear before approval, not after execution as a report.

A workable flow is: request deletion → generate preview → human confirms the impact → execute → output processing record → archive. The manual confirmation step becomes a bottleneck in high-frequency scenarios, so it needs grading: low-risk deletions (no derivation dependencies) execute automatically; high-risk deletions (with derivation dependencies or crossing scopes) require confirmation.

### 13.3.4 Why validate in staging

Preview output depends on data shape. Development data is usually clean and dependency-light, so the preview says "no impact"; production data has historical residue, cross-scope references, and unexpected dependencies, so the preview says something entirely different.

Cascade delete must therefore be validated in a staging environment at production data scale. This discipline is not process fastidiousness: the preview is itself a feature that needs testing, and its accuracy can only be checked against real data.

## 13.4 The trade-off between masking and deletion

### 13.4.1 Where product and compliance disagree

Product teams prefer masking because it preserves conversational continuity and the user does not feel that the system suddenly lost its memory. Compliance teams prefer deletion because "the skeleton is retained" invites the follow-up question "what is in the skeleton".

There is no universal answer to this disagreement, but it can be structured: handle "what the user sees" and "what exists in storage" separately.

At the user-visible level, a masked memory no longer appears in any answer, which is equivalent to forgetting. At the storage level, the skeleton remains, and the compliance documentation must state this explicitly and explain why it is retained (for example, preserving pointer relationships to keep the audit chain intact).

If the regulator does not accept any form of retention, physical deletion is required, and the cost is a broken audit chain — a genuine trade-off, not something that can be had both ways.

### 13.4.2 A decision rule

Route by the source of the request:

**The user says "don't keep this"**: mask by default. Rationale: reversible, does not break continuity, low cost.

**The user exercises a statutory right to erasure**: physical delete plus a processing record. Rationale: compliance outranks continuity.

**Internal system cleanup**: mark-delete or demote. Rationale: traceability matters more than thoroughness.

**Security incident handling** (for example, discovering a poisoned memory): cascade delete plus forced rebuild of derivations. Rationale: contamination may already have spread into derived conclusions.

These four routing rules cover most scenarios. The remaining edge cases need case-by-case judgment — but having a framework for that judgment is better than starting from scratch every time.

## 13.5 The hard problem of deletion verifiability

### 13.5.1 Why this is an industry-wide problem

The core demand of the right to erasure is "be forgotten", and proving "be forgotten" requires answering a negative proposition: that a piece of information no longer exists anywhere in the system.

Proving a negative proposition is computationally very hard. You need to enumerate every possible storage location — main tables, indexes, caches, logs, backups, exported copies, copies in downstream systems — and demonstrate absence in each. Any omission invalidates the proof.

More awkwardly, the proof itself leaves a trace. If a deletion record is kept in order to prove "this was deleted", that record itself contains the fact that some information once existed, which may constitute new personal information.

### 13.5.2 What current mechanisms can actually deliver

A hash chain can prove "the record has not been tampered with" and can locate exactly which record was altered. It cannot prove "the record no longer exists".

Cascade delete can handle four layers and can output a processing record. It cannot prove "backups and exported copies have also been cleared".

Isolation can guarantee that data does not cross under the default path. It cannot prove that it does not cross even when misconfigured.

So the strongest commitment available today is: **within a clearly defined scope, following clearly defined steps, a reviewable processing was completed and a record of it was retained**. This is not a proof of "thoroughly erased"; it is evidence that "the agreed process was followed". Conflating the two is the most common over-commitment in compliance communication.

### 13.5.3 A possible direction

A cross-system exchangeable deletion audit format is a worthwhile direction: instead of trying to prove "does not exist", it records "in which locations, by whom, at what time, what processing was performed", and lets a third party verify that those processing steps covered every location it knows about.

This reframing turns a negative proposition into a checkable list comparison, which is far more tractable. As of October 2026 no standard has emerged; each vendor defines its own format.

## 13.6 Engineering discipline for deletion

Four rules, in order of importance.

**First, derivation relationships must be established at write time.** This is the only precondition for cascade delete to be real; retrofitting costs more than rebuilding the whole store.

**Second, the preview must come before execution and must give a list rather than a count.** A count-only preview cannot support a decision.

**Third, validate cascade delete in staging at production data scale.** The preview is itself a feature that needs testing.

**Fourth, put preview output into change management.** A high-risk deletion should have approval, a record, and a rollback plan, just like a release.

## 13.7 Chapter Summary

This chapter establishes four judgments.

**First, "delete" in a memory system is four semantics, not a single operation.** Mark-delete, mask, cascade soft-delete, and physical delete correspond to four motivations, and handling them with a single mechanism necessarily fails on one side: physical deletion for "don't keep this" breaks continuity, and mark-deletion for a statutory erasure right gets discovered during audit.

**Second, deletion and forgetting are two different things.** Deletion is a data operation; forgetting is a description of effect. A system can delete a record and still be influenced by it (derived conclusions, cache, and summaries remain), and it can retain a record while no longer being influenced (demoted, down-weighted, marked invalid). Product requirements mostly want forgetting; compliance requirements mostly want deletion; conflating them leads either to over-destruction or to deletion that does not hold up.

**Third, the precondition for cascade delete is that derivation relationships exist, not that the deletion logic is well written.** That layer of relationships must be established at write time; accuracy inferred by scanning afterwards cannot be guaranteed. The preview must give a list rather than a count, and must appear before execution.

**Fourth, the verifiability of deletion remains an unsolved problem, and this book does not claim otherwise.** The strongest commitment available today is "within a clearly defined scope, following clearly defined steps, a reviewable processing was completed and a record retained", not "thoroughly erased". Stating that distinction clearly is more valuable than claiming a solution.

These four judgments share a common premise: the delete operation itself is trustworthy. But if content that should never have been recorded was mixed into the write path — credentials, injected instructions, forged facts — then deletion is merely cleaning up a problem that should not have occurred. Chapter 14 turns to the gate that sits before the write.
