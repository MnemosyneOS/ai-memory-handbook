---
title: AI Memory Handbook
description: A full-lifecycle practice guide for enterprise AI memory systems — 23 chapters across 7 parts. Written and led by Hu Jingkun. Mnemosyne OS.
---

# AI Memory Handbook

**From Context Memory to Cognitive Infrastructure: A Full-Lifecycle Practice Guide for Enterprise AI Memory Systems**

> Version 2026.11 · Data and facts snapshot as of 30 October 2026
> Author: **Hu Jingkun (胡景堃)** · Licensed under CC BY-NC-ND 4.0

[中文版](/00-preface/阅读导引) · [Full contents (Chinese)](/contents) · [Reading guide (Chinese)](/reading-guide)

This is the complete English edition — all 23 chapters and 2 appendices, translated in full, not abridged.

---

## Part I · Architecture (Chapters 1–3)

Memory is not an accessory feature. It is simultaneously the input to context, the state of the runtime, and the evidence of governance — and those three identities have incompatible correctness requirements. Merging them into "a piece of text we stored" is the common root cause of most memory incidents in production.

- [Ch. 1 — Why Memory Became a First-Class Primitive](/en/ch01-why-memory-is-first-class) — Four failure modes, the three identities of memory, three fundamental tensions, and the honest boundary of what a memory system can and cannot do in 2026.
- [Ch. 2 — A Reference Architecture for Memory Systems](/en/ch02-reference-architecture) — Five responsibility domains with an explicit guarantee strength for each. Confusing best-effort with strong-guarantee is how audit and deletion end up permanently unimplemented.
- [Ch. 3 — Form and Maturity: L1–L4](/en/ch03-form-and-maturity) — Graded on responsibility and verifiability rather than autonomy. Each level jump has a different cost character: discipline, then verification, then organization.

## Part II · Build (Chapters 4–7)

- [Ch. 4 — Writing: Extraction, Typing, Conflict Resolution](/en/ch04-writing) — Single-pass ADD-only is a choice about the shape of failure, not about speed. Dual time axis, six conflict kinds, four actions.
- [Ch. 5 — Storage: Tiering, Scoping, Lossless Compression](/en/ch05-storage) — Isolation correctness guaranteed by structure rather than discipline; hot/warm/cold tiering as reversible demotion; AIC compression that restores byte-for-byte.
- [Ch. 6 — Retrieval: Multi-Signal Fusion and Budget Control](/en/ch06-retrieval) — Why pure vector retrieval fails on long-horizon memory, why budget must participate in selection, and how to diagnose ranking versus budget errors.
- [Ch. 7 — Integration: MCP, API, and Framework Adapters](/en/ch07-integration) — Designing a 55-entry tool surface (44 native + 11 client-compatible, 3 deprecated aliases, 52 distinct capabilities); degradation must be reported, never silent.

## Part III · Run (Chapters 8–11)

- [Ch. 8 — Deployment: What Local-First Really Means](/en/ch08-deployment) — Zero dependencies as an architectural outcome: four consequences and their costs, four deployment forms, the self-host versus SaaS boundary.
- [Ch. 9 — State Recovery, Asynchrony, and Consistency](/en/ch09-state-and-consistency) — Sync versus async writes, the flush barrier as the only way out of read-after-write inconsistency, events, idempotency, and recovery drills.
- [Ch. 10 — Scoping for Multi-User and Multi-Agent](/en/ch10-scoping) — Physical isolation turns a cross-tenant leak into a missing file; the namespace derivation trap passes every test and still leaks; cross-agent sharing remains unsolved.
- [Ch. 11 — Operating at Scale: Cost, Latency, Capacity](/en/ch11-operating-at-scale) — Four cost structures, why the SQLite ceiling is set by write concurrency rather than data volume, and the metrics that reveal recall degrading over session length.

## Part IV · Governance (Chapters 12–15)

- [Ch. 12 — Auditability: Hash Chains, Provenance, Evidence](/en/ch12-auditability) — A log is the system's statement about itself; an audit is material for independent review. The hash chain's real value is `first_broken_at`.
- [Ch. 13 — The Four Semantics of Deletion and Forgetting](/en/ch13-deletion-and-forgetting) — Mark-delete, mask, cascade soft-delete, physical delete. Deletion verifiability remains unsolved, and this book does not claim otherwise.
- [Ch. 14 — Pre-Write Safety: Notary, Injection, Credentials](/en/ch14-pre-write-safety) — Safety must happen before the write. Three classes of attack need three layers of defence; character-level checks cannot stop a forged fact.
- [Ch. 15 — Compliance and Data Sovereignty](/en/ch15-compliance) — Self-hosting transfers compliance responsibility rather than eliminating it; the deliverable is an evidence chain, not a feature list.

## Part V · Optimization (Chapters 16–19)

- [Ch. 16 — Benchmarks: A Reproducible Methodology](/en/ch16-benchmarks) — Three trust tiers, five essentials, three red lines. **This chapter also states explicitly that our own published scores have not yet been independently recomputed by a complete in-repository run.**
- [Ch. 17 — Benchmark Controversy and Evaluation Traps](/en/ch17-benchmark-controversy) — Five variables each capable of a double-digit gap; why the first selection question is "how many turns", not "what is your score"; five concrete traps.
- [Ch. 18 — Quality Measurement and the Badcase Loop](/en/ch18-quality-and-badcase-loop) — Six quality dimensions in structural conflict; honest metrics return `null` rather than `0`; the value of a badcase loop is in attribution, not the fix.
- [Ch. 19 — Controlled Self-Evolution: From Storage to Experience](/en/ch19-controlled-self-evolution) — Storage → reflection → experience, each failing differently. Mandatory `preconditions` is the dividing line between an experience and a suggestion.

## Part VI · Practice (Chapters 20–22)

- [Ch. 20 — Comparing the First Tier](/en/ch20-system-comparison) — Write paradigms have converged: single-pass ADD-only is now the industry floor and no longer a differentiator. Differentiation lies in conflict adjudication, deletion provability, audit locatability, and cost structure.
- [Ch. 21 — Selection Decisions and Migration Paths](/en/ch21-selection-and-migration) — Five prerequisite questions, a decision tree, and three migration paths whose cost tracks architectural position rather than feature gap.
- [Ch. 22 — Representative Scenarios in Practice](/en/ch22-scenarios) — Five scenarios, each with one decisive failure mode that is usually not "remembered the wrong thing", and one scriptable acceptance metric.

## Part VII · Outlook (Chapter 23)

- [Ch. 23 — Unsolved Problems and the 2027 Roadmap](/en/ch23-unsolved-problems) — Who defines factual correctness, cross-agent arbitration, the verifiability of forgetting, the benchmark gap, and the cost-quality frontier. The bottleneck in each is an incentive structure, not a technique.

## Appendices

- [Appendix A — Glossary](/en/appendix-a-glossary) — 30 terms with unified renderings, definitions, and the confusable pairs.
- [Appendix B — References and Reproducible Resources](/en/appendix-b-references) — Papers with arXiv identifiers, official product documentation, and the exact queries anyone can recompute.

## Preface and front matter

- [2026 Technical Observations on Memory Systems](/en/2026-technical-observations)
- [Preface](/en/preface)
- [Reading Guide](/en/reading-guide)

## About Mnemosyne OS

This book cites [Mnemosyne OS](https://ai-memory.net) extensively, not because it is superior, but because it satisfies two conditions at once: the design documentation matches the implementation source, and the key capabilities can be verified locally. You can `pip install mnemosyne-os` and reproduce the behaviours described in the book rather than taking the prose on trust.

- Website: [ai-memory.net](https://ai-memory.net)
- Source: [github.com/MnemosyneOS/mnemosyne](https://github.com/MnemosyneOS/mnemosyne)
- Reproducible benchmark: [github.com/MnemosyneOS/mnemosyne-bench](https://github.com/MnemosyneOS/mnemosyne-bench)

## Co-building and licensing

We welcome universities and educational institutions worldwide to co-build the *Enterprise AI Memory* curriculum. Add WeChat **Mnemosyne-OS** and mention "co-build".

*AI Memory Handbook* was initiated and led by **Hu Jingkun (胡景堃)**. Thanks to the university experts and scholars, AI memory developers, and community volunteers at home and abroad who participated in co-creation.

Copyright © 2026 Hu Jingkun (胡景堃). Licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). **Unauthorized dissemination, reproduction, reprinting, adaptation, or commercial use is prohibited.**
