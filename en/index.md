# AI Memory Handbook

**From Context Memory to Cognitive Infrastructure: A Full-Lifecycle Practice Guide for Enterprise AI Memory Systems**

> Version 2026.11 · Data and facts snapshot as of 30 October 2026
> Systems covered: Mnemosyne OS, Mem0, Zep / Graphiti, Letta, LangMem, Cloudflare Agents

**Author: Hu Jingkun (胡景堃)** · Licensed under CC BY-NC-ND 4.0

---

## English edition status

The full English edition is being translated chapter by chapter. The Chinese edition is complete and authoritative: **23 chapters across 7 parts, plus 3 appendices**.

Until the translation is complete, this page is a structured entry point for English readers: it tells you what each chapter argues, and links to the Chinese text so that machine translation and AI assistants can work from the authoritative source rather than from a paraphrase.

If you need a specific chapter translated first, open an issue in this repository.

## Reading paths

- **First systematic look at AI memory**: Technical Observations → Ch. 1 → Ch. 2 → Ch. 4 → Ch. 6 → Ch. 20
- **Putting memory into production**: Ch. 8 → Ch. 11 → Ch. 12 → Ch. 14 → Ch. 18
- **Owning selection or project approval**: Technical Observations → Ch. 1 → Ch. 3 → Ch. 20 → Ch. 21 → Ch. 23

## Part I · Architecture (Chapters 1–3)

Memory is not an accessory feature. It is simultaneously the input to context, the state of the runtime, and the evidence of governance — and those three identities have incompatible correctness requirements. Merging them into "a piece of text we stored" is the common root cause of most memory incidents in production.

- **Ch. 1 — Why Memory Became a First-Class Primitive.** Four failure modes (stored in the wrong scope, stored what should never be stored, failed to forget, forgot but cannot prove it), the three identities of memory, three fundamental tensions, and the honest boundary of what a memory system can and cannot do in 2026.
- **Ch. 2 — A Reference Architecture.** Five responsibility domains — extraction, storage, adjudication, retrieval, governance — with an explicit guarantee strength for each. Extraction and adjudication are best-effort; storage and governance are strong guarantees. Confusing the two is how audit and deletion end up permanently unimplemented.
- **Ch. 3 — Form and Maturity: L1–L4.** Graded on two axes — the responsibility memory carries, and how verifiable it is — rather than on autonomy. Each level jump has a different cost character: discipline, then verification, then organization. Upgrade when a signal fires, not when a trend does.

## Part II · Build (Chapters 4–7)

- **Ch. 4 — Writing: Extraction, Typing, Conflict Resolution.** Single-pass ADD-only is a choice about the *shape of failure*, not about speed: a bad extraction only introduces noise, whereas a bad update silently erases a true fact. Dual time axis separates when a fact happened from when the system learned it. Six conflict kinds, four actions, and why keeping adjudication off the write path is worth the temporary coexistence of contradictions.
- **Ch. 5 — Storage: Tiering, Scoping, Lossless Compression.** Isolation correctness should be guaranteed by structure, not discipline. One SQLite file per scope turns a cross-tenant leak into a missing file. Hot/warm/cold tiering makes forgetting a reversible demotion rather than an irreversible delete. AIC compression keeps numbers, dates, amounts, and model numbers intact at every tier and restores byte-for-byte.
- **Ch. 6 — Retrieval: Multi-Signal Fusion and Budget Control.** Pure vector retrieval fails on long-horizon memory because the discriminating information lives in structured fields the embedding cannot see. Budget must participate in selection, and the degradation order decides whether failure is observable. Diagnose "ranking wrong" versus "budget wrong" before tuning anything.
- **Ch. 7 — Integration: MCP, API, and Framework Adapters.** The width of the tool surface is a design decision, not a list length: 55 `tools/list` entries — 44 native plus 11 client-compatible, including 3 deprecated aliases, 52 distinct capabilities. Degradation must be reported, never silent.

## Part III · Run (Chapters 8–11)

- **Ch. 8 — Deployment: What Local-First Really Means.** Zero dependencies is an architectural outcome, not a slogan: offline availability, a small supply-chain surface, one-command deployment, conflict-free upgrades — and a built-in embedder whose recall is deliberately below commercial models.
- **Ch. 9 — State Recovery, Asynchrony, and Consistency.** Async writes keep the hot path fast and introduce read-after-write inconsistency; the flush barrier is the only way out. Events, idempotency, and a recovery drill that actually proves nothing is lost or double-charged.
- **Ch. 10 — Scoping for Multi-User and Multi-Agent.** Physical isolation makes the proof of isolation a point question instead of a coverage question. The namespace derivation trap is the one failure that passes every test and still leaks across tenants. Cross-agent shared memory remains unsolved; the reliable capability today is *supporting non-sharing*.
- **Ch. 11 — Operating at Scale.** Four cost structures, why the SQLite ceiling is set by write concurrency and cross-scope aggregation rather than data volume, and the operational metrics that reveal recall degrading over session length.

## Part IV · Governance (Chapters 12–15)

- **Ch. 12 — Auditability.** A log is the system's statement about itself; an audit is material handed to a third party for independent review. The difference is non-repudiation, locatability, and recomputability. A SHA-256 hash chain's real value is one return value: `first_broken_at`, which turns "something may be wrong" into "record 137 was altered".
- **Ch. 13 — The Four Semantics of Deletion.** Mark-delete, mask, cascade soft-delete, physical delete. Four motivations, four strengths. The premise of cascade delete is that derivation relationships were recorded at write time — not that the delete logic is well written. Deletion verifiability remains an unsolved problem, and this book does not claim otherwise.
- **Ch. 14 — Pre-Write Safety.** Safety must happen before the write, not at retrieval: redacted content never enters storage, contamination cannot spread through derivations, and the audit chain records clean content. Three classes of attack need three layers of defence; character-level checks cannot stop a forged fact.
- **Ch. 15 — Compliance and Data Sovereignty.** Self-hosting transfers compliance responsibility rather than eliminating it. Deletion-proof exports conflict with the right to erasure, and only policy layering resolves it. The deliverable of compliance is an evidence chain, not a feature list.

## Part V · Optimization (Chapters 16–19)

- **Ch. 16 — Benchmarks: A Reproducible Methodology.** A benchmark's credibility has three tiers, and a score carries no credibility on its own — the process attached to it does. **This chapter also states, explicitly, that our own published headline scores have not yet been independently recomputed by a complete in-repository run.** The gap is written up as a worked example, not glossed over.
- **Ch. 17 — Benchmark Controversy and Evaluation Traps.** Five variables — dataset version, judge, prompt template, retrieval depth, multi-hop permission — each capable of producing a double-digit gap larger than the real capability difference. The first selection question is "how many turns did your benchmark run", not "what is your score".
- **Ch. 18 — Quality Measurement and the Badcase Loop.** Six quality dimensions that trade against each other. Honest metrics return `null` with `insufficient_data` rather than `0`, because zero and "no data" are different things. The value of a badcase loop is in attribution, not in the fix.
- **Ch. 19 — Controlled Self-Evolution.** Storage → reflection → experience, with a different failure mode at each stage. `preconditions` being mandatory is the dividing line between an experience and a suggestion. Every model-generated memory, skill, or patch is a candidate change that must pass evaluation, security review, versioning, canary release, and rollback.

## Part VI · Practice (Chapters 20–22)

- **Ch. 20 — Comparing the First Tier.** Write paradigms have converged: single-pass ADD-only is now the industry floor, which means it is no longer a differentiator. The remaining differences are conflict adjudication, deletion provability, audit locatability, and cost structure.
- **Ch. 21 — Selection Decisions and Migration Paths.** Five prerequisite questions, a decision tree, and three migration paths with their real costs. Migration from a hosted service back to self-hosting is far more expensive than the reverse; when sovereignty is uncertain, start self-hosted.
- **Ch. 22 — Representative Scenarios in Practice.** Five scenarios, each with one decisive failure mode that is usually *not* "it remembered the wrong thing" — over-generalization, stale facts, negative transfer, residual derivations, proper-noun misses — and one scriptable acceptance metric.

## Part VII · Outlook (Chapter 23)

- **Ch. 23 — Unsolved Problems and the 2027 Roadmap.** Five problems that no implementation has solved in production: who defines factual correctness, cross-agent conflict arbitration, the verifiability of forgetting, the gap between benchmarks and real use, and the cost-quality Pareto frontier. The bottleneck in each is an incentive structure, not a technique.

## Appendices

- **Appendix A — Glossary.** 30 terms with unified translations, definitions, and the confusable pairs.
- **Appendix B — References and Reproducible Resources.** Papers with arXiv identifiers, official product documentation, and the exact search queries anyone can recompute.
- **Appendix C — Revision Log.** Every substantive change relative to the previous internal draft, including what was deleted and why. *(Repository edition only; excluded from the published site.)*

## Links

| Resource | URL |
| --- | --- |
| Mnemosyne OS website | https://ai-memory.net |
| This book, online | https://ai-memory.net/ai-memory-handbook/ |
| Mnemosyne OS source | https://github.com/MnemosyneOS/mnemosyne |
| Reproducible benchmark | https://github.com/MnemosyneOS/mnemosyne-bench |
| PyPI package | https://pypi.org/project/mnemosyne-os/ |
| Documentation site | https://docs.mnemosyne-os.io |

## Copyright

Copyright © 2026 Hu Jingkun (胡景堃). All rights reserved.

Released under **CC BY-NC-ND 4.0**. **Without prior written authorization, any form of dissemination, reproduction, reprinting, adaptation, or commercial use is prohibited.** For commercial licensing, curriculum co-building, translation rights, or media collaboration, contact WeChat **Mnemosyne-OS**.
