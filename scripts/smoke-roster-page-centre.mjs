// smoke-roster-page-centre.mjs — страница ростера работает по ЦЕНТРУ ИЗ АДРЕСА,
// а не по выбранному в переключателе.
//
// ДЕФЕКТ (замер 05.08, ZZ Demo, роль admin): демо-центра нет в списке доступных,
// но страница ростера открывается по прямому адресу. Все окна — обе двери Add Child
// и окно ручного завода — были завязаны на `currentCenter` из переключателя.
// В организационном виде он пуст: кнопка нажималась, и НЕ ПРОИСХОДИЛО НИЧЕГО.
// Ни модалки, ни ошибки в консоли — самый дорогой вид отказа.
//
// Что проверяется:
//   1. ZZ Demo по прямому адресу: обе двери открываются, ручной завод открывает окно;
//   2. окно взяло ЦЕНТР СТРАНИЦЫ, а не центр переключателя — видно по дедупу:
//      на ZZ Demo подсказка поднимается на своего ребёнка и НЕ поднимается на чужого;
//   3. боевой центр тем же прогоном — и НИЧЕГО НЕ СОХРАНЯЕТСЯ: окно закрывается
//      Cancel, ни одной записи проба не делает.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { pickCentre } from './lib/switchCentre.mjs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const ZZ_ID = '0de1b5a4-e6d8-4e34-a5e4-e3dde23e1c6c'
const RIDGE_ID = '4aed7d5a-00d0-4a4c-ac99-311046ad2027'

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 160)))

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const sess = await page.evaluate(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('sb-'))
  return k ? { k, v: localStorage.getItem(k) } : null
})
if (!sess) { console.error('НЕТ сессии в .demo-profile'); await ctx.close(); process.exit(2) }
await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.evaluate(({ k, v }) => localStorage.setItem(k, v), sess)

// Контекст переключателя НАРОЧНО ставим в другой центр: именно это расхождение
// и ломало окна. Если страница слушается адреса, оно ей не мешает.
await page.goto(`${APP}/children`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await pickCentre(page, 'Wickliffe')

async function openDoors(centerId, tag) {
  await page.goto(`${APP}/center/${centerId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const btn = page.getByRole('button', { name: /Add Child/i }).first()
  if (!(await btn.count())) { bad(`${tag}: кнопка Add Child`, 'кнопки нет'); return false }
  await btn.click()
  await page.waitForTimeout(1500)
  const online = await page.locator('[data-door="online"]').count()
  const manual = await page.locator('[data-door="manual"]').count()
  ;(online === 1 && manual === 1) ? ok(`${tag}: обе двери открылись`)
                                  : bad(`${tag}: двери`, `online=${online} manual=${manual}`)
  return online === 1 && manual === 1
}

// ─── 1. ZZ Demo по прямому адресу ────────────────────────────────────────────
if (await openDoors(ZZ_ID, 'ZZ Demo')) {
  await page.locator('[data-door="manual"]').click()
  await page.waitForTimeout(2500)
  const first = await page.getByPlaceholder('First').count()
  first === 1 ? ok('ZZ Demo: окно ручного завода открылось') : bad('ZZ Demo: окно', 'поля First нет')
  await page.screenshot({ path: path.join(SHOTS, 'zz-after.png'), fullPage: false })

  // 2. Чей ростер в окне: подсказка должна знать СВОЙ центр.
  // Единственный ребёнок ZZ Demo — «ZZSMOKE Keytest», и он неактивен: подсказка
  // обязана поднять и ушедшего (он же и есть тот, кого заводят повторно).
  await page.getByPlaceholder('First').fill('Keytest')
  await page.getByPlaceholder('Last').fill('ZZSMOKE')
  await page.waitForTimeout(1400)
  const own = await page.locator('[data-dedup="1"]').count()
  const ownTxt = own ? (await page.locator('[data-dedup="1"]').innerText()).replace(/\s+/g, ' ').trim() : ''
  own === 1 ? ok(`ZZ Demo: дедуп поднялся на СВОЕГО ребёнка — «${ownTxt.slice(0, 90)}»`)
            : bad('ZZ Demo: дедуп', 'подсказки на своего ребёнка нет — окно смотрит не в тот ростер')
  await page.getByPlaceholder('First').fill('Kylie')
  await page.getByPlaceholder('Last').fill('Bates')
  await page.waitForTimeout(1400)
  const foreign = await page.locator('[data-dedup="1"]').count()
  foreign === 0 ? ok('ZZ Demo: на чужого ребёнка (Bates, Wickliffe) подсказки нет')
                : bad('ZZ Demo: дедуп', 'подсказка на ребёнка ДРУГОГО центра — окно взяло чужой ростер')
  // Ничего не сохраняем.
  await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {})
  await page.waitForTimeout(800)
}

// ─── 3. Боевой центр тем же прогоном, без сохранения ─────────────────────────
if (await openDoors(RIDGE_ID, 'Wickliffe')) {
  await page.locator('[data-door="manual"]').click()
  await page.waitForTimeout(2500)
  const first = await page.getByPlaceholder('First').count()
  first === 1 ? ok('Wickliffe: окно ручного завода открылось') : bad('Wickliffe: окно', 'поля First нет')
  await page.getByPlaceholder('First').fill('Kylie')
  await page.getByPlaceholder('Last').fill('Bates')
  await page.waitForTimeout(1400)
  const own = await page.locator('[data-dedup="1"]').count()
  own === 1 ? ok('Wickliffe: дедуп поднялся на своего Bates Kylie') : bad('Wickliffe: дедуп', 'подсказки нет')
  await page.screenshot({ path: path.join(SHOTS, 'ridge-after.png'), fullPage: false })
  await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {})
  await page.waitForTimeout(1000)
  const stillOpen = await page.getByPlaceholder('First').count()
  stillOpen === 0 ? ok('Wickliffe: окно закрыто по Cancel — ничего не сохранено') : bad('Wickliffe', 'окно осталось открытым')
}

pageErrors.length === 0 ? ok('ни одной необработанной ошибки страницы') : bad('ошибки страницы', pageErrors.join(' || '))

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
