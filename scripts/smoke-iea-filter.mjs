// smoke-iea-filter.mjs — проба отбора строк на /iea-confirm ЧЕРЕЗ НАСТОЯЩИЙ ПУТЬ.
//
// Что проверяется (заказ владельца 05.08):
//   1. счётчик Ridge сошёлся с жёлтой плашкой Site Claim — 64 ребёнка F/R без
//      заявления. До правки экран показывал 248 детей: в списке стояли P, которым
//      заявления не бывает вовсе;
//   2. семья F+P показывает СТРОКОЙ только F/R-ребёнка, а подтверждение целится
//      во ВСЁ домохозяйство (household-правило) — это видно по числу на кнопке
//      и по подписи под строкой;
//   3. чисто-P семьи в списке нет.
//
// ЧЕГО ПРОБА НЕ ДЕЛАЕТ НАРОЧНО: не нажимает Confirm. Это боевые дети боевого
// центра, а запись определения — вперёд-только: откатить её нечем. Цель кнопки
// проверяется по числу на ней и по подписи «household of N», а не по факту записи.
//
// Сессия — из ./.demo-profile, перенос на локальный preview; тот же приём, что
// у остальных проб.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')

// Ожидание Ridge — то же число, что знает плашка (замер в базе 05.08).
const RIDGE_EXPECT = Number(process.env.RIDGE_EXPECT || 64)
// Боевая семья F+P: Franklin Melody [P] + Franklin Mariyah [F, ждёт заявления].
const FAM_MIXED = { centre: 'Highland Heights', guardian: 'Brandi Franklin', shown: 'Franklin Mariyah', hidden: 'Franklin Melody', household: 2 }
// Боевая чисто-P семья: три ребёнка, все Paid.
const FAM_PAID = { guardian: 'Ariel Rossen', child: 'Rossen Micah' }

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

async function openCentre(name) {
  await page.goto(`${APP}/iea-confirm`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  for (const label of ['Main Office', 'Organization']) {
    const el = page.getByText(label, { exact: true }).first()
    if (await el.count().catch(() => 0)) {
      await el.click().catch(() => {})
      await page.waitForTimeout(900)
      const c = page.getByText(name, { exact: false }).first()
      if (await c.count().catch(() => 0)) { await c.click().catch(() => {}); await page.waitForTimeout(4000); break }
    }
  }
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.move(1200, 700)
  await page.waitForTimeout(1500)
}

const header = async () => (await page.locator('body').innerText())
  .split('\n').find(l => l.includes('with Free/Reduced and no application on file')) ?? ''

// ─── 1. Ridge: число сошлось с плашкой ───────────────────────────────────────
await openCentre('Wickliffe')
{
  const line = await header()
  const m = line.match(/(\d+)\s+famil\w+\s+·\s+(\d+)\s+child/)
  if (!m) bad('счётчик Ridge', `строки счётчика нет: «${line}»`)
  else {
    const kids = Number(m[2])
    kids === RIDGE_EXPECT ? ok(`Ridge: ${kids} детей F/R без заявления — сошлось с плашкой`)
                          : bad('счётчик Ridge', `на экране ${kids}, плашка знает ${RIDGE_EXPECT}`)
    console.log(`    строка счётчика: ${line.trim()}`)
  }
  await page.screenshot({ path: path.join(SHOTS, 'iea-filter-ridge.png'), fullPage: true })
}

// ─── 2. Семья F+P и 3. чисто-P семья ─────────────────────────────────────────
await openCentre(FAM_MIXED.centre)
const box = page.getByPlaceholder('Search by child or guardian name…')
{
  await box.fill(FAM_MIXED.guardian)
  await page.waitForTimeout(900)
  const body = await page.locator('body').innerText()
  body.includes(FAM_MIXED.shown) ? ok(`семья ${FAM_MIXED.guardian}: F-ребёнок ${FAM_MIXED.shown} в строке`)
                                 : bad('семья F+P', `${FAM_MIXED.shown} не показан`)
  !body.includes(FAM_MIXED.hidden) ? ok(`P-ребёнок ${FAM_MIXED.hidden} строкой НЕ показан`)
                                   : bad('семья F+P', `${FAM_MIXED.hidden} (Paid) попал в строку`)
  const btn = await page.locator('button', { hasText: 'Confirm ·' }).first().innerText().catch(() => '')
  btn.includes(`· ${FAM_MIXED.household}`) ? ok(`кнопка целится во всё домохозяйство: «${btn.trim()}»`)
                                           : bad('household-правило', `на кнопке «${btn.trim()}», ожидалось · ${FAM_MIXED.household}`)
  body.includes(`household of ${FAM_MIXED.household}`) ? ok('подпись объясняет, кому уйдёт запись')
                                                       : bad('household-подпись', 'подписи «household of N» нет')
  await page.screenshot({ path: path.join(SHOTS, 'iea-filter-mixed.png'), fullPage: true })
}
{
  await box.fill(FAM_PAID.guardian)
  await page.waitForTimeout(900)
  const body = await page.locator('body').innerText()
  const absent = !body.includes(FAM_PAID.child)
  const explained = body.includes('No family waiting for an application matches')
  absent ? ok(`чисто-P семья ${FAM_PAID.guardian} в списке отсутствует`)
         : bad('чисто-P семья', `${FAM_PAID.child} показан`)
  explained ? ok('отсутствие объяснено словами — сказано, кого список не держит')
            : bad('чисто-P семья', 'пустота без объяснения')
  await page.screenshot({ path: path.join(SHOTS, 'iea-filter-paid.png'), fullPage: true })
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
