# Chapter 15 — Compliance and Data Sovereignty

The previous four chapters dealt with "how to get things right inside the system". Compliance poses a different class of question: it does not care whether the implementation is elegant, only whether four things can be answered — where the data is, who can read it, whether it can be deleted cleanly, and whether it can be proven.

What these four questions have in common is that none of their answers can be given by engineering alone. Where the data is depends on deployment form and contract; who can read it depends on the identity system and the permission model; whether it can be deleted cleanly depends on whether the four semantics from Chapter 13 have been implemented; whether it can be proven depends on whether the audit chain from Chapter 12 holds up. A compliance review is in effect a test of whether the previous three chapters were actually done.

This chapter first unpacks the four hard questions compliance poses to a memory system, then addresses data residency, export and migration, and multi-user isolation in turn, then explains the relationship between pricing and capability tiers — including one point that is easily misread: the gate being off by default means self-hosted users are subject to no restriction at all. Finally it strings the mechanisms of Chapters 12 to 14 into a single evidence path that can be handed to an auditor.

## 15.1 The four hard questions compliance raises

### 15.1.1 Where the data is

The answer to this question is not an address but a set of facts: the physical location of primary storage, of backups, of logs, of exported copies, and of any third-party system that processes the data.

For a self-hosted deployment the answer is "inside your own data centre or your own cloud account", and that answer can be verified by network topology. For hosted SaaS the answer depends on the provider's data-residency configuration and requires contractual confirmation.

The problem is that most teams only know the first item (the primary storage location) and not the other four — and the other four are exactly what a compliance review asks about.

### 15.1.2 Who can read it

This question needs to distinguish three layers.

**Permissions inside the service**: can operations staff read the database directly? If they can, the statement "only the application can access it" does not hold.

**Application-level permissions**: can a caller read data outside its own scope? This depends on how isolation is implemented.

**Third-party permissions**: what can the provider, the cloud vendor, the auditor, and the backup vendor each see?

Of the three, the first is the most easily overlooked, because it does not live in the code but in operational process.

### 15.1.3 Whether it can be deleted cleanly

Chapter 13 has already laid this out: deletion has four semantics, and physical deletion usually cannot cover copies that have already been exported.

A compliance review will typically push on a concrete scenario here: the user asks for deletion, but a deletion-proof export was made three months ago as audit evidence — should that export be deleted too?

The answer depends on a legal judgment, not a technical one. What technology can do is record the fact of "which copies fall within the deletion scope" clearly enough for the legal team to decide on the basis of facts.

### 15.1.4 Whether it can be proven

Chapter 12 has already laid this out: a hash chain can prove that nothing was tampered with, but cannot prove that something no longer exists.

The most error-prone sentence in compliance communication is therefore "we can prove the data has been deleted". The correct formulation is "we can provide a deletion processing record completed according to the agreed process, covering the following scope", with the out-of-scope parts explicitly listed.

The distinction is not wordplay. The former collapses when the reviewer probes the details; the latter withstands probing.

## 15.2 Data residency

### 15.2.1 Residency characteristics of three deployment forms

| Form | Data location | Residency controllability | Main cost |
| --- | --- | --- | --- |
| Self-hosted (on-premises or own cloud account) | Entirely within your own environment | Fully controllable, verifiable by network topology | You carry operations, backup, and high availability |
| BYOC (bring your own cloud) | In your own cloud account, with the vendor managing the software layer | Relatively high; the access scope of the management channel must be confirmed | Complex contracts; the fault-responsibility boundary must be explicit |
| Hosted SaaS | In the provider's environment | Depends on the provider's data-residency configuration | Data leaves your domain; depends on provider availability and compliance credentials |

Table 15-1 — Residency characteristics of three deployment forms

The third column deserves the most attention: residency controllability is not binary but a checklist that must be confirmed item by item. BYOC looks like "the data is in our own cloud", but the vendor's management channel usually still has access, and that must be made explicit in the contract.

### 15.2.2 What self-hosting really means

Self-hosting is often treated as the universal answer to compliance, but it only addresses "where the data is" and none of the other three questions.

In a self-hosted environment, "who can read it" depends on your own permission system; "whether it can be deleted cleanly" depends on whether you implemented cascade delete; "whether it can be proven" depends on whether you have an audit chain. In other words, self-hosting transfers compliance responsibility from the provider to yourself rather than eliminating it.

This is also why the open-source build of a mature product should not be reduced in capability because of self-hosting: if the self-hosted build lacks audit and cascade delete, then the claim "self-hosting satisfies compliance" does not hold.

Mnemosyne's positioning is that the open-source build and the SaaS use an identical engine, with no feature paywall. The significance of this choice lies precisely here — self-hosting is not a degraded edition.

### 15.2.3 The boundary of residency configuration

The "data residency configuration" offered by hosted services usually means choosing a storage region. It does not automatically cover backups, logs, CDN caches, or disaster-recovery replicas.

When using such a configuration, confirm each item: whether backups are in the same region, whether logs are in the same region, where the disaster-recovery replica sits, and whether cross-region replication is enabled.

These details are usually not in a prominent place in the product documentation and must be actively asked about. Writing them into a contract annex carries more force than writing them into an architecture document.

## 15.3 Export and migration

### 15.3.1 Why export is a compliance requirement rather than a feature

The right to data portability requires that users can take their data away. This means export must be complete, structured, and readable by other systems — not a pile of screenshots or PDFs.

Export is also the basis for migration. Lock-in (inability to get the data out) is a substantive risk in procurement evaluation, and it is often masked by the sentence "we support an API" — having an API is not the same as having a complete export.

### 15.3.2 Design points of the Memory Exchange Protocol

A usable export format needs three elements.

**Structured records.** The body, metadata, time axis, source, confidence, and verification status of every memory. A format that exports only the body cannot reconstruct the semantics.

**A manifest file.** Recording the export scope, record count, generation time, format version, and checksum. The manifest lets the receiver verify completeness.

**Incrementality.** Supporting incremental export by time range or scope, otherwise a full export is infeasible at scale.

Mnemosyne implements this with `memory_export-v1` / `memory_import-v1` as a JSONL plus manifest.json combination, with `memory_claim` used to take over memories from an external export. The key point of this combination is that the manifest carries a checksum — without a checksum, the importing side cannot tell whether the file is complete.

### 15.3.3 The conflict between deletion-proof export and the right to erasure

A deletion-proof export exists to preserve audit evidence: even if the source memory is deleted, the exported copy remains.

It conflicts inherently with the right to erasure. The resolution is not technical but policy layering:

**Define the retention scope explicitly.** Which data falls under statutory or contractual retention obligations and which does not.

**Isolate the purpose.** A retained copy may only be used for audit, not for business decisions or training.

**Record the fact of isolation.** Record in the audit chain why the copy is retained, who approved it, and until when.

**Handle expiry.** After the retention period, clean it up automatically, and chain the cleanup action as well.

Only when all four steps are done can you say "we satisfy the right to erasure while retaining necessary audit evidence". Doing only the first step amounts to using "compliance" as an excuse to retain data indefinitely.

### 15.3.4 Acceptance checklist for migration

When migrating out of any system, five things must be verified:

1. The record count matches the manifest, with no silent loss
2. Time-axis fields are complete (both `observation_date` and write time present)
3. Source and verification status are preserved
4. Scope relationships are preserved (which memories belong to which user or agent)
5. Retrieval results after import match those before export (overlap of hit sets for the same query and top-k)

The fifth is the most often skipped and the most revealing: the format may be correct while the index rebuild is wrong, and recall quality degrades quietly.

## 15.4 Multi-user isolation

### 15.4.1 The compliance meaning of physical versus logical isolation

From a compliance perspective the difference between the two is not performance but **provability**.

Under logical isolation, proving "user A cannot read user B's data" requires reviewing the filter conditions on every query path. That is a coverage problem and cannot be proven exhaustively.

Under physical isolation, proving the same thing requires only proving "the path is derived correctly" and "the file permissions are correct". That is a point problem and can be verified item by item.

This is why compliance scenarios favour physical isolation: not because it is more secure, but because it is easier to prove.

### 15.4.2 How to verify isolation

Three tests, none optional.

**Cross-tenant read test.** Use A's credentials to try to read B's data, expecting an empty result. Note the expectation is an empty result rather than an error — an error means the system noticed the unauthorized access, while an empty result means the data simply is not within reach.

**Deletion blast-radius test.** Delete one of A's memories and verify that B's data is entirely unaffected, including caches and summaries.

**Post-restore isolation test.** After restoring from backup, re-run the first two tests. This is the most often skipped, and the restore process is precisely where isolation is most easily broken.

### 15.4.3 The boundary of isolation

Physical isolation guards against data crossing under the default path. It does not guard against misconfiguration — if the namespace is hard-coded to a fixed value, all scopes land in the same store.

This risk cannot be eliminated by the isolation mechanism itself; it can only be detected: after a write, check whether the returned namespace matches expectation, and alert immediately if not.

Making this check a routine monitor is far more reliable than expecting a human eye to catch it in code review.

## 15.5 Pricing and capability tiers

### 15.5.1 A design that is easily misread

Mnemosyne OS's hosted edition has four tiers, and one design point needs explanation: **the gate is off by default**.

Concretely: self-hosted users and users who install from PyPI are subject to no tier restriction at all. `MNEMOSYNE_TIER_GATE` being unset means the gate is off. The gate only performs result-projection filtering at the exit; it does not change retrieval parameters, does not change SQL, and does not change storage.

The compliance implication is: **the open-source build has no feature paywall**. Audit, cascade delete, physical isolation, and lossless compression — capabilities directly relevant to compliance — are fully available in the self-hosted build.

If it were designed the other way round — putting audit and cascade delete behind a paid tier — then "self-hosting satisfies compliance" would not hold, because the capabilities compliance requires would cost extra. That is an existing industry practice, but it contradicts a positioning of "local-first, data sovereignty".

### 15.5.2 What the four tiers actually differ in

| Tier | Price | Main differences |
| --- | --- | --- |
| Free | $0 / ¥0 | All 52 tools; 30-day cold-tier recall window; single namespace; 7-day audit window |
| Pro | $6.9/month or ¥9.9/month (annual $69 / ¥99) | Permanent cold tier; cross-namespace recall; unlimited audit history; full export |
| Team | $19.9/seat/month or ¥29.9/seat/month (annual $199 / ¥299) | Everything in Pro; multi-user namespaces; team policies; audit report export |
| Compliance Add-on | $9.9/month or ¥19.9/month | Monthly only, add-on only, must be stacked on Pro or Team: scheduled integrity reports, deletion-proof export, data-residency configuration |

Table 15-2 — Mnemosyne OS hosted tiers (as of October 2026)

The key point of this table is the last row: the Compliance Add-on is **not a standalone tier** and must be stacked on Pro or Team. Treating it as a separately purchasable package leads to misunderstanding during procurement.

The second point worth noting is that the Free tier's audit window is only 7 days. That means free users cannot trace operations from a month ago. It is enough for individual developers and not enough for any organization that needs to produce evidence — and this, rather than the "cold-tier window", is the most substantive difference between Free and Pro.

### 15.5.3 Details of annual billing and trials

Annual billing is priced as "pay 10 months, use 12", roughly a 16.7% discount. New accounts include a 30-day Team trial with no card required.

USD is billed through PayPal Subscriptions; CNY is billed by WeChat QR code and confirmed by the operator. This difference has practical procurement implications: USD runs on automatic renewal and can be cancelled anytime in PayPal; CNY requires manual confirmation, so renewal requires an active step.

## 15.6 Compliance is an evidence chain, not a feature list

### 15.6.1 Stringing the four chapters together

What a compliance review wants is not "which features you have" but "show me the evidence". The evidence chain has four segments, drawn from the previous four chapters.

| Review question | Evidence needed | Corresponding mechanism |
| --- | --- | --- |
| Where is the data | Deployment topology, backup and log locations, third-party inventory | Self-hosted topology or residency configuration plus contract annex |
| Who can read it | Permission model, cross-tenant read test results | Physical isolation plus the three isolation tests |
| Can it be deleted cleanly | Deletion processing record, coverage statement | Four deletion semantics plus `dry_run` preview plus cascade processing record |
| Can it be proven | Integrity verification results, provenance chain | Hash chain `verify_integrity` plus `memory_trace` |

Table 15-3 — The four compliance questions and their corresponding evidence

The purpose of this table is to turn "compliance" from an abstract requirement into four preparable documents. Each can be reviewed by a third party — that is what makes it evidence. What can only be asserted by oneself is a statement.

### 15.6.2 A deliverable compliance package

Following the table above, a team should be able to produce five documents at any time:

1. **Deployment topology diagram**, marking the locations of data storage, backups, logs, and exported copies
2. **Permission matrix**, listing each role's read and write permissions over each data class, including operational roles
3. **Isolation test report**, with the execution time and results of the three tests
4. **Deletion processing record sample**, including preview output, execution record, and coverage statement
5. **Integrity verification report**, including verification time, total record count, and result

None of the five needs to be long; one to two pages each suffices. The key is that they can be independently reviewed rather than merely believed.

### 15.6.3 Common failing patterns

**Documentation without output.** Asserting "we support cascade delete" but unable to produce a record of one actual execution.

**Feature without scope.** Claiming "the data has been deleted" but unable to say which copies were covered.

**Result without process.** Providing the conclusion "intact" without the verification time, record count, or method.

**Present without history.** Able to prove today's state but not the operation that happened three months ago.

What these four have in common is that the material is self-descriptive rather than evidentiary. The moment the reviewer probes a detail, the conversation retreats to "this is how our implementation works".

## 15.7 Chapter Summary

This chapter establishes four judgments.

**First, none of the four questions compliance raises can be answered by engineering alone.** Where the data is depends on deployment and contract, who can read it depends on the permission system, whether it can be deleted cleanly depends on whether the four semantics were implemented, and whether it can be proven depends on whether the audit chain holds. A compliance review is in effect a test of the previous three chapters.

**Second, self-hosting transfers compliance responsibility rather than eliminating it.** It addresses "where the data is", but "who can read it", "whether it can be deleted cleanly", and "whether it can be proven" still have to be implemented yourself. This is also why the self-hosted build should not cut audit and cascade delete — after cutting them, "self-hosting satisfies compliance" does not hold.

**Third, the conflict between deletion-proof export and the right to erasure can only be resolved by policy layering.** Define the retention scope, isolate the purpose, record the fact of isolation, and handle expiry — all four steps are required. Doing only the first amounts to using compliance as an excuse to retain data indefinitely.

**Fourth, the deliverable of compliance is an evidence chain rather than a feature list.** Five documents (topology, permission matrix, isolation tests, deletion records, integrity report) constitute evidence only if a third party can review them. Documentation without output, feature without scope, result without process, present without history — all four collapse under probing.

This chapter concludes the Governance part. The previous four chapters dealt with "how to make the system trustworthy", and trustworthiness presupposes that the system is continuously measured and improved. If a system cannot tell whether its recall quality is degrading, then even a complete audit chain can only prove that it "has been wrong consistently". That is the problem the Optimization part addresses.
