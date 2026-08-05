// smoke-iea-search.mjs — проба поиска по имени ребёнка на /iea-confirm ЧЕРЕЗ НАСТОЯЩИЙ ПУТЬ.
//
// Что проверяется (заказ владельца 05.08):
//   1. семья находится по ребёнку, чья ФАМИЛИЯ ОТЛИЧАЕТСЯ от опекунской
//      (боевая пара Highland Heights: опекун Thiana Carter — ребёнок Cheeks Bella);
//   2. порядок слов и регистр не мешают: «Bella Cheeks» = «Cheeks Bella» = «cheeks»;
//   3. совпавший ребёнок ПОДСВЕЧЕН — видно, почему семья выпала в результат;
//   4. пустой результат ОБЪЯСНЁН словами, а не показан пустотой.
//
// Сессия берётся из ./.demo-profile и переносится на локальный preview — тот же
// приём, что у остальных проб: токен Supabase живёт в localStorage и от origin
// не зависит, но снимать его надо ПОСЛЕ загрузки прода (refresh-токен одноразовый).
// Service worker выключен: иначе страница поднимется из кеша прошлой сборки.
//
// ЭКРАН ОРГ-УРОВНЕВЫЙ. Директору центра он не показывается вовсе — если сессия
// в профиле директорская, проба скажет это словами и не станет притворяться,
// что проверила.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const CENTER = process.env.CENTER || 'Highland Heights'
const CHILD_LAST = 'Cheeks'
const CHILD_FULL_NATURAL = 'Bella Cheeks'      // как произносят
const CHILD_FULL_STORED = 'Cheeks Bella'        // как хранится (канон CACFP)
const GUARDIAN = 'Thiana Carter'
const NONSENSE = 'Zzzqqq'

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block' })
const page = ctx.pages()[0] ?? await ctx.newPage()

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const sess = await page.evaluate(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('sb-'))
  return k ? { k, v: localStorage.getItem(k) } : null
})
if (!sess) { console.error('НЕТ сессии в .demo-profile'); await ctx.close(); process.exit(2) }

await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.evaluate(({ k, v }) => localStorage.setItem(k, v), sess)
await page.goto(`${APP}/iea-confirm`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Экран центро-зависим. Переключатель центров живёт в боковой панели; после
// переименования 04.08 орг-вход называется Main Office (раньше Organization).
async function pickCentre() {
  for (const label of ['Main Office', 'Organization']) {
    const el = page.getByText(label, { exact: true }).first()
    if (await el.count().catch(() => 0)) {
      await el.click().catch(() => {})
      await page.waitForTimeout(900)
      const c = page.getByText(CENTER, { exact: false }).first()
      if (await c.count().catch(() => 0)) {
        await c.click().catch(() => {})
        await page.waitForTimeout(3500)
        await page.keyboard.press('Escape').catch(() => {})
        await page.mouse.move(1200, 700)
        return true
      }
    }
  }
  return false
}

const denied = await page.getByText('not part of a centre director').count().catch(() => 0)
if (denied) {
  console.error('Сессия в .demo-profile — директорская. Этот экран орг-уровневый, проба невозможна под ней.')
  await page.screenshot({ path: path.join(SHOTS, 'iea-search-denied.png'), fullPage: true })
  await ctx.close(); process.exit(3)
}

await pickCentre()
await page.waitForTimeout(2500)

const box = page.getByPlaceholder('Search by child or guardian name…')
if (!(await box.count())) {
  console.error('Поля поиска нет на экране — дальше проверять нечего.')
  await page.screenshot({ path: path.join(SHOTS, 'iea-search-nobox.png'), fullPage: true })
  await ctx.close(); process.exit(4)
}
// Экран открывается с фильтром «только открытые» — искать надо по всему списку,
// иначе проба перепутает «не нашлось» с «спрятано фильтром».
const onlyOpen = page.getByLabel('Only families with someone still open', { exact: false })
  .or(page.locator('input[type=checkbox]').first())
if (await onlyOpen.isChecked().catch(() => false)) { await onlyOpen.uncheck().catch(() => {}) }
await page.waitForTimeout(500)

async function search(q) {
  await box.fill(q)
  await page.waitForTimeout(700)
  const cards = page.locator('div').filter({ hasText: GUARDIAN })
  return {
    guardianVisible: await page.getByText(GUARDIAN, { exact: true }).count(),
    highlighted: await page.locator('[data-match="child"]').count(),
    highlightedText: await page.locator('[data-match="child"]').first().innerText().catch(() => ''),
    bodyText: await page.locator('body').innerText(),
    cards: await cards.count(),
  }
}

// 1. Поиск по фамилии ребёнка, которой нет у опекуна
{
  const r = await search(CHILD_LAST)
  r.guardianVisible ? ok(`«${CHILD_LAST}» находит семью ${GUARDIAN} — фамилия ребёнка ≠ фамилии опекуна`)
                    : bad('поиск по фамилии ребёнка', `семья ${GUARDIAN} не показана`)
  r.highlighted > 0 ? ok(`подсветка стоит: ${r.highlightedText.replace(/\s+/g, ' ').trim()}`)
                    : bad('подсветка', 'ни один ребёнок не помечен data-match="child"')
  await page.screenshot({ path: path.join(SHOTS, 'iea-search-child.png'), fullPage: true })
}

// 2. Порядок слов и регистр
for (const q of [CHILD_FULL_NATURAL, CHILD_FULL_STORED, CHILD_LAST.toLowerCase()]) {
  const r = await search(q)
  r.guardianVisible ? ok(`«${q}» — находит`) : bad(`порядок/регистр «${q}»`, 'семья не показана')
}

// 3. Пустой результат объяснён словами
{
  const r = await search(NONSENSE)
  // Текст пустоты изменился 05.08 вместе с отбором: список держит только
  // ожидающих заявления, и пустота теперь называет ЭТО, а не «нет совпадений».
  const said = r.bodyText.includes('No family waiting for an application matches')
  said ? ok('пустой поиск объяснён словами, а не пустотой') : bad('пустой поиск', 'нет объяснения на экране')
  const namesQuery = r.bodyText.includes(NONSENSE)
  namesQuery ? ok('в объяснении назван сам запрос') : bad('пустой поиск', 'запрос в тексте не назван')
  await page.screenshot({ path: path.join(SHOTS, 'iea-search-empty.png'), fullPage: true })
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
