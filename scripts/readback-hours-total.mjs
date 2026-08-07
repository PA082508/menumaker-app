// readback-hours-total.mjs — ЧИТКА, НЕ ПРОБА. Открывает живую карточку сотрудника
// на проде, вкладку Schedule, и читает глазами то же, что читает человек:
// столбец Hours по строкам и Total weekly hours внизу.
//
// Ничего не пишет: ни клика по Save, ни ввода. Read-back по правилу «читка
// никогда не пишет» — единственные действия это переход по адресу и открытие
// вкладки.
//
// Карточка: Carolyn Hercik (Ridge) — пять одинаковых дней 06:30–15:30 с обедом
// 12:00–13:00. Строка обязана показать 8.0, итог — 40.0 (пять раз по 8.0).
// До правки итог считал по legacy break_minutes = 30 и показал бы 42.5.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const STAFF = process.env.STAFF_ID || '84401340-0e5f-4bc8-bc90-fbfbfddac6c7'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './readback-out')

fs.mkdirSync(SHOTS, { recursive: true })

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 1200 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
const signedIn = await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sb-')))
if (!signedIn) { console.error('НЕТ сессии в .demo-profile — читка невозможна'); await ctx.close(); process.exit(2) }

await page.goto(`${PROD}/staff/${STAFF}/settings`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Вкладка расписания. Ищем по видимому слову, а не по классу; расписание живёт
// ВНУТРИ вкладки Work, поэтому сперва открываем её, потом ищем таблицу.
const hasTable = async () => await page.evaluate(() =>
  [...document.querySelectorAll('table')].some(t => /Total weekly hours/i.test(t.textContent || '')))

for (const name of ['Work', 'Schedule', 'Work Schedule', 'Расписание']) {
  if (await hasTable()) break
  const tab = page.getByText(name, { exact: false }).first()
  if (await tab.count() && await tab.isVisible().catch(() => false)) {
    await tab.click().catch(() => {})
    await page.waitForTimeout(2500)
  }
}
await page.waitForTimeout(1500)

const read = await page.evaluate(() => {
  const table = [...document.querySelectorAll('table')]
    .find(t => /Total weekly hours/i.test(t.textContent || ''))
  if (!table) return null
  const rows = [...table.querySelectorAll('tbody tr')].map(tr => {
    const c = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim())
    return { day: c[0], hours: c[c.length - 1] }
  })
  const foot = table.querySelector('tfoot tr')
  const total = foot ? [...foot.querySelectorAll('td')].pop().innerText.trim() : null
  const who = (document.querySelector('h1,h2')?.innerText || '').trim()
  return { who, rows, total }
})

if (!read) { console.error('таблица расписания не найдена — карточка не открылась'); await page.screenshot({ path: path.join(SHOTS, 'readback-FAIL.png'), fullPage: true }); await ctx.close(); process.exit(3) }

console.log('карточка:', read.who)
for (const r of read.rows) console.log(`  ${r.day.padEnd(10)} Hours = ${r.hours}`)
console.log('  TOTAL WEEKLY =', read.total)

const shown = read.rows.map(r => parseFloat(r.hours)).filter(n => !Number.isNaN(n))
const sum = shown.reduce((a, b) => a + b, 0)
const total = parseFloat(read.total)
console.log(`\nсумма видимых Hours = ${sum.toFixed(1)} · итог на экране = ${total.toFixed(1)}`)
console.log(Math.abs(sum - total) < 0.05 ? '✓ ИТОГ РАВЕН СУММЕ ВИДИМЫХ' : '✗ ИТОГ РАСХОДИТСЯ СО СТРОКАМИ')

await page.screenshot({ path: path.join(SHOTS, 'readback-schedule.png'), fullPage: true })
console.log('снимок:', path.join(SHOTS, 'readback-schedule.png'))
await ctx.close()
