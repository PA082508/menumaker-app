// smoke-iea-households.mjs — проба слияния домохозяйств, статусов и кнопки «наверх»
// на /iea-confirm ЧЕРЕЗ НАСТОЯЩИЙ ПУТЬ.
//
// Что проверяется (заказ владельца 05.08):
//   1. счётчик Wickliffe СОШЁЛСЯ С ЖЁЛТОЙ ПЛАШКОЙ до единицы — число читается
//      с ДВУХ РАЗНЫХ ЭКРАНОВ (Site Claim и /iea-confirm), а не из одного кода дважды;
//   2. Bates — ОДНА строка, два опекуна в подписи, домохозяйство из шести детей;
//   3. ушедший ребёнок виден серым с пометкой «left MM/DD», Confirm его не считает;
//   4. ребёнок дома, которого строка не показывает, всё равно НАХОДИТСЯ поиском —
//      и рядом сказано, почему его нет в списке;
//   5. кнопка «наверх» появляется после двух экранов и уносит страницу в начало.
//
// Confirm НЕ нажимается: это боевые дети боевого центра, а запись определения —
// вперёд-только. Цель кнопки проверяется числом на ней.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { pickCentre } from './lib/switchCentre.mjs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const CENTRE = 'Wickliffe'
const BATES = { query: 'Bates', guardians: ['Bryant Jackson', 'Deidra Booker'], household: 6 }
const HIDDEN_CHILD = 'Bates Kylie'   // активен, бумага уже в деле — строкой не идёт

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

// Выбор центра НЕ ПЕРЕЖИВАЕТ переход на другую страницу в этой сессии: после
// каждого goto контекст возвращается в Main Office. Поэтому центр выбирается
// заново на КАЖДОЙ странице — иначе проба читает пустой экран и объявляет провал
// там, где его нет.
async function openAtCentre(pathname, settleMs = 6000) {
  await page.goto(APP + pathname, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await pickCentre(page, CENTRE)
  await page.waitForTimeout(settleMs)
}

// ─── 1. Число с ДВУХ экранов ─────────────────────────────────────────────────
await openAtCentre('/iea-confirm')

const headerLine = (await page.locator('body').innerText())
  .split('\n').find(l => l.includes('with Free/Reduced and no application on file')) ?? ''
const confirmCount = Number((headerLine.match(/·\s*(\d+)\s+child/) || [])[1])
console.log(`    /iea-confirm: ${headerLine.trim()}`)

await openAtCentre('/claim-report', 10000)
let bannerText = (await page.locator('body').innerText())
  .split('\n').find(l => l.includes('without a current IEA on file')) ?? ''
const bannerCount = Number((bannerText.match(/(\d+)\s+Free\/Reduced/) || [])[1])
console.log(`    плашка Site Claim: ${bannerText.trim() || '(не найдена)'}`)
if (!bannerText) bad('сверка с плашкой', 'плашку Site Claim не удалось прочитать')
else if (confirmCount === bannerCount) ok(`${CENTRE}: ${confirmCount} = ${bannerCount} — два экрана сошлись до единицы`)
else bad('сверка с плашкой', `/iea-confirm ${confirmCount}, плашка ${bannerCount}`)

// ─── 2-4. Дом Bates ──────────────────────────────────────────────────────────
await openAtCentre('/iea-confirm')
const box = page.getByPlaceholder('Search by child or guardian name…')
await box.fill(BATES.query)
await page.waitForTimeout(1000)
{
  const body = await page.locator('body').innerText()
  const rows = Number((body.match(/(\d+)\s+of\s+\d+\s+famil/) || [])[1])
  rows === 1 ? ok('Bates — ОДНА строка (домохозяйство склеено по общим опекунам)')
             : bad('слияние домохозяйств', `строк ${rows}, ожидалась 1`)
  const bothGuardians = BATES.guardians.every(g => body.includes(g))
  bothGuardians ? ok(`оба опекуна перечислены: ${BATES.guardians.join(' · ')}`)
                : bad('опекуны', 'в подписи строки не оба доверенных лица')
  const btn = await page.locator('button', { hasText: 'Confirm ·' }).first().innerText().catch(() => '')
  btn.includes(`· ${BATES.household}`) ? ok(`запись целится в шесть активных детей: «${btn.trim()}»`)
                                       : bad('household-правило', `на кнопке «${btn.trim()}», ожидалось · ${BATES.household}`)
  const foundHidden = body.includes(HIDDEN_CHILD)
  const explained = body.includes('already on file') || body.includes('left ') || body.includes('Paid')
  foundHidden ? ok(`${HIDDEN_CHILD} найден, хотя строкой не идёт`) : bad('поиск по всему дому', `${HIDDEN_CHILD} не показан`)
  explained ? ok('рядом сказано, почему он не в списке') : bad('причина', 'причина отсутствия не названа')
  await page.screenshot({ path: path.join(SHOTS, 'iea-household-bates.png'), fullPage: true })
}

// Ушедшие: ищем строку с пометкой «left MM/DD» по всему списку
{
  await box.fill('')
  await page.waitForTimeout(1200)
  const former = await page.locator('[data-former="1"]').count()
  const body = await page.locator('body').innerText()
  const leftMark = /left \d{2}\/\d{2}|no longer enrolled/.test(body)
  if (former > 0 && leftMark) ok(`ушедшие дети показаны серым с пометкой (${former} шт.)`)
  else if (former > 0) bad('пометка ухода', 'серые есть, а даты ухода нет')
  else console.log('    ⓘ ушедших детей в семьях этого центра сейчас нет — проверять нечего')
}

// ─── 5. Кнопка «наверх» ──────────────────────────────────────────────────────
{
  const before = await page.locator('[data-scroll-top="1"]').count()
  before === 0 ? ok('в начале страницы кнопки «наверх» нет') : bad('кнопка наверх', 'висит на первом экране')
  // Порог — ОДИН экран (поправка владельца 05.08): на первом экране кнопки нет,
  // на втором она уже есть.
  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.8)))
  await page.waitForTimeout(600)
  const onFirst = await page.locator('[data-scroll-top="1"]').count()
  onFirst === 0 ? ok('на первом экране кнопки всё ещё нет') : bad('порог', 'кнопка появилась, не выйдя за первый экран')
  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 1.4)))
  await page.waitForTimeout(600)
  const onSecond = await page.locator('[data-scroll-top="1"]').count()
  onSecond === 1 ? ok('на втором экране кнопка уже видна') : bad('порог', 'на втором экране кнопки нет')
  const cls = await page.locator('[data-scroll-top="1"]').getAttribute('class').catch(() => '')
  ;(cls ?? '').includes('no-print') ? ok('кнопка помечена no-print') : bad('печать', `class=${cls}`)
  const after = onSecond
  if (after === 1) {
    await page.locator('[data-scroll-top="1"]').click()
    await page.waitForTimeout(1200)
    const y = await page.evaluate(() => window.scrollY)
    y < 50 ? ok('нажатие вернуло страницу в начало') : bad('кнопка наверх', `после клика scrollY=${y}`)
  }
  await page.screenshot({ path: path.join(SHOTS, 'iea-scrolltop.png'), fullPage: false })
}

// ─── 6. Закрытая семья: поиск отвечает ИМЕНЕМ и причиной ─────────────────────
{
  await box.fill('Teighan Graves')
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()
  const named = await page.locator('[data-offlist="1"]').count()
  const txt = named ? (await page.locator('[data-offlist="1"]').first().innerText()).replace(/\s+/g, ' ').trim() : ''
  named > 0 ? ok(`закрытая семья: найден по имени — «${txt}»`)
            : bad('поиск по закрытой семье', 'ответ без имени ребёнка')
  const hasReason = /already on file|Paid|left \d{2}\/\d{2}|no longer enrolled/.test(txt)
  hasReason ? ok('причина названа рядом с именем') : bad('причина', `в ответе нет причины: ${txt}`)
  const generic = body.includes('No family waiting for an application matches')
  !generic ? ok('общего «здесь такого нет» больше нет') : bad('общий ответ', 'экран всё ещё отвечает общей фразой')
  await page.screenshot({ path: path.join(SHOTS, 'iea-offlist.png'), fullPage: false })
}

// ─── 7. Ссылка на инструкцию ─────────────────────────────────────────────────
{
  const link = page.getByRole('link', { name: 'How this works' }).first()
  const href = await link.getAttribute('href').catch(() => null)
  href === '/instructions?doc=income-categories' ? ok('с экрана есть ссылка «How this works» на инструкцию')
                                                 : bad('ссылка на инструкцию', `href=${href}`)
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
