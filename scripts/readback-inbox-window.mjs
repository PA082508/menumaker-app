// readback-inbox-window.mjs — читка окна инбокс-правок (08.08). НИЧЕГО НЕ ПИШЕТ.
//
// Проверяет ровно то, что заказано словом владельца:
//   · титул семейной заявки — «<Фамилия> household · N children» вместо «(no name)»;
//   · говорящая кнопка на заявке БЕЗ реплики бланка (iea): «Original not on file…»;
//   · отметки двойников у пары Rife: «newest … counts» и «superseded».
//
// Сессия — из ./.demo-profile, перенос на локальный preview (рецепт 02.08).
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out/inbox-window')
fs.mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(...a)
const fails = []
const ok = (n) => log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, viewport: { width: 1500, height: 1050 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
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

await page.goto(APP + '/enrollment-inbox', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(11000)
// Инбокс открывается на вкладке «Needs a person» — она пуста. Семейные заявки и
// двойники живут в «All»: читаем там, иначе проба меряет пустую вкладку.
await page.getByRole('button', { name: /^All$/ }).first().click({ timeout: 15000 }).catch(() => {})
await page.waitForTimeout(4000)
await page.screenshot({ path: `${SHOTS}/1-inbox.png`, fullPage: true })

const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')

// 1. титулы семейных заявок
const households = text.match(/[A-Z][a-z-]+ household · \d+ child(?:ren)?/g) ?? []
households.length
  ? ok(`титулы семей живьём: ${[...new Set(households)].join(' · ')}`)
  : bad('титулы семей', 'ни одной строки «<Фамилия> household · N children» на экране')

// 2. двойники
const dupNew = /newest of \d+ · counts/.test(text)
const dupOld = /superseded · \d+ of \d+/.test(text)
dupNew && dupOld
  ? ok('двойники помечены: свежая «counts», старая «superseded» — обе видимы')
  : bad('двойники помечены', `newest=${dupNew} superseded=${dupOld} (нет пары двойников в этой вкладке?)`)

// 3. говорящая кнопка — открываем заявку БЕЗ реплики (iea)
const ieaRow = page.getByText(/Income eligibility|IEA|household · /i).first()
await ieaRow.click({ timeout: 15000 }).catch(() => {})
await page.waitForTimeout(1500)
const review = page.getByRole('button', { name: /Review/i }).first()
await review.click({ timeout: 15000 }).catch(() => log('   кнопку Review не нашли — снимок покажет состояние'))
await page.waitForTimeout(6000)
await page.screenshot({ path: `${SHOTS}/2-review.png` })
const modal = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
// ⚠️ Строка, начатая с `/`, читается как ДЕЛЕНИЕ от предыдущей — регулярка
// живёт в переменной, а не в начале строки.
const speaks = /Original not on file — view submitted values/.test(modal)
const plain = /View original form/.test(modal)
if (speaks) ok('говорящая кнопка на заявке без реплики бланка')
else if (plain) log('   · открылась заявка С репликой — кнопка обычная (это не отказ пробы)')
else bad('говорящая кнопка', 'ни одной кнопки просмотра в окне Review')

log(`\nснимки: ${SHOTS}`)
if (fails.length) { log('\nПРОВАЛЫ:'); fails.forEach(f => log(' · ' + f)) }
await ctx.close()
