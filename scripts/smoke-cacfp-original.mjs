// smoke-cacfp-original.mjs — «View original form» для CACFP Enrollment.
//
// ЗАЧЕМ. Реплика собрана генератором из витринного кита (scripts/gen_cacfp_replica.py),
// и именно поэтому её нужно ПРОВЕРИТЬ живьём: генератор гарантирует, что координаты
// не переписаны руками, но не гарантирует, что нормализованная полезная нагрузка
// (child_name / birthdate / schedule{}/ mailing{}) легла в те самые клетки.
//
// Проба в два захода:
//   A. сама реплика с синтетической подачей той же ФОРМЫ (в репозиторий не кладём
//      ни одного настоящего имени) — считаем клетки, галочки, подпись, даты;
//   B. настоящая строка Rife через настоящую дверь: ростер Wickliffe → карточка
//      Isaac Rife → вкладка Documents → одобренная форма CACFP → просмотр.
//      Ничего не пишется: только открывается и закрывается.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { pickCentre } from './lib/switchCentre.mjs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const RIDGE_ID = '4aed7d5a-00d0-4a4c-ac99-311046ad2027'

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

// Синтетическая подача той же формы: форма настоящая, человек выдуманный.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const day = (arr, dep, meals) => ({ in_care: true, arr1: arr, dep1: dep, arr2: '', dep2: '', meals })
const MEALS_ON = { b: false, as: false, l: true, ps: true, su: false, es: false }
const MEALS_OFF = { b: false, as: false, l: false, ps: false, su: false, es: false }
const FD = {
  type: 'cacfp_enrollment', center_name: 'Play Academy Wickliffe', center_code: 'ridge',
  child_name: 'ZZSMOKE Original', age: '4', birthdate: '2021-09-08',
  schedule: Object.fromEntries([
    ...DAYS.map(d => [d, day('8:00 am', '4:30 pm', MEALS_ON)]),
    ['sat', { in_care: false, arr1: '', dep1: '', arr2: '', dep2: '', meals: MEALS_OFF }],
    ['sun', { in_care: false, arr1: '', dep1: '', arr2: '', dep2: '', meals: MEALS_OFF }],
  ]),
  schedule_varies: false, day_phone: '(440) 555-0100',
  mailing: { street: '1 Test Street', city: 'Wickliffe', zip: '44092' },
  parent_name: 'ZZSMOKE Parent', parent_birthdate: '1990-01-15', parent_email: 'zz@example.com',
  signature_method: 'drawn', expires_on: '2027-08-31',
}
// 1×1 прозрачный png — рисунок подписи как рисунок, а не как текст.
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 940 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 160)))

// ─── A. реплика сама по себе ─────────────────────────────────────────────────
const payload = encodeURIComponent(JSON.stringify({ formData: FD, signatures: { parent_sig: SIG }, signatureDate: '2026-08-04' }))
await page.goto(`${APP}/forms/CACFP_Enrollment_v11_original.html?data=${payload}`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

const bgOk = await page.evaluate(() => { const i = document.querySelector('img.bg'); return !!i && i.naturalWidth === 1275 && i.naturalHeight === 1650 })
bgOk ? ok('A: официальный бланк подложкой, 1275×1650') : bad('A: подложка', 'картинка бланка не загрузилась или не того размера')

const cells = await page.locator('.rv').allTextContents()
const marks = await page.locator('.rmark').count()
const sigImgs = await page.locator('img.rsig').count()
const has = (t) => cells.some(c => c.trim() === t)

has('ZZSMOKE Original') ? ok('A: имя ребёнка на своём месте') : bad('A: имя', `клетки: ${cells.slice(0, 8).join(' | ')}`)
has('9/8/2021') ? ok('A: дата рождения печатается как на бумаге (9/8/2021), без сдвига на день') : bad('A: ДР', `нет 9/8/2021 среди клеток`)
has('8/4/2026') ? ok('A: дата подписи с подачи (8/4/2026), а не из form_data') : bad('A: дата подписи', 'на бланке пусто — signatureDate не доехал')
has('1 Test Street') && has('Wickliffe') && has('44092') ? ok('A: почтовый адрес разложен по трём клеткам') : bad('A: адрес', 'street/city/zip не на местах')
cells.filter(c => c.trim() === '8:00 am').length === 5 ? ok('A: пять рабочих дней с часами прихода') : bad('A: часы', `8:00 am встречается ${cells.filter(c => c.trim() === '8:00 am').length} раз, ожидалось 5`)
// 5 дней «в уходе» + 5 обедов + 5 полдников = 15; суббота и воскресенье пустые.
marks === 15 ? ok('A: 15 галочек — дни в уходе и отмеченные приёмы пищи') : bad('A: галочки', `${marks}, ожидалось 15 (выходные не должны отмечаться)`)
sigImgs === 1 ? ok('A: подпись родителя нарисована на своём месте') : bad('A: подпись', `картинок подписи ${sigImgs}`)
await page.screenshot({ path: path.join(SHOTS, 'cacfp-original-synthetic.png'), fullPage: false })

// ─── B. настоящая строка Rife через настоящую дверь ──────────────────────────
await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const sess = await page.evaluate(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('sb-'))
  return k ? { k, v: localStorage.getItem(k) } : null
})
if (!sess) { bad('B: сессия', 'НЕТ сессии в .demo-profile — вход не выполнен'); }
else {
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), sess)
  await page.goto(`${APP}/children`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await pickCentre(page, 'Wickliffe')
  await page.goto(`${APP}/center/${RIDGE_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)

  // Isaac Rife зачислен с 17 августа и БЕЗ КОМНАТЫ (его завёл Approve формы, а
  // комнату там не спрашивают). Карточный вид группирует по комнатам — таких
  // детей он не показывает вовсе; список показывает. Замер 05.08, отдельной
  // строкой в отчёт: пока комнаты нет, ребёнок виден только в «☰ List».
  await page.getByText(/☰ List/).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  const search = page.getByPlaceholder(/Search active/i).first()
  if (await search.count()) { await search.fill('Rife'); await page.waitForTimeout(2000) }

  const row = page.getByText(/Isaac/i).first()
  if (!(await row.count())) bad('B: ростер', 'строки Isaac Rife в ростере Wickliffe не видно даже списком и поиском')
  else {
    await row.click()
    await page.waitForTimeout(3500)
    const docsTab = page.locator('[data-tab="documents"]').first()
    if (!(await docsTab.count())) bad('B: карточка', 'карточка не открылась или вкладки Documents в ней нет')
    else {
      await docsTab.click()
      await page.waitForTimeout(3500)
      // У Исаака в деле две одобренные CACFP-подачи (первая завела ребёнка,
      // вторая дописала поля) — обе с репликой. Берём первую кнопку списка.
      const formBtn = page.getByRole('button', { name: /View original form/i }).first()
      if (!(await formBtn.count())) bad('B: Documents', 'кнопки «View original form» у формы CACFP в карточке нет')
      else {
        await formBtn.click()
        await page.waitForTimeout(4000)
        const frame = page.frameLocator('iframe[title="Original form"]')
        const cnt = await frame.locator('.rv').count().catch(() => 0)
        cnt > 8 ? ok(`B: настоящая форма Rife открылась репликой — ${cnt} заполненных клеток`)
                : bad('B: просмотр', `клеток ${cnt} — реплика не получила данные`)
        const nameSeen = await frame.locator('.rv', { hasText: /Rife/i }).count().catch(() => 0)
        nameSeen > 0 ? ok('B: на бланке стоит имя того самого ребёнка') : bad('B: имя', 'имени Rife на бланке нет')
        await page.screenshot({ path: path.join(SHOTS, 'cacfp-original-rife.png'), fullPage: false })
        await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {})
      }
    }
  }
}

pageErrors.length === 0 ? ok('ни одной необработанной ошибки страницы') : bad('ошибки страницы', pageErrors.join(' || '))

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
