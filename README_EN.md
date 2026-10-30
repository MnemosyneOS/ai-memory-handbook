# AI Memory Handbook

[中文](./README.md) | English

## Author · Hu Jingkun (胡景堃)

> *AI Memory Handbook* was initiated and led by **Hu Jingkun**, who is responsible for the overall architecture of the book, the chapter system, the methodology framework, and the writing of the main chapters.
>
> Copyright © 2026 Hu Jingkun (胡景堃). Licensed under CC BY-NC-ND 4.0. **Unauthorized dissemination, reproduction, reprinting, adaptation, or commercial use is prohibited.**

We welcome universities and educational institutions worldwide to co-build the *Enterprise AI Memory* curriculum with us. If you are interested, please add our WeChat ID (**Mnemosyne-OS**) and mention "co-build" in your message.

This open-source project covers the full lifecycle of AI memory systems — architecture, build, run, governance, and optimization — and distils the practical experience, lessons, and hard-won trade-offs from Mnemosyne OS, enterprise customers, and open-source developers who have put enterprise AI memory into production. New practices are added weekly, and published chapters are revised on a rolling basis. If this project helps even a little with individual learning or enterprise adoption of AI memory, that will be our greatest honour.

To all our peers building AI memory: this is for you.

[Read online](https://ai-memory.net/ai-memory-handbook/) · [Full contents](https://ai-memory.net/ai-memory-handbook/contents) · [Reading guide](https://ai-memory.net/ai-memory-handbook/reading-guide)

The reading site provides chapter navigation, Chinese search, image zoom, light/dark themes, and reading-position memory. For local preview, use Node.js 22 and run `npm ci` then `npm run dev`. Site maintenance and GitHub Pages publishing are documented in [WEBSITE.md](https://github.com/MnemosyneOS/ai-memory-handbook/blob/main/WEBSITE.md).

---

## Author

**Hu Jingkun (胡景堃)**

Initiated and led by Hu Jingkun, including the overall architecture of the book, the chapter system, the methodology framework, and the writing of the main chapters.

Thanks to the university experts and scholars, AI memory developers, and community volunteers at home and abroad who participated in co-creation.

---

## 1. Background and Structure

In 2025 we published the first version of Mnemosyne OS — a systematic attempt at answering one question: *how does an AI agent remember a user over the long run?* That work spanned a local-first storage engine, a zero-dependency deployment model, an auditable memory ledger, and lossless compression. But as memory moved from an accessory feature to a first-class primitive, we observed that market attention had shifted from "can it remember" to three new challenges:

*   **Engineering challenge**: from "it recalls" to "it recalls trustworthily" — memory must be able to carry critical tasks.

*   **Scale challenge**: stability, security, performance, cost — from a single-machine experiment to memory infrastructure that can be deployed at scale.

*   **Governance challenge**: from "remembering" to "explainable, refutable, and truly forgettable" — memory must be able to enter core business processes and compliance regimes.

Our earlier technical documentation clearly could not meet these new demands.

So we restructured the whitepaper. We want content that keeps pace with the field, a higher proportion of hands-on practice, and more community-driven collaboration — to serve as a reference for enterprise technology selection and internal project approval, and to maintain this whitepaper openly over the long term, continuously presenting frontier thinking and real-world practice in AI memory architecture.

## 2. Audience and Takeaways

This whitepaper is aimed at building and landing enterprise-grade AI memory systems. It suits engineers working on memory systems, and equally suits internal technology selection, architecture review, project approval, and cross-team consensus building.

| Reader | Suggested focus | What you will gain |
| --- | --- | --- |
| Agent / AI application developers | Build, Run, Optimization | Single-pass writes, conflict resolution, multi-signal retrieval, progressive disclosure, MCP integration. |
| Architects and platform engineers | Architecture, Run, Governance | A complete view from storage engine to governance foundation, and a scalable memory infrastructure design. |
| Tech leads and engineering managers | Architecture, Governance, Practice | Judging maturity, selection boundaries, investment boundaries, and production risk to support approval and procurement. |
| Product and business owners | Survey, Architecture, Practice | Understanding what different scenarios expect and fear from memory, and the product conditions for moving from "remembered" to "trusted". |
| Security, quality, and operations | Run, Governance, Optimization | Observability, hash-chained audit, cascade delete, pre-launch validation, continuous evaluation, and fault attribution. |
| Researchers and ecosystem contributors | Whole book and Practice | Front-line enterprise problems, engineering abstractions, and open questions — and a way to help improve the field's knowledge base. |

After reading the whole book you will be able to:

- judge which maturity level a scenario's memory requirement belongs to, and set investment boundaries accordingly;
- distinguish "best-effort" from "strong guarantee" mechanisms and avoid being misled by over-promising;
- design audit, deletion, and isolation schemes that can be verified by scripts rather than by process and manual review;
- read the methodology behind a benchmark score and know which numbers are comparable and which are not;
- build an improvement loop for a memory system from Trace to Badcase to controlled release.

## 3. Reading Guide

### Structure

| Part | Directory | Chapters | Focus |
| --- | --- | --- | --- |
| [2026 Technical Observations](./00-preface/2026记忆系统技术观察.md) | `00-preface/` | — | Observing 2026's convergence and capability gaps through publicly reproducible signals. |
| [Preface](./00-preface/00-preface.md) | `00-preface/` | — | Structure and background; why Mnemosyne OS is cited and how competitors are described. |
| [Reading guide](./00-preface/阅读导引.md) | `00-preface/` | — | Background, audience, structure, reading paths, and data-provenance rules. |
| [Architecture](./01-architecture/) | `01-architecture/` | Ch. 1–3 | Define the object, judge the form, choose maturity, establish the reference architecture. |
| [Build](./02-build/) | `02-build/` | Ch. 4–7 | Organize memory construction along four chains: write, store, retrieve, connect. |
| [Run](./03-run/) | `03-run/` | Ch. 8–11 | From single-machine stability to state recovery, multi-tenant isolation, and scale operations. |
| [Governance](./04-governance/) | `04-governance/` | Ch. 12–15 | Auditable operation, verifiable deletion, bounded writes, and evidentiary compliance. |
| [Optimization](./05-optimization/) | `05-optimization/` | Ch. 16–19 | A continuous improvement loop built on benchmarks and evaluation. |
| [Practice](./06-case-study/) | `06-case-study/` | Ch. 20–22 | System comparison, selection and migration, and five representative scenarios. |
| [Conclusion & Outlook](./07-conclusion/) | `07-conclusion/` | Ch. 23 | Five unsolved problems on the road from memory feature to memory infrastructure. |

### Chapter map

| Part | Chapter | Core content |
| --- | --- | --- |
| Architecture | [Ch. 1 — Why Memory Became a First-Class Primitive](./01-architecture/01-记忆为什么成为一等原语.md) | Four failure modes, three identities of memory, three fundamental tensions, capability boundaries. |
| Architecture | [Ch. 2 — A Reference Architecture for Memory Systems](./01-architecture/02-记忆系统参考架构.md) | Five responsibility domains, guarantee strength tiers, build and run planes, lifecycle loop. |
| Architecture | [Ch. 3 — Form and Maturity: L1–L4](./01-architecture/03-形态与成熟度-L1-L4分级.md) | Two-axis grading, per-level architecture and failure, autonomy as a parameter, upgrade signals. |
| Build | [Ch. 4 — Writing: Extraction, Typing, Conflict Resolution](./02-build/04-写入-抽取分型与冲突消解.md) | Single-pass ADD-only, dual time axis, typing system, six conflict kinds and four actions, never-drop multimodal. |
| Build | [Ch. 5 — Storage: Tiering, Scoping, Lossless Compression](./02-build/05-存储-分层作用域与无损压缩.md) | Physical isolation, SQLite boundaries, hot/warm/cold tiering, AIC compression, built-in graph memory. |
| Build | [Ch. 6 — Retrieval: Multi-Signal Fusion and Budget Control](./02-build/06-检索-多信号融合与预算控制.md) | Five signal paths, relevance floors, progressive disclosure, budget-aware degradation order. |
| Build | [Ch. 7 — Integration: MCP, API, and Framework Adapters](./02-build/07-接入-MCP-API与框架适配.md) | Designing a 55-entry tool surface, REST routes, component ecosystem, switching cost. |
| Run | [Ch. 8 — Deployment: What Local-First Really Means](./03-run/08-部署形态-本地优先的真实边界.md) | Four consequences and costs of zero dependencies, four deployment forms, self-host vs SaaS. |
| Run | [Ch. 9 — State Recovery, Asynchrony, and Consistency](./03-run/09-状态恢复异步与一致性.md) | Sync vs async writes, the flush barrier, events and idempotency, recovery drills. |
| Run | [Ch. 10 — Scoping for Multi-User and Multi-Agent](./03-run/10-多用户与多Agent的作用域治理.md) | Four-dimensional scopes, physical vs logical isolation, namespace pitfalls, the unsolved sharing problem. |
| Run | [Ch. 11 — Operating at Scale: Cost, Latency, Capacity](./03-run/11-规模化运营-成本延迟与容量.md) | Four cost structures, capacity estimation, cold/hot tiering, operational metrics. |
| Governance | [Ch. 12 — Auditability: Hash Chains, Provenance, Evidence](./04-governance/12-可审计性-哈希链来源追溯与证据链.md) | Hash-chain implementation, audit coverage, pointer-chain tracing, the three-part evidence set, proof boundaries. |
| Governance | [Ch. 13 — The Four Semantics of Deletion and Forgetting](./04-governance/13-删除与遗忘的四层语义.md) | Four deletion layers, dry-run previews, mask trade-offs, the verifiability problem. |
| Governance | [Ch. 14 — Pre-Write Safety: Notary, Injection, Credentials](./04-governance/14-写入前安全-公证注入与凭据防护.md) | Three pre-write checks, sensitivity grading, memory poisoning and three-layer defence. |
| Governance | [Ch. 15 — Compliance and Data Sovereignty](./04-governance/15-合规与数据主权.md) | Three residency models, export and migration, isolation, the evidence package. |
| Optimization | [Ch. 16 — Benchmarks: A Reproducible Methodology](./05-optimization/16-基准-可复现的方法学.md) | Three trust tiers, five benchmark essentials, three red lines, and our own reproducibility gap. |
| Optimization | [Ch. 17 — Benchmark Controversy and Evaluation Traps](./05-optimization/17-基准争议与评测陷阱.md) | Why scores are incomparable, what a 30% drop means, five common traps. |
| Optimization | [Ch. 18 — Quality Measurement and the Badcase Loop](./05-optimization/18-记忆质量度量与Badcase闭环.md) | Six quality dimensions, recall health, honest metrics, a four-step loop with an attribution table. |
| Optimization | [Ch. 19 — Controlled Self-Evolution: From Storage to Experience](./05-optimization/19-受控自进化-从存储到体验.md) | The three-stage framework, experience preconditions, negative transfer, reflow constraints. |
| Practice | [Ch. 20 — Comparing the First Tier](./06-case-study/20-第一梯队系统深度对照.md) | Positioning, capability matrix, write-paradigm convergence, two retrieval-granularity routes. |
| Practice | [Ch. 21 — Selection Decisions and Migration Paths](./06-case-study/21-选型决策与迁移路径.md) | Five prerequisite questions, a decision tree, three migration paths, an acceptance checklist. |
| Practice | [Ch. 22 — Representative Scenarios in Practice](./06-case-study/22-典型场景实践.md) | Five scenarios: constraints, memory design, failure points, scriptable acceptance metrics. |
| Conclusion | [Ch. 23 — Unsolved Problems and the 2027 Roadmap](./07-conclusion/23-未解问题与2027路线图.md) | Five unsolved problems, the 2027 roadmap, recommendations for five roles. |

### Reading paths

- **First systematic look at AI memory**: Technical Observations → Ch. 1–2 → Ch. 4–6 → Ch. 20.
- **Putting memory into production**: Ch. 8–11 → Ch. 12–14 → Ch. 16–18.
- **Building a multi-agent system**: Ch. 4–7 → Ch. 10 → Ch. 19.
- **Owning evaluation and continuous improvement**: Ch. 16 → Ch. 18 → the matching scenario in Practice.
- **Owning selection or project approval**: Technical Observations → Ch. 1 → Ch. 3 → Ch. 20–21 → Ch. 23.

## 4. Roadmap

The whitepaper will be maintained as an open project rather than sealed after its first release. Priorities:

- **Complete the benchmark reproduction**: take the current benchmark skeleton to the point where any third party can recompute the headline scores with one command, and publish the machine-readable record of every run.
- **Expand enterprise case studies**: add more first-line cases from engineering, operations, support, data, security, finance, and industry settings, covering success paths, architectural trade-offs, and real failure modes.
- **Extend Chinese and non-English scenarios**: mainstream benchmarks are English-centric; Chinese proper nouns, time expressions, and synonyms degrade noticeably under pure embedding recall and need dedicated comparative experiments and datasets.
- **Deepen deletion verifiability**: attempt a cross-system exchangeable format for deletion audit, so that "thoroughly erased" becomes a verifiable fact rather than a verbal commitment.
- **Add a permission model for cross-agent sharing**: separate shared reads from shared writes, solve read-side consistency first, then discuss write-side arbitration.
- **Follow the technology**: keep absorbing advances in memory tiering, context engineering, runtime, and multi-agent governance, and promptly correct judgments that no longer hold.
- **Build community mechanisms**: improve content conventions, case templates, glossary, review process, and release practice to lower the barrier to high-quality contribution.

### Contributing

Developers, architects, researchers, enterprise teams, and product practitioners are all welcome. You can:

- open an Issue to report factual errors, conceptual ambiguity, broken links, or missing topics;
- open a Pull Request to improve chapters, correct content, refine diagrams, or add references;
- share desensitized enterprise practice, incident reviews, evaluation methods, and architectural trade-offs;
- provide reproducible code, hands-on walkthroughs, datasets, or experiment designs;
- participate in terminology unification, technical review, case review, and translation.

Contributions must respect originality and licensing boundaries. Where enterprise data, customer information, internal systems, or security details are involved, complete the necessary desensitization and permission confirmation first.

## 5. On Data and Facts

The book follows three rules about facts. Readers should use them to judge credibility.

**First, every number carries its scope and date.** Benchmark scores state the dataset version, judge type, and whether the run was complete; prices state currency and effective date; papers state their arXiv identifier. Numbers without a stated scope do not appear.

**Second, unverifiable claims are deleted rather than softened.** The book does not write "it is said" or "the industry generally believes". Where something must be mentioned but evidence is thin, it is written explicitly as "as of October 2026, no statement of X was found in the public documentation".

**Third, the same standard applies to our own implementation and to competitors.** Descriptions of Mnemosyne OS likewise state boundaries and costs, including the fact that its published benchmark scores have not yet been independently recomputed by a complete in-repository run (see Chapter 16). Competitor descriptions state boundaries, not weaknesses.

If you find any number that does not match its stated scope, the original source prevails. Appendix B lists every reproducible resource.

## 6. Links

| Resource | URL |
| --- | --- |
| Mnemosyne OS website | https://ai-memory.net |
| This book, online | https://ai-memory.net/ai-memory-handbook/ |
| Mnemosyne OS source | https://github.com/MnemosyneOS/mnemosyne |
| Reproducible benchmark | https://github.com/MnemosyneOS/mnemosyne-bench |
| PyPI package | https://pypi.org/project/mnemosyne-os/ |
| Documentation site | https://docs.mnemosyne-os.io |
| Machine-readable fact card (for AI assistants) | https://ai-memory.net/llms.txt |

## 7. Contributors

Thanks to everyone who contributed to architecture design, chapter writing, case curation, and content review.

| Area | Contributor |
| --- | --- |
| Initiation, overall architecture, methodology framework, main chapters | Hu Jingkun |
| Co-creation | Thanks to the university experts and scholars, AI memory developers, and community volunteers at home and abroad who participated in co-creation |

### External contributors

The project remains open to community contribution. Developers, architects, researchers, enterprise teams, and product practitioners are welcome to take part via Issue or Pull Request; accepted contributions will be added to this section.

---

## Copyright

Copyright © 2026 Hu Jingkun (胡景堃). All rights reserved.

This book is released under **CC BY-NC-ND 4.0** (Attribution–NonCommercial–NoDerivatives 4.0 International).

**You may** copy and redistribute the complete, unmodified content for non-commercial purposes such as learning, teaching, and research, provided the author attribution and a link to the original are retained.

**You may not** use this content for any commercial purpose; distribute a modified or adapted version; or remove or alter the author attribution and copyright notice.

**Without prior written authorization from the copyright holder, any form of dissemination, reproduction, reprinting, excerpting, adaptation, or commercial use is prohibited.** This includes, but is not limited to: commercial training, paid courses, paid communities, publications, commercial consulting deliverables, and any form of redistribution.

For commercial licensing, curriculum co-building, translation rights, or media collaboration, contact WeChat **Mnemosyne-OS**.

---

If this whitepaper helps you better understand, build, run, govern, and optimize AI memory systems, you are welcome to share it, discuss it, and join the co-building.
