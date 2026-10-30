# Chapter 9 — State Recovery, Asynchrony, and Consistency

A customer-service Agent writes at the end of a session: "The customer requested a refund, ticket number RF-88213, awaiting finance review."
On the next turn it recalls this memory immediately, finds nothing, and so asks the customer about their request all over again.
On the third turn, that memory appears again.
Within the same conversation, the same fact was remembered twice and missed once.

This is not a failed write, and recall is not broken.
It is the inherent shape of asynchronous writing: the hot path only enqueues, and extraction, conflict resolution, and consolidation are all handed to the background.
Reading before the queue has reached disk returns the old state from before it landed.
The system did not lie; it simply made no promise about "read immediately after write".

The durability promise of a memory system is weaker than most engineers expect: it guarantees "accepted writes will eventually reach disk", not "a write is readable when it returns".
This difference is almost unobservable in a single-process, low-frequency development environment, yet in production it determines whether you can prove your innocence during an incident review.

This chapter proceeds as timing → barrier → events → idempotency → the boundary of promises → drills, each section answering a different facet of the same question: given that the process may die at any moment, what exactly can you promise the reader.

## 9.1 Two Timings of Memory Writes

There are two write paths, and the difference is not in the interface but in "when it counts as done".

**Synchronous writing** is "readable as soon as written".
A single `add()` completes extraction, embedding, storage, and audit-chain appending internally, and by the time it returns the data is already in SQLite.
Its advantage is zero mental overhead: no barrier, no polling, no need to understand queues.
The cost is that it holds up the main loop: one write includes one model call (single-pass ADD-only extraction), typically on the order of hundreds of milliseconds with a commercial model, and writing synchronously on every conversation turn makes that latency perceptible to the user.

**Asynchronous writing** compresses the hot path into a single enqueue.
After `memory_hot_path` with `action=enable` turns this mode on, the hot path only places the write request in the queue and returns immediately; extraction, conflict adjudication, consolidation, and embedding generation all happen in background threads.
The advantage is that the main loop is no longer bound by model latency; the cost is read-after-write inconsistency: a successful enqueue does not equal a successful disk write.

| Dimension | Synchronous write | Asynchronous write |
| --- | --- | --- |
| Semantics on return | Already on disk, readable | Enqueued, not necessarily readable |
| Main-loop latency | Includes one model call | Enqueue overhead only |
| Loss surface on crash | Writes already returned are not lost | Enqueued writes not yet on disk are lost |
| Extra mechanism needed | None | `flush` barrier or event polling |
| Suitable scenario | End of session, batch import | High-throughput in-turn writes |

Table 9-1 — Semantic differences between synchronous and asynchronous writes

The criterion is not "which is faster" but "whether the reader can tolerate stale values".
If the memory is needed for a decision immediately after the write, synchronous writing or an explicit barrier is mandatory.
If the write is merely "note it down, deal with it next session", asynchronous is a reasonable default.

## 9.2 `memory_hot_path` and the flush Barrier

`memory_hot_path` has three actions, corresponding to "open", "look", and "wait".
`action=enable` turns on asynchronous writing; `action=status` returns queue depth and statistics, used to judge whether the background is keeping up; `action=flush` blocks until the queue has reached disk.

The third action is the entire point of this section.
**`flush` is the consistency barrier for read-immediately-after-write.** Read without flushing and you read stale values, with no error raised.

```python
from mnemosyne import MemoryBrain

brain = MemoryBrain("./mem")
brain.ensure_init()

# Turn on asynchronous writing: the hot path only enqueues
brain.hot_path(action="enable")

brain.retain("The customer requested a refund, ticket number RF-88213", fast=True)
hits = brain.recall("refund ticket", k=3)          # may be empty: not yet on disk
brain.hot_path(action="flush")                    # consistency barrier
hits = brain.recall("refund ticket", k=3)          # now guaranteed readable
```

What this code demonstrates is exactly that failure scenario: the first `recall` returning empty is not a bug but a direct consequence of asynchronous semantics; the `flush` line before the second `recall` is the only means of turning "read after write" back into a dependable promise.

The typical form of this trap is "passes in tests, fails intermittently in production".
In a test environment write volume is small, the background thread catches up with the queue almost instantly, and `recall` happens to read the new value; in production the queue has a backlog, and the same code starts returning stale results intermittently.
More troublesome is that it presents as "sometimes remembers, sometimes does not", which is easily misdiagnosed as a recall quality problem, leading to tuning retrieval parameters — a completely wrong direction.

The cost is that `flush` gives back part of the benefit of asynchrony.
The wait for one `flush` equals the remaining processing time of every pending write in the queue, and under a backlog it can be longer than a synchronous write.
So the correct usage is not "flush after every read" but "flush only when the read depends on the write that just happened".

## 9.3 Operation Logs and Events

For asynchronous writes to be visible across processes, the mechanism is a persisted operation log.
Accepted writes have a record in the log even when processing is not yet complete.

`add` over REST is asynchronous and returns an event id: `POST /v3/memories/add/` returns immediately, and the actual extraction and storage happen in the background.
The caller has two ways to confirm the result: poll `GET /v1/event/{id}/` and watch the status go from pending to succeeded; or use MCP's `get_event_status`, which is semantically identical.
`GET /v1/events/` lists all operations, and `list_events` is its tool form.

The event mechanism solves "cross-process visibility", not "read consistency".
The distinction is worth stating plainly: events tell you "whether this write has finished processing", while the barrier guarantees "whether this write can be read right now".

In production the two usually need to be used together: `add` gets an event id, poll until succeeded, then `recall`.
If you only poll events without flushing, there is still a very short window in which you can read the old state — because the event status update and index visibility are not the same atomic operation.

The cost is that polling itself is not free.
In high-frequency write scenarios, one poll per event more than doubles QPS; the reasonable approach is batch polling via `GET /v1/events/`, or simply using `flush` instead of tracking each event.

## 9.4 Crash Recovery and Idempotency

After a process is killed, the correctness of recovery depends on two things: what was already on disk is not lost, and what was submitted repeatedly is not duplicated.

**What was already on disk is not lost** is guaranteed by SQLite's WAL and transactions.
One write touches four tables — body text, structured facts, graph triples, audit ledger — and they commit in the same transaction: a crash before commit rolls the whole transaction back; a crash after commit leaves the data intact.
The audit ledger is a SHA-256 chain, which makes this especially important — writing half a chain makes every subsequent `verify_integrity` fail.

**What was submitted repeatedly is not duplicated** depends on idempotency identifiers, not on the caller's self-discipline.
There are many triggering scenarios: client timeout retries, at-least-once delivery from a message queue, manual replay by operations.
Without deduplication, the same conversation is extracted twice, producing two nearly identical memories.
Deduplication relies on two layers of judgement: content fingerprint (identical body text is judged duplicate outright) and similarity (semantically close but not identical is handed to `dedup` and `consolidate`).

The batch boundary of `retain_batch` needs separate mention.
It is much faster than writing record by record (the official note says about 15 times), but its atomicity boundary is "each item independent", not "the whole batch atomic": if the seventh item in a batch fails, the first six are already written.
So recovery logic for batch imports must record progress per item and must not assume "this batch either all succeeds or all fails".

The cost is that deduplication itself is not free.
Content fingerprints are cheap; similarity judgement requires computing and comparing embeddings, which at the ten-thousand-record scale is a substantial computation.
And deduplication is approximate: a loose threshold misses true duplicates, a tight one kills two memories that "look alike but really differ".

## 9.5 Graded Consistency Promises

Writing promises as grades is far more useful than writing "supports transactions".

| Promise | Holds? | Boundary |
| --- | --- | --- |
| Single write is atomic | Holds | Four tables in one transaction, including the audit chain append |
| Committed writes are not lost | Holds | After WAL reaches disk; queue contents not yet flushed are excluded |
| Read immediately after write | Does not hold (async mode) | Requires `flush` or event polling |
| Cross-scope aggregate read is atomic | Does not hold | Under physical isolation it is N independent files, N transactions |
| Concurrent reads and writes do not block each other | Holds | In WAL mode writes do not block reads, but write and write remain serialized |

Table 9-2 — The scope and boundaries of consistency promises

The two "does not hold" rows deserve elaboration.

**Cross-scope aggregate reads are not transactional.**
Each scope is an independent SQLite file, and a cross-tenant statistic opens N files in sequence.
During the traversal, another process may be writing to one of those files.
The result is that this aggregation does not see a global snapshot at any single point in time but a splice of "each file at some moment of its own".
For operational reports this usually does not matter; for accounting statistics it is simply wrong.

**Under WAL, write and write remain serialized.**
WAL lets reads not block writes and writes not block reads, but SQLite permits only one write transaction at a time.
This means write concurrency does not grow with CPU core count.
Spread across tens of thousands of scopes on a single machine, each scope's write frequency is low, so this is not a problem.
But if one hot scope must bear high-concurrency writes, SQLite becomes a hard bottleneck — a point that reappears in the capacity judgement of Chapter 11.

The cost is that this set of promises must be written into documentation rather than left for users to guess.
An unwritten "eventual consistency" amounts to no promise at all during an incident review.

A horizontal comparison shows how universal this boundary is.
As of October 2026, LangMem divides writing into "conscious formation" (hot path) and "subconscious formation" (background), with persistence relying on LangGraph's `BaseStore`.
`InMemoryStore` is lost on restart, and production must switch to a persistent implementation such as `AsyncPostgresStore`.
The structure on both sides is the same: the hot path pursues low latency, the background pursues complete processing, and the inconsistency in between must be handled explicitly by the user.

## 9.6 Recovery Drills

The sentence "killing the process does not lose memories" must be verifiable, otherwise it is only a design intention.
The checklist below can be executed item by item, each with an explicit pass criterion.

- **Hard-kill during writes**: write 100 records then immediately `kill -9`; after restart, `recall` should return all 100. If fewer than 100 come back, some writes were treated as successful without actually committing.
- **Queue loss surface**: enable asynchronous writing, enqueue 50 records, then hard-kill immediately. After restart there should be fewer than 50, and the missing items should be identifiable in the operation log as incomplete. If not one is missing, `enable` is actually synchronous semantics and the documentation does not match the implementation.
- **Repeated submission**: `add` the same conversation three times in a row; `dedup` should report 2 duplicates. If it reports 0, the idempotency identifier is not in effect.
- **Audit chain integrity**: after the hard kill, run `verify_integrity()`, which should return `valid=true`. If `first_broken_at` has a value, a half chain was written.
- **No double billing**: compare the `stats` write count and model call count before and after the hard kill. The model call count should be less than or equal to the write count; repeated submissions should not produce extra extraction calls.

The last item is the most easily overlooked and the most expensive.
If asynchronous retries are not idempotent, one crash recovery can cause the same conversation to be extracted twice, both times as real model calls.
What the bill shows is "write volume doubled", not "an incident".

## 9.7 Chapter Summary

This chapter establishes three judgements.

First, the two write timings are a semantic option, not a performance option.
Synchronous writing promises "readable on return"; asynchronous writing promises "accepted on return".
Which to choose depends on whether the reader can tolerate stale values, not on which is faster.
This judgement fails when "writes and reads are never in the same turn" — in pure offline batch processing there is no difference between the two.

Second, `flush` is the only reliable read-after-write barrier in asynchronous mode; event polling can only confirm "processing finished", not guarantee "readable now".
The cost is that `flush` waits for the entire queue and is slower than synchronous writing under a backlog, so it should be used only when a read depends on the write that just happened.
This judgement does not apply in pure synchronous mode, where the barrier is redundant.

Third, consistency promises must be stated in grades.
Single-write atomicity and committed-writes-not-lost both hold.
Read-immediately-after-write and cross-scope aggregate atomicity do not hold, and require an explicit mechanism or an explicit abandonment.
Using the phrase "eventual consistency" as a promise amounts to giving up the ability to prove yourself during an incident review.

One question this chapter sidesteps: if multiple processes write to the same scope simultaneously, who performs the idempotency judgement.
Within a single process, in-memory deduplication works; across processes it can only rely on a unique constraint at the storage layer or on content fingerprints.
And when the writers are different Agents belonging to different users, the question is no longer only deduplication but "who has the right to write".
Chapter 10 continues from here.

---
