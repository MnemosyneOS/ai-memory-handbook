# Chapter 7 — Integration: MCP, API, and Framework Adapters

In May 2026, a company doing legal document review integrated the memory layer into its Agent. The first version used only three tools: write, retrieve, delete. After two months of operation, the effect plateaued at "can remember client preferences" — nobody resolved conflicts, nobody generated summaries, nobody looked at audits. It was not that the capabilities were unusable; they ranked in the twenties on the tool list, and the team only read the first few.

Another company did the opposite: it wrote a mapping table against the list, assigning every tool to a step in its process, and discovered that what was missing was not tools but process — their Agent had never had a "conversation ended" event, so the summary tool had no trigger point. Integration is not a wiring question: the width of the tool surface, the authentication method, and the depth of adaptation in turn determine what kind of code the caller writes.

## 7.1 Two Strategies for the MCP Tool Surface

### 7.1.1 Compatibility First versus Native Depth

The first-layer contract an MCP (Model Context Protocol) server presents is tool names, which determine whether a client can directly reuse existing prompts and processes. Mnemosyne OS's `tools/list` returns **55** entries, of which **44 are native tools** and **11 are client-compatible tools**. The difference between 55 and 44+11 is not an arithmetic error — 3 of them are deprecated aliases retained for old clients (`memory/export-v1`, `memory/import-v1`, `memory/claim`), which point at the same handlers as the underscore versions. The reason the aliases exist is concrete: some MCP clients reject tool names containing `/`. **The number of distinct capabilities after deduplication is 52.**

Three numbers are often conflated: 55 is the entry count, 52 the capability count, 3 the alias count. Using 52 to describe capabilities and 55 to describe entries are both correct; using 55 to describe capabilities overcounts by three.

### 7.1.2 The Cost of Each Strategy

The benefit of compatibility first is migration cost: the 11 compatible tools reuse conventional agent-memory tool names (`add_memory`, `search_memories`, `get_memories`, `update_memory`, `delete_memory`, `list_entities`, and so on), so an existing MCP client points its address here and the prompts need not change. The cost is that they cover only the most basic capabilities — conflict resolution, progressive disclosure, audit verification, and session summarization have no compatible names, and using the compatibility surface means giving them up. The benefit of native depth is complete capability; the cost is that the caller must read the list, understand what problem each tool solves, and reorganize prompts.

| Strategy | Tool count | Benefit | Cost |
| --- | --- | --- | --- |
| Compatibility first | 11 | Zero prompt changes, usable the same day | Basic capabilities only |
| Native depth | 44 | Conflict resolution, disclosure, audit available | Must read the list and reorganize prompts |
| Hybrid | 55 entries (52 capabilities) | Start compatible, then adopt native | Two name sets coexist; priority must be defined |

Table 7-1 — Three paths across the MCP tool surface

The hybrid path is the most common in practice: get running with compatible names first, then switch key processes over to native tools one by one. The risk is that once two name sets coexist, the same semantics has two invocation styles, and the model picks one at random. The convention "native first, compatibility only as fallback" mitigates this, but it lives in documentation, not in code.

## 7.2 Tool Classification

The 44 native tools fall into three layers by the problem they solve; the 11 compatible tools are listed separately.

| Category | Count | Solves | Representative tools |
| --- | --- | --- | --- |
| Retrieval and governance | 23 | Access, compression, audit, graph and temporal | `retain` `recall` `audit` |
| Memory formation layer | 9 | Session summaries, conflicts, task facts, experience | `session_summarize` `conflict_resolve` |
| Memory runtime layer | 12 | Injection, profile, disclosure, metrics | `memory_inject` `profile_card` |
| Client compatibility | 11 | Conventional agent-memory tool names | `add_memory` `search_memories` |

Table 7-2 — The four-way division of MCP tools

Both the memory formation layer and the runtime layer are new in 8.1.0, with 9 and 12 tools respectively. The division is not by code module but by "where a memory sits in its lifecycle": the formation layer governs "whether it should exist and in what form", the runtime layer governs "how it enters the model context". Its practical use is gap triage — a failure point of "the Agent does not know where we left off" means the formation layer is not connected; "it knows the memory exists but cannot fit it into context" means the runtime layer is not connected.

The cost is that the layers overlap: to get a directly injectable context you can either assemble it yourself with `recall` or get it in one call with `memory_inject`; both paths work, but the quota ledger, degradation behaviour, and return structure differ. Such overlap is unavoidable as capabilities expand, and it leaves "which one to choose" to the caller.

## 7.3 REST API

Not every environment can run an MCP client. Browsers, low-code platforms, and orchestration tools that only speak HTTP all need an ordinary interface, which is why the REST layer exists: **single process, single port**, with the console and the API sharing one listener. Authentication accepts three headers: `X-API-Key`, `Authorization: Bearer <token>`, and `Authorization: Token <token>`. The three coexisting is not elegance in design but the fact that different caller ecosystems each habitually use one, and forcing uniformity would make integrators write a conversion layer.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/status/` | Liveness probe and configuration |
| `POST` | `/v3/memories/add/` | Extract and write (async, returns an event number) |
| `POST` | `/v3/memories/search/` | Semantic retrieval |
| `GET`/`PUT`/`DELETE` | `/v3/memories/{id}/` | Read, update, delete a single record |
| `GET` | `/v1/event/{id}/` | Poll an event |
| `POST` | `/v3/graph/*` | Graph memory |
| `POST` | `/v1/capsule/` · `/v1/expand/` | Compression and restoration |
| `GET` | `/v1/integrity/` | Chain verification |
| `GET`/`POST`/`DELETE` | `/v1/keys/` | Key management |

Table 7-3 — The main routes of the REST interface

The write route is asynchronous: `POST /v3/memories/add/` returns an event number rather than a result, and the caller polls `/v1/event/{id}/`. The reason is that a write may include a model call, and waiting synchronously would leave the connection hanging for a long time; the cost is that the caller must implement polling, and getting the interval wrong causes two kinds of failure — too dense and it crushes the service, too sparse and "read immediately after write" reads nothing. The tradeoff of sharing a single port is simple deployment, with the reverse proxy needing only one rule; the cost is that console static assets share threads and the connection pool with the API, so one large file download will squeeze API bandwidth.

## 7.4 Framework Adaptation

The form of framework adaptation is dictated by each framework's own historical protocol. All adapters do only two things: retrieve and inject before the model call, write after the turn ends. Anything beyond that belongs to the framework, not to the memory layer — a component that both stores memories and answers questions will have its own model and its own judgements about user data, and at that point it is no longer a memory layer.

| Framework | Adaptation approach | Notes |
| --- | --- | --- |
| LangChain | `BaseMemory`-compatible history class | Handles history only, does not take over chain state |
| LlamaIndex | ChatStore and retriever bridging | Index and memory are two separate structures |
| CrewAI | One crew shares long-term memory | Scope is partitioned by crew |
| Dify | HTTP tool definitions over REST | Must handle async polling |
| n8n | HTTP Request node orchestration | Do not use temporary values as scope keys |
| Vercel AI SDK | `useChat` reaches memory via REST | Front end must go through a proxy; never expose the key |
| Ollama | Local model plus local memory | Both sides can be offline; suits disconnected environments |
| MCP | stdio and Streamable HTTP | The two transports authenticate differently |

Table 7-4 — Framework adaptation and notes

Adaptation depth varies widely. LangChain and LlamaIndex are code-level bridges that can reach the framework's internal turn boundaries, so "when to write" has an explicit trigger point; Dify and n8n are HTTP-level adaptations that can only decide timing through orchestration nodes, and the "conversation ended" event must be built by hand; Vercel AI SDK is a front-end scenario where writes must go through a server-side proxy, or the key ends up in the browser. Code-level bridges can therefore use session summarization, while HTTP-level adaptations usually get only basic write and retrieve — this is not a limitation of the memory layer but of the information available at the integration point.

## 7.5 Component Ecosystem and Degradation Reports

There are 72 component adapters in total: 20 LLMs, 13 embedders, 28 vector stores, 6 graph stores, 5 rerankers. Transport comes in three tiers: **stdlib HTTP** connects directly using the standard-library `urllib`, needing no third-party package; the **sdk** tier imports the vendor SDK lazily and states explicitly which package is missing when it is absent; the **builtin** tier is the built-in implementation — the embedder is 128-dimensional, deterministic, and offline, and a `hashing` embedder additionally supports arbitrary dimensions.

The point of the three tiers is to leave the decision "do we install dependencies" to the deployer: a user who just wants it running needs only the main package, while a user connecting Qdrant needs extra dependencies. The cost is that the same feature behaves differently across tiers — the built-in embedder's recall quality is markedly below a real embedding model, yet the interface signature is identical, which easily leads people to think that switching provider is merely switching a backend.

Degradation is where this design is easiest to get wrong. When a configured component cannot be constructed (missing key, unreachable endpoint, SDK not installed), the system falls back to the built-in equivalent and **explicitly reports** what it fell back from:

```python
m = Memory.from_config({"llm": {"provider": "openai"}})
print(m.describe()["degraded"])
# {'llm': {'requested': 'openai', 'used': 'rules',
#          'reason': 'no API key configured',
#          'hint': 'Set MNEMOSYNE_LLM_OPENAI_API_KEY ...'}}
```

None of the four fields in the return may be missing: what was requested, what was actually used, why, and how to fix it. With only `used` and no `reason`, the caller knows it degraded but not why; without `hint`, it knows the cause but not the next step. Silent degradation is exactly the failure to prevent — it lets a misconfigured deployment run for a long time in the shape of "works but performs poorly" with nobody knowing what to fix. When hard failure is needed, strict mode can be enabled: hard failure during development and testing, soft degradation in production.

## 7.6 A Realistic Estimate of Switching Cost

### 7.6.1 Switching from Mem0

The 2026 Mem0 algorithm is likewise **single-pass ADD-only extraction**, so the reason "a different write model makes migration hard" no longer holds. There are four real differences. The first is tool names: the 11 compatible tools reuse conventional names directly, so an MCP client only changes its address; the `Memory` class also accepts the conventional call shape — the same class name, method names, parameter names, and defaults — so at the code level it is often a one-line import change.

The second is the semantics of `update_memory`, which is where redesign is required. Under an append-only model, an update is not an in-place rewrite of the body text but a write of a new entry with the old one marked superseded. Code that relies on "the old value disappears after the update" must be restructured — the old value is still in the store, just not returned by default. This difference is invisible in functional tests and only surfaces in audits or historical queries.

The third is where graph memory lives. Mnemosyne's graph is built into the same SQLite file, with entity linking and multi-hop traversal requiring zero dependencies; Mem0's graph memory (entity linking) is a platform capability, and the open-source edition is officially documented as removed, with no queryable graph and no `relations` field — so "migrating from the open-source edition and wanting a graph" is a new capability, not a port of an existing one. The fourth is audit: the hash-chained audit ledger and `verify_integrity()` can point at exactly which record was altered, and Mem0 has no counterpart, so during migration this is often treated as a bonus until the first time evidence must be produced.

### 7.6.2 Switching from Zep

Zep's Context MCP Server exposes **12 tools**: 6 for user-owned graphs (`search_graph`, `get_user_summary`, `get_subgraph`, `get_node_neighbors`, `list_episodes`, `add_memory`) and 6 for the shared Context Graph (`list_graphs`, `search_graph_in`, `get_subgraph_in`, `get_node_neighbors_in`, `list_episodes_in`, `add_memory_to_graph`), plus the `zep://graphs/directory` resource. Its `search_graph` has a `scope` parameter accepting `auto` / `observations` / `thread_summaries` / `episodes` / `nodes` / `edges` — turning "do you want conclusions or raw fragments" into an explicit parameter.

The difficulty in migration is the return shape. Zep's `search_graph` returns **a pre-assembled context block** that downstream code pastes straight into the prompt; Mnemosyne returns **structured memory entries**, which the caller must assemble. So migrating from Zep requires adding a layer of assembly logic downstream — this is not a missing capability but a relocation of the "how to assemble" decision from the server to the client, and the client did not previously have that code.

### 7.6.3 Switching from Letta

Letta's memory lives inside the agent runtime (the current conceptual surface being Stateful agents, Conversations, MemFS, shared memory), in the shape of "a stateful Agent plus its memory"; Mnemosyne is an external service that the Agent accesses through an interface. This is the largest of the three migrations, because what changes is not the interface call but the architectural position. Once the assumption "memory exists alongside the Agent instance" fails, three things must be handled: the memory's lifecycle is no longer controlled by the Agent; scope must be redrawn when multiple instances share one memory; "load memory at startup" goes from implicit to explicit. The cost is losing the convenience of in-runtime access, exchanging data only through the interface; the benefit is replaceability — swap the runtime and the memory is still there.

## 7.7 Chapter Summary

This chapter establishes three judgements.

**First, the width of the tool surface is a design decision, not the length of a capability list.** The 11 compatible tools make migration usable on day one, but using the compatibility surface means giving up conflict resolution, progressive disclosure, and audit; the 44 native tools are complete but require the caller to read the list and reorganize prompts. The hybrid path is most common, and its risk is that two name sets coexist and the model picks one at random. The condition for this to hold is that the caller knows what it lacks; a team that does not know will use only the first three tools no matter how wide the surface is.

**Second, adaptation depth is determined by the information available at the integration point, not by the number of adapters.** Code-level bridges can reach turn boundaries, and therefore can use session summarization; HTTP-level adaptations do not know when a turn ends and can use only basic write and retrieve. This explains why "supports eight frameworks" does not equal "identical capability across eight frameworks". It fails when the framework itself provides turn events — then HTTP-level adaptations also get boundaries and the depth gap narrows.

**Third, degradation must be reported; silent degradation is worse than no degradation.** When component construction fails, fall back to the built-in implementation and report the requested value, the actual value, the reason, and a fix hint. Silent degradation lets a misconfigured deployment run for a long time in the shape of "works but performs poorly". The condition for this to hold is that the caller reads `describe()`; a deployment that does not is voluntarily giving up this information. During development the opposite should apply — use strict mode so configuration problems fail immediately.

The cost ranking of the three migrations is Letta largest (architectural position changes), Zep next (a downstream assembly layer must be added), Mem0 smallest (names and call shapes both line up). But this ranking describes only the volume of code change, not the risk: Mem0 changes least, yet the risk sits in the semantic difference of `update_memory` — it will not fail a test, only make historical queries give different answers. Chapter 8 turns to another dimension: all the integration approaches above assume there is somewhere a process can run. When the environment disallows a resident process, disallows local disk, or demands multiple replicas, those assumptions must be re-examined.

---
