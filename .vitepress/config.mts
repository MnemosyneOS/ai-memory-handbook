import { defineConfig } from 'vitepress'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

const PART_TITLES = {
  '00-preface': '卷首',
  '01-architecture': '架构篇',
  '02-build': '构建篇',
  '03-run': '运行篇',
  '04-governance': '治理篇',
  '05-optimization': '调优篇',
  '06-case-study': '实践篇',
  '07-conclusion': '总结与展望篇'
}

const PART_ORDER = Object.keys(PART_TITLES)

function chapterTitle(file) {
  const raw = readFileSync(file, 'utf8')
  const line = raw.split('\n').find((l) => l.startsWith('# '))
  return line ? line.replace(/^#\s+/, '').trim() : file
}

function chapterOrder(name) {
  const m = name.match(/^(\d{2})-/)
  if (m) return Number(m[1])
  if (name.startsWith('00-preface')) return 0
  if (name.startsWith('阅读导引')) return 1
  if (name.startsWith('2026')) return 2
  if (name.startsWith('附录A')) return 90
  if (name.startsWith('附录B')) return 91
  return 50
}

function buildSidebar() {
  const sidebar = []
  for (const part of PART_ORDER) {
    const dir = join(ROOT, part)
    let files = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')
    } catch {
      files = []
    }
    if (files.length === 0) continue
    files.sort((a, b) => chapterOrder(a) - chapterOrder(b) || a.localeCompare(b))
    sidebar.push({
      text: PART_TITLES[part],
      collapsed: false,
      items: files.map((f) => ({
        text: chapterTitle(join(dir, f)),
        link: `/${part}/${f.replace(/\.md$/, '')}`
      }))
    })
  }
  return sidebar
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'AI Memory Handbook',
  description:
    '企业级 AI 记忆系统的全生命周期实践：从上下文记忆到认知基础设施。Mnemosyne OS 出品。',
  srcExclude: ['README.md', 'README_EN.md', 'WEBSITE.md', 'node_modules/**'],
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['link', { rel: 'canonical', href: 'https://ai-memory.net/ai-memory-handbook/' }],
    ['meta', { name: 'author', content: 'Hu Jingkun (胡景堃)' }],
    ['meta', { name: 'copyright', content: 'Copyright © 2026 Hu Jingkun. CC BY-NC-ND 4.0.' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'AI memory, agent memory, AI 记忆, 记忆系统, Mnemosyne OS, MCP, long-term memory, RAG, 上下文工程'
      }
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'AI Memory Handbook' }],
    ['meta', { property: 'og:title', content: 'AI Memory Handbook — 企业级 AI 记忆系统的全生命周期实践' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          '覆盖写入、存储、检索、治理、调优全链路的 AI 记忆系统白皮书。由胡景堃发起并主导撰写，Mnemosyne OS 出品。'
      }
    ],
    ['meta', { property: 'og:url', content: 'https://ai-memory.net/ai-memory-handbook/' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'robots', content: 'index, follow, max-image-preview:large' }],
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: 'AI Memory Handbook',
        alternateName: '企业级 AI 记忆系统的全生命周期实践',
        inLanguage: ['zh-CN', 'en'],
        author: { '@type': 'Person', name: 'Hu Jingkun', alternateName: '胡景堃' },
        publisher: { '@type': 'Organization', name: 'Mnemosyne OS', url: 'https://ai-memory.net' },
        license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
        url: 'https://ai-memory.net/ai-memory-handbook/',
        description:
          'A practical guide to building enterprise AI memory systems across their full lifecycle: write, store, retrieve, govern, and optimize.',
        about: [
          { '@type': 'Thing', name: 'AI agent memory' },
          { '@type': 'Thing', name: 'long-term memory for LLM agents' },
          { '@type': 'Thing', name: 'memory governance and audit' }
        ]
      })
    ]
  ],

  sitemap: {
    hostname: 'https://ai-memory.net/ai-memory-handbook/'
  },

  themeConfig: {
    logo: '/logo.svg',
    outline: { level: [2, 3], label: '本页目录' },
    nav: [
      { text: '首页', link: '/' },
      { text: '全书目录', link: '/contents' },
      { text: '阅读指南', link: '/reading-guide' },
      { text: 'English', link: '/en/' },
      { text: '官网', link: 'https://ai-memory.net' }
    ],
    sidebar: buildSidebar(),
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无匹配结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新于' },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    footer: {
      message:
        'Copyright © 2026 胡景堃（Hu Jingkun）. 采用 CC BY-NC-ND 4.0 许可。未经授权禁止传播、复制或用于商业化。',
      copyright: 'Mnemosyne OS · ai-memory.net'
    }
  }
})