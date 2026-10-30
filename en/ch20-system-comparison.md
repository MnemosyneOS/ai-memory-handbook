# Chapter 20 — Comparing the First Tier

In September 2026 a team building a support agent received three PoC conclusions: one said graph memory was better on multi-hop questions, one said a hosted service would save two person-months of operations work, and one said a zero-dependency local library could fit inside the customer's air-gapped environment. None of the three was wrong, but together they could not produce a decision — they were not measuring the same thing.

The deadlock was not a shortage of information but a lack of a common dimension of comparison. Every vendor's documentation answered "what am I good at"; none answered "where do I rank on the same ruler".

This chapter sets up that ruler. 20.1 and 20.2 give positioning and a ten-dimension snapshot, stating facts only. The real divergence lies in 20.3 and 20.4: write paradigm and retrieval granularity determine the direction of every subsequent selection judgment. 20.5 and 20.6 address the two dimensions most easily obscured by marketing language. 20.7 explains how to read the matrix.

Terminology: the Model Context Protocol is written MCP throughout. "Public documentation" means official documentation and repository READMEs accessible as of October 2026; anything that could not be verified is marked as "no statement found" rather than taken as evidence of a missing capability.

## 20.1 Six metaphors, six boundaries

Each of the six systems introduces itself in one sentence, but that sentence is marketing language. More informative is the underlying metaphor: it determines what the system treats as the core problem, and it determines when the system fails.

| System | Core metaphor | One-line positioning | Best suited for |
| --- | --- | --- | --- |
| Mnemosyne OS | A filing cabinet with its own ledger | Zero-dependency, local-first memory server | Offline and sovereignty-sensitive teams |
| Mem0 | Replaceable memory middleware | A memory layer in three forms | Getting conversational personalization live quickly |
| Zep + Graphiti | A governed temporal graph | Unified context layer plus graph-building framework | Cross-system context governance |
| Letta | An agent that tidies its own desk | Stateful agent runtime | Agents managing their own memory |
| LangMem | A side-effect-free state transformation | Memory SDK for the LangChain ecosystem | Teams already deep in LangGraph |
| CF Agents | A sticky-note wall next to the runtime | Durable agent runtime | Teams already in the Workers ecosystem |

Table 20-1 — Core metaphors and applicable boundaries of the six systems (as of October 2026)

The metaphor also predicts the failure point. A filing cabinet means retrieval is a search inside the cabinet, and the failure point is recall precision rather than capacity. Middleware means replaceability comes first, and the failure point is that switching cost is underestimated: once the data model is depended on directly by the layer above, it is no longer replaceable. A temporal graph means correctness outranks latency, and the failure point is that graph-building cost grows with ontology complexity rather than data volume. An agent that tidies its own desk means memory is a by-product of behaviour, and the failure point is that memory quality is coupled to agent behaviour and hard to attribute separately. A state-transformation function means persistence is pushed to the caller, and `InMemoryStore` loses everything on restart. A sticky-note wall means memory sticks to the execution environment, and the failure point is platform lock-in.

## 20.2 The ten-dimension capability matrix (October 2026 snapshot)

This table answers: putting the six systems on the same set of engineering dimensions, where does each one's support level fall? ✅ native support; ⚠️ requires additional configuration or has known limitations; ❌ not supported or must be built yourself.

| Dimension | Mnemosyne | Mem0 | Zep+Graphiti | Letta | LangMem | CF Agents |
| --- | --- | --- | --- | --- | --- | --- |
| Single-pass append-only write | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ |
| Zero-dependency startup | ✅ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ |
| Full functionality when self-hosted | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ |
| Time-aware retrieval | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Multi-signal fusion | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Auditable integrity | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Cascade delete | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Chinese retrieval optimization | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| MCP tool surface | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Reproducible benchmark scripts | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

Table 20-2 — The ten-dimension capability matrix of the six systems (as of October 2026)

The ⚠️ marks fall into two classes, and conflating them leads to wrong conclusions.

**Class one: requires configuration.** The capability exists but is off by default or needs an integration. Mem0's memory decay is of this class — available on the platform, opt-in, off by default.

**Class two: not found in public documentation.** This book could not confirm the capability from accessible material. It does not mean the capability is absent; it means the claim is unverified, and procurement should ask the vendor directly rather than assume.

Treating class two as class one produces an unjustified downgrade; treating class one as class two produces an unjustified upgrade. Both distort the matrix.

## 20.3 The convergence of write paradigms

### 20.3.1 What the two-stage pipeline solved

The earlier paradigm was two-stage: when a new fact arrives, first retrieve similar existing memories, then have the model adjudicate among ADD, UPDATE, DELETE, and NOOP. It solved a real problem — keeping one authoritative state per entity, so that the store never contains contradictory versions.

The cost was that every write required a second model call, and more importantly that the update path could destroy a true fact. A wrong adjudication does not merely add noise; it overwrites.

### 20.3.2 What changed in 2026

In 2026 Mem0 moved to **single-pass ADD-only extraction**: one LLM call that only appends, with no UPDATE or DELETE stage. The official migration guide states it plainly, and the `add()` return value changed from `ADD`/`UPDATE`/`DELETE` to `ADD` only. Mnemosyne has been single-pass ADD-only since its first version.

Both systems now sit on the same paradigm. This is not a coincidence but a result of constraint convergence: once the volume of memory is large enough and writes frequent enough, the cost of two-stage adjudication exceeds the benefit of state uniqueness, while overwrite-style updates lose evidence.

### 20.3.3 What this means for selection

The convergence has a direct consequence: **"append-only" is no longer a differentiator**. It has become the industry floor, which is good news — it means a design principle has been validated — and bad news for anyone whose pitch rests on it.

The differentiation has moved to what happens after the write:

| Question | Where the difference now lies |
| --- | --- |
| Who adjudicates old versus new facts? | Mem0 handles supersession on the platform via Dream; the open-source build does not. Mnemosyne defers it to on-demand `conflict_resolve` |
| How is derivation invalidation handled on delete? | Depends on whether derivation relationships are recorded at write time |
| How is the audit trail made locatable? | Only a hash chain names the specific altered record |
| How does cost scale? | Depends on candidate pool, reranker use, and tiering policy |

Table 20-3 — Where differentiation now lies, given a converged write paradigm

The honest reading is that the same paradigm with different completion mechanisms produces very different maturity. That is a more useful comparison than "we are also append-only".

## 20.4 Two routes to controlling retrieval granularity

Both systems solve the same problem — controlling injection cost — but with different mechanisms and different costs.

### 20.4.1 Zep: explicit semantic granularity

Zep's Context MCP Server exposes twelve tools, six for the user's own graph and six for shared context graphs, plus a `zep://graphs/directory` resource. The key design is that `search_graph` takes a `scope` parameter with values `auto`, `observations`, `thread_summaries`, `episodes`, `nodes`, and `edges`.

This makes "do I want durable facts, a conversation summary, or raw fragments" an explicit parameter. The caller decides, and pays the cost of understanding the semantic hierarchy.

### 20.4.2 Mnemosyne: two-step disclosure

Mnemosyne uses `recall_catalog` to return a directory — title, a one-line summary, and the expansion cost — and `expand_memory` to expand one or two entries. The decision of "should I expand" is made in two steps rather than declared up front.

The advantage is that the caller need not understand the semantic hierarchy; the cost is an extra round trip, which is unattractive in latency-sensitive paths.

### 20.4.3 The trade-off in one table

| Aspect | Zep's explicit scope | Mnemosyne's two-step disclosure |
| --- | --- | --- |
| Who decides granularity | The caller, at query time | The caller, after seeing the directory |
| Round trips | One | Two |
| Knowledge required | Understand the semantic hierarchy | Understand only the query |
| Best for | Callers with a fixed context-assembly strategy | Callers optimizing per-query cost |

Table 20-4 — Two routes to controlling retrieval granularity

Neither is better in general. A system that always assembles context the same way prefers explicit scope; a system whose context needs vary per query prefers disclosure.

## 20.5 Audit and governance

Only Mnemosyne makes a SHA-256 hash chain a product capability: `verify_integrity()` returns `{valid, total, first_broken_at}`, naming the specific altered record rather than merely reporting a mismatch. The rest provide operational logs or observability tooling.

The cost must be stated: a hash chain imposes write serialization and verification overhead, and the longer the chain the slower verification becomes. For a write-heavy system this is a real throughput ceiling, not a rounding error.

## 20.6 Deployment forms and pricing structure

| System | Forms | Notable boundary |
| --- | --- | --- |
| Mnemosyne OS | Library, CLI, single-process REST, MCP server, hosted SaaS | Open-source build and SaaS share the same engine; no feature paywall |
| Mem0 | Library, self-hosted server, hosted platform | Free and Custom tiers only; graph memory, profiles, Dream, SSO and audit logs are platform features |
| Zep | Managed cloud, BYOC | Community Edition deprecated; custom OIDC requires Enterprise; MCP billed per seat |
| Letta | npm package, Letta Cloud | Memory lives inside the agent runtime (MemFS); shared memory repositories require cloud-hosted agents |
| LangMem | Python SDK | Persistence delegated to a LangGraph `BaseStore` |
| Cloudflare Agents | Workers runtime | Session API still experimental; retrieval implementation is entirely up to the developer |

Table 20-5 — Deployment forms and notable boundaries

## 20.7 How to read the matrix

Four rules.

**Rule one: no system leads on every dimension.** The matrix is a tool for locating trade-offs, not a scoreboard. A system that appears weaker on four dimensions may be the only viable option under a hard constraint.

**Rule two: a ⚠️ is not a ❌.** Ask the vendor which class it is. Many ⚠️ marks are configuration away from becoming ✅.

**Rule three: the dimensions that matter most are the ones your scenario cannot compromise on.** For an air-gapped deployment, zero-dependency startup is not one dimension among ten; it is a gate that eliminates most of the field before the comparison begins.

**Rule four: the matrix ages quickly.** Everything here is as of October 2026. Capability surfaces in this field change within months, and a comparison table older than a year should be treated as historical.

The competitive focus in 2026 is no longer "can it remember". It is whether what is remembered can be trusted, explained, and safely forgotten. The matrix should be read with that in mind.

## 20.8 Chapter Summary

This chapter establishes three judgments.

**First, write paradigms have converged.** Single-pass ADD-only is now the industry floor, adopted independently by the main implementations. It is no longer a differentiator, and any selection argument resting on it is outdated.

**Second, differentiation has moved to completion mechanisms.** Who adjudicates old versus new facts, whether derivation relationships are recorded for cascade delete, whether audit can name the altered record, and how cost scales — these are the questions that now separate systems, not the write paradigm.

**Third, retrieval granularity control splits into two routes with different costs.** Explicit semantic scope requires the caller to understand the hierarchy but needs one round trip; two-step disclosure requires less knowledge but costs an extra round trip. Neither dominates.

This chapter deliberately gives no recommendation. The next chapter turns the matrix into a decision: given a specific scenario, which system, and what does moving to it cost?
