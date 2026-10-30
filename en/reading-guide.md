# Reading Guide

## 1. Background

In May 2026, a survey accepted into ACL 2026 Findings formalized the evolution of memory mechanisms in LLM agents into three stages: **storage** (trajectory preservation), **reflection** (trajectory refinement), and **experience** (trajectory abstraction). The value of this division lies not in periodizing the technology, but in naming something engineering-wise very troublesome: the three stages correspond to three completely different correctness criteria. The storage stage demands "do not lose"; the reflection stage demands "do not be wrong"; the experience stage demands "be transferable." Trying to satisfy all three criteria with a single mechanism is the root cause of why most memory systems fail at scale today.

In the same period, a convergence worth recording appeared on the engineering side. The write and recall paradigm centered on "single-pass ADD-only extraction + multi-signal retrieval + temporal reasoning + memory decay" was independently adopted by several major implementations. This shows that the floor of "do not overwrite existing facts" has become consensus — a bad extraction at worst introduces noise, and never destroys a true fact. But convergence brings a new problem: when the foundational paradigm converges, differentiation shifts to harder ground — how conflicts are adjudicated, how deletion is proven, how cost is controlled, how experience is abstracted.

This handbook takes that as its starting point. It does not attempt to offer a one-size-fits-all solution, but organizes itself around one concrete question:

> **Under the technical conditions of 2026, how should an enterprise or an individual developer make defensible trade-offs among memory write, retrieval, forgetting, auditing, and evolution?**

"Defensible" is the keyword. It means every technical choice must be able to answer: why not the other one, what is the cost, under what conditions does it fail. A choice that cannot be interrogated does not constitute an engineering decision.

## 2. Intended Readers and What They Gain

This handbook is for people who need to design, build, operate, or audit memory capability for AI systems.

| Reader | Suggested focus | What you gain |
| --- | --- | --- |
| Agent / AI application developers | Build section, integration chapters | The engineering methods of single-pass write, conflict resolution, multi-signal retrieval, and progressive disclosure |
| Architects and platform engineers | Architecture section, operations section | A complete view from storage engine to governance foundation, and the real costs of local-first versus managed service |
| Technical leads and R&D managers | Architecture section, practice section, tuning section | The ability to judge the maturity of a memory system, its selection boundaries, and production admission conditions, supporting project initiation and procurement |
| Product and business owners | Architecture section, typical scenarios, outlook section | An understanding of what different personas expect and fear from memory, and the product conditions for moving from "remembering" to "being trusted" |
| Security, compliance, and operations staff | Governance section, operations section | Hands-on mechanisms for hash-chained auditing, cascade delete, sanitized write, and integrity verification |
| Researchers and ecosystem contributors | Tuning section, outlook section | Frontline industrial constraints, methodological disputes over benchmarks, and unsolved problems |

After reading the whole book, you will be able to:

- judge which maturity level a scenario's memory needs belong to, and set investment boundaries accordingly;
- distinguish "best-effort" from "strong guarantee" mechanisms, and not be misled by over-promising;
- design audit, deletion, and isolation schemes that can be verified by scripts, rather than relying on process and manual work;
- read the methodological differences behind benchmark scores, and know which numbers are comparable and which are not;
- establish an improvement loop for a memory system from Trace to Badcase to controlled release.

## 3. Structure of the Book

| Part | Chapter range | Core content |
| --- | --- | --- |
| Front matter | Technical observations | Observing the technical convergence and capability gaps of memory systems in 2026, based on publicly reproducible signals |
| Architecture | Chapters 1–3 | Why memory is a first-class primitive, the responsibility-domain division of the reference architecture, the L1–L4 maturity levels |
| Build | Chapters 4–7 | Write paradigms, storage and compression, retrieval fusion and budget control, MCP and framework integration |
| Operations | Chapters 8–11 | Deployment forms, state recovery and consistency, multi-user scope governance, operations at scale |
| Governance | Chapters 12–15 | Auditability, the four layers of deletion semantics, pre-write safety, compliance and data sovereignty |
| Tuning | Chapters 16–19 | Reproducible benchmarks, evaluation traps, quality metrics and the Badcase loop, controlled self-evolution |
| Practice | Chapters 20–22 | Comparison of first-tier systems, selection and migration paths, typical scenario practice |
| Outlook | Chapter 23 | Five unsolved problems and the 2027 roadmap |

## 4. Chapter Navigation

| Part | Chapter | Core content |
| --- | --- | --- |
| Architecture | Chapter 1 — Why Memory Became a First-Class Primitive | Four failure modes, three identities, three pairs of fundamental contradictions, capability boundaries |
| Architecture | Chapter 2 — Memory System Reference Architecture | Five-domain responsibility division, guarantee-strength layering, lifecycle loop |
| Architecture | Chapter 3 — Form and Maturity: L1–L4 Levels | The two axes of responsibility and verifiability, architecture and failure per level, upgrade signals |
| Build | Chapter 4 — Writing: Extraction, Typing, and Conflict Resolution | Single-pass ADD-only, dual time axis, six conflict classes and four operations, multimodal without discard |
| Build | Chapter 5 — Storage: Tiering, Scope, and Lossless Compression | Physical isolation, the SQLite boundary, hot / warm / cold tiers, AIC compression |
| Build | Chapter 6 — Retrieval: Multi-Signal Fusion and Budget Control | Five signal channels, relevance floor, progressive disclosure, budget awareness |
| Build | Chapter 7 — Integration: MCP, API, and Framework Adaptation | Design trade-offs of a 55-tool surface, REST routes, component ecosystem, switching cost |
| Operations | Chapter 8 — Deployment Forms: The Real Boundary of Local-First | Four consequences and costs of zero dependencies, four deployment forms, self-hosting and SaaS |
| Operations | Chapter 9 — State Recovery, Asynchrony, and Consistency | Synchronous and asynchronous writes, the flush barrier, idempotency and recovery drills |
| Operations | Chapter 10 — Scope Governance for Multi-User and Multi-Agent | Four-dimensional scope, physical and logical isolation, unsolved problems of shared memory |
| Operations | Chapter 11 — Operations at Scale: Cost, Latency, and Capacity | Four cost structures, capacity estimation, operational metrics |
| Governance | Chapter 12 — Auditability: Hash Chains, Provenance, and Evidence Chains | Hash chain implementation, audit coverage, pointer-chain backtracking, proof boundaries |
| Governance | Chapter 13 — The Four Layers of Deletion and Forgetting Semantics | Four-layer deletion, dry_run, mask trade-offs, the difficulty of verifiable deletion |
| Governance | Chapter 14 — Pre-Write Safety: Notary, Injection, and Credential Protection | Three pre-write checks, sensitivity grading, memory poisoning |
| Governance | Chapter 15 — Compliance and Data Sovereignty | Data residency, export and migration, isolation, pricing and tier gate boundaries |
| Tuning | Chapter 16 — Benchmarks: A Reproducible Methodology | Three levels of credibility, five elements of a benchmark, three red lines, honest disclosure |
| Tuning | Chapter 17 — Benchmark Disputes and Evaluation Traps | Why comparisons fail, what a 30% drop means, five common traps |
| Tuning | Chapter 18 — Memory Quality Metrics and the Badcase Loop | Six quality dimensions, recall health, honest measurement, the four-step loop |
| Tuning | Chapter 19 — Controlled Self-Evolution: From Storage to Experience | The three-stage framework, experience preconditions, negative transfer, backflow constraints |
| Practice | Chapter 20 — In-Depth Comparison of First-Tier Systems | Positioning, capability matrix, paradigm convergence, retrieval-granularity routes |
| Practice | Chapter 21 — Selection Decisions and Migration Paths | Five upfront questions, decision tree, three migration paths, acceptance checklist |
| Practice | Chapter 22 — Typical Scenario Practice | Constraints, design, failure points, and acceptance for five scenario classes |
| Outlook | Chapter 23 — Unsolved Problems and the 2027 Roadmap | Five unsolved problems, roadmap table, action recommendations for five roles |

## 5. Recommended Reading Paths

- **A first systematic look at AI memory**: Technical observations → Chapter 1 → Chapter 2 → Chapters 4–6 → Chapter 20
- **Currently putting memory into production**: Chapters 8–11 → Chapters 12–14 → Chapters 16–18
- **Responsible for selection or project initiation**: Technical observations → Chapter 1 → Chapter 3 → Chapters 20–21 → Chapter 23
- **Responsible for compliance and audit**: Chapters 12–15 → Chapter 18 → Chapter 22, Section 4
- **Following the frontier and research directions**: Chapter 1 → Chapters 16–19 → Chapter 23

## 6. About the Data and Facts in This Book

This book handles facts according to three rules; readers should judge credibility accordingly.

**First, every number carries its measurement basis and its date.** Benchmark scores state the dataset version, the judge type, and whether the run was complete; prices state the currency and the effective date; papers state their arXiv identifiers. Numbers without a stated basis do not appear.

**Second, unverifiable claims are deleted rather than softened.** This book does not write judgments such as "it is said" or "the industry generally believes," which cannot be traced to a source. The few items that must be mentioned but lack sufficient evidence are explicitly marked as "not documented in public materials as of October 2026."

**Third, the same cautious standard applies to our own implementation as to competitors.** The book's description of Mnemosyne OS likewise states boundaries and costs, including the fact that its benchmark scores have not yet been independently recomputed by a single complete run inside the repository (see Chapter 16). Descriptions of competitors state only their boundaries, never their weaknesses.

If a reader finds any number that conflicts with the stated basis in this handbook, the original source should prevail. Appendix B gives entry points to all reproducible resources.

## 7. Next Steps

This handbook will be maintained through continuous revision, not sealed after its first release. The coming priorities include:

- **Completing the full recomputation of benchmarks**: advancing the currently skeleton-only benchmark repository to a state where any third party can recompute the headline score with a single command, and publishing a machine-readable record of every run.
- **Extending Chinese and non-English scenarios**: existing mainstream benchmarks are English-centric; Chinese proper nouns, temporal expressions, and near-synonymous expressions degrade markedly under pure embedding recall, requiring independent controlled experiments and datasets.
- **Deepening the verifiability of deletion**: attempting to define a deletion-audit format exchangeable across systems, so that "thoroughly erased" moves from a verbal promise to a verifiable fact.
- **Adding a permission model for cross-Agent sharing**: designing "shared read" and "shared write" separately, solving read-side consistency first and only then discussing write-side arbitration.
- **Tracking changes in product form**: the boundary of memory systems is merging with the runtime, the context layer, and the Skill system, requiring continuous correction of judgments that no longer apply.

Corrections of factual errors, conceptual ambiguities, and topics needing coverage are welcome via Issue or Pull Request. Where enterprise data and internal systems are involved, please complete the necessary sanitization and permission confirmation first.

---
