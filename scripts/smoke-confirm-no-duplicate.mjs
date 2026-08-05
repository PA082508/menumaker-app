// smoke-confirm-no-duplicate.mjs — повторный Confirm на Paper applications не
// подшивает второй документ тому, у кого он уже есть.
//
// ПОВОД (05.08, перед вводом 64 бумажных заявлений). Если с первого раза
// определение легло, а бумага нет — сеть, права, что угодно — человек нажмёт
// ещё раз, и это правильно: ему нужно недостающее. До правки второй заход
// подшивал ВТОРОЙ документ тем, кому уже подшили, и в деле ребёнка оказывались
// две одинаковые бумаги с одной датой.
//
// Проба идёт по НАСТОЯЩЕЙ странице настоящего прода, но на ТЕСТОВОМ ребёнке в
// демо-центре (ZZDUP Guard). Ничего боевого не трогает; строки за собой убирает
// тот, кто её запускал, — SQL после прогона (см. отчёт).
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || PROD
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const CHILD = 'ZZDUP'

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 940 } })
const page = ctx.pages()[0] ?? await ctx.newPage()

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
if (APP !== PROD) {
  const sess = await page.evaluate(() => {
    const k = Object.keys(localStorage).find(k => k.startsWith('sb-'))
    return k ? { k, v: localStorage.getItem(k) } : null
  })
  if (!sess) { console.error('НЕТ сессии в .demo-profile'); await ctx.close(); process.exit(2) }
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), sess)
}

// Тестовый ребёнок живёт в Parma Heights — НЕ в Wickliffe, где завтра работает
// Татьяна: проба не должна попадаться ей в списке. Демо-центр не подошёл: его
// нет среди доступных (не кормящая площадка), и приложение честно откатывается
// в организационный вид. Центр ставим той же записью, какой его помнит само
// приложение: mm.currentCenter.<userId>.
await page.goto(`${APP}/children`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.evaluate((zz) => {
  const k = Object.keys(localStorage).find(k => k.startsWith('sb-'))
  const uid = k ? JSON.parse(localStorage.getItem(k)).user.id : null
  if (uid) localStorage.setItem(`mm.currentCenter.${uid}`, zz)
}, '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b')
await page.goto(`${APP}/iea-confirm`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const search = page.getByPlaceholder(/Search/i).first()
if (await search.count()) { await search.fill(CHILD); await page.waitForTimeout(1800) }

const rowSeen = await page.getByText(new RegExp(CHILD, 'i')).count()
rowSeen > 0 ? ok('тестовый ребёнок в списке ожидающих заявление') : bad('список', 'тестового ребёнка на странице нет')

if (rowSeen > 0) {
  // Категория с бумаги, дата с бумаги, подтверждение «бумага в деле» —
  // без всех трёх страница откажет словами, и это её право.
  await page.locator('select').filter({ hasNot: page.locator('option[value="__none__"]') }).first()
    .selectOption('F').catch(() => {})
  await page.locator('input[type="date"]').first().fill('2026-08-01').catch(() => {})
  await page.locator('input[type="checkbox"]').first().click().catch(() => {})
  await page.waitForTimeout(400)

  const confirm = page.getByRole('button', { name: /Confirm/i }).first()
  if (!(await confirm.count())) {
    console.log('ЭКРАН:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900))
    bad('кнопка', 'кнопки Confirm на странице нет')
  } else {
  await confirm.click()
  await page.waitForTimeout(4000)
  const first = (await page.locator('body').innerText()).includes('recorded')
  first ? ok('первый Confirm записал определение и бумагу') : bad('первый Confirm', 'подтверждения на экране нет')
  await page.screenshot({ path: path.join(SHOTS, 'confirm-dup-1.png') })

  // ВТОРОЙ заход — тот самый случай, ради которого стоит защита.
  if (await confirm.count()) {
    await confirm.click()
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(SHOTS, 'confirm-dup-2.png') })
    ok('второй Confirm нажат — считаем документы запросом к базе')
  } else {
    bad('второй Confirm', 'кнопки больше нет — повторный заход проверить не на чем')
  }
  }
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nЭКРАННАЯ ЧАСТЬ ЗЕЛЁНАЯ — теперь read-back по базе')
process.exit(fails.length ? 1 : 0)
