# Chapter 21 — Selection Decisions and Migration Paths

In June 2026 a team doing medical device after-sales selected a hosted memory platform. The reasoning was sound: fast to launch, no operations burden, pay as you go. Ten months later they received a compliance audit requirement from their customer — every derived conclusion touching patient device-usage records had to be provably and thoroughly deleted, with evidence of the moment of deletion. The platform offered operation logs but not integrity proof. When the team exported the logs to the auditor, the auditor asked one question: "how do you prove the logs themselves were not altered?" The meeting room went quiet for half a minute.

This was not choosing the wrong product. It was failing to ask one question early enough. That platform does what it positions itself to do very well; it simply does not promise "verifiable deletion evidence". The team compared latency, price, and recall quality during selection, but did not compare "will we be asked to produce evidence three years from now". The difficulty of selection is not information but order: comparing capabilities first and asking about constraints later almost guarantees rework; asking about constraints first and comparing capabilities later eliminates most of the field. This chapter follows that order — 21.1 gives five questions that must be answered first, 21.2 compresses them into a decision tree, 21.3 explains why some choices are harder to undo than others, 21.4 to 21.6 give three migration paths in ascending order of change magnitude, and 21.7 gives an acceptance checklist: migration success is not judged by "it runs".

Terminology: "migration" here means moving the memory layer from A to B while retaining existing data and caller code; it does not include replacing the model, the vector store, or the orchestration framework.

## 21.1 Five questions that must be answered before selection

What these five have in common is that the cost of a wrong answer does not show up at launch. It shows up two years later, in an audit, a scale-up, or a team handover.

| Question | If yes | If no |
| --- | --- | --- |
| Is data sovereignty a hard constraint? | Only the self-hosted route remains | Hosted options may enter the candidate set |
| Does the team have operations capability? | Self-hosting is feasible | Hosted or zero-dependency options |
| Must memory be shared across agents? | A permission model is needed above the engine | Physical isolation suffices |
| Is verifiable deletion evidence required? | A hash chain is mandatory | Operation logs suffice |
| Is the Chinese share high? | Tokenization must be measured | Default tokenization usually suffices |

Table 21-1 — How the five prerequisite questions narrow the candidate set

**Question one: is data sovereignty a hard constraint?** The test is not "we care about data security" but "can the data leave the network we control". Medical, financial, government, and some manufacturing customers write this into contracts, and once it is written in, the entire hosted route is out — and the comparison dimension shifts from "how many features" to "how complete can self-hosting be". A wrong answer here is the most expensive, because it is non-negotiable.

**Question two: does the team have operations capability?** The real cost of self-hosting is not installing a service but maintaining a graph database, backups, upgrades, and failure recovery over the long term. A team with DBAs and SREs can carry it; a three-person product team cannot. Resist a common optimism: treating "it ran" during the PoC as proof of operations capability.

**Question three: does memory need to be shared across agents?** Physical isolation (one SQLite file per scope combination) naturally supports "not sharing", but the moment two agents must read the same memory, a permission model has to be built above the engine. The answer to this question determines whether the unsolved problem from Chapter 23 lands on your desk.

**Question four: is verifiable deletion evidence required?** Distinguish two requirements: "deletion took effect" and "deletion can be proven to have occurred and cannot be denied". The former is satisfied by operation logs; the latter needs a hash-chained audit ledger. Most teams believe they need only the former, until the first audit asks.

**Question five: is the Chinese share high?** If memory content is predominantly Chinese and queries contain model numbers, person names, or proper nouns, pure embedding recall will miss, and the tokenization and keyword channels must be measured. The verification cost here is very low, so there is no excuse for skipping it.

## 21.2 The decision tree

Compressing the five questions into a tree can cut the candidate set from six to two within half an hour. The tree does not aim for completeness; it aims to eliminate the obviously unsuitable first.

```text
Q0 Is data sovereignty a hard constraint?
├─ Yes → self-hosted only
│   ├─ Do you have graph-database operations capability?
│   │   ├─ Yes → Zep route (Graphiti self-built) or Mnemosyne self-hosted
│   │   └─ No  → Mnemosyne self-hosted (single-file SQLite, zero-dependency startup)
│   ├─ Do you need a zero-dependency quick validation (offline / no key / no model)?
│   │   └─ Yes → Mnemosyne (built-in rules extractor and 128-dim embedder)
│   └─ Already in the LangGraph ecosystem and only need an SDK?
│       └─ Yes → LangMem plus your own persistent store
└─ No → hosted is acceptable
    ├─ Do you need conversational personalization live fast?
    │   └─ Yes → Mem0 (platform, Free or Custom)
    ├─ Do you need cross-system context governance with temporal graphs?
    │   └─ Yes → Zep (managed cloud or BYOC)
    ├─ Does the agent manage its own memory, with memory as part of the runtime?
    │   └─ Yes → Letta
    ├─ Are you already in the Workers ecosystem?
    │   └─ Yes → Cloudflare Agents
    └─ Mixed: shared reads self-hosted, shared writes hosted
        └─ Mnemosyne self-hosted plus a hosted layer for cross-team sharing
```

The tree's value is that it forces the sovereignty question to the top. Most selection processes put it in the middle, where it competes with feature comparisons and loses.

## 21.3 Why some choices are harder to undo than others

Not all selections carry the same reversibility.

**Data sovereignty decisions are effectively irreversible in one direction.** Moving from self-hosted to hosted is a business decision with a migration cost. Moving from hosted back to self-hosted requires re-architecting the storage layer, re-establishing operational capability, and — critically — proving to the customer that the data that left is now back and that the copies are gone. That last part is often impossible to prove.

**Data model dependencies are hard to undo.** Once the layer above depends directly on a vendor's data model, switching means rewriting that layer. The middleware metaphor promises replaceability, but replaceability survives only while the abstraction boundary is respected.

**Audit capability is hard to retrofit.** Adding a hash chain to an existing store requires backfilling the chain over historical records, which is either impossible (the history is gone) or expensive (a full rewrite).

The practical implication: when sovereignty is uncertain, start self-hosted. The cost of starting self-hosted and later moving to hosted is lower than the reverse.

## 21.4 Migration path one: from Mem0

The change magnitude is small, because the interface surfaces overlap substantially.

Mnemosyne exposes eleven client-compatible tools that reuse conventional agent-memory names — `add_memory`, `search_memories`, `get_memories`, `get_memory`, `update_memory`, `delete_memory`, `delete_all_memories`, `delete_entities`, `list_entities`, `list_events`, `get_event_status` — and the `Memory` class accepts the conventional `add(messages, user_id=...)` call shape. For most code, changing the import is enough.

**One migration rationale that is now obsolete.** Earlier documentation often said "Mem0's two-stage ADD/UPDATE/DELETE pipeline makes migration difficult". That is no longer true: Mem0 now also uses single-pass ADD-only extraction. The real differences are three:

| Difference | What to check |
| --- | --- |
| `update_memory` semantics | Whether your code relies on in-place update rather than append-and-supersede |
| Graph memory ownership | Mem0's open-source build removed graph capability (no queryable graph, no `relations` field); graph memory is a platform feature. Mnemosyne builds entity linking into the same SQLite file |
| Audit capability | Whether you need a hash chain that names the altered record |

Table 21-2 — The three real differences when migrating from Mem0

## 21.5 Migration path two: from Zep

The change magnitude is medium.

Zep's `search_graph` returns an assembled context block, with `scope` controlling whether you get observations, thread summaries, episodes, nodes, or edges. Mnemosyne returns structured memory entries. If your downstream code consumes the text block directly, you need an assembly layer.

The work is not large but it is not zero: someone has to decide how to turn structured entries into the prompt, and that decision was previously made inside the vendor's scope parameter.

## 21.6 Migration path three: from Letta

The change magnitude is the largest, because the architectural position differs fundamentally.

Letta's memory lives inside the agent runtime. MemFS is a git-versioned memory filesystem that belongs to the agent and is projected onto the machine where the agent runs; the agent reads and edits it with ordinary file tools. There is no default vector index — the agent finds memory with normal file search. Shared memory refers to a git repository owned by the organization, and shared memory repositories require cloud-hosted agents.

Migrating means moving from "the agent edits its own memory files" to "the agent calls an external service". The agent loop must be restructured, and any behaviour that depended on the model seeing its memory as part of its own state must be re-expressed as tool calls.

This is not a criticism of Letta; it is a different architectural bet, and the migration cost is the price of changing bets.

## 21.7 Acceptance checklist for migration

Five items, all of which must pass.

**Tool-name compatibility test.** Run your existing call sites against the new backend and confirm every tool name resolves. Failures here are cheap to find and cheap to fix; discovering them in production is neither.

**Recall quality A/B.** Run the same 100 queries against both backends with ground truth, and compare hit@k and MRR. A drop of more than a few points means something in the retrieval pipeline does not map cleanly.

**Deletion semantics regression.** Delete a memory with dependencies and verify that derived conclusions, caches, and summaries are all handled. Do this before migration, not after.

**Audit chain availability.** Run `verify_integrity()` and confirm it returns a usable result with a non-zero total. An empty chain that reports `valid: true` is technically correct and practically useless.

**Rollback plan.** Confirm you can go back. If the new backend is already receiving writes, going back means reconciling two divergent stores, which is far more expensive than the initial migration.

## 21.8 Chapter Summary

This chapter establishes three judgments.

**First, selection order matters more than selection criteria.** Asking about constraints first and comparing capabilities later eliminates most of the field cheaply; comparing capabilities first and discovering constraints later almost guarantees rework. The sovereignty question belongs at the top of the tree, not in the middle.

**Second, choices differ in reversibility.** Sovereignty decisions are effectively irreversible in one direction; data model dependencies are hard to undo; audit capability is hard to retrofit. When sovereignty is uncertain, starting self-hosted is the safer default because the cost of moving self-hosted to hosted is lower than the reverse.

**Third, migration cost is not proportional to feature gap but to architectural position.** Moving from Mem0 is mostly an import change; moving from Zep needs an assembly layer; moving from Letta requires restructuring the agent loop, because the memory lives in a different place relative to the agent.

The next chapter takes these decisions down to the level of concrete scenarios, where the question is no longer "which system" but "what does this system need to do in this business, and what will break first".
