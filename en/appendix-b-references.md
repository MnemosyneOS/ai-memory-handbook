# Appendix B — References and Reproducible Resources

This appendix lists only sources that can be independently accessed and recomputed. Every number cited in the body text can find its origin here; sources that cannot be listed here are not cited in the body text.

All links and version information are as of **30 October 2026**. Product documentation and repositories are updated continuously; if you find a version difference when recomputing, the official page at that time prevails.

## B.1 Academic papers

| ID | Title | Authors / venue | Relation to this book |
| --- | --- | --- | --- |
| arXiv:2605.06716 | From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms | Jinghao Luo et al., ACL 2026 Findings, submitted 2026-05-07 | Source of the three-stage evolution framework (storage / reflection / experience); the backbone of Chapter 19 |
| arXiv:2410.10813 | LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory | Di Wu et al., ICLR 2025 | A composite benchmark of 500 questions over five abilities; the original source of "roughly a 30% accuracy drop in sustained interaction" |
| arXiv:2504.19413 | Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory | Prateek Chhikara et al. | LOCOMO comparison: 26% relative improvement in LLM-as-a-Judge, 91% lower p95 latency, over 90% token cost saving |
| arXiv:2501.13956 | Temporal knowledge graph methods in Zep / Graphiti | Zep team | Methodological source for the dual time axis and incremental graph updates |

**On the accurate formulation of the three-stage framework**: the survey formalizes the evolution as **storage (trajectory preservation)**, **reflection (trajectory refinement)**, and **experience (trajectory abstraction)**, and analyses three drivers — the necessity of long-range consistency, the challenge of dynamic environments, and the goal of continual learning. In the frontier "experience" stage it focuses on two mechanisms: proactive exploration and cross-trajectory abstraction. This book does not extrapolate beyond that framework.

## B.2 Products and implementations

### B.2.1 Mnemosyne OS

| Resource | URL | Notes |
| --- | --- | --- |
| PyPI | `https://pypi.org/project/mnemosyne-os/` | Package name `mnemosyne-os`, current version 8.1.0.post1, MIT |
| Source repository | `https://github.com/MnemosyneOS/mnemosyne` | Main branch contains `mnemosyne/`, `storage/`, `security/`, `scripts/`, `docs/` |
| Benchmark repository | `https://github.com/MnemosyneOS/mnemosyne-bench` | Unified scorer, three-method adapters, naive baseline, CN-Scenarios dataset |
| Hosted console | `https://ai-memory.net` | Registration, API key management, memory browsing, subscription management |
| Compatibility notes | `docs/COMPATIBILITY.md` in the repository | Mapping of the conventional agent-memory call shape |
| Deployment notes | `docs/DEPLOY_DEEPSEEK_HARNESS.md` in the repository | MCP deployment walkthrough |

Installation and minimal reproduction:

```bash
pip install mnemosyne-os
python -c "from mnemosyne import Memory; m=Memory(); m.add('I prefer dark mode', user_id='alice'); print(m.search('preference', filters={'user_id':'alice'})['results'][0]['memory'])"
```

Self-check scripts (in the repository; clone first):

```bash
python verify.py
python scripts/verify_api.py
python scripts/verify_precision_recall.py
python scripts/verify_recall_quality.py
python scripts/verify_memory_lifecycle.py --brain-dir ./mem --src-root .
python scripts/verify_formation.py
python scripts/verify_graph_health.py
python scripts/verify_l1_l3.py
python scripts/verify_v810.py
```

Benchmark reproduction:

```bash
git clone https://github.com/MnemosyneOS/mnemosyne-bench
cd mnemosyne-bench
python -m harness.run --systems mnemosyne,naive --datasets longmemeval
python scripts/verify_harness.py
```

**A fact that must be stated alongside the above**: the benchmark repository's `results/2026-10-24.md` labels itself a **seed result table**, whose purpose is to carry the scores already published in the main repository's README so the two never drift; the only machine-readable run record currently committed is a naive baseline run on CN-Scenarios (hit@5 = 0.0, 6 questions). The README figures — LongMemEval 96.2, LoCoMo 94.8, BEAM 1M 68.5, BEAM 10M 53.9 — should therefore be cited as **claims pending recomputation by a complete in-repository run**, not as verified results.

### B.2.2 Mem0

| Resource | URL | Notes |
| --- | --- | --- |
| Research page | `https://mem0.ai/research` | The four algorithmic changes (single-pass ADD-only extraction, multi-signal retrieval, temporal reasoning, memory decay) and token comparison data |
| Documentation | `https://docs.mem0.ai/` | Separate sections for open source and platform; default components, self-hosted stack, component configuration |
| Pricing | `https://mem0.ai/pricing` | Free and Custom tiers |
| Repository | `https://github.com/mem0ai/mem0` | Open-source library and self-hosted server |
| Benchmark data | `https://github.com/mem0ai/memory-benchmarks` | The authoritative source for published scores |

**Scope note**: Mem0's official research page in October 2026 states "single-pass ADD-only extraction — extraction collapses to one LLM call that only adds, with no overwrite or delete step, so history survives intact with about 2x faster extraction"; and "memory decay — recently accessed memories get a soft ranking boost while idle ones dampen over time at zero search latency cost. Nothing is ever deleted or hidden." This book describes accordingly, and does not cite any unpublished decay coefficient.

**Benchmark scores must carry three scope markers** (Platform / OSS, Top 50 / Top 200, accuracy / pass rate). The official figures are in the `mem0ai/memory-benchmarks` repository README, **not** on the mem0.ai/research page (that page's four charts are client-rendered and capture as `0.0`, so they must not be cited):

| Benchmark | Top 200 | Top 50 | Metric |
| --- | --- | --- | --- |
| LongMemEval (500 questions) | 94.4% (472/500) | 94.8% (474/500) | Accuracy |
| LoCoMo (1540 questions) | 92.5% (1425/1540) | 91.8% (1414/1540) | Accuracy |
| BEAM 1M (700 questions) | 70.1% (491/700) | 67.1% (470/700) | **Pass rate** |
| BEAM 10M (200 questions) | 50.5% (101/200) | 45.5% (91/200) | **Pass rate** |

> **BEAM's pass rate and LoCoMo's accuracy are not directly comparable.** The OSS self-hosted configuration has a separate set (LongMemEval overall 91.0%, GPT-5 answering and judging), which is not the same set as the Platform figures.

### B.2.3 Zep / Graphiti

| Resource | URL | Notes |
| --- | --- | --- |
| Zep documentation | `https://help.getzep.com/` | v4 is the default version; a `/llms.txt` index is available |
| Context MCP Server | `https://api.getzep.com/mcp` | Exposes 12 tools: `search_graph`, `get_user_summary`, `get_subgraph`, `get_node_neighbors`, `list_episodes`, `add_memory`, `list_graphs`, `search_graph_in`, `get_subgraph_in`, `get_node_neighbors_in`, `list_episodes_in`, `add_memory_to_graph`, plus a `zep://graphs/directory` resource |
| Graphiti repository | `https://github.com/getzep/graphiti` | Apache-2.0 framework for temporal context graphs, with hybrid retrieval |
| Pricing and plans | `https://www.getzep.com/pricing` | MCP billed per seat; custom OIDC requires Enterprise |

**Scope note**: Zep positions itself as "the unified context layer for enterprise data", organizing data in temporal Context Graphs and serving Context Lake through the Konig graph database service. The Context MCP Server authenticates the end user rather than a Zep account member, signing in through the customer's own identity provider.

### B.2.4 Letta

| Resource | URL | Notes |
| --- | --- | --- |
| Documentation | `https://docs.letta.com/` | Concepts include Stateful agents, Conversations, MemFS, shared memory |
| Current source | `https://github.com/letta-ai/letta-code` | Contains the agent harness, terminal UI, App Server, channels, runtime |
| Historical source | `https://github.com/letta-ai/letta` (`archive` branch) | The retired V1 API server |

**Scope note**: Letta, formerly MemGPT, distributes as the npm package `@letta-ai/letta-code`, with Letta Cloud and a TypeScript Agent SDK. This book does not assert the current implementation status of "sleep-time compute"; it is cited only as an architectural idea.

### B.2.5 LangMem

| Resource | URL | Notes |
| --- | --- | --- |
| Documentation | `https://langchain-ai.github.io/langmem/` | Conceptual guide: semantic / episodic / procedural memory; conscious and subconscious formation; memory namespace |
| Repository | `https://github.com/langchain-ai/langmem` | Memory SDK; persistence delegated to a LangGraph store |

### B.2.6 Cloudflare Agents

| Resource | URL | Notes |
| --- | --- | --- |
| Documentation | `https://developers.cloudflare.com/agents/` | Durable agent runtime; conversation state and memory, tools, Agent Skills, workflows, file system, sandbox, MCP |
| Documentation index | `https://developers.cloudflare.com/agents/llms.txt` | Full-site page index |

## B.3 Reproducible observation methods

The data in this book's "Technical Observations" chapter can be recomputed with the following queries. Both match only arXiv metadata fields and therefore return lower bounds.

```text
https://export.arxiv.org/api/query?search_query=all:%22agent+memory%22&max_results=1
https://export.arxiv.org/api/query?search_query=abs:%22memory%22+AND+abs:%22LLM+agent%22&max_results=1
```

Measured on 30 October 2026, the `opensearch:totalResults` values were 600 and 841 respectively.

Repository activity is observed via the GitHub REST API repository endpoint, reading `stargazers_count` and `pushed_at`. Measured on the same day: mem0ai/mem0 at 68,080, getzep/graphiti at 32,356, letta-ai/letta at 25,292, and langchain-ai/langmem at 1,736. Such figures indicate ecosystem activity only and do not constitute a quality judgment.

## B.4 Directions not covered here but worth reading

The following directions are closely related to memory systems but are not developed in this book, because each would need a chapter of its own:

- **General context engineering**: strategies for compressing, offloading, rebuilding, and validating context. The boundary with memory is lifetime, not data structure.
- **Agent observability**: standard definitions for traces, metrics, and cost attribution — the upstream input to memory quality measurement.
- **Asset registry and version governance**: registration, versioning, and release mechanisms for prompts, skills, MCP servers, and agents. Memory entries are governance-analogous to these.
- **Behaviour validation and simulation**: user and environment simulation before launch, as one means of validating memory strategy changes.

Readers who need to align these directions with memory systems are advised to start from the responsibility-domain division in Chapter 2 and work through item by item, rather than starting from implementation details.
