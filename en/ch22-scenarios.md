# Chapter 22 — Representative Scenarios in Practice

The previous five chapters established general methods: how to divide responsibility domains, how to write and retrieve, how to implement governance, how to judge selection. But methods only mean something when they land in a scenario, and scenarios differ not in technology stack but in **how severe the consequence of failure is** and **what error rate is tolerable**.

A personal assistant that misremembers a user's taste gets corrected, and the cost is one complaint. A medical follow-up system that misremembers an allergy history costs a medical incident. Both use the same mechanisms, but their configuration, acceptance criteria, and investment differ completely. Writing those differences down clearly is more useful than another set of general best practices.

This chapter selects five scenarios, each developed in four parts: business constraints, memory design, failure points, and acceptance methods. The five cover the full range from low-risk high-tolerance to high-risk low-tolerance, and they also cover the specific problems of Chinese-language scenarios.

## 22.1 Personal assistants: preference drift and over-generalization

### 22.1.1 Business constraints

A personal assistant's memory needs have three characteristics: low write frequency (a few per day), high read frequency (used in every turn), and high error tolerance (the user will correct it).

The key constraint is that **the user is the only judge**. The system does not need to prove anything to a third party; it only needs to make the user feel understood. That means audit chains and cascade deletes are far lower priority here than recall accuracy and response speed.

### 22.1.2 Memory design

The core is a **layered profile**. Split memory into three layers: stable identity (occupation, language habits, long-term preferences), preferences and constraints (dietary restrictions, communication style), and current situation (what project is in flight, this week's goals).

The value of layering is that update frequency differs. Stable identity barely changes; current situation changes weekly. Mixed together, every situational update contaminates the identity layer.

The second design element is **source tagging**. Distinguish "what the user explicitly said" from "what the system inferred". "I don't eat coriander" is explicit; "prefers light flavours" inferred from three orders is not. The two should carry different weights at recall time.

### 22.1.3 Failure point: over-generalization

The most common failure is not remembering wrongly but **over-extrapolating from specific to general**.

The user said "less spicy" three times, the system inferred "doesn't eat spicy" and wrote it to the preference layer. Next time the user orders a mala hotpot, the assistant recommends a mild broth, and the user is puzzled.

The mechanism is that a single statement was promoted to a stable attribute, and the promotion carried no confidence decay. The correct approach is to mark inferences as low-confidence, place them in the situational layer rather than the preference layer, and allow them to be overturned on each use.

The second failure point is **unreflected preference drift**. The user liked dark mode three months ago and now uses light mode. If the old memory is not superseded by the new one, the system keeps recommending dark mode. This requires retrieval to consider the time signal, not just semantic similarity.

### 22.1.4 Acceptance methods

Three executable checks.

**Layered displayability.** Can the system show the user "what I have remembered" organized by layer? If it can only produce a flat list, the user cannot tell which item is identity and which is transient situation.

**Overturn cost.** After the user says "no, I prefer light now", how many interactions does it take for the system to correct itself? More than one means the write path lacks conflict resolution.

**Over-generalization rate.** Sample 50 system-inferred memories and judge by hand how many are "stable attributes inferred from a single statement". Above 20% means inference is too aggressive.

## 22.2 Customer support and CRM: stale facts overriding new ones

### 22.2.1 Business constraints

Support scenarios have three characteristics: high write frequency (every interaction generates records), retrieval must be real-time (the user is waiting), and error consequences are moderate (satisfaction suffers but no law is broken).

The key constraint is **multiple sources**. The same customer's information comes from the ticketing system, call records, email, and the order database. The four have different update times and may contradict each other.

### 22.2.2 Memory design

The core is **dual time axis plus source priority**.

The dual time axis distinguishes "when the fact happened" from "when the system learned it". A record saying "the customer upgraded to Enterprise" may have an event time of last week while the system only learned it today. Recording only the write time makes the system misjudge the freshness.

Source priority resolves contradictions. The order database's state outranks a verbal promise in a call record; a formal ticket's conclusion outranks a guess in a chat. This priority must be configured explicitly, not judged by the model.

The second design element is **making conflicts explicit**. When two sources contradict, do not silently pick one — mark the contradiction and let the retrieval result carry a "conflict exists" flag. A human agent seeing the flag will confirm; a silent choice lets the error persist.

### 22.2.3 Failure point: stale facts remain effective

The most typical failure: the customer complained about slow logistics three months ago, and the system wrote "sensitive to logistics" into the profile. The customer later changed the delivery address, the logistics problem was resolved, but the profile was never updated. Every interaction, the system volunteers "we noticed you had concerns about logistics", and the customer feels the system is dredging up old grievances.

Mechanically, this is **a derived conclusion that did not expire with its source fact**. The source fact (that complaint) no longer has predictive value, but the derived conclusion (logistics-sensitive) exists independently with no expiry.

The second failure point is **cross-session context contamination**. In a previous support session the customer expressed dissatisfaction, that emotion was written into memory, and the next session begins with the prior "this customer may be unhappy", producing an overly cautious tone.

### 22.2.4 Acceptance methods

**Recency correctness.** Construct 20 test cases of "old fact versus new fact" and check whether the system returns the new one. Target above 90%.

**Conflict visibility.** Deliberately inject contradictory sources and check whether retrieval results carry the conflict flag. Target 100%.

**Expiry cleanup.** Measure the share of memories not cited and not updated for over 90 days. Above 40% means the demotion mechanism is missing.

## 22.3 Engineering productivity agents: negative transfer of experience

### 22.3.1 Business constraints

Engineering scenarios have peculiar memory needs: what is written is **method** rather than fact, reading happens at task start, and the cost of error may be an introduced bug.

The key constraint is that **experience has applicability conditions**. "In this project we use pnpm rather than npm" is valid experience, but only in a specific project. Applied indiscriminately to another project, it causes a build failure.

### 22.3.2 Memory design

The core is **mandatory preconditions**. When saving a reusable experience, three things must be recorded: the conditions under which it applies (`must`), the conditions under which it does not (`must_not`), and the typical environment (`typical_env`).

An "experience" without these three is actually a "suggestion", and a suggestion's reliability is far below an experience's.

The second design element is **precondition validation at recall time**. Rather than simply returning matching experiences, judge whether the current environment satisfies `must` and triggers `must_not`, return only the entries that pass, and report why the others did not.

Mnemosyne's `playbook_save` makes `preconditions` mandatory, and `playbook_recall` returns `applicable` and `blocked_by`. The cost of this design is more friction at write time — the caller must think through applicability, and that is exactly the step most often skipped.

The third design element is **code evolution memory**. Record the intent, constraints, impact surface, and rejected approaches of each change. The value of this memory is not "what was changed" but "why it was not done the other way" — the latter is forgotten by everyone within six months.

### 22.3.3 Failure point: negative transfer

The most typical failure: an experience valid in project A is applied to project B and causes an incident.

A concrete form: the agent learned in project A that "on a type error, first check the `strict` setting in tsconfig". That experience was stored without preconditions. In project B, on a type error, the agent went straight to editing tsconfig, while B's real problem was a dependency version conflict. The tsconfig change masked the symptom, and the problem resurfaced in a more severe form two days later.

Mechanically, this is **an experience treated as a universal rule**. Missing preconditions turn recall into keyword matching, and keyword matching cannot distinguish "a similar problem" from "the same problem".

The second failure point is **the experience library becoming a dogma library**. As experience accumulates, the agent relies more on historical practice and explores less. The symptom is that novel problems trigger repeated attempts at historical solutions rather than analysis of the current problem.

### 22.3.4 Acceptance methods

**Precondition coverage.** Measure the share of experience entries with complete `must` / `must_not` / `typical_env`. Target 100%; below 80% means write discipline is not in place.

**Negative-transfer detection.** Construct 10 "experience does not apply" scenarios and check whether `playbook_recall` correctly returns `blocked_by`. Target 100%.

**Exploration rate.** Measure the ratio of historical-solution use to on-the-spot analysis when the agent encounters novel problems. A steadily falling exploration rate means the experience library is suppressing exploration.

## 22.4 Compliance-sensitive industries: deleted but derivations remain

### 22.4.1 Business constraints

Medical and financial scenarios have three characteristics: writes must be cautious (every entry may be evidence), reads must be authorized (unauthorized reads are incidents), and deletion must be provable (statutory erasure rights).

The key constraint is that **no step may be "roughly right"**. The auditor will probe the details, and vagueness at the detail level is treated as non-compliance.

### 22.4.2 Memory design

The core is **four-layer deletion semantics plus recorded derivation relationships**.

Derivation relationships must be established at write time, not inferred at delete time. A memory "the patient is not allergic to ibuprofen" may already have generated the derived conclusion "NSAIDs may be used", been cited in two consultation summaries, and influenced three medication recommendations. If these relationships are not recorded at write time, deletion can only scan full text, and accuracy cannot be guaranteed.

The second design element is **deletion preview**. Before execution, the affected derived entries, summaries, and caches must be visible as a list, not merely as a count. The decision-maker needs to judge whether "deleting these" is acceptable.

The third design element is **audit chain integrity**. Every deletion must be chained, recording who deleted what and when, and what was affected. This is not for blame assignment but to prove during review that "deletion followed the process".

### 22.4.3 Failure point: residual derived conclusions

The most typical failure is the case at the start of Chapter 13: the source record was deleted, the summary still cites it, and the policy still uses the old parameters.

A concrete form: the patient exercises the right to erasure and asks for memories relating to "income level" to be cleared. Operations executes the deletion, the interface returns success, and retrieval confirms nothing is findable. Three months later a compliance spot check finds that the patient's session summary still contains "monthly income approximately 20,000", and the follow-up policy generated from that memory is still using the old parameters.

Mechanically, this is **deletion that only did the first layer**. Of the four semantics, source record deletion is the simplest; invalidating derivations, clearing caches, and marking summaries stale all require additional mechanisms.

The second failure point is **the conflict between exported copies and the right to erasure**. To preserve audit evidence, the system made a deletion-proof export. When the user asks for deletion, should that export also be deleted? If retained, does that violate the right to erasure?

### 22.4.4 Acceptance methods

**Cascade completeness test.** Delete a memory with dependencies and verify that all four layers — derived conclusions, caches, and summaries — are handled. Target 100%.

**Preview accuracy.** Compare the impact items listed in the preview with the items actually affected. Target 100% agreement; disagreement means derivation relationships are incompletely recorded.

**Export scope statement.** Every deletion processing record must explicitly list "the scope covered by this deletion" and "copies retained outside that scope and why". Without this item, the review will keep probing.

## 22.5 Chinese-dominant enterprise knowledge: proper-noun recall misses

### 22.5.1 Business constraints

Chinese scenarios have two peculiarities: tokenization has no space boundaries, and proper nouns (product model numbers, person names, project codenames) have low discriminability in embedding space.

The key constraint is that **keyword signals cannot be relegated to fallback**. Most systems are designed as "semantic primary, lexical fallback", but in Chinese proper-noun scenarios the lexical channel is the primary one.

### 22.5.2 Memory design

The core is **treating lexical signals as a first-class citizen**.

Bigram tokenization is the most stable n-gram strategy under zero-dependency constraints: splitting "Huawei Mate60Pro" into bigrams preserves key fragments such as "Mate60" without needing a dictionary. Combined with an FTS5 full-text index, it delivers baseline recall without an embedding model.

The second design element is **a synonym dictionary**. Chinese near-synonyms ("prefers" / "likes" / "is used to") are close semantically but entirely different lexically. A built-in dictionary lets lexical retrieval cover these variants.

The third design element is **relative time parsing**. "Last Wednesday", "end of last year", "this quarter" must be parsed into absolute dates; otherwise the dual time axis fails outright, and the dual time axis is the basis of conflict adjudication.

### 22.5.3 Failure point: pure embedding recall misses on model numbers

The most typical failure: the user asks about "warranty policy for Mate60" and the system returns "warranty policy for Mate50".

Mechanically, the two model numbers are close in embedding space (both phone models, both Huawei products, similar sentence structure) but entirely different in business terms. Semantic similarity gives the wrong signal here.

The second failure point is **over-compression of Chinese summaries**. Chinese has high information density, and summarization easily drops critical qualifiers ("only", "excluding", "except for"), reversing the meaning.

### 22.5.4 Acceptance methods

**Proper-noun recall rate.** Construct 50 queries over model numbers, person names, and codenames and check whether top-5 contains the correct entry. Target above 85%; pure embedding solutions typically sit around 60%.

**Lexical-semantic comparison experiment.** Run the same query batch through pure embedding, pure lexical, and fusion, and compare hit rates. This experiment directly shows which signal is more effective on a given corpus.

**Time parsing accuracy.** Sample 50 inputs containing relative time expressions and check whether the parsed results match expectation.

## 22.6 Mapping scenarios to capabilities

| Scenario | Key capabilities | Main risk | Core acceptance metric |
| --- | --- | --- | --- |
| Personal assistant | Layered profile, source tagging, time signal | Over-generalization, preference drift | Over-generalization rate < 20% |
| Support and CRM | Dual time axis, source priority, explicit conflicts | Stale facts overriding new ones | Recency correctness > 90% |
| Engineering productivity | Mandatory preconditions, recall validation, change memory | Negative transfer | Precondition coverage 100% |
| Compliance-sensitive | Four-layer deletion, derivation relationships, deletion preview | Residual derived conclusions | Cascade completeness 100% |
| Chinese knowledge | Bigram plus FTS5, synonyms, time parsing | Proper-noun misses | Proper-noun recall > 85% |

Table 22-1 — Capability mapping and acceptance metrics across five scenarios

The most useful column of this table is the last: every scenario has one core metric that can be verified by a script. Teams without that metric cannot actually tell whether their memory system is working.

## 22.7 Chapter Summary

This chapter establishes three judgments.

**First, scenarios differ not in technology stack but in consequence of failure and tolerable error rate.** A personal assistant can tolerate 20% over-generalization; a medical scenario cannot tolerate any residual derived conclusion. The same mechanisms require completely different configuration and acceptance criteria across scenarios, and applying general best practices leads to misallocated resources.

**Second, every scenario has one decisive failure mode, and it is usually not "remembered the wrong thing".** For personal assistants it is over-generalization, for support it is stale facts overriding new ones, for engineering it is negative transfer, for compliance it is residual derivations, and for Chinese it is proper-noun misses. Five failures need five different mechanisms, and no single general solution defends against all of them.

**Third, acceptance must land on scriptable metrics.** Over-generalization rate, recency correctness, precondition coverage, cascade completeness, proper-noun recall — all five can be verified against fixed datasets. Teams without such metrics can only discover problems through user complaints, and the lag of user complaints is unacceptable in compliance scenarios.

This chapter concludes the Practice part. The Outlook that follows addresses the problems these scenarios all face and that currently have no solution.
