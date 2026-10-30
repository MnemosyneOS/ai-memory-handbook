# Chapter 2 — Memory System Reference Architecture

One team changed memory solutions three times in three months: first they assembled their own with a vector database, and found recall unstable; then they switched to a managed memory service, and found deletion incomplete; finally they returned to building in-house, and found that auditing had become the new problem. The cost of the three switches was not in code volume, but in that each one redefined "what counts as memory being correct" — the first only required "it can be found," the second only required "it can be deleted," and the third, for the first time, asked "who can prove it has not been modified."

The waste in that process is avoidable. It happened because the architecture was never decomposed into **responsibility domains** before work began: who is responsible for extraction, who for storage, who for adjudicating old-versus-new conflicts, who for proving integrity. Without that decomposition, every new requirement drives a wholesale replacement instead of a local evolution.

The reference architecture given in this chapter binds to no specific product. It answers three questions: which responsibility domains a memory system consists of, what the guarantee strength of each domain is, and which capabilities are suited to building in-house versus handing to a shared platform. This chapter first gives the architectural overview and three views, then decomposes the build, runtime, and governance planes layer by layer, then explains how the lifecycle threads these layers into a closed loop, and finally closes with a responsibility-boundary table.

## 2.1 Architectural Overview

### 2.1.1 Understanding One System Through Three Views

The same memory system needs to be seen in three ways by three kinds of people.

The **component view** answers "what parts are there": extractor, embedder, vector index, graph store, audit ledger, scope manager. It serves implementers, and its purpose is to prevent capability omissions — every missing part means one class of failure that cannot be observed.

The **responsibility view** answers "who guarantees what": the storage layer guarantees durability, the retrieval layer guarantees the relevance floor, the audit layer guarantees non-repudiation. It serves architects, and its purpose is to prevent responsibility confusion — when an incident occurs, it can locate "which layer's guarantee was broken."

The **lifecycle view** answers "what is done when": what is checked at write time, what is filtered at recall time, what is cascaded at delete time, what is periodically verified. It serves operations and compliance, and its purpose is to prevent mistaking a one-off configuration for a continuous mechanism.

The three views do not conflict; they are three facets of the same system. A common mistake is to draw only the component diagram and then discover during an incident review that no one owns anything; or to draw only the lifecycle diagram and then discover during scaling that there are no clean interfaces between parts.

### 2.1.2 Five Capability Responsibility Domains

Decompose a memory system into five responsibility domains, each with explicit inputs, outputs, and guarantee strength.

| Responsibility domain | Input | Output | Guarantee strength | Consequence of failure |
| --- | --- | --- | --- | --- |
| Extraction domain | Conversations, documents, behavior logs | Candidate facts (with type, source, time) | Best-effort | Noise enters the store |
| Storage domain | Candidate facts | Persistent records + indexes + graph edges | Strong (ACID) | Data loss or misplacement |
| Adjudication domain | New facts + existing facts | ADD / NOOP / UPDATE / keep both | Best-effort | Old facts suppress new facts |
| Retrieval domain | Query + budget | Ranked memory entries | Relevance floor | Noise injected or recall missed |
| Governance domain | Whole store + policies | Audit evidence, deletion results, sanitization results | Strong (verifiable) | Cannot prove its own innocence |

Table 2-1 — The five capability responsibility domains of a memory system

What needs the most attention in this table is the "guarantee strength" column. Extraction and adjudication are **best-effort** — they depend on model judgment and always carry an error rate; storage and governance are **strong guarantees** — they depend on deterministic data structures and algorithms, and an error there is a bug. The most common consequence of designing these two classes together is substituting "the model will judge it" for "the data structure guarantees it," so that auditing and deletion are never made solid.

### 2.1.3 Four Principles of Enterprise-Grade Design

**Principle 1: Externalize state.** Memory must not depend on a particular execution instance. Instances are replaceable; memory must be continuous. The direct corollary: any implementation where "the in-process cache is the memory" fails in multi-replica scenarios.

**Principle 2: Layer the guarantee strength.** Different responsibility domains promise different strengths, and this must be declared explicitly in documentation and interfaces. Packaging "best-effort" as "strong guarantee" is the most common way memory systems lose trust.

**Principle 3: Verifiable beats configurable.** If a capability cannot be verified by script, its existence can only be believed. This is especially true of auditing, deletion, and isolation — which happen to be the first three things a compliance review asks about.

**Principle 4: Match the minimum sufficient architecture to task risk.** Not every scenario needs a hash chain and cascade delete. A personal project is fine with a single-file SQLite plus the built-in extractor; financial and medical scenarios need a complete evidence chain. The purpose of architecture is to give every granted capability a matching constraint, not to make the system big.

## 2.2 The Build Plane: Extraction, Storage, Adjudication, Retrieval

### 2.2.1 Extraction: What One Call Can Obtain

The extraction domain turns unstructured input into candidate facts. The mainstream approach in 2026 is **single-pass extraction**: one model call completes fact identification, type determination, temporal parsing, and source annotation, with no multi-round iteration.

The benefit of a single pass is cost determinism and predictable latency; the cost is that extraction quality is bounded by a single judgment, and complex multi-hop phrasing is easily missed. There are usually two compensations: first, deterministic rules as a backstop (simple statements can still be extracted without a model); second, allowing the caller to explicitly specify metadata such as `observation_date`, converting "when it happened" from a model inference into a caller declaration.

Mnemosyne's choice is to use the built-in `rules` deterministic extractor as the default, so writing works without an API key. The cost must be stated clearly: the built-in extractor's recall quality on complex multi-turn conversation is markedly lower than when an LLM is configured; it is **a zero-configuration starting point, not a production-grade endpoint**. `describe()["degraded"]` reports which component has currently fallen back to the built-in implementation and why, avoiding silent degradation.

### 2.2.2 Storage: Physical Isolation and Tiering

The core decision in the storage domain is not "which database to use" but **how isolation is done**.

Logical isolation (a shared table plus `WHERE user_id = ?`) is simple to implement, with risk concentrated at one point: any single missed filter condition is a cross-tenant leak, and a miss is extremely hard to spot in code review because it looks exactly like correct code.

Physical isolation (one file or one independent namespace per scope) moves the risk from "writing the condition correctly" to "deriving the path correctly." The former is a probabilistic problem, the latter a deterministic one — a wrong path fails loudly or reads empty, and never silently returns someone else's data.

Mnemosyne uses physical isolation: each combination of the four-dimensional scope (`user_id` / `agent_id` / `run_id` / `app_id`) derives a namespace mapping to its own directory and its own SQLite file. The cost is that cross-scope aggregate queries require multiple reads merged at the application layer; for memory scenarios this cost is usually acceptable, because cross-scope recall is the exception rather than the norm.

Tiering is the storage domain's second decision. The purpose of the hot / warm / cold tiers is not to save money but to make "forgetting" a reversible downgrade rather than an irreversible deletion: low-value memories are demoted and compressed and can still be restored by `expand`. This is safer than outright deletion, at the cost that storage never actually shrinks.

### 2.2.3 Adjudication: Who Decides Old-Versus-New Conflicts

The adjudication domain is the most easily underestimated link. Its input is a new fact and existing facts, and its output is an action: append, ignore, update, or keep both.

Mnemosyne's `conflict_resolve` offers six conflict judgments and four operations. The six are temporal update, preference change, scope difference, precision difference, logical contradiction, and source conflict; the four operations are ADD, NOOP, UPDATE, and KEEP_BOTH. The default is `dry_run=true`, which produces only a plan without changing data; `scope=audit` scans the whole store and reports only true conflicts that "share an entity and share a predicate."

The design point is **moving adjudication off the write path**. Writing always only appends; adjudication happens on demand when needed. The benefit is that writing is fast and never destroys facts; the cost is that contradictory entries temporarily coexist in the store, and retrieval must resolve them using time and source signals rather than relying on the assumption that "there is only one correct record in the store."

### 2.2.4 Retrieval: The Inevitability of Multi-Signal Fusion

The retrieval domain must trade off between "relevance" and "budget." Vector retrieval alone fails on long-horizon memory, because semantic similarity is not decision equivalence: "I am allergic to peanuts" and "I ate peanuts yesterday with no problem" sit very close together in embedding space, but one is a constraint and the other a counterexample.

Mnemosyne fuses five signal channels: semantic, BM25 keyword, entity graph, time, and tags, filtered through a calibrated relevance floor before returning, and retaining a lexical fallback — BM25 still provides baseline recall when the embedding service is unavailable. The cost is that fusion itself adds computation, and the weights of each channel need per-scenario tuning; the default weights may be too semantics-heavy in scenarios dense with proper nouns.

Budget control is the retrieval domain's second constraint. The mature approach is **two-step disclosure**: first return a catalog (title + one-line summary + expansion cost), and after the caller judges, expand 1–2 items. Injection cost drops from O(all memories) to O(catalog + a few expansions). The cost is one extra round trip, which is uneconomical in latency-sensitive scenarios.

## 2.3 The Runtime Plane: Deployment, State, and Scale

### 2.3.1 From Running to Running Continuously

The build plane solves "is the functionality correct"; the runtime plane solves "can it stay correct." The dividing line is this: once the system must span instances, time, and collaborators, the build plane's assumptions fail one by one.

Three assumptions fail first: in-process state is no longer trustworthy, single-replica locks no longer exclude each other, and in-memory caches are no longer consistent. The runtime plane's job is to provide substitute mechanisms for these three.

### 2.3.2 The Engineering Meaning of Zero Dependencies

"Zero dependencies" is often used as a marketing term, but it has a precise engineering meaning: the core package's `install_requires` is empty, all external service adapters issue HTTP directly through the standard library, and adapters needing third-party SDKs import lazily and raise an explicit error when the package is missing.

Mnemosyne's core package fits this definition. It brings four consequences: offline availability, a small supply-chain attack surface, simple deployment (one `pip install`, no Docker, no database, no API key), and upgrades free of dependency conflicts. The cost is equally explicit: the built-in embedder is a 128-dimensional deterministic implementation, with recall quality below commercial embedding models; when stronger recall is needed, an external provider must be wired in explicitly.

### 2.3.3 Four Choices of Deployment Form

| Form | Suitable scenario | Main cost |
| --- | --- | --- |
| Library embedding | Single-process applications, CLI tools, scripts | No concurrency isolation; multi-process use must handle file locks itself |
| Single-process service | Console + REST sharing a port, internal team use | Single point; process-level high availability must be built yourself |
| MCP server | Integrating clients such as Claude Code and Cursor | Under stdio transport, one process per client |
| Managed SaaS | No operations capability, cloud storage acceptable | Data leaves the domain, dependent on provider availability |

Table 2-2 — Suitable scenarios and costs of four deployment forms

The criterion for choosing is not "which is more advanced" but whether data sovereignty is a hard constraint. If it is, self-hosting is the only option, and a mature product's open-source edition should not lose functionality because of self-hosting; if it is not, managed hosting reduces operational burden.

### 2.3.4 Three Bottlenecks at Scale

The scaling bottleneck of a memory system is rarely "cannot store it all"; it is usually one of three places.

**Write serialization**: hash-chained auditing requires each record to link to the previous one, which is inherently serial. Write throughput is capped by how fast the ledger can be appended, not by the database. Mitigations are batch commits and partitioned ledgers, at the cost that verification must merge across partitions.

**Retrieval fusion computation**: each of the five signal channels has its own cost, with the reranker the most expensive. Mitigations are caching high-frequency queries and trimming the number of signal channels per scenario, at the cost that cache consistency needs an additional mechanism.

**Cross-scope aggregation**: physical isolation degrades cross-scope queries into N reads. The mitigation is pre-aggregated views, at the cost of consistency between views and source data.

## 2.4 The Governance Plane: Audit, Deletion, Safety

### 2.4.1 Why Governance Is a Cross-Cutting Capability

Governance is not the last stage of the lifecycle but a constraint running through every stage: the permission model is fixed during architecture design, tool policies are implemented during build, sandboxes and gateways are enforced at runtime, observability and security analysis are detected during the governance stage, and evaluation verifies changes during the tuning stage.

A usable self-check criterion: if a governance requirement can only be satisfied after launch through process and manual work, and cannot be landed in policies, interfaces, or data structures during the architecture and build stages, then it will very likely fail once scaled.

### 2.4.2 Strength Differences Among Three Guarantees

There are strength differences inside the governance domain too, and conflating them leads to over-promising.

| Mechanism | What it can prove | What it cannot prove |
| --- | --- | --- |
| Hash-chained audit | Records have not been tampered with, and exactly which one can be located | That a record no longer exists |
| Cascade delete | Source record, derived conclusions, cache, and dependent summaries are all handled | That backups and export copies have been purged |
| Scope isolation | Data does not cross under default paths | That data still does not cross when misconfigured |

Table 2-3 — The proof boundaries of three governance mechanisms

This table should go directly into customer-facing explanations. Its purpose is to set expectations in advance: audit is not proof of deletion, deletion is not backup purge, and isolation is not immunity to misconfiguration.

### 2.4.3 Safety Must Happen Before Write

The fundamental difference between a memory system and a one-off prompt is that a poisoned memory keeps taking effect in all subsequent conversations. The placement of safety checks is therefore critical.

Filtering at retrieval time means the poisoned content has already entered storage, and any single missed filter lets it take effect again; checking before write means the poisoned content never lands. Mnemosyne's notary chooses the latter: field-level sanitization after credential pattern matching, invisible-Unicode detection, and HTML injection detection, all completed before write.

The cost is increased write latency, and rules that require continuous maintenance — new credential formats and new injection techniques must both be tracked.

## 2.5 Lifecycle: The Loop from Architecture to Tuning

### 2.5.1 Outputs of Five Stages

| Stage | What it answers | Key outputs | Exit condition |
| --- | --- | --- | --- |
| Architecture design | Form, autonomy, responsibility domains, permission boundaries | Responsibility boundary table, guarantee strength declaration | Boundaries can be reviewed |
| Build | How to implement as a reproducible version | Extractor, scope rules, retrieval strategy, evaluation baseline | Offline evaluation passes |
| Runtime | How to be reliable, isolated, recoverable | Events, checkpoints, artifacts, Trace, cost | Failure drill passes |
| Governance | How to see, constrain, and hold accountable | Audit evidence, deletion records, isolation verification | Compliance check passes |
| Tuning | How to reproduce problems and verify improvements | Datasets, evaluators, experiment records | Regression passes |

Table 2-4 — The five stages of the memory system lifecycle

Architecture design is listed as the first stage rather than left implicit inside build because once the form choice and permission boundaries are fixed, the subsequent cost range is essentially locked. Leaving those decisions to implementation detail is equivalent to letting code define the architecture in reverse, and such problems can usually only be solved by refactoring.

### 2.5.2 Tuning Outputs Must Flow Back into Build

Any memory strategy, extraction rule, or retrieval weight generated by a model, feedback, or trajectory should be treated as a **candidate change**, which may enter production only after reproducible evaluation, safety checks, versioning, canary rollout, and a rollback-capable release.

This constraint explains why the runtime stage must produce structured Traces and cost facts. Without reproducible evidence, tuning can only rely on subjective impression; without a versioned release unit, even if an improvement direction is found, there is no way to prove the improvement came from this change.

## 2.6 Chapter Summary

This chapter established four judgments.

**First, a memory system must be decomposed by responsibility domain, not enumerated by feature.** Among the five responsibility domains, extraction and adjudication are best-effort, while storage and governance are strong guarantees. The most common consequence of designing the two classes together is substituting "the model will judge it" for "the data structure guarantees it," so that auditing and deletion are never made solid.

**Second, the choice of isolation method matters more than database selection.** Logical isolation puts the risk in "whether the filter condition is written correctly"; physical isolation puts it in "whether the path is derived correctly." The former is probabilistic, the latter deterministic. The cost is that cross-scope aggregation requires multiple reads.

**Third, the proof boundaries of governance mechanisms must be declared explicitly.** A hash chain proves no tampering but cannot prove non-existence; cascade delete handles four layers but excludes backups; scope isolation prevents default-path crossing but not misconfiguration. These three sentences belong in the product documentation, not in the incident post-mortem.

**Fourth, the key to the lifecycle loop is the backflow constraint.** Any change produced by tuning must pass the build stage's tier gate before entering production; otherwise "self-evolution" degrades into "self-modification without approval."

This chapter's architecture is static. One question remains unanswered: to what extent should the same architecture be built out in organizations of different maturity? Building every responsibility domain to the full is waste for a ten-person team; building only half is a risk for a financial scenario. That is the graded judgment Chapter 3 provides.

---
