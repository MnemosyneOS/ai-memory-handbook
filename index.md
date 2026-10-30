---
layout: home
title: AI Memory Handbook
titleTemplate: 企业级 AI 记忆系统的全生命周期实践
description: 覆盖写入、存储、检索、治理、调优全链路的 AI 记忆系统白皮书。由胡景堃发起并主导撰写，Mnemosyne OS 出品，CC BY-NC-ND 4.0 许可。

hero:
  name: AI Memory Handbook
  text: 从上下文记忆到认知基础设施
  tagline: 企业级 AI 记忆系统的全生命周期实践 · 7 篇 23 章 · 2026.11 版
  image:
    src: /logo.svg
    alt: AI Memory Handbook
  actions:
    - theme: brand
      text: 开始阅读
      link: /00-preface/阅读导引
    - theme: alt
      text: 全书目录
      link: /contents
    - theme: alt
      text: English
      link: /en/

features:
  - title: 架构篇 · 第 1–3 章
    details: 记忆为什么是一等原语、五个能力责任域的划分、L1–L4 成熟度分级与升级信号。
    link: /01-architecture/01-记忆为什么成为一等原语
    linkText: 阅读架构篇
  - title: 构建篇 · 第 4–7 章
    details: 单遍 ADD-only 写入、双时间轴、物理隔离与无损压缩、五路信号检索、MCP 工具面设计。
    link: /02-build/04-写入-抽取分型与冲突消解
    linkText: 阅读构建篇
  - title: 运行篇 · 第 8–11 章
    details: 零依赖部署的真实边界、flush 一致性屏障、namespace 派生陷阱、四项成本结构与容量规划。
    link: /03-run/08-部署形态-本地优先的真实边界
    linkText: 阅读运行篇
  - title: 治理篇 · 第 12–15 章
    details: SHA-256 哈希链审计、指针链来源追溯、删除的四层语义、写入前公证、合规证据链。
    link: /04-governance/12-可审计性-哈希链来源追溯与证据链
    linkText: 阅读治理篇
  - title: 调优篇 · 第 16–19 章
    details: 可复现基准的方法学、五个评测陷阱、六维质量度量、受控自进化与经验前置条件。
    link: /05-optimization/16-基准-可复现的方法学
    linkText: 阅读调优篇
  - title: 实践篇 · 第 20–22 章
    details: 第一梯队系统深度对照、选型决策树与三条迁移路径、五类场景的失效点与验收指标。
    link: /06-case-study/20-第一梯队系统深度对照
    linkText: 阅读实践篇
---

## 关于本书

本书围绕 AI 记忆系统的架构、构建、运行、治理和调优的整个生命周期，总结了 Mnemosyne OS、企业客户与开源社区开发者在企业级 AI 记忆落地过程中的实践经验、教训与取舍。

它不试图给出一套放之四海皆准的方案，而是围绕一个具体问题组织：

> **在 2026 年的技术条件下，一个企业或一个开发者，应该如何在记忆的写入、检索、遗忘、审计与演化之间做出可辩护的取舍？**

「可辩护」是关键词。它意味着每一个技术选择都要能回答：为什么不是另一个、代价是什么、在什么条件下会失效。一个无法被追问的选择，不构成工程决策。

## 本书的数据与事实口径

本书对事实的处理遵循三条规则，请读者据此判断可信度。

**第一，所有数字都标注口径与时间。** 基准分数标注数据集版本、judge 类型与是否完整运行；价格标注币种与生效时间；论文标注 arXiv 编号。没有口径的数字不出现。

**第二，无法核验的论断一律删除，而不是弱化表述。** 本书不写「据传」「业内普遍认为」这类无法追溯来源的判断。少数必须提及但证据不足的内容，会明确写出「截至 2026 年 10 月的公开文档中未见说明」。

**第三，对自家实现与对竞品采用同一套审慎标准。** 书中对 Mnemosyne OS 的描述同样标注边界与代价，包括其基准分数尚未由仓库内一次完整运行独立复算这一事实（见[第 16 章](/05-optimization/16-基准-可复现的方法学)）。

## 推荐阅读路径

- **第一次系统了解 AI 记忆**：[技术观察](/00-preface/2026记忆系统技术观察) → [第 1–2 章](/01-architecture/01-记忆为什么成为一等原语) → [第 4–6 章](/02-build/04-写入-抽取分型与冲突消解) → [第 20 章](/06-case-study/20-第一梯队系统深度对照)
- **正在把记忆接入生产**：[第 8–11 章](/03-run/08-部署形态-本地优先的真实边界) → [第 12–14 章](/04-governance/12-可审计性-哈希链来源追溯与证据链) → [第 16–18 章](/05-optimization/16-基准-可复现的方法学)
- **负责选型或项目立项**：[技术观察](/00-preface/2026记忆系统技术观察) → [第 1 章](/01-architecture/01-记忆为什么成为一等原语) → [第 3 章](/01-architecture/03-形态与成熟度-L1-L4分级) → [第 20–21 章](/06-case-study/20-第一梯队系统深度对照) → [第 23 章](/07-conclusion/23-未解问题与2027路线图)

## 关于 Mnemosyne OS

本书的技术细节大量引用 [Mnemosyne OS](https://ai-memory.net)，原因不是它更优，而是它同时满足两个条件：设计文档与实现源码一致，且关键能力可被本地验证。读者可以 `pip install mnemosyne-os` 后直接复现书中的行为，而不必相信文字描述。

- 官网：[ai-memory.net](https://ai-memory.net)
- 源码：[github.com/MnemosyneOS/mnemosyne](https://github.com/MnemosyneOS/mnemosyne)
- 可复现基准：[github.com/MnemosyneOS/mnemosyne-bench](https://github.com/MnemosyneOS/mnemosyne-bench)
- 文档站：[docs.mnemosyne-os.io](https://docs.mnemosyne-os.io)

## 共建与授权

欢迎国内外高校等教育机构一起共建企业级 AI Memory 课程，请添加微信 **Mnemosyne-OS** 沟通，备注「共建」。

本书由**胡景堃**发起并主导撰写。感谢参与共创的国内外高校专家、学者、AI Memory 领域的开发者、社区志愿者等。

Copyright © 2026 胡景堃（Hu Jingkun）. 采用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) 许可。**未经授权禁止传播、复制、转载、改编或用于商业化。**
