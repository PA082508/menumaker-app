// shot-cancel-sheet.mjs — снимок листа «Register {имя}» ради ОДНОЙ кнопки: Cancel.
//
// Ничего не пишет: открывает лист (кнопка Register только показывает лист —
// `setSheetFor`, без записи), снимает, и уходит тем же Cancel, который сам ничего
// не пишет. Ни «Take photo & register», ни «Register without a photo» не жмутся.
//
// ORIGIN задаётся снаружи: прод — «после», локальный preview старой сборки — «до».
// Кроме картинки печатает ЗАМЕРЕННЫЙ фон и цвет текста кнопки: «белая» — это
// проверяемое число, а не впечатление.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const ORIGIN = process.env.ORIGIN || 'https://menumaker-app.vercel.app'
const PROD = 'https://menumaker-app.vercel.app'
const LABEL = process.env.LABEL || 'after'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './cancel-out')

fs.mkdirSync(SHOTS, { recursive: true })

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true, serviceWorkers: 'block', viewport: { width: 430, height: 900 }, deviceScaleFactor: 2,
})
const page = ctx.pages()[0] ?? await ctx.newPage()

// Сессию берём с прода и, если снимаем локальную сборку, переносим её ПОСЛЕ
// загрузки прода — иначе localStorage чужого origin пуст и дверь закрыта.
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
await page.waitForTimeout(8000)

const reg = page.getByRole('button', { name: /^Register$/ }).first()
if (!await reg.count()) {
  console.error('кнопки Register нет — список кандидатов пуст или страница не открылась')
  await page.screenshot({ path: path.join(SHOTS, `cancel-${LABEL}-FAIL.png`), fullPage: true })
  await ctx.close(); process.exit(3)
}
await reg.click()
await page.waitForTimeout(2000)

const cancel = page.getByRole('button', { name: /Cancel/ }).first()
const style = await cancel.evaluate(el => {
  const s = getComputedStyle(el)
  return { text: el.textContent.trim(), background: s.backgroundColor, color: s.color, border: s.border }
})
console.log(`[${LABEL}] «${style.text}»`)
console.log(`  фон:    ${style.background}`)
console.log(`  текст:  ${style.color}`)
console.log(`  рамка:  ${style.border}`)

const out = path.join(SHOTS, `cancel-${LABEL}.png`)
await page.screenshot({ path: out })
console.log('  снимок:', out)

// Уходим листом, как ушёл бы человек: Cancel ничего не пишет.
await cancel.click().catch(() => {})
await ctx.close()
