# Chapter 23 — Unsolved Problems and the 2027 Roadmap

The methods in the previous twenty-two chapters all rest on one premise: that a memory system can determine "what should be remembered". That premise holds most of the time, but it fails in five places, and those five are precisely the gates memory must pass through to move from "feature" to "infrastructure".

This chapter does not attempt to give solutions. Its value lies in drawing the boundary clearly: which problems have been solved well enough for production, which remain at the stage of "there is an approach but no validation", and which have not even had the problem defined. That distinction matters for investment decisions — investing in a solved problem is duplicated effort, and investing in an undefined problem is gambling.

## 23.1 Five unsolved problems

### 23.1.1 Who defines the correctness of memory

Every system defaults to "whatever the user says is the memory". That default is reasonable in most scenarios but fails in three: the user misremembers, the user says the opposite, and the user deliberately misleads.

A concrete case: the user says "I am allergic to peanuts", but earlier medical records show no allergy history. Which should the system remember? Believing the user may impose unnecessary dietary restrictions; believing the record may be dangerous if the allergy is real.

The adjudication tools available technically are limited. Cross-verification requires an external source of truth, which most systems have no access to; the recency assumption holds that "newer is more accurate", but newer information may also come from a less reliable source; the source-priority assumption holds that "official is more accurate", but official sources also go stale.

The real issue is that this adjudication rule is a **business rule**, not a technical one. It should be defined by the consumer of the system, and every current system hard-codes it as "believe the user". That means the system is making medical, financial, and legal judgments on the consumer's behalf, and the basis for those judgments is never made explicit.

As of October 2026 no system has implemented configurable factual adjudication rules in production. This is the first unsolved problem and the most fundamental.

### 23.1.2 Conflict arbitration for cross-agent shared memory

When a user's three agents — work assistant, personal assistant, health advisor — share the same memory, who has write authority, who has delete authority, and how are conflicts arbitrated?

Physical isolation supports "not sharing" — each agent gets its own scope, fully independent. That is currently the only reliable approach. The cost is that the user has to restate the same preferences to three agents.

Sharing requires a permission model, and the complexity of that model explodes with the number of agents and the extent of sharing. Three agents have three pairwise relationships; five agents have ten, and each relationship needs read permission, write permission, delete permission, and visibility scope defined.

Current product-level approaches fall into two classes. One is "shared reads, isolated writes": multiple agents read the same governed memory while writes stay isolated. This avoids write-conflict arbitration, at the cost of a shared layer that needs periodic merging and therefore has latency. The other is an "organization-level shared repository": shared memory becomes an independent repository owned by the organization, which agents access by permission. This class typically requires a cloud-hosted environment; locally deployed agents cannot participate.

Neither class solves the core problem: when two agents reach different conclusions about the same fact, which one is right? That question does not exist in single-agent scenarios, necessarily appears in multi-agent ones, and currently has no arbitration mechanism.

### 23.1.3 The verifiability of forgetting

Chapter 13 already laid this out: a hash chain can prove "not tampered with" but not "no longer exists".

The difficulty is not technical but logical. To prove a negative proposition ("this information no longer exists anywhere in the system"), you must enumerate every possible location and verify each. And the list of locations itself changes as the system evolves — add a cache layer today, and yesterday's proof is invalidated.

More awkwardly, the proof itself leaves a trace. Keeping a deletion record in order to prove "this was deleted" means that record contains the fact that some information once existed, which may constitute new personal information. This is a self-referential dilemma.

A possible direction is to convert the negative proposition into a checkable list comparison: rather than proving "does not exist", record "in which locations, by whom, at what time, what processing was performed", and let a third party verify that those steps covered every location it knows about. This lowers the difficulty, but as of October 2026 no standard format has emerged.

### 23.1.4 The gap between benchmarks and real use

Existing benchmarks test **passive retrieval**: given a query, can the system return the correct memory.

In real use, however, users actively manage memory — editing, deleting, restating, and asking "why do you remember this". These interaction patterns have nothing to do with the passive-retrieval evaluation paradigm.

A concrete case: the user discovers the system has recorded the wrong occupation and says "no, I'm a designer, not an engineer". Correct handling requires three steps: recognize this as a correction, locate the erroneous memory, update it and confirm. No existing benchmark tests any of these three steps.

The consequence is that a system scoring highly on LongMemEval may repeatedly fail when the user corrects it — it records the new information, but the old information remains, and the next retrieval may return the old one. This failure is completely invisible on a benchmark.

The second gap is **long-period use**. The roughly 30% accuracy drop reported by LongMemEval already signals this, but the mechanism has not been adequately studied. Is it falling retrieval precision as memory volume grows? Interference from stale facts? Or genuine drift in user preferences? Different mechanisms need different solutions, and currently they cannot be distinguished.

### 23.1.5 The cost-quality Pareto frontier

There is no public cross-system data on the relationship between the cost of a single memory write (model call, embedding generation), the cost of retrieval (fusion computation), and recall quality.

This means selection cannot answer a basic question: how much quality does a doubling of cost buy?

A concrete case: a team chooses between "a stronger embedding model" and "adding a reranker". The former raises write cost per item; the latter raises retrieval cost per query. Which is more economical depends on the write-to-query ratio, corpus characteristics, and the actual recall precision the business needs. Those parameters vary enormously across real scenarios, and no single recommendation applies.

A workable method is to run a small local comparison: fix a query batch with ground truth, measure recall and cost under three configurations. The method is reliable but time-consuming, and most teams are unwilling to invest at the selection stage.

Without a public cost-quality curve, selection relies on experience and vendor recommendation, and vendor recommendation is structurally biased.

## 23.2 The 2027 roadmap

| Direction | 2026 state | 2027 expectation | Key uncertainty |
| --- | --- | --- | --- |
| Configurable factual adjudication | Universally hard-coded to "believe the user" | Configurable strategies (source priority / recency / human confirmation) | Whether consumers are willing to own the configuration |
| Cross-agent memory governance | Physical isolation primary, shared reads secondary | Shared reads mature; a reference implementation for shared writes | Whether permission-model complexity stays manageable |
| Verifiability of forgetting | Vendor-specific processing records | An exchangeable deletion audit format | Whether a standards body engages |
| Evaluation of active management | No benchmark coverage | Evaluation sets for correction, deletion, and follow-up questions | Labelling cost is high and hard to scale |
| Cost-quality curve | No public data | Leading vendors publish comparison data | Publishing exposes cost structure |
| Chinese and non-English scenarios | A few implementations optimize specifically | Independent non-English benchmarks | Dataset construction and labelling cost |

Table 23-1 — Expected directions of progress in 2027

The fourth column matters more than the third. Every direction is constrained by a non-technical factor: whether consumers will own the configuration responsibility, whether permission-model complexity stays manageable, whether a standards body engages, whether labelling cost is bearable, whether vendors will expose their cost structure. Technical capability is not the bottleneck; incentive structure is.

## 23.3 Recommendations for five roles

### 23.3.1 Developers

Do not build "yet another memory store". The storage layer is oversupplied, and single-pass ADD-only plus multi-signal retrieval is a publicly copyable design.

The opportunities are in three places. First, **the observability layer**: traces, audit, quality monitoring, cost attribution. These tools are generally weak, and they determine whether problems can be located quickly. Second, **the scenario adaptation layer**: Chinese tokenization, proper-noun retrieval, industry terminology — things general solutions do not cover. Third, **precondition modelling**: how to separate an "experience" from a "suggestion", and how to make applicability conditions machine-checkable.

What these three share is that none requires a new algorithm; all require deep understanding of a specific scenario.

### 23.3.2 Architects

Make "does it support per-record provenance" a hard gate in 2027 selection.

The reason is not that provenance is valuable in itself, but that a system without it cannot locate the cause during an incident review. If a memory-caused incident cannot answer "where did this memory come from", the review stops at "the system behaved abnormally" and never reaches "why".

The second gate is "is deletion graded". A system that can only do single-record deletion fails the compliance bar; a system that only does physical deletion over-destroys in product scenarios.

The third is "is isolation provable". Not "is it isolated", but "can it be proven with the three tests".

### 23.3.3 Product owners

Users' trust in memory depends on whether they can understand what the system remembered and why.

Three concrete practices. First, **layered display**: organize memory by stable identity, preferences and constraints, and current situation, so the user sees structure rather than a flat list. Second, **minimize the cost of correction**: after the user says "no", the system should complete locate, update, and confirm within one interaction. Third, **offer a middle option for "don't keep this"**: full deletion breaks continuity, not deleting violates the user's wish, and masking is the practical compromise between them.

None of the three requires new technology; they require treating memory as a product surface rather than a backend feature.

### 23.3.4 Compliance and security

The most urgent work in 2027 is not adding more checks but putting deletion preview output into change management.

A deleted user preference may already have influenced three recommendation results. The blast radius of a deletion must be visible before execution, and that visibility needs process support — preview, approval, execution, archiving, all four steps. Missing any one invites probing during review.

The second piece of work is distinguishing "we deleted it" from "we can prove we deleted it according to process". The former is a statement; the latter is evidence. Most teams stop at the statement, while the reviewer wants evidence.

The third is not to endorse "thoroughly erased". Current technology cannot produce that proof, and promising it will collapse at the first deep review.

### 23.3.5 Researchers

What industry most lacks is not new algorithms but **reproducible failure case sets**.

A public "memory system failure mode benchmark", recording how each system specifically collapses in specific scenarios, would be worth more than any single system's headline score. The reason: a score tells you whether it is good; a failure case tells you where it breaks, and the latter is more useful for engineering decisions.

The second direction is **evaluating active management behaviour**. The quality of a system's response when the user corrects, deletes, or follows up is a completely blank area today, and it is also the most frequent interaction in real use.

The third is **public measurement of the cost-quality curve**. This requires a neutral third party, because vendors have no incentive to publish data unfavourable to themselves.

## 23.4 Conclusion

The maturity of a memory system is not marked by remembering more.

A system that remembers everything is frightening rather than reliable from the user's perspective, because it cannot be overturned. A system that remembers precisely but cannot explain itself is a black box rather than a tool from the operator's perspective, because problems cannot be traced. A system that can delete thoroughly but cannot prove it is a liability rather than an asset from the compliance perspective, because its promises cannot be verified.

The real marks of maturity are therefore three: **explainable** (every conclusion traces back to a source), **refutable** (the system actually changes after the user corrects it), and **thoroughly forgettable** (deletion covers all layers with a record to show for it).

None of the three concerns "remembering more". They concern control — the user's control over memory, the operator's control over the system, and compliance's control over evidence.

The technical conditions of 2026 are already sufficient for the first two. The third is constrained by an unsolved self-referential dilemma and will not disappear in the short term. Acknowledging this is closer to engineering honesty than claiming to have solved it.

Memory will eventually become infrastructure that no longer needs repeated discussion, much as databases are today. At that point people will stop asking "what algorithm does your memory system use" and start asking "can it be audited, overturned, and forgotten" — just as they now ask of a database whether it can do transactions, backups, and recovery.

Until that day arrives, the trade-offs discussed in this book still have to be made one by one.
