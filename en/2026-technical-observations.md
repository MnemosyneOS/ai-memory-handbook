# 2026 Technical Observations on Memory Systems

The first chapter of this handbook discusses "why memory matters," but that question already had consensus in 2025. What actually needs evidence is a different set of questions: where the center of gravity of this field moved in 2026, which capabilities are converging, and which gaps are widening.

This chapter does not use survey data. The reason is straightforward: this book conducted no survey, and fabricating respondent percentages is the most easily exposed kind of false authority in the memory field. The substitute is **observation based on publicly reproducible signals** — paper indexes, official documentation, release records, public repositories, and pricing pages. All bases of measurement and cutoff dates are stated, and any reader can recompute them with the same search expressions.

Search and retrieval time is uniformly **October 30, 2026**. Content concerning versions and prices is dated to this day; later changes should be checked against the official pages.

## 1. Core Findings

**Finding 1: On the academic side, the center of gravity has shifted from "how to store" to "how to abstract."** The survey accepted into ACL 2026 Findings formalizes the evolution into three stages — storage → reflection → experience — and explicitly notes that the methodology of the latter two remains immature. This agrees with engineering-side observation: write and retrieval already have relatively stable paradigms, while "abstracting trajectories into reusable experience" is still exploratory.

**Finding 2: The write paradigm has genuinely converged.** Single-pass ADD-only extraction was independently adopted by major implementations. This means "do not overwrite existing facts" has become an industry-wide floor of consensus, and also that it is no longer anyone's differentiating selling point.

**Finding 3: There is a systematic gap between capability claims and verifiability.** Nearly every system can claim to "support memory," but only a few can offer a recomputable benchmark, an audit that can locate tampering, and a verifiable deletion. The gap is not in whether a feature exists, but in whether evidence exists.

**Finding 4: Deployment forms are polarizing toward two ends.** One end binds to a managed ecosystem (cloud vendor runtimes, managed context layers); the other is zero-dependency self-hosting. The middle form (self-hosting that requires building your own graph database or message queue) is squeezed on operating cost from both ends.

**Finding 5: Control over retrieval granularity has become a new competitive point.** Once baseline recall capability converges, "letting the caller precisely control what granularity is fetched" becomes a source of differentiation: some systems make granularity an explicit parameter, others use two-step disclosure to control injection cost.

**Finding 6: Chinese and non-English scenarios remain significantly under-covered.** Mainstream benchmarks are English-centric; Chinese proper nouns, relative temporal expressions, and near-synonymous expressions degrade markedly under pure embedding recall, while public controlled experiments addressing this are very few.

## 2. Signal 1: Paper Growth and Structural Distribution

Two queries against the arXiv API's `search_query` yield a lower-bound estimate of the field's size.

```text
https://export.arxiv.org/api/query?search_query=all:%22agent+memory%22&max_results=1
→ opensearch:totalResults = 600

https://export.arxiv.org/api/query?search_query=abs:%22memory%22+AND+abs:%22LLM+agent%22&max_results=1
→ opensearch:totalResults = 841
```

Both query expressions match only metadata fields and do not search full text, so what they produce is a **lower bound**: a large number of papers titled around "long-term context" or "persistent state" will not be counted. Anyone can recompute against the same URLs; the counts will change as the arXiv index updates, which is normal.

What is more informative than the total is the distribution. The survey's judgment is that among the three stages, "storage" already has mature methods, "reflection" has considerable work but lacks a unified evaluation basis, and "experience" still lacks both methods and metrics. On the engineering side this maps to one concrete conclusion: **if all you need to do today is "remember and retrieve," there are many mature options available; if you need to "distill transferable experience from history," there is no scheme you can copy directly**.

This point is frequently confused during selection. The "it understands you better the more you use it" in vendor demos usually belongs to the capability of the reflection stage, and its reliability is far below that of the storage stage. Evaluating the two as the same thing will systematically overestimate a system's maturity.

## 3. Signal 2: Capability Convergence on the Engineering Side

The most record-worthy change of 2026 is the convergence of the write paradigm. Take Mem0: its official research page, describing the current algorithm, lists four items — **single-pass ADD-only extraction** (one LLM call, only adds, never overwrites or deletes; the vendor states extraction is roughly twice as fast as before and history is fully preserved), **multi-signal retrieval** (semantic, keyword, and entity channels scored and fused in parallel), **temporal reasoning** (classification completed at write time), and **memory decay** (recently accessed items receive a soft ranking boost, idle items decay over time, at zero retrieval-latency cost, and nothing is deleted or hidden).

The combination of these four overlaps heavily with the core design of Mnemosyne OS: the latter likewise uses single-pass ADD-only extraction, five-signal fusion (semantic + BM25 + entity graph + time + tags), a dual time axis, and tiered degradation. The two differ markedly in implementation detail, but have already converged in **paradigm choice**.

Convergence is good for users: a stable paradigm means lower migration cost, and also means different implementations can be compared with the same evaluation method. But it simultaneously raises the bar for selection — when the foundational paradigm is no longer a differentiator, selection must move into finer dimensions: how conflicts are adjudicated, how deletion is proven, how auditing locates things, how cost changes with scale.

One concrete comparison illustrates this refinement. Under the vendor's stated basis, a Mem0 retrieval call uses about 6,900 tokens, while a full-context approach exceeds 25,000 tokens; this gap determines whether a product can be priced at high daily active usage. Mnemosyne's differentiator is not the token count but the mode of budget control: `recall(..., budget_tokens=N)` selects which memories to return and at what granularity under a budget constraint, and `profile_card`'s `max_tokens` is a hard cap that drops whole tiers rather than truncating mid-sentence. The former is "saving on average"; the latter is "a controllable ceiling." They suit different scenarios.

## 4. Signal 3: The Gap Between Capability Claims and Verifiability

Placing the public materials of six major implementations side by side reveals a pattern: **capability claims are densest for write and retrieval, and evidence is sparsest for audit and deletion**.

| Capability | Prevalence of claims | Prevalence of verifiable means |
| --- | --- | --- |
| Write and recall | High | Medium (SDK examples exist, systematic self-check scripts are rare) |
| Scope isolation | High | Low (cross-tenant read tests are rare) |
| Audit | Medium | Low (mostly operation logs, not locatable integrity proofs) |
| Deletion | High | Low (four-layer semantics and dry_run previews are rare) |
| Benchmark reproducibility | Low | Low (most publish only the headline score) |

Table 1 — Comparison of claim density and evidence density for six capability classes

What matters in this table is **the difference between the two columns**. The larger the gap, the lower the degree to which that capability "can be believed." The audit and deletion rows have the largest gaps, and they happen to be the first two things a compliance review asks about.

One operational test: ask any memory system for three things — a script for a cross-tenant read test, the actual output of a `verify_integrity` run, and a `dry_run` report of a cascade delete. A system that can produce all three on the spot has verifiable governance capability; one that can only produce documentation screenshots has declarative governance capability.

## 5. Signal 4: Divergence in Pricing and Deployment Forms

Pricing structure reflects each vendor's judgment about "who bears the operations burden."

Mem0's public pricing as of October 2026 has only two tiers: **Free** (unlimited end users; for the first 30 days, 10,000 adds / 1,000 retrievals per month with model calls borne by Mem0; with your own LLM key, 50,000 adds / 10,000 retrievals) and **Custom** (usage-based quote, including graph memory, user profiles, memory consolidation, advanced analytics, SSO and audit logs, SLA, and on-premises deployment). This structure shows that its commercialization centers on "large customers who need governance and compliance," with the Free tier carrying customer acquisition and developer education.

Mnemosyne OS's SaaS follows a four-tier structure: Free (all 52 tools, a 30-day cold-tier recall window, a single namespace, a 7-day audit window), Pro ($6.9/month or ¥9.9/month, permanent cold tier, cross-namespace recall, unlimited audit history), Team ($19.9/seat/month, multi-user namespaces and team policies), and Compliance Add-on ($9.9/month, monthly billing only, add-on only). Its design point is that **the tier gate is off by default**: self-deployed and PyPI users face no restrictions at all; charging only narrows the read window, the write channel is always open, and the open-source edition has no feature paywall.

Zep's Context MCP Server is billed per seat, with seat counts varying by plan, and custom OIDC requiring an enterprise plan; this reflects the pricing logic of a new scenario — "opening memory to employees' own clients" — where it prices per **person** rather than per call volume.

The three structures correspond to three assumptions: Mem0 assumes value lies in large customers' governance needs, Mnemosyne assumes value lies in managed convenience rather than feature tiering, and Zep assumes value lies in per-capita access. None is more correct, but they lead to completely different product routes.

## 6. Signal 5: Under-Coverage of Chinese and Non-English Scenarios

Three observable facts.

First, mainstream benchmark datasets are dominated by English dialogue. LongMemEval's 500 questions evaluate five capabilities (information extraction, multi-session reasoning, temporal reasoning, knowledge update, and abstention), and its question construction is strongly language-dependent; direct translation would change the difficulty distribution.

Second, pure embedding recall degrades markedly on Chinese proper nouns. Tokens such as product models, personal names, and project codenames lack sufficient discriminability from common words in embedding space, whereas lexical signals like BM25 happen to be more precise there. The engineering response is to treat lexical signals as a first-class citizen rather than a fallback: Mnemosyne uses Bigram tokenization + FTS5 + a built-in synonym dictionary, and retains a BM25 fallback when the embedding service is unavailable.

Third, Chinese temporal expressions ("last Wednesday," "end of last year," "this quarter") require dedicated relative-time parsing; otherwise the "when did it happen" dimension fails outright, and the dual time axis is precisely the basis of conflict adjudication.

The joint conclusion of these three points is that Chinese scenarios cannot be solved by "swapping in another multilingual embedding model"; they require adaptation at the retrieval-pipeline level. Public targeted controlled experiments are currently very few, and this book considers this the most worthwhile gap to fill.

## 7. Chapter Conclusion

The five groups of signals point to one judgment: **in 2026 the competition in memory systems has shifted from "can it remember" to "can what is remembered be trusted, explained, and safely forgotten."**

This shift has three concrete implications.

For users: selection should use "evidence" rather than "features" as the primary criterion. A system that can offer a recomputable benchmark, locatable auditing, and previewable deletion carries lower long-term risk even if its feature list is shorter.

For builders: the foundational paradigm has converged, and continuing to differentiate on "we also support ADD-only" is meaningless. The real space lies in three directions — the accuracy of conflict adjudication, the verifiability of deletion, and quality metrics for experience abstraction.

For researchers: what industry lacks most is not new algorithms but reproducible failure-case sets and cross-system cost-quality curves. The value of these two things will exceed any single system's headline score.

The architecture section that follows will turn these three judgments into concrete responsibility divisions and investment scales.

---
