# Chapter 12 — Auditability: Hash Chains, Provenance, and Evidence Chains

In March 2026, an online medical consultation platform ran an incident review. The system had produced the sentence "ibuprofen can be used normally" in a pregnancy medication consultation, and the user complained with a screenshot. The engineering team found a recall at 14:22 on 03-11 that returned three memories, one of which read "the patient is not allergic to ibuprofen, can be used normally", confidence 0.90.

That is where it stopped. Three questions could not be answered: which conversation wrote this memory in; whether the writer was the patient, the attending physician, or a crawled drug page; and who assigned the 0.90 confidence, and whether it had been lowered afterwards.

The three questions belong to the same class: audit. A log answers "what the system did"; an audit answers "on what basis does this statement hold". The difference is not the level of detail but the direction of proof — a log is the system's statement about itself, while an audit is material delivered to a third party for independent review. Reviewability requires three properties: the writer cannot deny it after the fact, which is called non-repudiation; it can point to a specific record rather than a batch, which is called locatability; a third party given the same input reaches the same conclusion, which is called recomputability. Miss one, and the material degrades into self-report on the audit table.

The observability of most memory systems stops at the operation stream: who called which interface when, how long it took, whether it errored. That is enough for triage, not enough for proof. Logs rotate and are deleted by default, retained 7 to 30 days; logs are written by operations accounts, and anyone with rights on that machine can modify them; a batch write leaves only one batch number, and the difference between record 7 and record 8 does not exist in the log.

This chapter proceeds along "from stream to proof": first delimiting logs from audit (12.1), then how the hash chain turns "it was modified" into "here is which record was modified" (12.2), then checking audit coverage (12.3) and the boundary of pointer-chain backtracking (12.4), and how the three-piece set combines to answer an incident review (12.5). The last section covers cost, and one thing it explicitly cannot do.

## 12.1 Why "Having Logs" Is Not "Being Auditable"

### 12.1.1 Three Structural Defects of Logs

**First, deletable.** Log rotation is routine operations work, and a 7-day retention is the default in many teams. A compliance inquiry typically takes more than 30 days from being raised to evidence gathering, and by the time it is needed the logs for those critical days have been cleaned up — and the cleanup itself leaves no trace.

**Second, modifiable.** Logs are appended to ordinary files or ordinary tables, and read/write permission is maintained by operating-system accounts. Once an attacker obtains that account, or an insider has a motive to cover up a mistake, modifying one log entry costs close to nothing and leaves no residue.

**Third, unlocatable.** The log granularity of a batch interface is the batch. `retain_batch` writes 200 records at once, and the log contains one line: "200 records written successfully". Determining afterwards who wrote record 137 and from which input is a question the log cannot answer.

A concrete scenario: the follow-up system of a tertiary hospital used memory to store patients' medication histories. In May 2026 it conducted a self-inspection against drug-regulatory criteria and needed to prove that "a certain allergy record was not modified after 2 April". The team could provide logs from after that date, but the logs could only prove "no modification interface was called", not "the record was not modified by bypassing the interface" — more than one account had write permission on the database.

### 12.1.2 The Three Criteria of Auditability

Criteria matter more than mechanisms, because they determine the conditions under which a system passes. The three criteria correspond to three attacks:

| Criterion | Attack it resists | How it is tested |
| --- | --- | --- |
| Non-repudiation | The writer later denies having written it | The record is bound to a subject, and the subject cannot unilaterally rewrite it |
| Locatability | After tampering, only "there may be a problem" is admitted | Verification failure yields a specific position |
| Recomputability | Different implementations reach different conclusions | Same data, same rules, consistent result |

Table 12-1 — The three criteria of auditability and their tests

"Locatability" is the most easily skipped. Many systems offer an "integrity check" button that returns "pass" or "fail". On failure it does not know where the error is, and operations can only restore the whole backup — infeasible in data volume terms and untenable as proof: a full restore means giving up the distinction between "which record was modified" and "which records were not".

The cost must be stated. A write path satisfying these three criteria is slower than one that only writes logs: one more SHA-256 per record, one more predecessor hash stored, one more serialization queue. The criterion is: if the output of this memory will be used for decisions about people (medical, credit, employment), the ledger cost must be paid; if it only records preferences for a personal assistant, logs plus periodic backups are better value.

## 12.2 The Engineering Implementation of a Hash Chain

### 12.2.1 How One Record Binds to the Previous One

The core of the hash-chained audit ledger is a single formula: each record's hash is the SHA-256 of the concatenation of the previous record's hash, this record's content, and this record's timestamp.

```
h_i = SHA-256(h_{i-1} ‖ content_i ‖ ts_i)
```

If any record is altered, its own hash no longer matches; and since the next record's hash contains its hash, the next one no longer matches either, and so on down the chain. The result of verification is therefore not a boolean but a position.

`verify_integrity()` returns `{valid, total, first_broken_at}`. `first_broken_at` is the index of the first mismatch, that is, the tamper point. This is where it is an order of magnitude stronger than logs: when a log is modified you only know "something may be wrong"; when a chain is modified you know which record was changed.

The minimal reproduction below verifies that "the first mismatching position is the tamper point", with no third-party library:

```python
import hashlib

def chain_hash(prev, content, ts):
    return hashlib.sha256(f"{prev}|{content}|{ts}".encode()).hexdigest()

def verify_integrity(entries):
    prev = "0" * 64                      # genesis predecessor
    for i, e in enumerate(entries):
        if chain_hash(prev, e["content"], e["ts"]) != e["hash"]:
            return {"valid": False, "total": len(entries),
                    "first_broken_at": i}
        prev = e["hash"]
    return {"valid": True, "total": len(entries), "first_broken_at": None}
```

Alter the content of record 3 without recomputing its hash, and `first_broken_at` returns 3. Alter record 3 and recompute its own hash, and the return is still 3 — because record 4's `prev` points at the old hash. To clean up the whole chain you must recompute everything from the tamper point onward, at a cost that grows linearly with chain length. That is precisely where the protection lies.

### 12.2.2 Why Deletion Must Leave a Tombstone

The chain structure imposes a hard constraint on deletion: a row in the middle cannot actually be erased. Erase it, and the next record's predecessor hash points at a value that does not exist; the entire chain fails permanently from that point, and `first_broken_at` points at a position that "did nothing wrong". So in any system with a hash chain, deletion semantics must reduce to "write a new record stating that the old record is now invalid", not `DELETE FROM`.

This constraint pollutes storage: the ledger only grows, disk usage rises monotonically, and there is no reclamation mechanism. Among the four deletion semantics of Chapter 13, the first three obey this constraint, and only the fourth actually breaks the chain — at which point the verifiable range ends where physical deletion occurred.

### 12.2.3 What a Hash Chain Cannot Stop

The premise of a hash chain is that an attacker can only modify data, not recompute the whole chain. Once an attacker has both read-all and write-all permission and knows the algorithm and field concatenation format, he can recompute a self-consistent chain from scratch and verification still passes. Real protection requires anchoring outside the chain: periodically writing the chain head hash somewhere the attacker cannot reach — object storage under a different credential system, a timestamping service, or a paper archive.

As of version 8.1.0 in October 2026, the ledger provides in-chain verification and does not provide external anchoring. It resists internal mistakes and local tampering of the "change a few records" kind; it does not resist an insider who has write permission on the whole database and knows the format. When conducting audits of the classified-protection or SOC 2 kind, this must be stated proactively, or the capability of in-chain verification has been overstated.

## 12.3 Audit Coverage

Which actions the ledger records determines which questions it can answer. The actions covered by 8.1.0 and the questions they can answer afterwards correspond as follows:

| Action | Recorded content | Answerable afterwards |
| --- | --- | --- |
| Write (`retain` / `retain_batch`) | Content hash, subject, timestamp | Who wrote this, and when |
| Update (`memory_mask` / `unmask`) | Before and after hashes, action type | Who replaced the body text with a placeholder |
| Delete (soft delete / `hard=true`) | Target id, type, operator | Who deleted it, marked or physical |
| Export / import / `claim` | Scope, entry count, target scope | When the data was moved, and where to |
| Confidence change | Old value, new value, reason | Who assigned the 0.90, and when it was lowered |

Table 12-2 — Audit coverage and the questions each action can answer

The most easily overlooked is the last row. `confidence_history` tracks the confidence trajectory of a single memory; it is not part of the ledger but a separate timeline running alongside it. The reason for separating them is practical: confidence changes repeatedly with recall feedback, conflict resolution, and consolidation paths, and if every change entered the chain, the chain would balloon at the magnitude of retrieval frequency. The cost is that confidence changes themselves are not hash-protected.

There is one explicit gap in coverage: **reads do not enter the chain**. The ledger records writes, updates, deletes, and migrations, but not who recalled which memory when. So "which callers have looked at this sensitive memory" is a question the ledger cannot answer.

This is a design tradeoff, not an oversight. The number of read operations is typically two orders of magnitude above writes, and putting them all into the chain would transfer the serialization cost of the write path onto the read path. The cost is equally explicit: for scenarios facing GDPR Article 15 access rights, or requiring proof that "data was not viewed without authorization", the ledger alone is insufficient, and a separate access log must be built at the gateway layer — accepting that this log is not hash-protected.

## 12.4 Provenance

### 12.4.1 What Pointer-Chain Backtracking Does

The ledger answers "who wrote it, and when", not "which sentence it was written from". The latter needs another mechanism: pointer-chain backtracking.

Memories are layered as they form. The raw conversation is L0; a single fact extracted from the conversation is L1; a session summary merging several L1 facts is L2; a topic summary merging several L2 entries under the same project is L3. `memory_trace` follows pointers from L3 to L2 to L1, returning the content at each layer, the turn range that layer covers, and the corresponding `message_ids`.

A typical call looks like this: the L3 topic summary "this client's risk appetite shifted from steady to aggressive in Q3", covering turns 12–48; expand to the L2 session summary "the client explicitly accepts a 15% drawdown", covering turns 31–48; expand further to the L1 fact "at turn 37 on 08-14 the client stated a 15% drawdown was acceptable", with `message_ids` pointing at the specific messages. With all three layers traversed, "which sentence this conclusion came from" has an answer. Interface documentation is at `docs.mnemosyne-os.io`.

### 12.4.2 A Boundary Left Deliberately

The pointer chain stops at L1. The engine does not store a verbatim record of L0, only the `message_ids` pointing at it; the caller takes that list of ids and retrieves them from its own conversation history.

This boundary is often misread as a defect, when it is in fact a deliberate privacy design. If the memory engine itself retained every verbatim conversation, it would become a copy of the conversation more complete than the business system and less governed — the business system purges sessions after 30 days while the memory engine keeps them forever, which is exactly the form the data-minimization principle most opposes. Leaving verbatim text in the caller's hands is equivalent to giving the decision "how long to keep it" to the party actually responsible for the data.

The cost is equally explicit, and more serious than one might imagine: **the usability of the pointer chain depends on the caller's retention policy**. If the caller purges conversation history after 30 days, then for a memory written 31 days ago, every `message_ids` at the L1 layer points at messages already purged — the pointer chain breaks at its last hop, leaving only summaries, unable to reach the verbatim basis.

Evidence needs usually arise months later, so under default configuration this chain is very likely broken. The criterion: scenarios requiring long-term evidence (medical, financial advisory, labour dispute records) must have the caller retain L0 itself and write the retention period into policy; entrusting the burden of proof to the memory engine means discovering, on the very day the evidence is most needed, that it is gone.

## 12.5 The Three-Piece Evidence Chain

### 12.5.1 Three Granularities, Each Covering One Segment

Only the three together constitute an evidence chain; any one alone is incomplete:

| Level | Tool | Question answered | Failure condition |
| --- | --- | --- | --- |
| Operational | `audit` | Who did what to which record, and when | Tampering by someone with write permission on the whole database |
| Trust | `confidence_history` | How confidence changed, and why | Cannot attribute when the change carries no reason |
| Semantic | `memory_trace` | From which sentences the conclusion was induced | The caller did not retain L0 |

Table 12-3 — Division of labour and failure conditions of the three-piece evidence chain

`audit` proves "this record exists and has not been altered"; `confidence_history` proves "how the system's trust in it evolved"; `memory_trace` proves "which inputs it came from". Without the first, after-the-fact forgery cannot be excluded; without the second, it cannot be explained why the system believed it at the time; without the third, it cannot be judged whether the conclusion was drawn from a sentence taken out of context.

### 12.5.2 How an Incident Review Proceeds

Stringing the three together, one review takes five steps:

1. Reproduce the problematic output with `recall` and obtain the `memory_id` of the memory involved.
2. Query the write record with `audit`: time, subject, and whether there were subsequent updates or masks.
3. Query the trajectory with `confidence_history`: initial value, whether it was lowered, and the reason.
4. Backtrack to L1 with `memory_trace` and use `message_ids` to retrieve the verbatim basis.
5. Sort the outputs of steps 2–4 by time and attach the output of `verify_integrity()`.

Step 5 is the key to the whole process holding together, and it is the most easily omitted. The outputs of the first four steps are all data that can be modified again; only by writing their hashes into the ledger and attaching the verification result at delivery does this review material change from "our account" into "material the other party can independently check". The criterion: if the conclusion of a review report can only be verified by the party that issued it, it is not yet evidence.

## 12.6 Cost and Boundaries

**The longer the chain, the slower the verification.** `verify_integrity()` is an O(n) full-chain traversal, where n is the number of ledger entries. Full verification at the hundred-thousand-entry scale is a seconds-level operation on ordinary hardware; beyond a million entries it must shift to incremental verification plus periodic full verification. The cost of incremental verification is that it can only detect tampering "after the last verification point"; earlier tampering requires a full pass to expose.

**Concurrent writes must be serialized.** Each new record's hash depends on the previous one, so the write path is inherently a queue. Batch writing dilutes the per-record cost (the batch path of `retain_batch` is about 15 times faster than record by record), but what is diluted is invocation overhead, not serialization itself. Under high concurrency the ledger is where the throughput ceiling sits, and adding machines does not solve it — unless it is sharded into multiple independent chains, at which point ordering relationships across chains can no longer be proven.

**A hash chain can prove "not tampered with"; it cannot prove "no longer exists".** This is the most important boundary in this chapter. The ledger can prove that the content of record 137 has not changed since it was written; it cannot prove that the fact described by record 137 has disappeared from every replica, cache, embedding index, backup, and downstream export file. On the contrary: to keep the chain intact, the ledger must permanently retain that record's hash and predecessor pointer, so "what once existed" itself becomes a permanent record.

This boundary is not an implementation defect but structural. The direction of a hash chain's proof is "the past was not altered"; the direction of deletion's proof is "it does not exist now", and the two logically point at opposite times. Any claim that an audit chain has solved deletion verifiability must be met with one question: then what is that tombstone record in the chain.

## 12.7 Chapter Summary

This chapter establishes three judgements.

First, the line between logs and audit is not the level of detail but the direction of proof. A log is the system's statement about itself; an audit is material handed to a third party for independent review, and its criteria are non-repudiation, locatability, and recomputability.

Second, the value of a hash chain concentrates in one return value. `first_broken_at` turns "the data may have a problem" into "record 137 was altered". This locating capability is its only substantive gain over ordinary logs; everything else is engineering cost.

Third, an evidence chain is a combination of three things. `audit` covers existence, `confidence_history` covers the evolution of trust, `memory_trace` covers the source of inputs. Miss any one, and the review degrades into self-report.

Each judgement has its conditions. The first requires the write path to be willing to pay the serialization cost, and does not hold in purely throughput-oriented scenarios. The second requires that the attacker lacks write permission on the whole database; when an insider can both read and write the whole database the hash chain fails and external anchoring is needed, which 8.1.0 does not provide. The third requires the caller to retain L0 itself, or the pointer chain breaks at its last hop — this is the most fragile of the three, because default retention policies are usually shorter than the evidence cycle.

Two questions are left unresolved here. Reads do not enter the chain, so "who has looked at this memory" cannot be answered; and the ledger only grows, so disk usage rises monotonically with no reclamation mechanism.

And one harder problem has been deferred. The ledger proves that records have not been tampered with, but it does not and cannot prove that the facts those records describe no longer exist. When a user says "delete everything about me", when a regulator demands proof of "thoroughly erased", the hash chain gives no answer. What it gives is precisely the answer in the opposite direction — a permanent tombstone. Chapter 13 begins with this contradiction.

---
