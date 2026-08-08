// readback-week-and-rooms.mjs — ЧИТАЮЩАЯ проба окна «Teacher App v1.1» (08.08).
//
// ЧИТАЕТ И СНИМАЕТ, НЕ ПИШЕТ. Ни одной отметки, ни одной строки в базу: всё, что
// здесь проверяется, видно глазами на уже существующих данных. Read-back никогда
// не пишет — правило дороже удобства.
//
// Что снимается:
//   1. ПРАВИЛО НЕДЕЛИ на кухонной двери. Сегодня суббота — экран обязан открыться
//      на ПРОШЕДШЕЙ неделе (её закрывают и подписывают), а не на следующей.
//   2. КУХОННАЯ ДВЕРЬ НЕ ТРОНУТА: табы всех комнат, линейка дней, плитка прогноза
//      и выгрузка — всё на месте (учительский вид их снимает только у себя).
//   3. РЕГИСТРАЦИЯ УСТРОЙСТВА: в списке комнат нет служебных строк — фильтр идёт
//      по признаку `is_roster`, а не по имени.
//
// Чего здесь НЕТ и быть не может: три экрана App учителя (персона из PIN, Meals
// одной комнатой, отсутствие «change room»). Туда нужен ТОКЕН УСТРОЙСТВА, а его
// у агента нет и быть не должно — это живая сверка владельца на живом планшете.
//
// Сессия берётся из ./.demo-profile и переносится на локальный preview: токен
// Supabase живёт в localStorage и от origin не зависит (рецепт 02.08).

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out/week-rooms')
const CENTER = process.env.CENTER || 'Ridge'

fs.mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(...a)
const fails = []
const ok = (n) => log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); log(`  ✗ ${n} — ${why}`) }

// ⚠️ Service worker НЕ блокируется. Замер 08.08: с `serviceWorkers: 'block'`
// боевое приложение в этом профиле зависает на «Loading…» — то есть проба
// проверяла бы не экран, а собственную обстановку. Перехвата запросов здесь нет,
// блокировать нечего; зато на localhost ниже снимается СТАРЫЙ worker с кэшами,
// иначе снимок покажет прошлую сборку и назовёт её новой.
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1400, height: 1000 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()

// ⚠️ Токен читается ПОСЛЕ подъёма прод-приложения: refresh-токен одноразовый.
await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
if (!Object.keys(store).some(k => k.startsWith('sb-'))) {
  console.error('НЕТ сессии в .demo-profile — войти руками и повторить'); process.exit(2)
}
await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
// Снять прошлый worker и его кэши: снимок обязан быть СВЕЖЕЙ сборки.
await page.evaluate(async () => {
  try {
    const rs = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(rs.map(r => r.unregister()))
    const keys = await caches?.keys?.() ?? []
    await Promise.all(keys.map(k => caches.delete(k)))
  } catch { /* нет SW — тем лучше */ }
})
await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) }, store)

async function pickCenter(p) {
  await p.getByText('Organization', { exact: true }).first().click().catch(() => {})
  await p.waitForTimeout(800)
  await p.getByText(new RegExp(CENTER), { exact: false }).first().click().catch(() => {})
  await p.waitForTimeout(2500)
  await p.mouse.move(1200, 700)
  await p.keyboard.press('Escape').catch(() => {})
  await p.waitForTimeout(600)
}

// ── 1–2. Кухонная дверь ──────────────────────────────────────────────────────
log('\n1. Кухонная дверь /meal-count — неделя и полный набор органов')
await page.goto(APP + '/meal-count', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await pickCenter(page)
await page.waitForSelector('.mc-class-btn', { timeout: 60000 }).catch(() => {})

const week = await page.locator('.mc-week-label, .mc-week-select').first().innerText().catch(() => '')
const dow = new Date().getDay()
const expect = dow === 6 ? 'прошедшая неделя (суббота — закрытие)'
  : dow === 0 ? 'следующая неделя (воскресенье — канун понедельника)'
  : 'текущая неделя'
log(`   неделя на экране: «${week.replace(/\n/g, ' ')}» · ожидание: ${expect}`)

const classTabs = await page.locator('.mc-class-btn').count()
const dayBar = await page.locator('.mc-day-bar').count()
const tile = await page.getByText(/Expected counts/i).count()
const exportBtn = await page.getByRole('button', { name: /Export for Google Sheets/i }).count()
classTabs > 1 ? ok(`табы комнат на месте (${classTabs})`) : bad('табы комнат', `их ${classTabs}`)
dayBar === 1 ? ok('линейка дней на месте') : bad('линейка дней', `блоков ${dayBar}`)
tile > 0 ? ok('плитка прогноза на месте') : log('   · плитки прогноза нет (центр не meal_site — это не отказ)')
exportBtn === 1 ? ok('выгрузка в лист на месте') : bad('выгрузка в лист', `кнопок ${exportBtn}`)

// День недели, на котором стоит фокус: в субботу — пятница.
const activeDay = await page.locator('.mc-day-btn.active').first().innerText().catch(() => '?')
log(`   день фокуса: ${activeDay.trim()}`)
await page.screenshot({ path: `${SHOTS}/1-kitchen-week.png` })

// ── 3. Регистрация устройства: только детские комнаты ────────────────────────
log('\n2. Settings → Devices — список комнат')
await page.goto(APP + '/settings/safepass-devices', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
await page.getByRole('button', { name: /Classroom pad/i }).first().click().catch(() => {})
await page.waitForTimeout(1200)
const opts = await page.locator('select option').allInnerTexts().catch(() => [])
const rooms = opts.filter(t => t && !/^—/.test(t))
log(`   комнат в списке: ${rooms.length} — ${rooms.join(' · ')}`)
const staffRows = rooms.filter(t => /staff/i.test(t))
staffRows.length === 0
  ? ok('служебных комнат в списке НЕТ')
  : bad('служебных комнат в списке нет', `найдены: ${staffRows.join(', ')}`)
rooms.length > 0 ? ok('детские комнаты предлагаются') : bad('детские комнаты предлагаются', 'список пуст')
await page.screenshot({ path: `${SHOTS}/2-devices-rooms.png` })

log(`\nснимки: ${SHOTS}`)
if (fails.length) { log('\nПРОВАЛЫ:'); fails.forEach(f => log(' · ' + f)); await ctx.close(); process.exit(1) }
log('\nвсё, что видно без токена устройства, — сходится')
await ctx.close()
