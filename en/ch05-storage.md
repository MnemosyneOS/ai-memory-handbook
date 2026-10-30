# Chapter 5 — Storage: Tiering, Scope, and Lossless Compression

In April 2026, a team doing medical follow-up work tripped over a problem in canary release that raises no error: they used the same `memories` table to store memories for all patients and doctors, distinguishing them by `WHERE user_id = ?`. A refactor changed the condition assembly for paginated queries from hand-written to a builder, and the builder appended no conditions when `filters` was empty. So the admin page endpoint "list recent memories" returned records for every tenant under certain parameters. The endpoint returned 200, the logs were clean, until a doctor saw another patient's follow-up records on the page.

This is not SQL injection, nor a missing permission model; it is a question of choosing an isolation method. A shared table plus filter conditions pins isolation correctness on "every query remembering to add the condition" — and there are hundreds of such conditions, so one miss is a cross-tenant leak. Physical isolation turns this from "get it right every time" into "right by default."

Storage-layer design involves four interlocking decisions, and this chapter proceeds in the order they get pressed on. 5.1 covers where isolation lives; 5.2 covers why a single-file database is sufficient and when it is not; 5.3 covers what to do when the store keeps growing; 5.4 covers how compression can avoid losing information; 5.5 covers why graph memory can be built in; 5.6 covers where the hard boundaries of this storage form lie.

The four decisions cannot be chosen independently. Choose physical isolation and you give up a single aggregate query across scopes; choose a single file and you simplify backup to copying a file while locking the concurrency ceiling to one machine; choose compression instead of deletion and you must bear the cost of decompression and verification; choose a built-in graph and you forgo the specialized indexes of large-scale graph traversal. These exchanges are stated one by one in this chapter.

One more foundational constraint runs through the whole chapter: writing is monotonic (Chapter 4), so the storage layer must itself bear the matter of "growth." The retrieval layer can suppress noise, but it cannot suppress disk usage; the write layer can guarantee that no information is lost, but it cannot guarantee that cost stays controlled. These two things are solvable only in the storage layer.

## 5.1 Physical Isolation

### 5.1.1 How Four-Dimensional Scope Derives Namespaces

Mnemosyne OS's scope has four dimensions: `user_id`, `agent_id`, `run_id`, `app_id`. The four dimensions can be combined arbitrarily, and each combination derives a namespace, each mapping to an independent directory on disk and an independent SQLite file.

The implementation path is short: `_namespace_for()` derives a namespace name from the scope dictionary, `_build_brain()` builds an engine context under that name, and each context holds its own database connection. Accessing three users in one process yields three contexts, three files, and none of them knows the others exist. The source is in `mnemosyne/api/memory.py`.

The most direct consequence of this design: **isolation depends on no single place in the code remembering to add a condition**. The medical team's incident above cannot happen under this model, because "list recent memories" under a given scope can only see the contents of that one file — there is no condition to miss.

The boundary of isolation should be stated more precisely: bodies, full-text indexes, and vector collections all travel with the namespace; whereas the audit ledger, graph edges, and statistics are, in some deployments, root-level shared structures. This means "memory content isolation" and "audit and graph being fully isolated" are not the same thing, and in multi-Agent deployments, inferring that audit is isolated because content is isolated leads to a wrong conclusion. The basis for judgment should be the actual deployment's directory structure, not the fact that scope has four dimensions.

The cost shows up in three places.

First, cross-scope aggregate queries require multiple reads. To see "how many memories were added platform-wide today," operations must, under this model, walk every namespace directory and tally them one by one; no single SQL statement can do it. At small scale this does not matter; once namespaces number in the thousands it becomes an offline task that needs separate design.

Second, once the namespace key is unstable, empty stores are silently produced. This is the most common mistake at the integration stage: some call passed `run_id` as a freshly generated UUID per request, so every write landed in a brand-new, empty store. The system raises no error, writes return success, and reads return empty — it looks like "memory is not taking effect," when in fact "memory has been scattered across a thousand stores each holding one record." The scope key must therefore be an identifier that "stays unchanged for the entire period during which this memory should exist," not a request-level identifier.

Third, the number of files itself becomes an operational object. Backup is no longer one file but a directory tree; migration is no longer one copy but batched by namespace.

| Application form | Recommended scope | Common mistake |
| --- | --- | --- |
| Single-user desktop tool | `user_id="local"` | Using the machine name as the key, losing all memory after switching machines |
| Multi-user web application | `user_id=<account id>` | Using email as the key, forking after the user changes email |
| Multi-tenant SaaS | `user_id=<account id>` + `app_id=<tenant id>` | Passing only the tenant, so users within a tenant share memory |
| One Agent per customer | `agent_id=<customer id>` | Also passing `user_id`, doubling stores through the combination of two dimensions |
| Isolation by session | `run_id=<session id>` + `user_id` | Passing only `run_id`, so memory cannot be inherited across sessions |

Table 5-1 — Choosing scope keys and common mistakes

Rows two and four in the table are two directions of the same class of error: a key finer than needed produces a mass of fragmented stores; a key coarser than needed makes memories that should be isolated visible to each other. Neither raises an error.

### 5.1.2 Comparison with Shared Tables Plus Filtering

A shared table plus `WHERE` filtering is not a bad design; it is better under two conditions: when cross-tenant aggregate analysis is needed, and when the number of tenants is enormous and each tenant's data is tiny — the latter, under physical isolation, produces thousands of nearly empty files, and file-system metadata overhead exceeds the data itself.

So the criterion here is scale and query shape, not abstract correctness.

| Dimension | Shared table + filtering | Physical isolation (one file per scope) |
| --- | --- | --- |
| Isolation correctness | Depends on every query adding the condition | Structurally guaranteed, no condition to miss |
| Cross-scope aggregation | One SQL statement | Requires multiple reads then merge |
| Small per-tenant data volume | No extra overhead | File metadata overhead is a high proportion |
| Blast radius of single-store corruption | All tenants | A single scope |
| Backup granularity | Whole database | Per scope |
| Migration and deletion | Row operations | Directory operations |

Table 5-2 — Trade-offs of the two isolation approaches

The last row is often overlooked, but it determines the choice in compliance scenarios. When a user exercises the right to erasure, physical isolation means "delete this directory" — verifiable and reviewable; a shared table means "delete these rows," requiring proof that no associated table was missed. The evidentiary cost of the former is an order of magnitude lower.

Conversely, physical isolation is wasteful when "tenant data is tiny." Suppose a B2B product has five thousand customers with an average of twenty memories each, a hundred thousand in total — that magnitude is trivially comfortable in one table, whereas split into five thousand files, a backup must walk five thousand directories and a full tally must open five thousand connections. The correct move there is not to abandon isolation but to separate "isolation" from "file splitting": partition logically by tenant while sharing one file physically, guaranteeing correctness through table partitioning or row-level constraints, and simultaneously converging condition assembly into one unified query builder so it cannot be bypassed.

The cost of that compromise is that "structural guarantee" falls back to "guarantee through a single converged entry point" — stronger than conditions scattered across hundreds of places, but still not a structural guarantee.

## 5.2 Why SQLite Is Enough

### 5.2.1 Four Underestimated Capabilities

Treating SQLite as a "toy database" is an outdated impression. For the load shape of a memory system, it happens to provide four necessary things, none of which requires an extra process.

**ACID and transactions.** One write must modify the main table, the full-text index, and the graph edge table simultaneously. All three must take effect atomically; otherwise you get "the memory exists but cannot be searched" or "the edge points to a nonexistent node." SQLite's transactions cover all three because they are in the same file.

**WAL concurrency.** In write-ahead logging mode, reads do not block writes and writes do not block reads. The memory system's load is "moderate write frequency, high read frequency" — one write per turn, several reads per context assembly. This shape falls exactly in WAL's sweet spot.

**FTS5 full-text index.** Keyword retrieval needs no external search engine. In Chinese scenarios, bigram pre-tokenization feeds the FTS5 content column, and the query side likewise cuts bigrams before `MATCH`, which works without a segmentation dictionary.

**JSON1 extension.** Metadata, tags, and entity lists are all stored in JSON columns, queryable and updatable directly with SQL functions, with no need to add a column for each variable field.

The combined significance of these four capabilities is that **one process, one file, zero external services** can simultaneously satisfy transactional consistency, concurrent reads, full-text search, and semi-structured fields. For a memory layer meant to be embedded in someone else's application, this combination eliminates the entire operations surface — users need not install a database before they can even discuss using your memory feature.

### 5.2.2 Where the Bottleneck Is

A common misjudgment attributes "slow retrieval" to "the database being inadequate." The measured experience is that **the bottleneck is usually in retrieval fusion, not the storage engine**. One recall must perform multi-channel scoring, normalization, fusion, and relevance-floor filtering over the candidate set — all pure computation; while fetching one record by primary key or pulling candidates from FTS5 is millisecond-level.

The optimization order should therefore be: first look at candidate set size (whether `candidate_n` is too large), then at the scoring rounds of fusion, and only last consider switching the storage engine. The gain from switching engines is usually far below expectations, while the operational complexity it brings is immediate.

One concrete observation helps determine the direction: if latency rises after increasing `candidate_n` but recall quality does not improve, the problem is in scoring and thresholds, not storage; if single-record reads by primary key also start slowing down, then the storage layer has a problem. The former far outnumbers the latter.

There are three situations where SQLite genuinely falls short, and none of them is on the "data volume" dimension.

First, multiple processes writing the same file simultaneously. WAL supports multiple readers and a single writer; multiple writers get serialized and may return busy errors. Multi-process writing requires external coordination, or concentrating writes into one process.

Second, cross-machine horizontal scaling is needed. A single file cannot be sharded across machines; it can only be copied wholesale or split by namespace onto different machines.

Third, large-scale analytical queries must run concurrently with writes. Analytical queries hold read snapshots for a long time and compete with high-frequency writes for WAL checkpoints.

All three have corresponding architectural adjustments, but the direction of adjustment is not "switch to a stronger database" but "split the load" — concentrate writes, shard by scope, and route analysis to replicas.

### 5.2.3 Architectural Constraints Imposed by a Single Writer

The second and third situations both stem from "a single writer." This constraint is stronger than it sounds, because it affects not only throughput but the process model.

Once a single writer is accepted, writes must go through one process. That process may be the application itself, or a separate write service. The former is simple but means writes are interrupted when the application restarts; the latter is stable but introduces one inter-process communication.

Asynchronous writing is a common way around this constraint: write requests are queued first, the hot path only enqueues and returns immediately, and the actual persistence is batched by a background thread. The benefit is that write latency drops from "one full persistence" to "one enqueue"; the cost is that read consistency is broken — reading immediately after writing may miss the write.

Asynchronous writing must therefore be paired with an explicit barrier: an operation that "waits for the queue to be persisted," called before a read that immediately follows a write. Without this barrier, asynchronous writing manifests as random loss, and it is not reproducible, because whether something is lost depends on how fast the queue drains.

This constraint is only touched on here; Chapter 9 takes state recovery, asynchrony, and consistency as its theme.

## 5.3 Tiered Memory

### 5.3.1 The Hot, Warm, and Cold Tiers

Add-only storage keeps growing; that is the debt left by Chapter 4. Tiering is how the debt is repaid: not by deleting old data but by moving it to a cheaper tier.

The three tiers behave differently.

The hot tier holds memories recently written or recently accessed; it participates in all retrieval channels and is the object of full scoring. The warm tier holds memories whose value has declined but which remain in the store; it participates in retrieval with lowered priority. The cold tier holds low-value memories moved out of the main table and compressed into archives, with only a decidable index left in the main table, fetched back on hit.

Migration from hot to warm changes only one field and costs almost nothing. Warm to cold actually moves data: removal from the main table, gzip archiving, and building a Bloom-filter-like index to decide "whether this entry might be in the cold tier." Every migration appends a record to the hash-chain ledger noting which tier it moved from and to — because "when a memory was demoted" is itself an event that needs to be auditable.

Writing demotions into the audit ledger is not formalism. When a user asks, "did you lose my data," what the ledger can answer is "this entry moved from the warm tier to the cold tier on March 12, is still in the store, and can be restored on hit," rather than "we never deleted anything." The former is checkable; the latter is only a promise.

### 5.3.2 Demote Rather Than Delete

The core judgment of the demotion strategy is: **a low-value memory is not a valueless memory**. A two-year-old "the user was on Python 3.9 at the time" gives no guidance for a current technology choice, but it explains why a piece of code used a now-deprecated idiom. Delete it and history breaks.

So the default action is demotion and compression, not silent deletion. The so-called "economics of forgetting" refers to exactly this: allocating storage cost by value, letting low-value memories occupy cheaper media rather than making them disappear.

Value ranking is synthesized from several signals: importance, access count, confidence, recency, and hit rate. Each demotion cycle moves away the lowest-value portion, 20% by default, at least one entry. If a byte budget is given, demotion continues until the active data volume falls within budget.

| Tier | Participates in retrieval | Storage form | Retrieval cost | Applicable signals |
| --- | --- | --- | --- | --- |
| Hot | All channels, full scoring | Main table row + vector | Lowest | Recently written, recently accessed |
| Warm | Participates with lowered weight | Main table row | Low | Medium value, long unaccessed |
| Cold | Fetched back on hit | gzip archive + index | High | Low value, extremely long unaccessed |

Table 5-3 — Retrieval participation and fetch cost of the three tiers

There are three costs. First, cold-tier recall has extra latency; a hit must be decompressed and then fetched back. Second, demotion has no automatic promotion mechanism — a memory demoted to the cold tier will not automatically rise back to hot even if it is later accessed frequently, unless there is an explicit access-triggered hot path. Third, the demotion criterion itself may be wrong: demoting a memory that will later be critical costs it appearing more slowly when needed, not failing to appear. That error's cost is designed to be "slow" rather than "lost," and this is the premise on which the entire tiering scheme rests.

The third cost deserves one more layer: why prefer "slow" over "lost"? Because slow is observable — latency metrics rise, users feel the lag; lost is unobservable — recall is empty and the system believes "there never was such a memory." Observable failures can be fixed; unobservable failures get misjudged as "it was never recorded." The entire tiering design unfolds around this asymmetry.

### 5.3.3 When Not to Tier

Tiering is not unconditionally correct. It is a burden in two situations.

The first is when the store is simply small. A few thousand memories in a single file is only tens of MB, and the scheduling cycles, audit records, and cold-tier indexes that tiering brings are pure added complexity while the disk space it saves is negligible. Demotion should be turned off and all memories kept in the hot tier.

The second is when the access pattern has no hot-cold distinction. Some systems' memories are accessed uniformly — a product knowledge base, for instance, where any entry might be asked about and there is no "recently used" skew. In that case tiering by access frequency pushes half the useful memories into the cold tier, raising recall latency across the board while saving almost no storage.

The criterion is the skew of the access distribution: if the top 20% of memories account for more than 80% of recall hits, tiering works; if the hit distribution is close to uniform, tiering is only adding a layer of indirection to every query.

## 5.4 Lossless Compression

### 5.4.1 Pointer Plus Structured Facts Plus Content Atoms

The most direct way to compress a memory is summarization, and summarization loses information. What gets lost is often exactly the part needing precision: amounts, dates, model numbers, identifiers. The sentence "the user bought a laptop, around ten thousand something" loses `ASUS VivoBook Pro 14`, `¥10,499`, and `2026-03-12` entirely, and those three values are precisely the answers to every follow-up question.

AIC's approach compresses a memory into three segments: **pointer**, **structured facts**, and **content atoms**.

The pointer is a verifiable reference of the form `m:<id>#<hash>`, optionally carrying a compression level. It is stable and parseable, and can point back to the original body at any time.

Structured facts are the type, time, entities, and relations extracted from the body, so that the compressed representation remains retrievable and rankable.

Content atoms are all the "value-type" fragments in the memory — numbers, dates, amounts, model numbers, URLs, email addresses, verbatim quotes inside quotation marks. The key constraint is that **atoms are preserved intact at every compression level**. Levels compress only narrative text, never atoms.

There are five levels from loose to tight: full text, key points, facts, pointer, atoms. In the extreme case only "pointer + atoms" remains; the body is gone, but "how much, when, which model" can still be answered.

```python
from mnemosyne import MemoryBrain

brain = MemoryBrain("./memories", enable_embeddings=True)
brain.ensure_init()
mid = brain.retain("His laptop is an ASUS VivoBook Pro 14", fast=True)

cap = brain.capsule(mid, budget_tokens=60)   # pointer + facts + atoms
print(cap["level"], cap["atoms"], cap["ref"])
```

The second parameter of `capsule()` is a token budget. The smaller the budget, the tighter the level, but the returned `atoms` always contains every value fragment; the `atoms_preserved` field is always true — it is the function's own assertion, not the caller's expectation.

The rendered compressed text carries one more readability trade-off: the pointer itself consumes tokens. An `id16 + hash8` pointer can take more than half of a very short budget, so the copy rendered for the model has a shortened pointer, while the structured fields returned to the program retain the full one. The same object has two representations: one saves tokens for the model, the other preserves verification capability for the program.

### 5.4.2 Byte-Level Recovery and Hash Verification

Compression counts as lossless only if it is reversible. `expand()` takes a pointer, returns the original body, and verifies the content hash.

```python
rec = brain.expand(cap["ref"])
print(rec["verified"], rec["content_chars"])   # True 386
print(rec["content"])
```

`verified` being `True` means the retrieved body matches the hash declared by the pointer. On mismatch it returns `verified=False` along with the actual hash and an explanation, rather than silently delivering suspect content. This distinction matters: a hash mismatch may mean the record was rewritten, the id was reused, or the pointer was transcribed wrong — three situations with completely different handling, all of which manifest as "the content is wrong."

Another use of retaining the hash is to make compression itself verifiable. The rendered compressed text must satisfy "the atom set of the original body is a subset of the atom set of the compressed text," an assertion checked each time a capsule is built. If any rendering drops an atom, it is judged a defect rather than "compressed better."

The costs must be stated clearly. First, compression saves tokens on narrative text, not on atoms; the higher the atom proportion in a memory, the less compressible space — a log-type memory full of numbers barely compresses at all. Second, every `expand()` is an extra storage read; compression turns "one read" into "two reads plus one verification," and this cost accumulates in batch citation scenarios. Third, the compressed representation depends on the pointer being valid; once the original record is physically deleted, the pointer is permanently invalidated, and what remains in the compressed text is only the atoms and an unverifiable summary. This is also why deletion is soft by default — hard deletion invalidates every compressed representation pointing at it in one stroke.

### 5.4.3 How Compression Works with Budgets

Compression used alone has limited benefit; its real value comes from working with the budget mechanism.

The budget of one recall is fixed. Without compression, an exhausted budget manifests as "later memories cannot get in": the caller sees fewer results than expected but cannot distinguish "the store only has this many" from "the budget was cut off." With compression, entries whose body does not fit are demoted to capsules, and those whose capsule does not fit are further demoted to reference indexes (not counted against the body budget; the caller decides whether to expand).

This ladder turns "the budget is insufficient" from a binary event into a tiered event. The cost is a decline in the explainability of results: the caller receives a block of text mixing full text, capsules, and references, and without reading the cost report in the return, cannot know which entry is complete.

The budget path must therefore also return the ledger: budget ceiling, actual usage, number of discarded entries, and whether truncation occurred. Without these four fields, tiered degradation is unobservable, and unobservable degradation is not much different from silently losing information.

## 5.5 Built-In Graph Memory

### 5.5.1 Entity Linking and Multi-Hop in the Same File

Graph memory usually means introducing a graph database. Mnemosyne's choice is to store triples in the same SQLite file: entities as nodes, relations as edges, with edges carrying time and source. Entity linking is completed on the write path — extracted entities land their edges in the same write, so graph signals are available from the very first memory, with no need for later backfilling.

Multi-hop traversal is implemented with recursive queries, and neighbor queries within two hops are millisecond-level on a single file. This lets questions like "which modules did this decision affect" be answered in passing during recall, without issuing a separate graph query.

The value of a built-in graph is zero dependencies: no Neo4j to deploy, no connection pool to maintain, and backup is still copying that file. For a single-machine memory layer, this eliminates the entire operations surface.

The cost is a scale ceiling. The complexity of recursive queries grows with hop count and degree; beyond three hops with millions of nodes, traversal on a single file is markedly slower than a dedicated graph database. A built-in graph suits neighborhood queries within two hops, not whole-graph analysis.

There is an easily overlooked failure mode here: the quality of entity extraction directly determines the graph's value. Chinese entity extraction relies on rules as a backstop, long strings get hard-cut, and the same object may be extracted as two or three nodes with different names. The graph then has "edges that do not connect," and queries return empty neighbors — it looks like "this entity has no relations" when in fact "the node was shredded." The basis for judgment is the distribution of node degrees: if the overwhelming majority of nodes have degree 1, the graph is essentially not working.

When larger scale is needed, an external graph store adapter can be attached. Six are currently supported: built-in SQLite triples, Neo4j, Memgraph, Neptune, Kuzu, and any SPARQL 1.1 endpoint. The adapter interface is uniform, and switching requires only a configuration change.

### 5.5.2 Trade-offs Between Built-In and External Graph Stores

| Dimension | Built-in SQLite triples | External graph database |
| --- | --- | --- |
| Deployment dependency | None | Requires a separate service and operations |
| Two-hop neighborhood query | Millisecond-level | Millisecond-level |
| Large-scale traversal beyond three hops | Markedly slower | Dedicated indexes, clear advantage |
| Transactional consistency | Same transaction as the main table | Cross-system, requires compensation |
| Backup | Copy the file | Separate backup process |
| Migration cost | Zero | Requires export and import |

Table 5-4 — Trade-offs between the built-in graph and external graph stores

The fourth row is the most easily overlooked. The built-in graph shares a transaction with the memory body, so the state "the memory write succeeded but the edge was not written" does not exist. With an external graph store, the two belong to different systems, and you must either accept eventual consistency or introduce two-phase commit; both paths carry costs.

The criterion is query shape rather than data volume: if the main queries are "get this memory's neighbors" and "which related entities are within two hops," the built-in graph is sufficient and cheaper; if the main queries are "find all paths passing through a certain class of node" and "compute subgraph density," the dedicated indexes of an external graph store are irreplaceable.

## 5.6 The Boundaries of This Storage Form

Combining the decisions above, the capability boundaries of this storage form can be described fairly concretely.

**Capacity.** A single file is usable at the tens-of-GB scale; beyond that, backup, checkpointing, and whole-store scans all become time problems. Note that this number is heavily affected by record size: a record with a 1024-dimensional float vector is an order of magnitude larger than a plain-text record, so the number of records at the same GB count can differ tenfold. To judge when your store reaches the boundary, look at record count and average size, not at disk usage percentage.

**Backup.** Backup is copying the file. This is the form's biggest operational advantage: no export tool, no downtime, and online copying under WAL mode. Recovery is the same — put the file back. The cost is no point-in-time recovery: what you copy is a snapshot of one moment, and writes between two snapshots cannot be reconstructed. Finer recovery granularity requires replaying the audit ledger, which is another path.

**Migration.** Migration moves namespace directories. The advantage is that a single tenant can be moved alone; the disadvantage is no cross-tenant consistent snapshot — different namespaces sit at different points in time during the move.

**Cross-scope queries.** These require multiple reads then merge. This is the direct cost of physical isolation and the most frequently complained about. A mitigation is maintaining a lightweight cross-scope index at the application layer (storing only id, scope, time, type) for "what exists" questions, while bodies are still read from their respective files as needed.

**Concurrent writes.** A single writer. Multiple processes writing the same file simultaneously get serialized and may return busy errors. When high-throughput writes are needed, concentrate writes into one process, or shard by scope across processes.

These boundaries are not a defect list; they are the definition of this form. The reason to choose it is zero dependencies, a single file, simple backup, and structurally correct isolation; the cost is that cross-scope aggregation, horizontal scaling, and fine-grained recovery all require additional design. When any one of these costs becomes the principal contradiction, the correct action is not to patch this form but to reassess whether a client-server architecture is warranted — that is the deployment-form question Chapter 8 expands.

## 5.7 Chapter Summary

This chapter established three judgments.

**First, isolation correctness should be guaranteed by structure, not by discipline.** A shared table plus filter conditions is better under two conditions — when cross-tenant aggregation is needed, and when tenants are numerous with very little data each — but its correctness depends on "every query remembering to add the condition," and there are hundreds of conditions. Physical isolation makes it right by default, at the cost that cross-scope aggregation requires multiple reads. This judgment holds on the condition that the scope key itself is stable; when the key is unstable, physical isolation silently produces a mass of empty stores, a failure mode more insidious than a shared table.

**Second, a single-file database being sufficient depends on the load shape matching, not on the data being small.** WAL's multiple-reader single-writer model matches the memory load of "moderate write frequency, high read frequency," and FTS5 plus JSON1 eliminate dependence on external search and document stores. It falls short in three situations: multi-process concurrent writes, cross-machine scaling, and large-scale analysis concurrent with writes. None of these is caused by "data growing," so estimating whether to switch engines by data volume usually points the wrong way. The real bottleneck is more likely in the computation of retrieval fusion than in the storage engine. This judgment fails when write throughput requirements are high — a single writer becomes a hard constraint, and what must be split then is the load, not the engine.

**Third, the value of lossless compression is that it downgrades "insufficient budget" from information loss to precision tiering.** Atom conservation keeps the values most needing precision intact at any level, and byte-level recovery makes compression reversible. This judgment holds on the condition that narrative text dominates the compressed memory; a memory full of numbers barely compresses, and there the benefit of compression falls below its read and verification cost. The scenario where it fails is physical deletion of the original record — once the pointer is invalidated, the compressed representation retains only unverifiable fragments.

The three judgments share one premise: the store keeps growing, and read cost must not grow with it. Tiering moves old data to cheaper tiers, compression lowers the context cost of a single memory, and physical isolation confines the growth boundary within a single scope. Stacked together, the scale this form can reach is describable — single machine, single writer, tens of GB, a manageable number of scopes.

The remaining question is: when the number of scopes itself becomes a scale variable — a multi-tenant SaaS with one namespace per tenant, for instance — this "manage by directory" approach begins to strain. Chapter 10 handles scope governance, and Chapter 11 handles the cost and capacity of operations at scale. Before that, Chapter 6 must answer a more upstream question: with this many layers, this many signals, and this many compression levels, how exactly should a single recall pick, within budget, the few entries to give the model.

---
