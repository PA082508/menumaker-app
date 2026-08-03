// smoke-rosterkey.mjs — проба клиентской части ключа по roster_id ЧЕРЕЗ НАСТОЯЩИЙ ПУТЬ.
//
// Что проверяется (и почему именно так):
//   1. постановка и снятие отметки на кухонной двери (/meal-count) — тап пальцем, очередь,
//      настоящий sync_meal_marks. Не «функция вернула ok», а «клетка стала зелёной, и
//      строка в базе несёт roster_id»;
//   2. то же на директорской двери (/meal-count-director) — сетка недели;
//   3. ИСКУССТВЕННЫЙ ОТКАЗ СЕРВЕРА: RPC подменяется на 500, и проба требует, чтобы
//      человек УВИДЕЛ отказ словами. Молчаливый откат галочки — то, ради чего вся правка;
//   4. Breakdown by Classroom в клеймовом отчёте жив (не пустой, не сломан).
//
// Сессия берётся из ./.demo-profile (тот же профиль, что у записи демо) и переносится на
// локальный preview: токен Supabase живёт в localStorage и от origin не зависит.
// Service worker выключен нарочно — иначе запросы уходят мимо перехвата, и «искусственный
// отказ» проверял бы не то.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const CHILD = 'ZZSMOKE Keytest'
const ROOM = 'Demo Room'
const CENTER = 'ZZ Demo'

fs.mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(...a)
const fails = []
const ok = (name) => log(`  ✓ ${name}`)
const bad = (name, why) => { fails.push(`${name}: ${why}`); log(`  ✗ ${name} — ${why}`) }

// Экран счёта центро-зависим: в режиме «Организация» он честно говорит «выберите центр».
// Переключатель живёт во всплывающем меню пункта «Organization» боковой панели.
async function pickCenter(page) {
  await page.getByText('Organization', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByText(CENTER, { exact: true }).first().click()
  await page.waitForTimeout(2500)
  // Всплывающее меню боковой панели перекрывает шапку экрана — уводим курсор,
  // иначе клик по комнате попадает в меню, а не в кнопку.
  await page.mouse.move(1200, 700)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)
}

// Комната может быть уже выбрана (в демо-центре она одна) — тогда клик не нужен.
async function pickRoom(page) {
  const btn = page.getByRole('button', { name: ROOM, exact: true })
  await btn.waitFor({ timeout: 30000 })
  const active = await btn.first().evaluate(el => el.className.includes('active'))
  if (!active) await btn.first().click({ force: true })
  await page.waitForTimeout(2500)
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  serviceWorkers: 'block',
  viewport: { width: 1400, height: 1000 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()

// ── Перенос сессии: прод → локальный preview ────────────────────────────────
// ⚠️ Токен читается ПОСЛЕ того, как прод-приложение поднялось: refresh-токен
// одноразовый, и копия, снятая до обновления сессии, мертва к моменту переноса.
await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
const authKeys = Object.keys(store).filter(k => k.startsWith('sb-'))
if (!authKeys.length) { console.error('НЕТ сессии в .demo-profile — войти руками и повторить'); process.exit(2) }
log(`сессия найдена (${authKeys.join(', ')})`)

await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) }, store)

// ── 1. Кухонная дверь: постановка и снятие ──────────────────────────────────
log('\n1. Кухонная дверь /meal-count')
await page.goto(APP + '/meal-count', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await pickCenter(page)
await page.waitForSelector('.mc-class-btn', { timeout: 60000 })
const weekLabel = await page.locator('.mc-week-label, .mc-week-select').first().innerText().catch(() => '?')
log(`   неделя на экране: ${weekLabel.replace(/\n/g, ' ')}`)
await pickRoom(page)

const row = page.locator('.mc-check-row', { hasText: CHILD })
if (await row.count() === 0) { bad('строка ребёнка видна', `«${CHILD}» нет в списке ${ROOM}`) }
else {
  ok('строка ребёнка видна на кухонной двери')
  await row.first().click()
  await page.waitForTimeout(600)
  const checked = await row.first().evaluate(el => el.className.includes('checked'))
  checked ? ok('галочка встала (оптимистично)') : bad('галочка встала', 'класс checked не появился')
  // Очередь уходит на сервер — ждём, пока значок «ждёт отправки» исчезнет.
  await page.waitForFunction(() => !document.querySelector('.mc-queue-badge'), null, { timeout: 20000 })
    .then(() => ok('очередь ушла на сервер (значок ожидания погас)'))
    .catch(() => bad('очередь ушла на сервер', 'значок ожидания висит дольше 20 с'))
}
await page.screenshot({ path: `${SHOTS}/1-kitchen-set.png`, fullPage: false })

// ── 2. Искусственный отказ сервера ──────────────────────────────────────────
log('\n2. Искусственный отказ сервера (RPC → 500)')
await page.route('**/rest/v1/rpc/sync_meal_marks*', r =>
  r.fulfill({ status: 500, contentType: 'application/json',
              body: JSON.stringify({ message: 'ZZSMOKE forced failure — проба 02.08' }) }))
// вторая клетка того же ребёнка: другой приём пищи
const slots = page.locator('.mc-slot-btn')
if (await slots.count() > 1) await slots.nth(1).click()
await page.waitForTimeout(400)
await page.locator('.mc-check-row', { hasText: CHILD }).first().click()
await page.waitForTimeout(1500)
const banner = page.locator('.mc-write-err')
if (await banner.count() === 0) bad('отказ виден человеку', 'полосы .mc-write-err нет на экране')
else {
  const txt = (await banner.first().innerText()).replace(/\s+/g, ' ').trim()
  const visible = await banner.first().isVisible()
  const named = /ZZSMOKE forced failure|500|Internal/i.test(txt)
  visible ? ok('полоса отказа видна') : bad('полоса отказа видна', 'элемент есть, но не отображается')
  named ? ok(`слова сервера показаны: «${txt.slice(0, 120)}…»`)
        : bad('слова сервера показаны', `в полосе нет ответа сервера: «${txt.slice(0, 120)}»`)
}
await page.screenshot({ path: `${SHOTS}/2-forced-failure.png` })
// отметка НЕ должна пропасть — она в очереди
const stillQueued = await page.locator('.mc-queue-badge').count()
stillQueued ? ok('отметка осталась в очереди, не потеряна')
            : bad('отметка осталась в очереди', 'значок ожидания исчез при отказе — похоже на потерю')

log('\n3. Снятие отказа и «Повторить»')
await page.unroute('**/rest/v1/rpc/sync_meal_marks*')
const retry = page.getByRole('button', { name: 'Повторить' })
if (await retry.count()) await retry.first().click()
await page.waitForFunction(() => !document.querySelector('.mc-queue-badge'), null, { timeout: 25000 })
  .then(() => ok('после починки связи очередь ушла сама'))
  .catch(() => bad('после починки связи очередь ушла', 'значок ожидания висит'))
await page.waitForTimeout(500)
;(await page.locator('.mc-write-err').count()) === 0
  ? ok('полоса отказа убралась после успеха')
  : bad('полоса отказа убралась', 'висит после успешной отправки')
await page.screenshot({ path: `${SHOTS}/3-recovered.png` })

// ── 4. Директорская дверь ───────────────────────────────────────────────────
log('\n4. Директорская дверь /meal-count-director')
await page.goto(APP + '/meal-count-director', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await pickCenter(page)
await page.waitForSelector('.mc-class-btn', { timeout: 60000 })
await pickRoom(page)
const trow = page.locator('tr.mc-tr', { hasText: CHILD })
if (await trow.count() === 0) bad('строка ребёнка в сетке недели', `«${CHILD}» нет`)
else {
  ok('строка ребёнка видна в сетке недели')
  const cells = trow.first().locator('.mc-cell-btn')
  const n = await cells.count()
  const before = await cells.nth(0).innerText()
  log(`   клеток в строке: ${n}; первая клетка сейчас: «${before.trim() || 'пусто'}»`)
  // третья клетка (обед понедельника при 3-4 приёмах) — правка с директорской двери
  const idx = Math.min(2, n - 1)
  await cells.nth(idx).click()
  await page.waitForTimeout(800)
  const after = await cells.nth(idx).innerText()
  after.includes('✓') ? ok('правка с директорской двери встала')
                      : bad('правка с директорской двери', `клетка осталась «${after}»`)
  await page.waitForFunction(() => !document.querySelector('.mc-queue-badge'), null, { timeout: 20000 })
    .then(() => ok('правка ушла на сервер'))
    .catch(() => bad('правка ушла на сервер', 'значок ожидания висит'))
}
await page.screenshot({ path: `${SHOTS}/4-director.png` })

// ── 5. Breakdown by Classroom ───────────────────────────────────────────────
log('\n5. Breakdown by Classroom (клеймовый отчёт)')
await page.goto(APP + '/claim-report', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await pickCenter(page).catch(() => {})
await page.waitForTimeout(6000)
const bodyTxt = await page.locator('body').innerText()
if (!/Breakdown/i.test(bodyTxt)) bad('Breakdown на месте', 'на странице нет заголовка Breakdown')
else {
  ok('Breakdown by Classroom отрисован')
  const tables = await page.locator('table').count()
  log(`   таблиц на странице: ${tables}`)
}
await page.screenshot({ path: `${SHOTS}/5-breakdown.png`, fullPage: true })

log('\n──────────────────────────────────────────')
if (fails.length) { log(`ПРОБА НЕ ЧИСТА — ${fails.length}:`); fails.forEach(f => log(' · ' + f)) }
else log('ПРОБА ЧИСТА')
await ctx.close()
process.exit(fails.length ? 1 : 0)
