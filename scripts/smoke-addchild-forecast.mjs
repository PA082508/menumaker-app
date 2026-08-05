// smoke-addchild-forecast.mjs — три вещи через настоящий путь:
//   1. ПАМЯТЬ О ЦЕНТРЕ: выбрал Wickliffe → три перехода по страницам → всё ещё
//      Wickliffe; Main Office возвращается ТОЛЬКО явным выбором;
//   2. ДВЕ ДВЕРИ Add Child и фоновый дедуп: ввод имени существующего ребёнка
//      поднимает плашку «Similar child found» с кнопкой «Use this child»;
//   3. ПЛИТКА ПРОГНОЗА на кухонном столе: числа, подпись пересева, вкладки центров.
//
// Сессия — из ./.demo-profile (роль admin). Директорской сессии у пробы нет, и
// выдавать админскую за директорскую она не станет: обе двери и дедуп от роли
// не зависят, а различие названо в отчёте.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const CENTRE = 'Wickliffe'
const EXISTING = { first: 'Kylie', last: 'Bates' }   // боевой ребёнок Wickliffe

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 900 } })
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
// Память о центре хранится ПОД ПОЛЬЗОВАТЕЛЕМ; чистим её, чтобы проба началась с нуля.
await page.evaluate(() => { Object.keys(localStorage).filter(k => k.startsWith('mm.currentCenter.')).forEach(k => localStorage.removeItem(k)) })

// Меню центров — HOVER-выпадашка: пока она закрыта, у её пунктов
// pointer-events: none, и клик по пункту уходит в пустоту. Поэтому сначала
// открываем её шапкой (там стоит подпись АКТИВНОГО входа), и только потом
// щёлкаем нужный пункт — он всегда ПОСЛЕДНЕЕ вхождение своей подписи.
async function pickFromSwitcher(label) {
  const active = await activeCentre()
  const header = page.getByText(active, { exact: true }).first()
  if (await header.count().catch(() => 0)) {
    await header.hover().catch(() => {})
    await header.click().catch(() => {})
  }
  await page.waitForTimeout(900)
  const t = page.getByText(label, { exact: true }).last()
  if (await t.count().catch(() => 0)) await t.click().catch(() => {})
  await page.waitForTimeout(3000)
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.move(1300, 820)
  await page.waitForTimeout(800)
}
// Активный центр читается из ЗАГОЛОВКА боковой панели — первая строка после названия продукта.
async function activeCentre() {
  const lines = (await page.locator('body').innerText()).split('\n').map(s => s.trim())
  const i = lines.findIndex(l => l === 'Play Academy')
  return i >= 0 ? lines[i + 1] : '(не найдено)'
}

// ─── 1. Память о центре ──────────────────────────────────────────────────────
await page.goto(`${APP}/children`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await pickFromSwitcher(CENTRE)
console.log(`    выбран центр: ${await activeCentre()}`)
let survived = true
for (const p of ['/meal-count', '/iea-confirm', '/children']) {
  await page.goto(APP + p, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const cur = await activeCentre()
  if (cur !== CENTRE) { survived = false; bad('память о центре', `после ${p} активен «${cur}»`); break }
}
if (survived) ok(`центр пережил три перехода — всё ещё ${CENTRE}`)
await pickFromSwitcher('Main Office')
{
  const cur = await activeCentre()
  cur === 'Main Office' ? ok('Main Office возвращается выбором') : bad('возврат в Main Office', `активен «${cur}»`)
  await page.goto(`${APP}/children`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000)
  const after = await activeCentre()
  after === 'Main Office' ? ok('и он тоже переживает переход — память симметрична')
                          : bad('память о Main Office', `после перехода активен «${after}»`)
}

// ─── 2. Две двери + дедуп ────────────────────────────────────────────────────
await pickFromSwitcher(CENTRE)
await page.goto(`${APP}/children`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
{
  const addBtn = page.getByRole('button', { name: /Add Child/i }).first()
  await addBtn.click(); await page.waitForTimeout(1200)
  const online = await page.locator('[data-door="online"]').count()
  const manual = await page.locator('[data-door="manual"]').count()
  ;(online === 1 && manual === 1) ? ok('Add Child открывает СРАЗУ две двери — Online и Manual entry')
                                  : bad('две двери', `online=${online} manual=${manual}`)
  await page.screenshot({ path: path.join(SHOTS, 'addchild-doors.png'), fullPage: false })

  await page.locator('[data-door="manual"]').click()
  // С 05.08 ручной завод открывает ПОЛНУЮ карточку, а не короткое окно: поля
  // ищутся по ключам реестра, а не по placeholder'ам старой модалки.
  await page.waitForTimeout(3000)
  await page.locator('#field-first_name input').first().fill(EXISTING.first)
  await page.locator('#field-last_name input').first().fill(EXISTING.last)
  await page.waitForTimeout(1500)
  const banner = page.locator('[data-dedup="1"]')
  const shown = await banner.count()
  shown ? ok(`плашка двойника поднялась на «${EXISTING.first} ${EXISTING.last}»`)
        : bad('фоновый дедуп', 'плашка не появилась на существующем имени')
  if (shown) {
    const txt = (await banner.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`    плашка: ${txt.slice(0, 160)}`)
    const useBtn = await banner.getByRole('button', { name: 'Use this child' }).count()
    const keepBtn = await banner.getByRole('button', { name: 'Keep creating new' }).count()
    ;(useBtn > 0 && keepBtn > 0) ? ok('обе двери в плашке: Use this child · Keep creating new')
                                 : bad('кнопки плашки', `use=${useBtn} keep=${keepBtn}`)
    const hasRoomAndBday = /·/.test(txt) && /b\.\d{2}\/\d{2}\/\d{4}/.test(txt)
    hasRoomAndBday ? ok('в подписи есть комната и дата рождения') : bad('подпись кандидата', `нет комнаты/ДР: ${txt.slice(0,80)}`)
  }
  await page.screenshot({ path: path.join(SHOTS, 'addchild-dedup.png'), fullPage: false })
  await page.keyboard.press('Escape').catch(() => {})
}

// ─── 3. Плитка прогноза ──────────────────────────────────────────────────────
await page.goto(`${APP}/meal-count`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
{
  const body = await page.locator('body').innerText()
  body.includes('Expected counts') ? ok('плитка «Expected counts» на кухонном столе') : bad('плитка', 'заголовка нет')
  body.includes('forecast') ? ok('сказано, что это прогноз, а не сегодняшняя посещаемость') : bad('плитка', 'слова forecast нет')
  const cap = await page.locator('[data-caption="1"]').innerText().catch(() => '')
  cap ? ok(`подпись пересева: ${cap.replace(/\s+/g, ' ').trim().slice(0, 90)}`) : bad('подпись', 'подписи пересева нет')
  const meals = await page.locator('[data-meal]').count()
  meals === 4 ? ok('четыре приёма крупными числами') : bad('приёмы', `плиток приёмов ${meals}`)
  const tabs = await page.locator('button', { hasText: /Wickliffe|Highland Heights|Parma Heights/ }).count()
  tabs >= 3 ? ok('админу центры даны вкладками') : bad('вкладки', `кнопок центров ${tabs}`)
  await page.screenshot({ path: path.join(SHOTS, 'forecast-tile.png'), fullPage: false })
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
