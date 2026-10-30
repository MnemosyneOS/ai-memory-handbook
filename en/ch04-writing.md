# Chapter 4 — Writing: Extraction, Typing, and Conflict Resolution

In March 2026, the customer-service team at a subscription SaaS company discovered that their Agent would insist on the phone that a customer "does not have a subscription." Digging in, two memories sat in the store: one from November 2025 saying "customer has unsubscribed," and one from February 2026 saying "customer has resubscribed." Both were there, both were true, and recall ranked the older one first.

This is not a retrieval defect. It is that write time never answered one question: when a new fact arrives, what happens to the old one. That question has no neutral answer, because it is simultaneously bound by three constraints — facts must not be lost, cost must not spiral, and users must be able to overrule. The three pull against each other, so any scheme must concede in some direction.

There are three common concessions. The first lets the model decide at write time whether to update or delete, at the cost of two model calls per write, plus the fact that a bad update silently erases a true fact — failure makes no sound. The second does nothing and only appends, at the cost of a store that bloats monotonically with conversation length and contradictory entries that coexist forever. The third defers the judgment to read time, at the cost of redoing resolution on every recall, with latency growing with the store.

All three concessions have counterparts in mainstream 2026 implementations, and their differences are not about "which is more advanced" but about which segment of the path each puts its cost on. Putting cost in the write segment slows every conversation; in the storage segment, it makes backups and migration heavier; in the read segment, it makes latency drift with store size. Which to choose depends on which class of failure the system fears more.

This chapter proceeds in the actual execution order of a write. 4.1 takes apart how many distinct things actually happen, engineering-wise, in one write; 4.2 explains why time must have two axes and which class of question a missing axis gets wrong; 4.3 covers what the typing enumeration solves and what burden it places on the extractor; 4.4 covers how conflicts are judged and what happens after judging; 4.5 and 4.6 handle the two most easily overlooked input classes — images and Chinese.

## 4.1 The Engineering Logic of Single-Pass Writing

### 4.1.1 What Happens Inside One Call

Treating `add()` as "stuffing a piece of text into the store" is the most common misconception at the integration stage. It is in fact a pipeline: one model call produces a batch of facts, and then each fact passes through four stages. The division of labor among these five stages must be clear, because the consequences of their failures are entirely different — some failures lose data, others lose only an index.

**First, extraction.** The input may be a bare string, a single message, or a list of messages. The extractor slices it into several independent facts, each with a category, a confidence, and entities. The quality of this step sets the ceiling for everything downstream: a fact the extractor never saw cannot be recalled no matter how strong retrieval is.

**Second, safety notary.** This runs before data lands on disk and does three things: credential detection with field-level sanitization, invisible-Unicode detection (zero-width characters, bidirectional controls), and HTML injection detection. Sanitization happens before entity extraction and embedding, so masked values never enter the index; injection detection, however, uses the unsanitized original text, because after sanitization the credential patterns no longer exist and the alerting capability would vanish with them.

**Third, persistence and index building.** The SQLite main table holds structured fields, the FTS5 virtual table holds tokenized full text for keyword retrieval, and the vector backend holds embeddings. There is a detail here that is easy to get wrong: the vector must be computed exactly once and fed to both the SQLite record and the vector backend. Writing only to the backend while leaving the record's `embedding` empty causes the semantic channel to score it as zero during candidate scoring — recall wasted.

**Fourth, appending to the hash chain.** Every write action appends a SHA-256 chain entry to the hash-chained audit ledger. It is a chain rather than a log because a chain can locate exactly which entry was changed, while a log can only prove "something changed."

**Fifth, persisting the operation log.** In asynchronous mode, `add()` immediately returns `{"event_id", "status": "PENDING"}`, and the caller polls with the event id. The log must be persisted rather than kept in memory; otherwise, after a process restart, an already-accepted write becomes "no such event."

The failure consequences of the five stages differ greatly; integrators use this table to decide which links are worth retrying.

| Stage | Failure manifestation | Consequence | Retryable |
| --- | --- | --- | --- |
| Extraction | Returns an empty fact list | Nothing was remembered this round, with no error | Yes, but the extractor must be changed |
| Notary | Sanitization misses an item | Credentials enter the index and embeddings in plaintext | No, the store must be purged first |
| Persistence | Main table succeeds, vector is empty | That entry can only be recalled by keyword | Yes, recompute the embedding |
| Hash chain | Append fails | The write is valid but unauditable | Yes, the ledger can be backfilled |
| Operation log | Status stuck at RUNNING | The caller cannot determine success or failure | Manual verification required |

Table 4-1 — Failure consequences of each stage in the write pipeline

The second row is the most underestimated. The other four can all be remedied after the fact, but once a credential has entered an embedding vector in plaintext, the only remedy is to purge the store — because the vector already contains the semantic representation of that value, and changing the text will not remove it from the vector.

The following code verifies the minimal write path: no model configured, using only the built-in rule extractor and built-in embedder.

```python
from mnemosyne import Memory

m = Memory()                                    # built-in embedder + rule extractor
out = m.add("I moved to Berlin in 2023.",
            user_id="alice", observation_date="2023-06-01")

for r in out["results"]:
    print(r["event"], r["categories"], r["memory"])
```

Each returned result carries an `event` field, whose value under single-pass writing is always `ADD` (fully duplicated content is caught by the pre-deduplication step, marked `DUPLICATE`, and produces no new id). `observation_date` does not participate in extraction; it affects only the time field, as the next section explains.

The parameter surface of `add()` is far wider than the minimal example, and three parameters directly affect write semantics, warranting separate explanation: `infer=False` skips extraction and stores turn by turn verbatim, suitable for preserving transcripts as-is; `immutable=True` marks the entry as non-rewritable, for values such as invoice numbers and contract identifiers that should not be overwritten by later updates; `includes` / `excludes` perform a lexical filter after extraction, used to keep a certain class of facts out of the store. All three are "adding a bypass on the single-pass pipeline," not switching to a different pipeline.

### 4.1.2 Why Not Make a Second Call

The motive for a second call is reasonable: only by seeing the memories already in the store can the model judge whether to overwrite or append. But this design has three costs, and the third is fatal.

The first is the cost structure. Judging requires putting existing memories into the prompt, tripling the prompt volume of a single write and doubling latency. For a conversational Agent that writes once per turn, this arithmetic spirals out of control in long sessions.

The second is the shape of the failure mode. Appending is monotonic: a bad extraction can only introduce noise. A bad update silently erases a true fact, and afterwards there is no way to distinguish "this was never remembered" from "this was deleted by a later update." Noise can be suppressed by ranking and thresholds; loss cannot.

The third is that it downgrades a semantic problem — "two statements are inconsistent" — into "one model judgment." And the inconsistency itself carries information: it may mean the user changed their mind, or it may mean one of the two was recorded wrong. Single-pass writing preserves the contradiction and hands it to the conflict resolution in 4.4 for classification, which is far more auditable than letting the extractor pick a side on the fly within one call.

The cost must be stated plainly: **add-only, never modify, means storage grows monotonically**. The write channel is always open while read cost grows with the store, and the difference between the two can only be repaid through tiered degradation and lossless compression (Chapter 5). At the same time, **the recall ceiling of single-pass extraction is locked by extractor quality**: if the extractor reads only user turns and not assistant turns, then actions the Agent itself confirmed — "I have saved the file to /tmp/x" — never enter the store, and subsequent turns have no way to know it happened.

This leads to the configuration criteria.

| Criterion | Built-in rule extractor suffices | LLM extractor must be configured |
| --- | --- | --- |
| Input language | Single language, regular sentence structure | Mixed languages, deeply nested sentences |
| Fact density | 0–2 facts per turn | Five or more independent facts in one passage |
| Domain vocabulary | Common words (preferences, addresses, job titles) | Domain terminology, model numbers, identifiers |
| Cost of failure | Missing one just means one fewer memory | Missing one causes a downstream misjudgment |
| Cost constraint | No API key, must be offline | One call per write is acceptable |

Table 4-2 — Criteria for choosing an extractor

The rule extractor is not a "degraded option"; it is an independently usable path: deterministic, zero latency, zero cost, and the only choice in an environment without network access. Its boundary is generalization — it relies on pattern matching, so an input like "last month I moved my desk to the 17th floor and left the 3rd floor to the intern," which packs two facts into one sentence and also carries a relative time, is easily half-extracted. There the gain from configuring an LLM extractor is clear, at the cost of one extra call per write and extraction results that are no longer deterministic and reproducible.

Batch scenarios add one more constraint: the overhead of per-item `add()` lies mainly not in extraction but in rebuilding indexes and appending to the ledger every time. The batch interface merges that portion, with an officially stated magnitude of an order of magnitude faster (the README says roughly 15×). But batch is not free — it places a batch of writes inside one transaction boundary, so isolation on single-item failure is worse than item-by-item writes, and the per-item `event` field in the returned results must be used to determine which succeeded.

### 4.1.3 The Boundary of Deduplication

In an add-only system, duplication is the main source of noise and also the easiest place to get wrong. An Agent that rereads its own context every turn will store the same preference again each turn; after ten turns the store holds ten copies of "the user prefers dark mode," recall returns five identical memories, and it looks like retrieval has broken.

Deduplication relies on a content signature — a stable hash computed after normalizing whitespace, casing, and template verbs. Identical content in the same store necessarily yields the same id, so deduplication needs no extra index structure, only a signature comparison before write.

But that comparison is bounded. Scanning the signatures of the entire store item by item drags a single write to nearly a second at the hundred-thousand-entry scale, and "slower the more it remembers" is worse than "occasionally stores a duplicate." The implementation sets a scan cap, beyond which it falls back to the engine's native template-hash versioning mechanism, which recognizes duplicates of the same template but not rewrites. The cost must be acknowledged: **beyond the scan cap, rewrite-type duplicates get through**. It is probabilistic, depending on store size and write position, so the same Agent behaving normally on a small store and beginning to show near-duplicates on a large one is expected behavior, not a defect.

## 4.2 The Dual Time Axis

### 4.2.1 When the Fact Happened Versus When the System Learned It

In September 2026, a cross-border logistics company bulk-imported its 2024 historical tickets into the memory store, feeding them in item by item with `add()`. Three months later someone asked, "Which port did this batch of goods go through in 2024?" and the Agent answered with the most recent port. The reason is mundane: every record's timestamp was the day of import.

A memory involves at least two times. **Event time** is when the fact happened in the real world; **ingestion time** is when the system learned of it. In real-time conversation the two nearly coincide, so real-time scenarios show no difference — until you import historical data, backfill tickets, or handle a user's retrospective narration ("I moved to Berlin in 2023"), at which point they diverge immediately.

The implementation of separation is light: `observation_date` explicitly declares event time, the write time is stamped by the system itself, and there is also a `knowledge_time` recording "when the system learned of it." All three live in the record and are used as needed at retrieval. The `timestamp` parameter is something else entirely — it shifts `created_at` wholesale, used when importing transcripts so that historical order is correct rather than every memory being stamped "now."

The difference between the two lies in which class of question they answer. Asking "where does he live now" requires the latest ingestion-time value; asking "where did he live in 2024" requires the entry whose event time falls in that interval; asking "when did we learn about this" requires `knowledge_time`. Three questions against the same store can have completely different answers, and all of them correct.

The cost is that the query side gains a judgment it must make: is this question about "what it was then" or "what it is now." Get the side wrong and the answer is wrong, and it looks a lot like a right answer. The logistics company's fix was not to change data but to distinguish the two classes of question at the retrieval entry point — filtering by event time when the question is about history, and taking the latest from the version chain when it is about the present. That judgment currently relies on the caller declaring it explicitly; the system will not guess on its behalf, because guessing wrong is more dangerous than not guessing — it delivers a wrong answer in a confident tone.

### 4.2.2 Version Chains Organized by Entity

The dual time axis handles "when"; the version chain handles "which one." When the same fact is updated, the old record is not deleted but marked as superseded, leaving bidirectional pointers: the old entry's `superseded_by` points to the new entry, and the new entry's `supersedes` points to the old one. Walking these pointers reconstructs an entity's sequence of values over time.

Keeping old versions is not nostalgia. It supports three things at once: answering "which company was he at in 2024"; explaining why a judgment was reasonable at the time; and rolling back when a new entry is itself found to be wrong. Deleting old entries is equivalent to erasing the event time axis, and memory degrades into a key-value table holding only current values.

The version chain has a less obvious use: it makes "change" itself retrievable content. The change "the user used to like detailed explanations and later found them verbose" is more informative than the preference at any single point in time, and it exists only in the difference between two records.

There are two costs. First, retrieval must know that "superseded entries are not returned by default, but are returned when history is explicitly requested," and missing that switch on any read path produces self-contradictory answers. Second, the version chain turns "current state" into a traversal rather than a single read, and the more an entity has been modified, the more expensive it is to obtain its current value. Third, the write side must guarantee the chain is unbroken — a single direct write that bypasses the chain makes all subsequent backtracking stop at that point, and it will not raise an error.

## 4.3 Typing

### 4.3.1 Memory Types and Memory Layers

Typing answers "what kind of thing is this memory." It is not a decorative field: the retrieval tag channel, the graph channel, the segmentation of the profile card, and the value model of the forgetting strategy all read it.

Mnemosyne OS 8.1.0's `__init__.py` defines five groups of enumerations, with the following values.

| Enumeration | Values | Purpose |
| --- | --- | --- |
| `MEMORY_TYPES` | semantic / episodic / procedural / preference / lesson / identity / reflection / strategy, plus five bookkeeping values for todo, note, session, fact, and event — 13 in total | Determines recall filtering and profile segmentation |
| `MEMORY_LAYERS` | working / episodic / semantic / procedural / reflective | Determines the start and end of consolidation paths |
| `FACT_TYPES` | fact / opinion / belief / observation / inference / hypothesis | Determines whether conflict judgment is comparable |
| `SOURCE_TYPES` | user / system / inference / web_search / file / agent_generated / external | Determines initial confidence and admission |
| `VERIFY_STATUS` | unverified / verified / contradicted / outdated / superseded | Determines whether recall flags "already superseded" |

Table 4-3 — Values and purposes of the five typing enumerations

There is one inconsistency here that must be stated honestly: the value in `MEMORY_TYPES` is spelled `reflection`, while the corresponding layer in `MEMORY_LAYERS` is spelled `reflective`. They are not the same thing — the former is "a reflection-type memory," the latter is "the layer a memory sits in." Using the two as the same key in code yields a silent empty result, because a failed dictionary lookup only returns a default value and raises nothing.

The real burden of typing falls on the extractor. If the caller explicitly supplies `memory_type`, the caller's value is used; if not, it is mapped from the extracted categories, and the layer is inferred from record fields. The more categories, the longer the mapping table and the higher the probability of misclassification. The consequence of misclassification is not data loss — the record still exists — but that it lands in the wrong filtering dimension: a preference labeled `note` never appears in a profile card filtered by `preference`, while the profile card looks perfectly normal.

### 4.3.2 Fact Types, Sources, and Verification Status

These three enumerations together answer a different question: is this memory worth believing.

The core role of `FACT_TYPES` is to **limit the comparable range**. Conflict judgment is performed only between assertions of the same kind — a `hypothesis` and a `fact` saying different things do not constitute a conflict, because the former is not an assertion to begin with. The distinction between `observation` and `inference` is finer: the former is "observed that the user clicked refund three times," the latter is "inferred that the user is price-sensitive"; both may enter the store, but the latter should not be used as a fact to overwrite the former.

`SOURCE_TYPES` determines initial confidence and also admission. What the user said directly, system configuration, and local files are sources suitable for long-term retention; model inferences and external retrieval results are sources requiring review. `web_search` is listed separately because it is the most typical injection surface — retrieved text may be instructions written by someone else.

`VERIFY_STATUS` is a signal for downstream consumers, not a switch for writing. `superseded` means "a newer statement exists," `contradicted` means "in explicit conflict with another entry and unresolved," and `outdated` means "expired in time." When recall returns these three mixed together with `verified`, the model will use them as facts of equal standing — this is the most insidious class of error in memory systems, because the result looks entirely normal.

There is a design trade-off worth pointing out here: `VERIFY_STATUS` does not participate in default filtering but is returned along with results, letting the caller decide whether to use them. The benefit is that information is not lost; the downside is that **the default behavior is unsafe** — an integrator that does not read this field will use a `contradicted` record as a fact. Filtering on the server side produces a different failure: when a user explicitly asks "what did the earlier one say," the superseded entry is silently filtered out and the answer becomes "not found." Neither approach is perfect; the current choice is "hand the judgment to the caller and make sure it has a basis."

### 4.3.3 The Maintenance Cost of Typing

Typing is a long-term maintained convention, not a one-off configuration. Three costs surface about half a year after deployment.

The first is enumeration inflation. Every added memory type requires checking all type-filtered read paths, and one miss makes a class of memory disappear from some views. The second is re-typing historical data. After classification rules change, old records still carry old types unless actively backfilled, so old and new records behave inconsistently under the same filter condition. The third is cross-system alignment — if another memory system is connected downstream, the type names on the two sides cannot correspond one-to-one, and the mapping table becomes a continuously drifting intermediate layer.

A pragmatic approach is to use only a few types and put fine-grained information into tags rather than types. Types determine "which processing path is taken," tags determine "which topic it belongs to"; the former has a finite number of branches, the latter can grow freely. Stuffing fine-grained semantics into types amounts to making a finite branch structure carry an infinite classification demand.

## 4.4 Conflict Resolution

### 4.4.1 Six Classes of Conflict

Early implementations treated "two memories mentioning the same entity" as a conflict, and in practice the false-positive rate was so high that it disabled the entire conflict panel: a store with 66 active memories reported 14 conflict groups, and on item-by-item review 13 groups were different facets of the same object — "the rule injection slot is A," "the memory channel is cloud," "the version was upgraded from 5.8.3 to 5.8.4" — three non-contradictory statements judged as one group.

What failed was not the number of alerts but their credibility. Once users discover that 13 of 14 groups are noise, they learn to ignore the whole panel, and the one group that genuinely needs handling gets ignored along with it.

The corrected criterion is assertion alignment: only statements that **share an entity, share a predicate, and differ in value or polarity** count as conflicts, further divided into six classes.

| Conflict type | Judgment condition | Action | Example |
| --- | --- | --- | --- |
| Temporal update | Same attribute, different value | UPDATE | Changing companies, changing owners, moving house |
| Preference change | Preference class, different object | UPDATE | "likes Redis" → "switched to Postgres" |
| Scope difference | Different project or namespace | ADD | Owner of project A vs owner of project B |
| Precision difference | Different numbers, different event times | NOOP | "about 3 months" vs "92 days" |
| Logical contradiction | Opposite polarity, shared predicate | KEEP_BOTH | "supports X" vs "does not support X" |
| Source conflict | Same fact, different sources | KEEP_BOTH | User's verbal account vs retrieval result |

Table 4-4 — Judgment conditions and default actions for the six conflict classes

The key to judgment is the "predicate" level. The implementation locates the first predicate and backtracks a short stretch of text before it as the attribute name, with the rest as the value: `the user's company in Beijing is Company A` and `the user's company in Beijing is Company B` share the attribute "company in Beijing" with different values, and are judged a temporal update; whereas `the rule injection slot is A` and `the memory channel is cloud` have different attributes and are judged non-conflicting outright. This criterion reduced the 14 noise groups above to 0.

The scope-difference class deserves separate explanation, because it is not "not a conflict" but "looks like a conflict yet is not." The owner of project A is Zhang San and the owner of project B is Li Si; the two memories share the entity "owner," share the predicate, and differ in value, but their scopes differ. Judging it an update would lose project B's owner. So the first link in the judgment chain is not content but scope.

The cost is that it depends on tokenization and a predicate table. Chinese entity extraction is itself a noise source, and long strings get hard-cut into fragments, so attribute names cannot directly reuse entity fields and must be backtracked separately from the predicate position. If the predicate table misses one word, a genuine conflict degrades to "no conflict" — this is the false-negative direction of risk, which is harder to discover than false positives.

### 4.4.2 The Four Operations and Whole-Store Audit

Judgment is followed by action, of which there are only four: `ADD` (no conflict, normal insertion), `NOOP` (duplicate or refinement, do not write), `UPDATE` (the old entry is invalidated), and `KEEP_BOTH` (keep both).

The landing of `UPDATE` is to **set `superseded` and write `superseded_by`, without deleting**. The reason was given in 4.2: deleting the old entry erases the event time axis. This is also the common choice of mainstream graph memory systems — invalidate the edge rather than delete it.

The landing of `KEEP_BOTH` is to keep both, downweight the new one, and mark `needs_confirmation`. The reason for not automatically picking a side is that siding without additional evidence, once wrong, fossilizes the error into a fact, which will subsequently be used as `verified`.

`NOOP` is not "do nothing." It requires judging which entry is more complete and keeping the more complete one; judge wrong and refinement information is lost. This operation is most easily implemented as "just discard the new one," so details added later never get in.

The write path **does not resolve by default**. All UPDATE / DELETE-type actions require an explicit call to `conflict_resolve`, and a `dry_run=true` run to inspect the plan first.

```python
from mnemosyne import Memory
m = Memory()

plan = m.conflict_resolve(content="The user's company in Beijing is Company C", dry_run=True)
print(plan["plan"])        # UPDATE / NOOP / KEEP_BOTH / ADD
print(plan["verdicts"])    # conflict type and rationale for each candidate
```

The plan lists "which entry it conflicts with, which class it was judged, and what is intended," after which it is executed with `dry_run=False`. Putting execution in a second step is not process fussiness: `UPDATE` changes the results of all subsequent recalls, and its criterion depends on the predicate table, so a single misjudgment silently changes historical answers.

This default has a cost: the store keeps accumulating contradictory entries, and if no one runs the audit periodically, the conflict panel will never be opened. So `conflict_resolve` offers `scope=audit` for whole-store scanning — bucketing by entity, judging pairwise within each bucket, keeping only results that are not `NONE`; when a bucket exceeds 12 entries, taking the top 12 by confidence to keep complexity from spiraling on large stores.

The audit itself has a boundary: bucketing means **conflicts without a shared entity cannot be scanned**. If one memory says "plan A is safe" and another says "that plan is unsafe," and entity normalization fails to merge them into the same bucket, the audit cannot see the pair. The returned results include "how many were scanned and how many were reported" precisely so this blind spot can be judged, rather than letting people assume "0 conflicts" equals "the store is clean."

## 4.5 The No-Discard Principle for Multimodal Writing

A claims Agent at an insurance company received a photo of a vehicle license from a user. The system had no vision model configured, so the photo was stored as a "memory" whose body was the image URL and whose metadata was tagged `modality: "image"`. Two weeks later someone asked, "What is the plate number on the vehicle license?" and recall came back empty — because not one character in that memory was a plate number.

That outcome is acceptable, but only on the premise that it must be **visible**. The no-discard principle does not mean "if it is stored, it can be used"; it means "store it and let people know what was understood and what was not." With a vision model configured, what is written is a description, so the image content becomes language-recallable; without one, what is written is a reference, and the caller can see from the metadata that this is only a reference.

Three image formats differ on the integration side and all must be recognized by the parsing layer: OpenAI's multi-part content (`{"type": "image_url", "image_url": {"url": ...}}`), Anthropic's (`{"type": "image", "source": {...}}`), and Gemini's inline parts (`{"type": "image", "data": ...}`), plus the `input_image` shorthand. Audio travels the same channel.

```python
from mnemosyne import Memory
m = Memory()

m.add([{"role": "user", "content": [
    {"type": "text", "text": "My new desk."},
    {"type": "image_url", "image_url": {"url": "https://example.com/desk.jpg"}},
]}], user_id="alice")
```

It is normal for all three formats to be submitted within one client — the frontend SDK uses the OpenAI shape, the backend talks to Anthropic directly, and batch processing uses Gemini's inline parts. If the parsing layer recognizes only one, the other two are treated as plain text, and the image reference disappears along with the information it carried, with no error raised.

One rule deserves separate mention: **do not download remote resources at write time**. Image references are preserved as-is — http(s) links, `data:` URIs, or local paths. Issuing a network request during a memory write turns a text operation into a network operation with timeouts, retries, and partial failures, and the failure surface is unbounded.

There is also a structural rule: **an image does not become a memory on its own**. A bare image with no accompanying explanation cannot be recalled by the Agent in language, and storing it as an independent record yields only a pile of non-recallable entries. The practice is to attach it to the text memory it accompanies; only when the entire turn's input is an image with no text at all does it land as a separate record whose body is the reference and whose type is annotated with `modality`. This exception is necessary — otherwise the very fact that "the user sent only an image" would be lost.

The cost is equally explicit. A memory storing only a reference cannot be semantically recalled and can only be hit by tag, time, or metadata; while one storing a description has a model-generated description, and if the description is wrong the memory is wrong — and wrong in a way that looks right. Neither direction is free.

## 4.6 Engineering Details of Chinese Writing

The problem with Chinese on the write side is not "whether it is supported" but "to what degree." Four layers each carry concrete trade-offs.

**Tokenization.** Chinese has no spaces, and the standard approach is bigram: beyond single characters as words, adjacent character pairs also become words. What the index stores is not the original sentence but a space-separated bigram sequence, and the query side likewise cuts bigrams and goes through FTS5's `MATCH`. This way "苹果" (apple) can be hit by "苹" and "果" as well as by "苹果," with no dependence on a segmentation dictionary. The cost is a markedly inflated index and pseudo-words that cross word boundaries — combinations like "果苹" that do not exist in the original sentence also enter the index, bringing a small number of false hits.

**Synonyms.** When the query term and the tag have different surface forms, the tag channel fails entirely. A measured example: asking "what is my graphics card" while the tag is "hardware" — the two differ in form, the tag weighting gets nothing, and the score is instead overtaken by irrelevant queries. The solution is a built-in synonym table mapping query terms to tag families (graphics card / GPU / VRAM → hardware). The cost is that this table must be maintained manually, words it does not cover still fail, and the failure is silent.

**Latin script.** Mixed Chinese-English writing is the norm; code identifiers, model numbers, and URLs must all be preserved intact within the same tokenization and must not be shredded by CJK rules. Once strings like `RTX 4090` or `INV-2024-001` are shredded, they can neither be matched exactly nor retain their semantics in embeddings.

**Relative time.** Expressions such as "last Wednesday" and "end of last year" must be resolved into absolute dates, otherwise the time channel cannot compare. The implementation is an offset table: last week → minus 7 days, last year → minus 365 days, plus regular-expression forms for "N days ago / N weeks ago / N months ago / N years ago."

Its crudeness must be acknowledged here: **subtracting 365 days is not "last year"** — it is off by a day across leap years — and an expression like "end of last year" can only yield an approximation no matter how it is computed. For a question like "which company was he at last year," a one-day error does not matter; for a question like "when does the contract signed last Wednesday expire," a one-day error is simply wrong.

The most underestimated of the four layers is the second. Tokenization and Latin script are technical problems that expose themselves immediately when done badly; the synonym table is a coverage problem that, when done badly, only makes certain questions quietly unanswerable while the system looks perfectly fine. In Chinese scenarios the proportion of "certain questions" is not low — any case where the question's wording and the memory's wording differ in form falls into this gap.

## 4.7 Chapter Summary

This chapter established three judgments.

**First, single-pass writing is a choice about failure shape, not about speed.** Appending is monotonic: a bad extraction can only introduce noise, and noise can be suppressed by ranking and thresholds. Updating is non-monotonic: a bad update silently erases a true fact, and afterwards the two cases are indistinguishable. This judgment holds on the condition that the system is capable of deferring "two inconsistent statements" to the read side (conflict resolution, verification status, version chains). Missing any one of these, contradictory entries appear in recall results with equal weight, at which point the cost of single-pass writing escalates from "noise" to "self-contradiction." The scenario where it fails is high-frequency overwrite data — inventory counts, online status — where only the current value matters and preserving a version chain is pure waste.

**Second, the dual time axis is not an optional field but the dividing line for whether historical questions can be answered.** A store with only ingestion time can only give the last-written value for "which company was he at in 2024," and it looks like a correct answer. This judgment holds on the condition that the query side genuinely distinguishes the two classes of question; otherwise the field exists but nobody uses it, which equals not existing. The scenario where it fails is a purely real-time system — if the store has only ever handled what happens in the present since its creation, the two axes always coincide, and separation brings only two fields that must be kept in sync.

**Third, the value of conflict resolution lies in credibility, not in recall rate.** A detector reporting 14 groups of which 13 are noise performs worse in practice than one reporting a single group, because the former trains users to ignore alerts. Assertion alignment (shared entity + shared predicate + differing value or polarity) is currently the criterion that brings false positives down to a usable level, at the cost of dependence on the predicate table and entity normalization, with higher risk in the false-negative direction. It pays off most on small stores: the smaller the store, the greater the impact of one misjudgment on overall answers; once the store grows large enough that a single memory's influence is diluted, the cost of whole-store auditing hits its ceiling before the benefit does.

One unsolved problem is left for Chapter 5: every mechanism in this chapter rests on "records stay in the store forever" — version chains must keep old entries, conflict resolution must be able to scan old entries, auditing must be able to backtrack. But add-only storage keeps growing. When the store becomes large enough that a whole-store scan is unacceptable, do you lower the scan frequency, narrow the scan range, or migrate old entries to another storage tier and scan there? The answer to that question determines the shape of the tiering strategy.

---
