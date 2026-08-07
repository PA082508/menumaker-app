// shot-issue-header.mjs — снимок ШАПКИ страницы /safepass/issue ради одной двери:
// «← Back to app». Читает и печатает ЗАМЕРЕННЫЕ фон, цвет и высоту тапа — «заметна»
// это число, а не впечатление.
//
// Ничего не пишет: открывает страницу и снимает.
//   ORIGIN=https://menumaker-app.vercel.app LABEL=before node scripts/shot-issue-header.mjs
//   ORIGIN=http://localhost:4173          LABEL=after  node scripts/shot-issue-header.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const ORIGIN = process.env.ORIGIN || 'https://menumaker-app.vercel.app'
const PROD = 'https://menumaker-app.vercel.app'
const LABEL = process.env.LABEL || 'after'
const SHOTS = path.resolve(process.env.SHOTS || './issue-out')
fs.mkdirSync(SHOTS, { recursive: true })

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, serviceWorkers: 'block', viewport: { width: 900, height: 700 }, deviceScaleFactor: 2,
})
const page = ctx.pages()[0] ?? await ctx.newPage()

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
const sess = await page.evaluate(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('sb-'))
  return k ? { k, v: localStorage.getItem(k) } : null
})
if (!sess) { console.error('НЕТ сессии в .demo-profile'); await ctx.close(); process.exit(2) }
if (ORIGIN !== PROD) {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), sess)
}

await page.goto(`${ORIGIN}/safepass/issue`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)

const back = page.getByText('Back to app').first()
if (!await back.count()) { console.error('двери «Back to app» на странице нет'); await ctx.close(); process.exit(3) }
const m = await back.evaluate(el => {
  const s = getComputedStyle(el), r = el.getBoundingClientRect()
  return { bg: s.backgroundColor, color: s.color, fontSize: s.fontSize, height: Math.round(r.height), width: Math.round(r.width) }
})
console.log(`[${LABEL}] «← Back to app»`)
console.log(`  фон:      ${m.bg}`)
console.log(`  текст:    ${m.color} · ${m.fontSize}`)
console.log(`  тап:      ${m.width}×${m.height}px  ${m.height >= 44 ? '✓ ≥44' : '✗ меньше 44'}`)

const out = path.join(SHOTS, `issue-header-${LABEL}.png`)
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 900, height: 260 } })
console.log('  снимок:', out)
await ctx.close()
