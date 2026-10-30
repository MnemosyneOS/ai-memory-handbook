# Chapter 10 — Scoping for Multi-User and Multi-Agent

A SaaS company integrated the memory service into an enterprise-facing customer-support platform, with three banks as clients.
Two weeks after launch, the compliance department of one of the banks, doing a data inventory, asked: in your memory store, can you prove that Bank A's data will not appear in Bank B's recall results.

The engineering team's answer was a piece of code: the query statement carries `WHERE user_id = ?`.
What compliance asked next was a different question: if someone one day omits that condition, how would you know.
That question has no answer at the code level, because the answer depends on whether isolation is structural or disciplinary.

Scoping governance is about exactly this.
It is not an authentication question, nor a query-writing question, but the question "what guarantees the boundary".
A boundary guaranteed by `WHERE` has the strength of the assumption "everyone who writes a query makes no mistake".
A boundary guaranteed by the filesystem has the strength of the fact "a mistyped path will not find the file".

The reason this layer belongs to the Run part rather than the Governance part is that its correctness depends on the deployment form.
Physical isolation holds only in deployments that can operate the filesystem directly — when SaaS multi-tenancy shares storage, you cannot give each tenant its own file.
The form choice of Chapter 8 produces a security consequence here for the first time.

This chapter proceeds as scope semantics → isolation approaches → the derivation-rule trap → multi-Agent sharing → teams and seats → acceptance.
The section on multi-Agent shared memory will state explicitly "this is an unsolved problem" rather than offering something that looks like a complete solution.

## 10.1 The Semantics of Four-Dimensional Scoping

Scope has four dimensions: `user_id`, `agent_id`, `run_id`, `app_id`.
They are not four optional filter fields but four orthogonal identity dimensions.

| Dimension | Semantics | Typical use | Lifecycle |
| --- | --- | --- | --- |
| `user_id` | The natural person the memory belongs to | Personal preferences, past decisions, health records | Long-term, across sessions |
| `agent_id` | The identity of the agent that produced the memory | Observations of the work assistant versus the personal assistant | Lives as long as the Agent deployment |
| `run_id` | One run / one task | Task-local temporary context, disposable intermediate state | Short; invalid when the task ends |
| `app_id` | The integrated application instance | Different contexts of the same Agent across product lines | Tied to the application version |

Table 10-1 — Semantics and lifecycle of the four scope dimensions

The four dimensions combine to derive a namespace.
This is not "four fields doing WHERE together" but "four fields deciding which directory the data lands in".
In the source, `_namespace_for` handles derivation, and `_build_brain` constructs an independent `MemoryBrainContext` for each scope combination.

The key to reading this table is the lifecycle column.
Using a short-lifecycle dimension on long-lifecycle data produces a large number of nearly empty orphan scopes.
Hanging long-lifecycle data under `run_id` means the data can never be recalled again once the task ends.
The most common error is using `run_id` as a "session id", so that every session opens a new memory store.

## 10.2 Physical versus Logical Isolation

The difference between the two isolation approaches is invisible on the normal path and shows up only when something goes wrong.

**Logical isolation** is a shared table plus filter conditions.
All tenants' data sits in the same set of tables, each record carries a `tenant_id`, and queries include the condition.
The advantages are simple implementation, easy cross-tenant aggregation, and a single backup.
The risk is a single point: one omitted condition is one cross-tenant leak, and omissions are extremely hard to catch in code review — one more `WHERE` versus no `WHERE` differs by one line in the diff.

**Physical isolation** is one independent SQLite file per scope.
An unauthorized read is not "querying someone else's data" but "opening a file that does not exist".
The difference matters a great deal when classifying an incident: the former is a data breach, the latter a 404.

Mnemosyne chooses physical isolation.
The costs were listed in Chapter 8; here is the governance-view one: **cross-scope aggregate queries require multiple reads**.
A requirement like "count the most frequently recalled memories across the whole platform" becomes a directory walk plus N queries under physical isolation, and the result is not a transactional snapshot (as noted in Chapter 9).
Acceptable for operational reports, not for real-time billing.

The criterion is the strength of the data sovereignty requirement.
If compliance requires proof that "A's data is physically not in B's files", physical isolation is the only way to provide that proof.
If it is only "logically it should not cross", logical isolation with strict query-layer encapsulation can also hold — but it needs an additional mechanism to guarantee "nothing was omitted", and that mechanism is usually test coverage plus code review, of limited strength.

## 10.3 The namespace Derivation Rule and the "Same Store" Trap

The premise of physical isolation is that "the derivation rule really does derive different namespaces".
If the configuration is hard-coded, that premise does not hold.

The most common form is configuring namespace as a fixed string:

```python
# Wrong: every scope lands in the same store
brain = MemoryBrain("./mem", namespace="default")
brain.retain("Bank A's customer preferences", user_id="bank_a")
brain.retain("Bank B's customer preferences", user_id="bank_b")
```

If the `namespace` parameter overrides the derivation logic, the two memories land in the same SQLite file.
At that point `user_id` is just an ordinary field, isolation degrades to logical isolation, and moreover the kind with no `WHERE` guarantee.
Worse, it raises no error: writes succeed, recall succeeds, and recall may simply mix the two banks' data together.

The detection method is direct: look at the return value of `retain_batch`.
The `namespace` field it returns should match the derivation result you expect.
If writes with two different `user_id` values return the same `namespace`, isolation is not in effect.
This check should be a startup self-test, not something a human compares.

The shape of the real incident is usually "it was fine at launch, it broke after some refactor".
A refactor that extracted the namespace parameter into a configuration item changed "derive by scope" into "read the config".
All tests stayed green, because the tests used exactly that fixed value.
The problem was found three months later by a client's compliance audit, and during those months every cross-tenant recall had been contaminated.

## 10.4 Multi-Agent Shared Memory: An Unsolved Problem

Under what conditions should three Agents of the same user — a work assistant, a personal assistant, a health advisor — see each other's memories.
This question had no accepted answer in 2026.

Specifically, four questions must be answered, and every one of them lacks a standard practice:

- Who has the right to write: can the work assistant read "the user has a sleep disorder" written by the health advisor
- Who has the right to delete: does the user saying "forget this" to the personal assistant apply to all Agents
- How conflicts are arbitrated: two Agents give different observations about the same fact; whose prevails
- How overreach is detected: an Agent read a scope it should not have; where is the log

Mnemosyne's current answer is "we do not solve it, but we support not sharing".
Physical isolation makes "one independent scope per Agent" the default and reliable form.
Cross-scope sharing requires the upper layer to build its own permission model: who may read which namespace under what conditions is the application's own judgement.
The engine provides isolation primitives, not governance policies.

This must be stated clearly, because "supports multi-Agent" and "has solved shared governance for multi-Agent" are two different things.
The former is a capability, the latter a policy, and policy depends on organization, regulation, and product semantics, which the storage layer cannot decide.

Horizontally, the phrase "shared memory" had changed meaning by 2026.
As of October 2026, Letta's shared memory means "a shared Git repository owned by the organization", available only to cloud-hosted agents; local agents each use their own MemFS.
That is, what is shared is the carrier of memory (one repository), not the governance rules of memory.
The significance of this observation for selection is: if the requirement is "multiple Agents see the same facts", shared storage suffices; if the requirement is "multiple Agents have different read/write permissions over the same facts", shared storage makes the problem harder — because it turns permission judgement from "can you open the file" into "does the query touch this row".

The cost is explicit: not solving shared governance means users in multi-Agent scenarios are asked the same questions repeatedly.
A preference the work assistant knows is unknown to the personal assistant, and the user must say it again.
This is the real experience at the current stage, and it should not be blurred by describing it as a "design choice".

## 10.5 Teams and Seats

The Team tier solves "multi-user namespaces" and "team policies", not "multi-Agent permissions".
The two are easily confused: the former is "how the memories of several people in one organization are organized", the latter "how several Agents of one person share".

Team-tier capabilities include multi-user namespaces, team policies, and audit report export, priced at $19.9/seat/month or $199/seat/year (RMB ¥29.9/seat/month or ¥299/seat/year).
As of October 2026, new accounts include a 30-day Team trial with no card required.

The fact that gating is off by default matters more in a governance context than in a pricing context.
`MNEMOSYNE_TIER_GATE` is off unless set; self-hosted and PyPI users are subject to no restriction at all.
The gate only filters the result projection at the exit; it does not change retrieval parameters, does not change SQL, does not change storage.

Those three sentences mean: **the paid tier is not a security boundary**.
What it narrows is the read window (30 days for the Free-tier cold layer), not access permission.
Treating "upgrade to Team" as "obtain stricter isolation" is a misreading — isolation strength is determined by the deployment form and namespace derivation, and has nothing to do with the paid tier.

The cost is that this design hands full responsibility for "who can see what" to the deployer.
In the SaaS form the platform is responsible for running, but not for whether your tenant partitioning is correct.
In the self-hosted form even the running is yours.
In both cases, isolation acceptance cannot be skipped.

## 10.6 How to Accept Isolation

Isolation must be testable, otherwise it is only a configuration intention.
Three tests cover three different failure surfaces.

- **Cross-tenant read**: write one uniquely tagged memory with A's credentials, then recall the same keyword with B's credentials. The result must be empty. If the recall hits, either namespace derivation has failed or the query layer has an overreach path.
- **Delete blast radius**: run `delete_all_memories` or `memory_cascade_delete` against A, then check B's memory count. The number must not change. If B lost records, the delete logic crossed scopes.
- **Isolation preserved after backup and restore**: back up the whole directory, restore to a new path, and rerun the first two tests. If cross-tenant visibility appears after restore, the backup flattened multiple scopes together.

The third is the most easily skipped and the most prone to problems.
Backup under physical isolation is copying a directory, which looks foolproof.
But if the backup script uses an implementation that "exports all namespaces into one file", restoring will write every scope back into the same store.
This class of problem is completely invisible until a restore drill.

One additional check, very low in cost: assert the namespace in the return value of `retain_batch` in CI.
It is the only signal that exposes derivation failure directly on the write path, and it requires no cross-tenant query to construct.

## 10.7 Chapter Summary

This chapter establishes three judgements.

First, four-dimensional scoping means four orthogonal identity dimensions, not four filter fields.
The consequence of choosing the wrong dimension is not "cannot find it" but that data lands in a scope with the wrong lifecycle and is lost as soon as the task ends.
The condition for this judgement is "scope is determined at write time"; if the business requires re-partitioning ownership after the fact, physical isolation turns migration into file moving, which costs more than logical isolation.

Second, the strength of physical isolation comes from "an unauthorized read cannot open the file"; the strength of logical isolation comes from "no query omits the condition".
The former costs cross-scope aggregation degrading to multiple non-transactional reads; the latter costs betting correctness on discipline.
This judgement has no substitute in compliance scenarios that "must provide proof of physical absence"; in pure operational analytics scenarios, the cost of physical isolation may exceed the benefit.

Third, multi-Agent shared memory is an unsolved problem, and the reliable capability today is "supporting non-sharing".
Cross-scope sharing requires the upper layer to build its own permission model; the engine provides only isolation primitives.
Describing it as "multi-Agent collaboration supported" would lead users to underestimate the policy work they must bear themselves.

One question this chapter does not answer: what physical isolation becomes at scale.
A hundred thousand tenants means a hundred thousand files, cross-tenant statistics become a directory walk, and backup becomes filesystem snapshot management.
These are no longer correctness questions but cost and latency questions.
Chapter 11 continues from here.

---
