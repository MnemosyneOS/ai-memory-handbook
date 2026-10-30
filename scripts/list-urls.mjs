#!/usr/bin/env node
/**
 * 把 VitePress 构建产物中的章节页 URL 打印出来，便于核对 sitemap 是否完整。
 * 用法：node scripts/list-urls.mjs
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = '.vitepress/dist'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.html')) out.push(p)
  }
  return out
}

try {
  const files = walk(DIST)
  const urls = files
    .map((f) => '/' + relative(DIST, f).replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, ''))
    .sort()
  console.log(`total pages: ${urls.length}`)
  for (const u of urls) console.log(`https://ai-memory.net/ai-memory-handbook${u}`)
} catch (e) {
  console.error('build first: npm run build')
  process.exit(1)
}