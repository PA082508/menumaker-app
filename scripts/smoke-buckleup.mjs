// smoke-buckleup.mjs — проба ритуала «Пристегни ремни» через настоящий экран.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   1. наступление окна: 11:29 → плашки нет; часы доходят до 11:30 → экран САМ
//      переключился на обед, прозвучал голос старта, плашка тикает;
//   2. отметка гасит: тап по ребёнку → зелёное «Lunch отмечен HH:MM»;
//   3. напоминание: 12:19 → 12:20 (за 10 минут до конца) без отметок → голос
//      напоминания, плашка краснеет;
//   4. закрывшееся окно без отметок → красная строка в списке дня;
//   5. iOS: пока звук не разблокирован — плашка беззвучная и говорит об этом.
//
// ⚠️ В БАЗУ НЕ ПИШЕТ. Вызов sync_meal_marks перехвачен и отвечает 200: путь тапа
// настоящий (очередь, оптимистичная отметка, плашка), а прод остаётся нетронутым.
// Запись как таковую проверяет другая проба — scripts/smoke-rosterkey.mjs.
//
// Часы подменяются через ?mm_clock=HH:MM&mm_day=mon — подмена работает ТОЛЬКО на
// localhost (src/lib/ritualClock.ts), поэтому проба идёт по локальному preview
// прод-сборки, а не по боевому адресу.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const CENTER = process.env.SMOKE_CENTER || 'Ridge'
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
fs.mkdirSync(SHOTS, { recursive: true })

const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true,
  serviceWorkers: 'block',
  viewport: { width: 1400, height: 1000 },
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = ctx.pages()[0] ?? await ctx.newPage()

// Сессия: читаем ПОСЛЕ загрузки прода — refresh-токен одноразовый.
await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
if (!Object.keys(store).some((k) => k.startsWith('sb-'))) {
  console.error('НЕТ сессии в .demo-profile'); process.exit(2)
}
await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) }, store)
// Память о звонках живёт в localStorage — иначе второй прогон пробы молчал бы.
await page.evaluate(() => Object.keys(localStorage)
  .filter((k) => k.startsWith('mm_ritual_')).forEach((k) => localStorage.removeItem(k)))

// Ничего не писать в прод: единственный писатель отметок отвечает «принято».
await page.route('**/rest/v1/rpc/sync_meal_marks*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }))

// Прозвучавшие голоса собираются из события mm:chime.
await page.addInitScript(() => {
  window.__chimes = []
  window.addEventListener('mm:chime', (e) => window.__chimes.push(e.detail.voice))
})

async function openScreen(clock) {
  await page.goto(`${APP}/meal-count?mm_clock=${clock}&mm_day=mon`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await page.getByText('Organization', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByText(CENTER, { exact: true }).first().click()
  await page.waitForTimeout(3500)
  await page.mouse.move(1200, 700)
  await page.waitForSelector('.mc-class-btn', { timeout: 60000 })
  await page.waitForTimeout(2500)
}
const chimes = () => page.evaluate(() => window.__chimes ?? [])
const bannerText = async () => {
  const b = page.locator('.mc-buckle')
  return (await b.count()) ? (await b.first().innerText()).replace(/\s+/g, ' ').trim() : ''
}

// ─── 1. Окно ещё не открылось ───────────────────────────────────────────────
console.log('\n1. 11:29 — окно обеда ещё не открылось')
await openScreen('11:29')
;(await bannerText()) === '' ? ok('плашки нет — экран не зовёт раньше времени')
                             : bad('плашки нет', `висит: «${await bannerText()}»`)

// ─── 2. Наступление окна ────────────────────────────────────────────────────
console.log('\n2. часы доходят до 11:30 — табло само загорается')
await page.waitForFunction(() => document.querySelector('.mc-buckle') !== null, null, { timeout: 120000 })
  .then(() => ok('плашка появилась сама, без перезагрузки'))
  .catch(() => bad('плашка появилась сама', 'за две минуты не появилась'))
const t2 = await bannerText()
const openRe = /Lunch идёт — отметьте порции/
const tickRe = /\b(29|30)\b/
openRe.test(t2) ? ok(`плашка: «${t2}»`) : bad('текст плашки', `«${t2}»`)
tickRe.test(t2) ? ok('отсчёт 30 минут тикает') : bad('отсчёт 30 минут', `в плашке нет счётчика: «${t2}»`)
const activeSlot = await page.locator('.mc-slot-btn.active').first().innerText().catch(() => '?')
activeSlot.trim() === 'Lunch' ? ok('экран сам переключился на Lunch')
                              : bad('экран переключился на Lunch', `выбран «${activeSlot.trim()}»`)
;(await chimes()).includes('start') ? ok('прозвучал голос старта')
                                    : bad('голос старта', `сыграно: ${JSON.stringify(await chimes())}`)
await page.screenshot({ path: `${SHOTS}/buckle-1-open.png` })

// ─── 3. Отметка гасит отсчёт ────────────────────────────────────────────────
console.log('\n3. отметка гасит отсчёт')
const row = page.locator('.mc-check-row').first()
if (await row.count() === 0) bad('есть кого отметить', 'в комнате нет детей')
else {
  await row.click()
  await page.waitForTimeout(1500)
  const t3 = await bannerText()
  const greenRe = /отмечен \d\d:\d\d/
  greenRe.test(t3) ? ok(`плашка позеленела: «${t3}»`) : bad('зелёная плашка', `«${t3}»`)
  const green = await page.locator('.mc-buckle.done').count()
  green ? ok('плашка в зелёном виде') : bad('плашка в зелёном виде', 'класс done не выставлен')
}
await page.screenshot({ path: `${SHOTS}/buckle-2-marked.png` })

// ─── 4. Напоминание за 10 минут ─────────────────────────────────────────────
console.log('\n4. 12:19 → 12:20 без отметок — голос напоминания')
await openScreen('12:19')
await page.waitForFunction(() => (window.__chimes ?? []).includes('reminder'), null, { timeout: 120000 })
  .then(() => ok('прозвучал голос напоминания'))
  .catch(async () => bad('голос напоминания', `за две минуты не прозвучал: ${JSON.stringify(await chimes())}`))
const t4 = await bannerText()
;(await page.locator('.mc-buckle.urgent').count()) ? ok(`плашка тревожная: «${t4}»`)
                                                   : bad('плашка тревожная', `«${t4}»`)
await page.screenshot({ path: `${SHOTS}/buckle-3-reminder.png` })

// ─── 5. Закрывшееся окно без отметок ────────────────────────────────────────
console.log('\n5. 16:45 — день прошёл, окна закрылись без отметок')
await openScreen('16:45')
const list = page.locator('.mc-unbuckled')
if (await list.count() === 0) bad('красный список', 'списка нет')
else {
  const txt = (await list.first().innerText()).replace(/\s+/g, ' ').trim()
  const headRe = /Окна закрылись без отметок: [1-9]/
  headRe.test(txt) ? ok(`красный список: «${txt.slice(0, 140)}…»`) : bad('красный список', `«${txt}»`)
  txt.includes('Lunch') ? ok('пропущенный обед в списке') : bad('пропущенный обед в списке', 'Lunch не назван')
  ;(await bannerText()) === '' ? ok('плашки нет — окон уже нет') : bad('плашки нет', 'висит после конца дня')
  const blocked = await page.locator('.mc-check-row[disabled], .mc-cell-btn[disabled]').count()
  blocked === 0 ? ok('ничего не заблокировано — отметить можно и сейчас')
                : bad('ничего не заблокировано', `${blocked} клеток отключено`)
}
await page.screenshot({ path: `${SHOTS}/buckle-4-unbuckled.png`, fullPage: true })

// ─── 6. iOS: звук не разблокирован ──────────────────────────────────────────
console.log('\n6. iOS: до касания дня — беззвучная плашка')
const ios = await ctx.newPage()
// WebKit до жеста держит контекст спящим. Подменяем AudioContext на такой же
// спящий — это и есть проверяемое поведение, а не выдумка про него.
await ios.addInitScript(() => {
  class Suspended {
    state = 'suspended'; currentTime = 0
    async resume() { /* iOS вне жеста: остаётся suspended */ }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
    createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} } }
    destination = {}
  }
  window.AudioContext = Suspended
  window.webkitAudioContext = Suspended
})
await ios.goto(`${APP}/meal-count?mm_clock=11:40&mm_day=mon`, { waitUntil: 'domcontentloaded' })
await ios.waitForTimeout(9000)
await ios.getByText('Organization', { exact: true }).first().click(); await ios.waitForTimeout(800)
await ios.getByText(CENTER, { exact: true }).first().click(); await ios.waitForTimeout(4000)
await ios.mouse.move(1200, 700); await ios.waitForTimeout(2500)
const silent = await ios.locator('.mc-buckle-unlock').count()
silent ? ok('плашка беззвучная и предлагает включить звук касанием')
       : bad('беззвучная плашка', 'кнопки разблокировки нет — экран молчит, не объяснив почему')
await ios.screenshot({ path: `${SHOTS}/buckle-5-silent.png` })

console.log('\n──────────────────────────────────────────')
if (fails.length) { console.log(`ПРОБА НЕ ЧИСТА — ${fails.length}:`); fails.forEach((f) => console.log(' · ' + f)) }
else console.log('ПРОБА ЧИСТА')
await ctx.close()
process.exit(fails.length ? 1 : 0)
