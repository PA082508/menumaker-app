// snapshot-backfill.mjs — добор «замороженных снимков» одобренным заявкам CACFP.
//
// ЗАЧЕМ. Замер 08.08: снимок есть у 10 из 42 одобренных заявок, и все десять —
// `dcy_01234`. У 23 одобренных `cacfp_enrollment` снимка НЕТ (реплика для них
// появилась 05.08, позже тех одобрений), и карточка ребёнка честно пишет «Live
// render — no snapshot yet».
//
// ПОЧЕМУ ЧЕРЕЗ БРАУЗЕР, А НЕ SQL. Снимок делает КЛИЕНТ: реплика бланка рисуется
// офскрин, html2canvas снимает страницы, и единственный писатель — edge-функция
// `enrollment-snapshot`. Никакой SQL этого не заменит, а второй писатель означал
// бы второй способ получить «официальную копию» — то есть две разные правды.
// Поэтому скрипт нажимает ту же кнопку «Create snapshot», что и человек.
//
// ПОРЯДОК — СЛОВО ВЛАДЕЛЬЦА: сперва ОДИН образец на сверку, и только потом
// массовый прогон. `--child "Isaac Rife"` делает один; `--all` — остальные.
//
// Сессия берётся из ./.demo-profile и переносится на локальный preview.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out/snapshot-backfill')
const args = process.argv.slice(2)
const childArg = args.includes('--child') ? args[args.indexOf('--child') + 1] : null
const CENTER = process.env.CENTER || 'Wickliffe'

fs.mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(...a)

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, viewport: { width: 1500, height: 1000 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') log('   console:', m.text().slice(0, 140)) })

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
if (!Object.keys(store).some(k => k.startsWith('sb-'))) {
  console.error('НЕТ сессии в .demo-profile — войти руками и повторить'); process.exit(2)
}
await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  try {
    const rs = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(rs.map(r => r.unregister()))
    const keys = await caches?.keys?.() ?? []
    await Promise.all(keys.map(k => caches.delete(k)))
  } catch { /* нет SW — тем лучше */ }
})
await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) }, store)

// центр
await page.goto(APP + '/children', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await page.getByText('Organization', { exact: true }).first().click().catch(() => {})
await page.waitForTimeout(700)
await page.getByText(new RegExp(CENTER), { exact: false }).first().click().catch(() => {})
await page.waitForTimeout(3000)
await page.keyboard.press('Escape').catch(() => {})

const name = childArg ?? 'Isaac Rife'
log(`\nОБРАЗЕЦ: ${name} (${CENTER})`)

// поиск ребёнка по имени
const search = page.getByPlaceholder(/Search active/i).first()
await search.waitFor({ timeout: 30000 })
await search.fill(name.split(' ')[1] ?? name)
await page.waitForTimeout(2500)
await page.screenshot({ path: `${SHOTS}/1-search.png` })

// Открыть карточку. Кликать по ИМЕНИ ненадёжно — оно живёт внутри плитки и не
// является кнопкой; у каждой плитки есть своя «⚙ Settings», она и открывает
// карточку. Ищем плитку, содержащую имя, и жмём её собственную кнопку.
const tile = page.locator('div').filter({ hasText: new RegExp(name.split(' ').reverse().join('\\s+'), 'i') })
  .filter({ has: page.getByRole('button', { name: /Settings/i }) }).last()
await tile.getByRole('button', { name: /Settings/i }).first()
  .click({ timeout: 20000 }).catch(() => log('   карточку открыть не удалось'))
await page.waitForTimeout(5000)
await page.screenshot({ path: `${SHOTS}/2-card.png` })

// вкладка документов
await page.getByRole('button', { name: /Documents/i }).first().click().catch(() => {})
await page.waitForTimeout(3500)
await page.screenshot({ path: `${SHOTS}/3-documents.png` })

const before = await page.getByText(/Live render — no snapshot yet/i).count()
log(`   строк «Live render — no snapshot yet» до: ${before}`)

const btn = page.getByRole('button', { name: /Create snapshot/i }).first()
if (await btn.count() === 0) {
  log('   кнопки «Create snapshot» нет — снимок уже есть или вкладка не открылась')
} else {
  await btn.click()
  log('   нажата «Create snapshot», ждём захвата…')
  await page.waitForTimeout(20000)
  await page.screenshot({ path: `${SHOTS}/4-after-capture.png` })
  const after = await page.getByText(/Snapshot on file/i).count()
  log(`   строк «🔒 Snapshot on file» после: ${after}`)
}

log(`\nснимки: ${SHOTS}`)
await ctx.close()
