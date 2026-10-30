# 附录 B：参考资料与可复现资源

本附录只列出可被独立访问与复算的来源。凡本书正文引用的数字，均可在以下条目中找到对应出处；无法在此列出的来源，正文不会引用。

所有链接与版本信息以 **2026 年 10 月 30 日**为准。产品文档与仓库会持续更新，读者复算时如遇版本差异，以当时的官方页面为准。

## B.1 学术论文

| 编号 | 标题 | 作者 / 出处 | 与本书的关系 |
| --- | --- | --- | --- |
| arXiv:2605.06716 | From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms | Jinghao Luo 等，ACL 2026 Findings，2026-05-07 提交 | 记忆演进三阶段（存储 / 反思 / 体验）框架的来源，第 19 章的骨架 |
| arXiv:2410.10813 | LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory | Di Wu 等，ICLR 2025 | 500 题、五项能力的综合基准；「持续交互约 30% 准确率下降」的原始出处 |
| arXiv:2504.19413 | Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory | Prateek Chhikara 等 | LOCOMO 上的对照实验：LLM-as-Judge 相对提升 26%、p95 延迟降低 91%、token 成本节省 90% 以上 |
| arXiv:2501.13956 | Zep / Graphiti 的时序知识图谱方法 | Zep 团队 | 双时间轴与增量图更新的方法学来源 |

**关于三阶段框架的准确表述**：综述把演进形式化为 **存储（trajectory preservation）**、**反思（trajectory refinement）**、**体验（trajectory abstraction）** 三个阶段，并分析三项驱动因素——长程一致性的必要性、动态环境的挑战、持续学习的目标；在前沿的「体验」阶段，重点讨论两个机制：主动探索与跨轨迹抽象。本书引用该框架时不做外推。

## B.2 产品与实现

### B.2.1 Mnemosyne OS

| 资源 | 地址 | 说明 |
| --- | --- | --- |
| PyPI | `https://pypi.org/project/mnemosyne-os/` | 包名 `mnemosyne-os`，当前版本 8.1.0.post1，MIT 许可 |
| 源码仓库 | `https://github.com/MnemosyneOS/mnemosyne` | 主分支含 `mnemosyne/`、`storage/`、`security/`、`scripts/`、`docs/` |
| 基准仓库 | `https://github.com/MnemosyneOS/mnemosyne-bench` | 统一 scorer、三方法适配器、naive 基线、CN-Scenarios 数据集 |
| 托管控制台 | `https://ai-memory.net` | 注册、API key 管理、记忆浏览、订阅管理 |
| 兼容性说明 | 仓库内 `docs/COMPATIBILITY.md` | 常规 agent-memory 调用形状的映射关系 |
| 部署说明 | 仓库内 `docs/DEPLOY_DEEPSEEK_HARNESS.md` | MCP 部署走查 |

安装与最小复现：

```bash
pip install mnemosyne-os
python -c "from mnemosyne import Memory; m=Memory(); m.add('I prefer dark mode', user_id='alice'); print(m.search('preference', filters={'user_id':'alice'})['results'][0]['memory'])"
```

自检脚本（仓库内，需先克隆）：

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

基准复现：

```bash
git clone https://github.com/MnemosyneOS/mnemosyne-bench
cd mnemosyne-bench
python -m harness.run --systems mnemosyne,naive --datasets longmemeval
python scripts/verify_harness.py
```

**必须同时说明的事实**：基准仓库的 `results/2026-10-24.md` 自我标注为 **seed result table**，其作用是承载主仓库 README 已公布的分数、避免两处漂移；仓库中目前唯一提交的机器可读运行记录是一次 naive 基线在 CN-Scenarios 上的运行（hit@5 = 0.0，6 题）。因此 README 中的 LongMemEval 96.2 / LoCoMo 94.8 / BEAM 1M 68.5 / BEAM 10M 53.9 应被引用为**待仓库内完整运行复算的主张**，而不是已复算结论。

### B.2.2 Mem0

| 资源 | 地址 | 说明 |
| --- | --- | --- |
| 研究页 | `https://mem0.ai/research` | 四项算法变更（单遍 ADD-only 提取、多信号检索、时序推理、记忆衰减）与 token 对照数据 |
| 文档 | `https://docs.mem0.ai/` | 开源版与平台版分栏；默认组件、自托管栈、组件配置 |
| 定价 | `https://mem0.ai/pricing` | Free 与 Custom 两档 |
| 仓库 | `https://github.com/mem0ai/mem0` | 开源库与自托管服务器 |

**口径说明**：Mem0 官方研究页在 2026 年 10 月的表述为「单遍 ADD-only 提取——提取收敛为一次 LLM 调用且只做追加，不覆盖不删除，历史完整保留，提取速度约为原来的两倍」；「记忆衰减——近期访问的记忆获得软性排序加权，闲置项随时间衰减，零检索延迟成本，不删除不隐藏」。本书据此描述，不引用任何未公布的衰减系数。

### B.2.3 Zep / Graphiti

| 资源 | 地址 | 说明 |
| --- | --- | --- |
| Zep 文档 | `https://help.getzep.com/` | v4 为默认版本；提供 `/llms.txt` 文档索引 |
| Context MCP Server | `https://api.getzep.com/mcp` | 暴露 6 个工具：`search_graph`、`get_user_summary`、`get_subgraph`、`get_node_neighbors`、`list_episodes`、`add_memory` |
| Graphiti 仓库 | `https://github.com/getzep/graphiti` | Apache-2.0 开源框架，时序上下文图，混合检索 |
| 定价与计划 | `https://www.getzep.com/pricing` | MCP 按席位计费；自定义 OIDC 需 Enterprise 计划 |

**口径说明**：Zep 的定位表述为「企业数据的统一上下文层」，以时序 Context Graph 组织数据，由 Konig 图数据库服务承载 Context Lake。Context MCP Server 的鉴权主体是终端用户而非 Zep 账号成员，登录走客户自己的身份提供方。

### B.2.4 Letta

| 资源 | 地址 | 说明 |
| --- | --- | --- |
| 文档 | `https://docs.letta.com/` | 概念面含 Stateful agents、Conversations、MemFS、shared memory |
| 当前源码 | `https://github.com/letta-ai/letta-code` | 含 agent harness、终端 UI、App Server、channels、runtime |
| 历史源码 | `https://github.com/letta-ai/letta`（`archive` 分支） | 已退役的 V1 API server |

**口径说明**：Letta 前身 MemGPT，当前以 npm 包 `@letta-ai/letta-code` 分发，另有 Letta Cloud 与 TypeScript Agent SDK。本书不对「睡眠时计算」的当前实现状态下断言，仅作为架构思路引用。

### B.2.5 LangMem

| 资源 | 地址 | 说明 |
| --- | --- | --- |
| 文档 | `https://langchain-ai.github.io/langmem/` | 概念指南：语义 / 情景 / 程序三类记忆；有意识形成与潜意识形成；memory namespace |
| 仓库 | `https://github.com/langchain-ai/langmem` | 记忆 SDK，持久化依赖 LangGraph store |

### B.2.6 Cloudflare Agents

| 资源 | 地址 | 说明 |
| --- | --- | --- |
| 文档 | `https://developers.cloudflare.com/agents/` | Durable Agent 运行时；Conversation state and memory、Tools、Agent Skills、Workflows、File system、Sandbox、MCP |
| 文档索引 | `https://developers.cloudflare.com/agents/llms.txt` | 全站页面索引 |

## B.3 可复现的观察方法

本手册「技术观察」章节的数据可由以下检索式复算。两次查询均只匹配 arXiv 元数据字段，返回的是下界。

```text
https://export.arxiv.org/api/query?search_query=all:%22agent+memory%22&max_results=1
https://export.arxiv.org/api/query?search_query=abs:%22memory%22+AND+abs:%22LLM+agent%22&max_results=1
```

2026 年 10 月 30 日实测的 `opensearch:totalResults` 分别为 600 与 841。

仓库活跃度观察使用 GitHub REST API 的仓库端点，读取 `stargazers_count` 与 `pushed_at`。同一天实测：mem0ai/mem0 为 68,080，getzep/graphiti 为 32,356，letta-ai/letta 为 25,292，langchain-ai/langmem 为 1,736。此类数字仅用于判断生态活跃度，不构成质量判断。

## B.4 本书不引用但值得一读的方向

以下方向与记忆系统强相关，但本书未展开，原因是它们各自需要独立篇幅：

- **上下文工程的通用方法**：上下文压缩、卸载、重建与校验的策略设计，与记忆的边界在于生命周期而非数据结构。
- **Agent 可观测性**：Trace、指标与成本归因的标准口径，是记忆质量度量的上游输入。
- **资产注册与版本治理**：Prompt、Skill、MCP 与 Agent 的注册、版本与发布机制，记忆条目在治理语义上与之同类。
- **行为验证与仿真**：上线前的用户模拟与环境模拟，是记忆策略变更的验证手段之一。

读者若需要把这些方向与记忆系统对齐，建议从本书第 2 章的责任域划分入手，再逐项对照，而不是先读实现细节。

---

