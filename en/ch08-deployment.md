# Chapter 8 — Deployment: What Local-First Really Means

A three-person team integrated the memory service into a customer-support ticketing system.
The first version ran on a developer's laptop and worked right after `pip install`, with no external account at any point.
Three weeks later it was due for production, and the first question operations asked was not about performance.
"Does it need a database, does it need a key, does it need a container" — the answer to all three was no.
So it was tucked into the existing Python application process.

Half a year later the application moved to K8s, and only then did the problems appear.
The relative path `./mem` drifted with the working directory.
After a rolling update the new Pod could not see the old Pod's memories.
The team had always assumed "local-first" meant "the data is on the server".

This class of failure is not a configuration oversight but a misreading of "local-first".
Local-first usually means three things holding at once:

- Data sits on a disk you control
- Core functionality does not depend on an external network
- Installation introduces no operational components

The third is the easiest to achieve; the first is the hardest to state clearly.
"a disk you control" is a persistent path on a laptop.
In container orchestration it is an ephemeral layer that may vanish with the Pod.

This chapter is not about which form is better.
It is about which complexities each form transfers, and to whom.
The deployment form determines three things downstream, which is why it comes first in the Run part:

- Whether backups can be made by copying files — the isolation acceptance in Chapter 10 depends on it
- Whether read-after-write can buy consistency from single-process memory — the `flush` in Chapter 9 depends on it
- Whether cross-scope aggregation needs multiple reads — the cost structure in Chapter 11 depends on it

This chapter is not operational detail; it is the physical premise of the next three chapters.

## 8.1 The Engineering Boundary of Zero Dependencies

### 8.1.1 What an Empty `install_requires` Means

`install_requires` for `mnemosyne-os` 8.1.0 is an empty list.
The fact itself has no value; what has value is why it can hold.

A memory system must touch at least four classes of external capability.
Call a model for extraction, call an embedding model for vectorization, store vectors in an index, store text in a database.
Industry convention is to pull in one SDK per class.
So installing one memory library equals installing four SDKs and their transitive dependencies.

Mnemosyne collapses these four classes into two layers: "optional adapter + built-in equivalent".
Adapters come in three transport tiers, and this tiering is the key to understanding zero dependencies:

| Transport tier | Implementation | Third-party packages needed | Typical providers |
| --- | --- | --- | --- |
| stdlib HTTP | Standard-library `urllib` speaks HTTP directly | None | `openai` `anthropic` `gemini` `ollama` `deepseek` `qdrant` |
| sdk | Lazy import of the vendor SDK; states which package is missing | The corresponding SDK | `langchain` `aws_bedrock` `chroma` `pgvector` |
| builtin | Engine built-in implementation | None | `rules` extractor, 128-dim embedder, `hashing` embedder, SQLite vectors and graph |

Table 8-1 — Three transport tiers of component adapters

The vast majority of the 72 adapters fall into one of the first two tiers: stdlib HTTP and builtin.
Only those without a stable HTTP contract, such as `langchain` and `aws_bedrock`, fall into the sdk tier.
For an interface that can be expressed clearly over HTTP, there is no reason to pull in a package that inflates the dependency tree tenfold.

The cost is that adapters must handle retries, timeouts, and differences in authentication headers themselves.
`providers/transport.py` therefore carries stdlib HTTP plus retry and credential redaction.
The complexity does not disappear; it moves from dependency management into the engine.
It also becomes a part the engine itself must cover with tests.

### 8.1.2 Lazy Imports and "Stating Exactly Which Package Is Missing"

Adapters that need an SDK do not participate in install-time dependencies.
They are imported only when actually constructed.
When a package is missing they do not raise a generic `ImportError` but state exactly which package is missing.
This design decision determines how smooth the upgrade path is.
From "usable with zero configuration" to "connected to a commercial model", each step adds exactly one package.
Rather than accepting a dependency closure all at once.

There is a simple way to test whether this boundary holds.
Install the package on a machine with no network, then execute `Memory()` and `add()`.
If it runs, the built-in path is complete.
If it does not, something has turned an optional dependency into a hard one.

## 8.2 The Four Consequences of Zero Dependencies, and Their Costs

Zero dependencies is the outcome of an architectural decision, not a marketing point.
Its value shows up only in four concrete consequences.
Each consequence carries one explicit cost.

**First, offline availability.**
The built-in `rules` deterministic extractor lets `add()` work even with no model configured.
The built-in 128-dim embedder lets `search()` return results even with no embedding model configured.
Disconnected environments, development machines without keys, and intranets barred from outbound access can all get the chain running.

The cost is in recall quality.
The 128-dim deterministic embedder does not understand semantics; it relies on character- and lexical-level similarity.
For synonymous paraphrases such as "I prefer dark mode" and "the night interface is easier on the eyes", it is nearly helpless.
Commercial embedding models (for example `text-embedding-3-small`) are markedly better on such paraphrases.
What the built-in embedder guarantees is "you can start using it", not "it is good enough".
It is a starting point, not an endpoint.

**Second, supply-chain safety.**
No third-party packages means no third-party package vulnerabilities to track.
And no transitive dependency version conflicts to reconcile.
For a component that resides on a user's disk long-term, this value grows over time.
The cost is that the engine itself bears the correctness of low-level details.
HTTP retry semantics, the choice of SQLite concurrency mode, character-encoding boundaries — all must be tested in-house.
What mature libraries used to cover must now be covered by the engine's own tests.

**Third, simple deployment.**
After one `pip install`, no Docker, no separate database process, no key, no model weight downloads.
This matters most for "integrate it into the existing application and try it for a week".
It pushes the cost of trial close to zero.
The cost is a lowered ceiling on operational capability.
To scale a single process and single file horizontally is not a configuration change but a backend swap or a gateway.

**Fourth, controllable upgrades.**
No dependency conflicts means an upgrade will not fail because of another package's version constraint.
The cost is that the engine cannot ride ecosystem evolution.
When a provider makes a breaking API change, the adapter must change with it.
And that change is not maintained by the vendor as an SDK would be.

Of the four costs, the first is the most easily underestimated.
Degradation must not be silent; this is where the honesty of the boundary lies:

```python
from mnemosyne import Memory

m = Memory.from_config({"llm": {"provider": "openai", "config": {"model": "gpt-4o-mini"}}})
print(m.describe()["degraded"])
```

On a machine with no key configured, the output is a four-field dictionary.
It answers, respectively, "what was asked for", "what was actually used", "why", and "what to do".
Degradation must be machine-readable, not merely written to a log.
Otherwise a service running in a container will discover half a year later that it has been using the rule extractor all along.

## 8.3 Why SQLite Is a Reasonable Choice for a Memory Engine

### 8.3.1 Four Features That Are Actually Used

SQLite was chosen not because it is "lightweight".
It was chosen because the read/write shape of a memory system falls exactly in its strong range.
Four features each have a definite purpose:

- **ACID transactions**: one write touches four tables — body text, structured facts, graph triples, audit ledger — and must commit atomically. The audit ledger is a SHA-256 chain, and writing half a chain equals breaking the chain.
- **WAL concurrent reads**: writes do not block reads. The load is medium write frequency, high read frequency, and WAL keeps a session that is writing from affecting other sessions' recall.
- **FTS5 full-text index**: after Chinese bigram tokenization, text lands directly in FTS5, so the BM25 keyword signal needs no extra search engine.
- **JSON1 extension**: structured facts, content atoms, and filter predicates are all stored as JSON in a single column, avoiding one table per type.

The combined result is direct: one SQLite file serves five roles at once.
Body store, vector index, graph store, full-text index, audit ledger.
The description of the `builtin` vector store is exactly "one SQLite file holds both memories and vectors".

### 8.3.2 Medium Write Frequency, High Read Frequency, Single Machine

The load shape of a memory system differs from a typical web application.
It is not high-concurrency writes, nor low-latency strongly consistent reads.
It is "write a batch at the end of a session, read a few times at the start of a turn".
Estimated against that shape, with tens of thousands of scopes on a single machine and thousands of memories per scope, SQLite is sufficient.

Physical isolation makes this estimate easier to hold.
Each scope combination derives an independent namespace, corresponding to an independent directory and an independent SQLite file.
Rather than sharing one table with a WHERE filter.
The benefit of a single file is amplified here.
Backup is copying a file, migration is copying a directory, deleting a tenant is deleting a directory.
All three require dedicated logic under a shared-table design.

There are three costs, none of them small:

- Cross-scope aggregate reads are not one query but N file opens. Counting "the most frequently recalled memories across the whole platform" becomes a directory walk under physical isolation.
- File count grows with scope combinations. A hundred thousand tenants means a hundred thousand files, plus an equal number of WAL and SHM sidecar files; the filesystem itself becomes the bottleneck.
- A single file has no cross-machine replication. Multi-replica deployment must rely on external mechanisms, and SQLite's semantics on network filesystems are not reliable.

## 8.4 Four Deployment Forms

The same engine has four usage forms.
The difference is not in functionality but in "who bears the process lifecycle".
The table below is ordered by integration cost, lowest first.

| Form | Integration | Suitable for | Main cost |
| --- | --- | --- | --- |
| Python library | `from mnemosyne import Memory` | Existing Python application where memory is an internal capability | Shares the process with the application; a crash kills both |
| CLI | `mnemosyne add/search/list` | Scripts, batch jobs, manual triage | Cold start on every call, no connection reuse |
| Single-process REST + console | `mnemosyne-web --port 9090` | Multi-language clients, human inspection needed | Single point; authentication and TLS must be built |
| MCP stdio server | `python -m mnemosyne.webui.mcp_server` | Agent clients that support MCP | Bound to the client process; stops when the client exits |

Table 8-2 — Integration approach and cost of the four deployment forms

**The Python library form** has the clearest boundary.
Memory is an internal module of the application, and the lifecycle is controlled by the application.
The cost is living and dying together with the application.
One OOM takes with it writes still sitting in the hot-path buffer that have not reached disk.

**The CLI form** is often undervalued.
`mnemosyne --agent search ...` returns a JSON envelope that a tool loop in any language can call directly.
It is also the only reliable means during triage.
When the REST layer is suspect, run the same query against the same `--brain-dir` with the CLI.
That immediately separates a storage-layer problem from a transport-layer problem.
The cost is that every call re-initializes the engine, so batch operations must go through `retain_batch`.

**Single-process REST + console** is the only form that provides both a human and a machine interface.
The console and REST share one listening port.
It accepts three authentication headers: `X-API-Key`, `Bearer`, and `Token`.
The cost is that everything a server ought to have is left to the user: reverse proxy, TLS, rate limiting, multiple replicas.

**The MCP stdio server** is the most common integration in the Agent ecosystem.
It is launched by the client process and communicates via JSON-RPC over stdio.
`tools/list` returns 55 entries — 44 native plus 11 client-compatible, 52 distinct capabilities after deduplication.
The cost is that the lifecycle is tied to the client.
The server disappears when the client exits, so any design that depends on "the service is always resident" does not hold.

One detail deserves separate mention.
In the quick-start examples, `mnemosyne-web` uses 9090, while the `curl` example that follows writes 8788.
Ports in deployment scripts must come from a single source of configuration.
Otherwise the console comes up and the health check hits a different port.
The failure presents as "the service is fine but unreachable".

## 8.5 The Boundary between Self-Hosting and SaaS

One engine, two deliveries.
The open-source edition is MIT licensed, unlimited, with no feature paywall.
SaaS is the hosted form, providing a console, API key management, and subscription billing.
The precise definition of this boundary is: SaaS sells operational convenience, not feature permissions.

The pricing structure itself can verify that statement.
As of October 2026, there are four tiers:

| Tier | USD | RMB | Contents |
| --- | --- | --- | --- |
| Free | $0 | ¥0 | All 52 tools · cold-tier recall window 30 days · 1 namespace · audit window 7 days |
| Pro | $6.9/month · $69/year | ¥9.9/month · ¥99/year | Cold tier permanent · cross-namespace recall · unlimited audit history · full export |
| Team | $19.9/seat/month · $199/seat/year | ¥29.9/seat/month · ¥299/seat/year | Everything in Pro · multi-user namespaces · team policies · audit report export |
| Compliance Add-on | $9.9/month | ¥19.9/month | Monthly only, add-on only, stacked on Pro or Team: scheduled `verify_integrity` reports, deletion-proof export, data residency configuration |

Table 8-3 — SaaS pricing tiers as of October 2026

The way to read this table is not to look at the prices.
It is to look at what each tier narrows.
Every Free-tier limitation falls on the read window: cold tier 30 days, audit 7 days, 1 namespace.
The write path is open at every tier.
That is the key to understanding the pricing logic.
Narrowing the read window does not make users lose data; it only means older data must be upgraded before it can be recalled.

Annual billing is priced as "pay 10 months, use 12", roughly a 16.7% discount.
New accounts include a 30-day Team trial with no card required.
USD is charged via PayPal Subscriptions; RMB is paid by WeChat QR code and confirmed by the operator.

The gating mechanism supports the same judgement.
`MNEMOSYNE_TIER_GATE` is off unless set; self-hosted and PyPI users are subject to no restriction at all.
The gate only filters the result projection at the exit.
It does not change retrieval parameters, does not change SQL, does not change storage.
Paying or not does not change engine behaviour, only the visible range of returned results.
The cost is that it cannot stop a paying user from running the open-source edition locally to obtain every capability.
So this pricing can only serve the population that "does not want to operate it themselves".

Horizontally, another route puts governance capabilities inside the paid tier.
As of October 2026, Mem0's public pricing has two tiers, Free and Custom.
Graph memory, user profiles, Dream consolidation, SSO, and audit logs all fall under Custom and require a separate agreement.
The difference between the two layering approaches is not the price level.
It is whether "capability changes with payment".
The practical meaning for selection is: if graph traversal is a hard requirement, taking the latter route means accepting that data leaves your domain.

## 8.6 Deployment Decision Criteria

Choosing a deployment form compresses into a two-question decision tree.
Neither question involves performance.

**Question one: is data sovereignty a hard constraint.**
If memory content is subject to industry regulation and cannot leave a specific jurisdiction, self-hosting is the only option.
And no functionality is lost, which is the direct result of an MIT license plus zero paywall.
Conversely, if data sovereignty is merely "we would prefer it", SaaS is a reasonable default.

**Question two: is anyone willing to bear operations.**
The real cost of self-hosting is not installation but three long-term duties:

- Backup strategy: copying files is easy, verifying recoverability is not
- Upgrade cadence: zero dependencies lowers upgrade risk but does not eliminate it
- Capacity monitoring: the three classes of metrics in Chapter 11 need somewhere to run

If nobody is willing to bear these three long-term, then SaaS pricing is payment for that.
Not payment for features.

When both questions point to self-hosting, there is one more layer of choice: library form or service form.
The criterion is whether memory is consumed by multiple processes.
Single-process consumption uses the library form; multi-process or multi-language consumption uses REST or MCP.

When both questions point to SaaS, the cold-tier window must be confirmed.
A 30-day window is insufficient for recall needs like "what happened in the last three months".
In practice this is usually hit within the first month.

The hybrid form is often treated as a compromise, when in reality it is more complex.
Run the engine locally for writes and hot-data recall, and periodically export cold data to the hosted side for archiving.
The cost is that dual-write consistency is not guaranteed.
When a local write succeeds and the export fails, the two memory sets diverge.
Divergence shows up at the recall layer as "the same thing is sometimes remembered and sometimes not".
Unless there is an explicit cross-side reconciliation mechanism, a hybrid form is worse than picking one of the two ends.

## 8.7 Chapter Summary

This chapter establishes three judgements.

First, zero dependencies is an architectural decision rather than a marketing attribute.
Its four consequences — offline availability, supply-chain safety, simple deployment, controllable upgrades — each carry one cost.
The drop in recall quality is the most easily underestimated.
`describe()["degraded"]` is the mechanism that makes this cost visible.
The condition for this judgement is "the built-in implementation suffices for the starting phase".
Once recall quality becomes a core metric, the built-in embedder must be replaced.
At that point the value of zero dependencies reduces to supply chain and deployment.

Second, SQLite's reasonableness comes from load shape, not data volume.
Medium write frequency, high read frequency, single-machine deployment.
Physical isolation turns backup, migration, and deletion into file operations.
The cost is that cross-scope aggregation degrades to multiple reads, and file count itself becomes a bottleneck.
This judgement fails under two conditions.
Horizontal scaling with multiple replicas is required, or cross-tenant aggregate queries are routine.

Third, the boundary between self-hosting and SaaS is operations, not features.
The engine is identical, and the open-source edition has no feature paywall.
Every SaaS tier narrows only the read window; the write path is always open.
The technical consequence is that pricing cannot prevent a local deployment from obtaining every capability.
Therefore it can only serve the population unwilling to operate.
Deployment decisions thus reduce to two non-performance questions: data sovereignty, and willingness to operate.

One question this chapter does not answer: how the "single process, single file" assumption brought by zero dependencies keeps state continuous in an environment where the process may be replaced at any moment.
That requires first clarifying write timing, and what visibility gaps asynchronous writes introduce.
Chapter 9 continues from here.

---
