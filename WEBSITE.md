# 站点维护说明

本书的在线阅读站托管在 **https://ai-memory.net/ai-memory-handbook/**，基于 VitePress 构建。

## 技术栈

| 项 | 值 |
| --- | --- |
| 静态站点生成器 | VitePress 1.6.x |
| Node.js | 22.x（见 `.nvmrc`） |
| 输出目录 | `.vitepress/dist` |
| 站点根路径 | `/ai-memory-handbook/` |
| 部署目标 | GitHub Pages（`MnemosyneOS/Mnemosyne-Cloud` 仓库的 `ai-memory-handbook/` 目录） |

## 本地预览

```bash
npm ci
npm run dev          # http://localhost:5173
```

## 构建

```bash
npm run build        # 产物在 .vitepress/dist
npm run preview      # 本地预览构建产物
```

## 目录与内容约定

- 每篇一个目录：`01-architecture/` … `07-conclusion/`
- 章节文件名格式：`NN-短标题.md`（**不含空格与全角标点**，避免 URL 转义与跨平台路径问题）
- 每篇的 `README.md` 是该篇导读，不进入站点正文，仅作为 GitHub 目录页
- 侧边栏由 `.vitepress/config.mts` 从目录自动生成，新增章节无需改配置，按文件名前缀 `NN` 排序
- 附录放在 `00-preface/`，命名 `附录A-…md`、`附录B-…md`

## 发布流程

1. `npm run build`
2. 将 `.vitepress/dist` 内容同步到 `Mnemosyne-Cloud` 仓库的 `ai-memory-handbook/` 目录
3. 提交并推送；GitHub Pages 会自动发布
4. 验收：
   - `https://ai-memory.net/ai-memory-handbook/` 返回 200
   - `https://ai-memory.net/ai-memory-handbook/sitemap.xml` 返回 200 且含全部章节 URL
   - 抽查 3 个章节页可正常打开、侧边栏高亮正确

## SEO 与可抓取性

- 站点为**纯静态 HTML**，不依赖 JS 渲染正文，搜索引擎与 AI 爬虫可直接抓取
- 每个页面由 VitePress 自动生成 `<title>`、`meta description`、canonical
- 首页 `index.md` 注入 `Book` 类型 JSON-LD 结构化数据（作者、许可、主题）
- `public/robots.txt` 声明 sitemap 地址
- `public/llms.txt` 提供面向 AI 助手的机器可读摘要
- 构建时由 `vitepress` 插件生成 `sitemap.xml`

## 注意事项

- **不要把带空格的文件名提交进仓库**。GitHub 的 Markdown 链接需要 `%20` 转义，且 VitePress 的 cleanUrls 与部分客户端的处理不一致，会导致 404。
- 章节内引用其他章节时用**站内绝对路径**（以 `/` 开头），VitePress 会正确解析；引用 GitHub 上的文件时用完整 URL。
- `srcExclude` 已排除 `README.md`、`README_EN.md`、`WEBSITE.md`，这些文件只服务于 GitHub 页面，不进入站点。