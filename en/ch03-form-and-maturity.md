# Chapter 3 — Form and Maturity: Maturity Levels L1–L4

The same statement, "we have AI memory," may refer to three entirely different things: stitching a user profile into the prompt, letting an Agent maintain its own memory blocks, and sharing a governed semantic layer across multiple systems. The engineering investment differs by an order of magnitude, and the consequence of failure differs by an order of magnitude, yet in requirements documents they are often written as the same line.

The purpose of grading is not to label systems but to find a defensible scale for **investment**. How much budget a team should spend building memory depends on what level of responsibility it wants memory to carry, not on what peers are doing. Once the grading is clear, questions like "do we need a hash chain" and "do we need cascade delete" change from "whether" to "at which level."

This chapter first gives the definitions and criteria of L1–L4, then describes each level's typical architecture and failure modes, then discusses how autonomy, as an adjustable parameter, works together with the grading, and finally gives the path and cost of evolving from a lower level to a higher one.

## 3.1 Definitions of the Four Maturity Levels

### 3.1.1 The Two Axes of Grading

Maturity cannot be measured on a single axis. The common practice is to rank by "autonomy," but high autonomy does not equal high maturity — a fully autonomous memory system may have no auditing capability at all.

This book uses two axes: **the responsibility memory carries** and **the degree of verifiability**.

The responsibility axis determines "what happens if it is wrong": whether being wrong merely degrades experience or leads to a compliance problem. The verifiability axis determines "whether being wrong can be discovered": whether it can only be found through user complaints or can be periodically detected by script.

The two axes cross into four quadrants, corresponding to L1–L4.

| Level | Responsibility memory carries | Degree of verifiability | Typical form |
| --- | --- | --- | --- |
| L1 Assisted injection | Improves experience | Relies on manual observation | Profile stitching, few-shot examples |
| L2 Controlled persistence | Supports cross-session continuity | Has logs, single entries traceable | Explicit write + retrieval interface |
| L3 Governed memory | Supports auditing and compliance | Periodically script-verifiable | Audit chain + cascade delete + scope isolation |
| L4 Semantic infrastructure | Supports facts shared across systems | Recomputable across systems | Semantic layer + conflict arbitration + provenance |

Table 3-1 — The four maturity levels of memory systems

The key to this table is not the ranking but the gap between the last row and the first: the engineering investment gap between L1 and L4 is typically on the order of ten person-months. Holding an L1 scenario to L4 standards is a waste of resources; using an L1 implementation to carry L3 responsibility is an incident in preparation.

### 3.1.2 L1: Assisted Injection

L1 memory is not "storage" but "part of the context." The typical implementation stitches user preferences, conversation summaries, or a few examples into the prompt, regenerating them on every call, with no pursuit of cross-session consistency.

Criterion: if the memory is wrong, the consequence is that this turn's answer fits less well; if the memory is gone, the feature still works.

The common misconception at this level is treating a "user profile" as a "memory system." A user profile is an editable set of fields whose correctness is guaranteed by its maintainer; a memory system's correctness is guaranteed by extraction and adjudication mechanisms. The two can coexist but cannot substitute for each other — a profile will not tell you that "the user said last week they wanted to switch to another approach."

The reasonable investment for L1 is zero to a few dozen lines of code. Any investment beyond that magnitude should first answer clearly: does this scenario really need cross-session continuity?

### 3.1.3 L2: Controlled Persistence

L2 introduces explicit write and retrieval interfaces: writing has a clear trigger point (what the user said, what the task accomplished), and retrieval has a clear call point (query once before answering). Memory becomes an independent component that can be observed and tested separately.

Criterion: if the memory is wrong, the consequence is a break in cross-session experience; and the system can answer "when was this memory written."

The minimum capability set for L2 is: idempotent write, scope isolation, a retrieval relevance floor, and single-entry deletion. If any one of these four is missing, the system will run into trouble under multi-user or long-term use.

The typical failure of L2 is treating "writing" as "saving the conversation." Raw conversation is not memory — it has not been filtered, typed, or source-annotated, and retrieving raw conversation directly amounts to pushing the signal-to-noise problem onto the model. This is where L2 and L1 divide: L2 requires one round of structured processing before write.

### 3.1.4 L3: Governed Memory

L3 memory begins to carry compliance responsibility, and therefore needs three things L2 lacks: **non-repudiable audit evidence**, **verifiable deletion**, and **physical isolation**.

Criterion: if the memory is wrong, the consequence may enter contractual or regulatory scope; and the system can prove to an auditor that "this record has not been tampered with" and that "this deletion has been cascade-processed."

L3's engineering threshold concentrates in two places. The first is the audit chain: a SHA-256 hash chain requires each record to link to the previous one, which brings write serialization and verification overhead, with longer chains verifying more slowly. The second is cascade delete: deleting one memory requires handling four layers — source record, derived conclusions, retrieval cache, and dependent summaries — and must be validated in a staging environment at real data scale, otherwise the `dry_run` output will not match production reality.

The common misconception at L3 is "having logs counts as auditing." Logs can be deleted or modified without leaving a trace; a hash chain cannot — the latter can locate exactly which entry was changed. The difference becomes very concrete during incident review: with logs you can only know "what happened at the time"; with a hash chain you can prove "the record was not modified afterwards."

### 3.1.5 L4: Semantic Infrastructure

L4 memory is no longer an internal component of a single application but a source of facts shared by multiple systems. It must solve problems L3 does not have: how to arbitrate conflicts among facts from different sources, how to trace the provenance of a fact across systems, and how to version semantic definitions.

Criterion: if the memory is wrong, the consequence is that multiple systems simultaneously produce wrong conclusions; and the system can recompute the basis of a conclusion across systems.

As of October 2026, L4 remains rare in industry. Graph databases and ontology modeling provide the means of expression, but **cross-system conflict arbitration and permission models** still lack mature solutions — the complexity of a permission model explodes with the number of Agents and the scope of sharing. Chapter 23 lists this as an unsolved problem.

## 3.2 Typical Architecture and Failure at Each Level

### 3.2.1 The Jump from L1 to L2 Is the Most Underestimated

From L1 to L2, the code volume may grow by only a few hundred lines, but the **discipline** required multiplies: write trigger points must be designed, scopes planned, retrieval thresholds tuned, deletion semantics defined. That discipline does not appear in the code; it appears only in incidents.

A concrete example: a team changed user preferences from "regenerate every time" to "write to the database and reuse," and within a week of launch users complained, "it remembers my taste from three months ago, but I changed that long ago." This is not a bug; it is the inevitable result of L2 lacking a conflict adjudication mechanism — the system has writing but no invalidation.

Therefore when upgrading from L1 to L2, conflict handling cannot be deferred. The minimum viable approach is to add `observation_date` and a `superseded` flag to each memory, and to prefer entries that are not superseded and are more recent at retrieval time. This is far simpler than the full six-class conflict adjudication, but it blocks most "old facts suppressing new facts" problems.

### 3.2.2 The Jump from L2 to L3 Is a Cost Jump

The cost from L2 to L3 lies mainly not in feature development but in **establishing a verification system**. Audit chains, cascade delete, and isolation verification each require an executable acceptance script; otherwise their effectiveness cannot be proven.

Take isolation verification: implementing physical isolation only requires deriving the path from the scope correctly, but proving "there really is no crossing" requires a cross-tenant read test — using A's credentials to try to read B's data, expecting an empty result rather than an error. That test takes only a few dozen lines to write, yet few teams establish it at the L2 stage.

L3's other cost is **serialization of the write path**. A hash chain requires ordering, and ordering requires a lock or a single writer. Under high-concurrency write scenarios this becomes a throughput bottleneck. Mitigations are partitioned ledgers or batch commits, at the cost that verification must merge partition results.

### 3.2.3 The Jump from L3 to L4 Is an Organizational Jump

L3 to L4 is not a technical problem but a problem of authority and accountability. When multiple systems share the same memory, who has the right to write, who has the right to delete, and who arbitrates conflicts — the answers are not in the code but in the organizational structure.

The technically feasible path is: define a unified semantic model (objects, relations, rules), assign a scope to each writer, and perform conflict detection and human arbitration at the shared layer. But the operating cost of this mechanism is high — it requires a role that continuously maintains the semantic model, and that role does not exist in most organizations.

The practical recommendation for L4 is therefore: **build shared read first, shared write later**. Multiple systems can read the same governed memory while writes remain isolated per system. This gains factual consistency while avoiding the complexity of write-conflict arbitration. The cost is that the shared layer must periodically merge data from each writer, introducing latency.

## 3.3 Autonomy: A Parameter Orthogonal to Grading

### 3.3.1 Autonomy Is Not Maturity

A system can reach L3's governance level while keeping very low autonomy: all writes are explicitly triggered by the caller, and the Agent does not decide on its own what to remember. Conversely, an L2 system may grant the Agent very high autonomy, letting the model decide when to write.

Conflating autonomy with maturity leads to two kinds of wrong decisions: raising autonomy for the sake of being "more advanced," and thereby losing explainability; or suppressing maturity for the sake of being "more controllable," and thereby failing compliance.

The correct approach is to treat autonomy as an independent parameter, adjusted by task risk.

| Autonomy | Who decides writes | Suitable tasks | Main risk |
| --- | --- | --- | --- |
| Low | Caller explicitly triggers | Compliance-sensitive, needs reproducibility | Memory strategy must be designed; the Agent cannot adapt |
| Medium | Caller triggers + background consolidation | Long-horizon tasks, experience accumulation | Background consolidation results must be reviewable |
| High | Agent autonomously edits memory blocks | Personal assistants, research-oriented Agents | Black-box decisions, high diagnostic cost |

Table 3-2 — Three grades of autonomy and their suitable tasks

### 3.3.2 The Cost of High Autonomy Must Be Designed In

The core problem of high autonomy is **observability**. When the Agent decides on its own to archive a stretch of context, diagnosing "why did it forget" requires tracing layer by layer: from the final answer back to the retrieval results, from the retrieval results back to the memory entry, from the memory entry back to the decision made at write time.

This traceability chain is inherent in low-autonomy systems — writes are explicit and a call stack can be inspected. In high-autonomy systems it must be purpose-built: every autonomous decision must record its basis, its scope of impact, and its rollback point.

Mnemosyne's choice on this dimension is low autonomy plus high observability: writes are triggered by explicit tool calls, every operation is written to the audit ledger, and `memory_trace` backtracks along the pointer chain to the specific message. The cost is that the caller bears responsibility for memory strategy design — the system will not decide for you "what is worth remembering."

### 3.3.3 Hybrid Forms Will Persist

In practice, purely low-autonomy or purely high-autonomy systems are rare. The more common form is layered: stable information such as user preferences uses low autonomy (explicit writes, human-editable), while volatile information such as task experience uses medium autonomy (consolidated in the background after a task ends, but with reviewable results).

The engineering requirement of this hybrid form is that the two classes of memory must be distinguishable. If they are mixed in one table, retrieval cannot determine "whether this is a preference the user confirmed or an experience the model inferred," and therefore cannot assign different confidence and different deletion policies.

## 3.4 Evolution Paths and Costs

### 3.4.1 The Minimum Change Set from L1 to L2

Four changes, in priority order:

1. Add `observation_date` and source annotations to memories, making "when it happened" and "where it came from" inspectable
2. Change scope from "one global store" to "derived by user/Agent," implementing logical isolation first and leaving an interface for physical isolation
3. Add a relevance floor on the retrieval path, preferring to return less
4. Define single-entry deletion semantics, even if it is only a soft-delete flag

Once these four are done, the system has the skeleton of L2. None of them requires replacing the storage engine.

### 3.4.2 The Minimum Change Set from L2 to L3

Three changes, each accompanied by verification cost:

1. Introduce an audit ledger (hash chain) and bring writes, updates, deletions, exports, and imports all within it
2. Upgrade deletion to cascade delete and provide a `dry_run` preview of dependencies
3. Establish two executable scripts: isolation verification and integrity verification

The second is the easiest to get wrong. Cascade delete requires first defining "derivation relationships": which conclusions were derived from this memory, which summaries cited it, which cache entries correspond to it. If this relationship is not established at write time, deletion can only infer it by scanning, with no accuracy guarantee.

### 3.4.3 Criteria for the Timing of Upgrades

Do not decide upgrade timing based on "peers are all doing it." Three concrete criteria:

**The first compliance problem appears**: when customers or auditors begin demanding proof of deletion or proof of non-tampering, L2 is no longer sufficient.

**The first cross-tenant risk appears**: when the user count exceeds what the team can manually verify, the omission risk of logical isolation becomes unacceptable.

**The first "remembered wrong but cannot be diagnosed" appears**: when an incident review cannot locate the specific memory entry, observability is missing and evolution toward L3 is needed.

Conversely, if none of the three signals has appeared, investing resources in L3 is usually waste — those resources yield more when spent on retrieval quality and user experience.

### 3.4.4 Downgrading Is Not Failure

For a system that has already built L3 capability, downgrading to L2 during a business contraction is a reasonable decision. The correct way to downgrade is to **keep the data structures and shut down the verification processes**: the audit ledger keeps being written but is no longer periodically verified, and cascade delete keeps `dry_run` but simplifies approval.

The reason is that once data structures are lost, re-establishing them requires backfilling historical data, which is often no longer obtainable. Shutting down processes costs far less.

## 3.5 Chapter Summary

This chapter established four judgments.

**First, maturity must be measured on two axes.** The responsibility memory carries determines "what happens if it is wrong," and the degree of verifiability determines "whether being wrong can be discovered." Ranking by autonomy alone leads to wrong conclusions — a fully autonomous memory system may have no auditing capability at all.

**Second, the cost nature of each level transition differs.** L1 to L2 is discipline cost (write trigger points, scope, thresholds, deletion semantics); L2 to L3 is verification cost (audit chain, cascade delete, isolation tests); L3 to L4 is organizational cost (the role maintaining the semantic model, cross-system arbitration authority). Planning with the wrong cost type puts budget in the wrong place.

**Third, autonomy is a parameter orthogonal to maturity.** High autonomy buys flexibility at the cost of observability; low autonomy buys explainability at the cost of the caller bearing strategy design responsibility. Hybrid forms will persist, on the premise that the two classes of memory are distinguishable.

**Fourth, upgrade timing should be triggered by signals, not by trends.** The first compliance problem, the first cross-tenant risk, and the first "remembered wrong but cannot be diagnosed" are three concrete criteria. When none of the three signals has appeared, the return on investing resources in L3 is lower than investing in retrieval quality.

The grading gives investment a scale but does not give implementation detail. Beginning with Chapter 4 we enter the build section, decomposing layer by layer the engineering practices of writing, storage, retrieval, and integration, and the cost of each practice.

---
