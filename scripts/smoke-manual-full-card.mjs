// smoke-manual-full-card.mjs — дверь ✍️ Manual entry открывает ПОЛНУЮ карточку,
// а не короткое окно; Save на минимуме сажает ребёнка в ростер и в сетку питания.
//
// ЗАЧЕМ ИМЕННО ТАК (заказ владельца 05.08). Короткое окно с шестью полями — это
// вторая форма ввода рядом с карточкой, и разошлась бы она с ней на первой правке.
// Форма ввода = сама карточка: все вкладки и поля доступны сразу, обязательный
// минимум держит только Save, остальное дозаполняется позже — красные бейджи
// вкладок помнят, чего нет.
//
// Проба ЗАВОДИТ РЕБЁНКА — поэтому только в ZZ Demo (`is_demo = true`) и с именем
// ZZPROBE: демо-центр не участвует ни в клейме, ни в бейджах, ни в счётчиках
// директора. В боевых центрах проба не пишет ничего.

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const ZZ_ID = '0de1b5a4-e6d8-4e34-a5e4-e3dde23e1c6c'
const STAMP = process.env.STAMP || String(Date.now()).slice(-6)
// ДР тоже уникальна на прогон: прошлый прогон оставил в ZZ Demo своего ZZPROBE,
// и совпадение «фамилия + дата рождения» подняло бы подсказку о двойнике — верно
// по правилу, но не то, что проверяет этот шаг.
const KID = { first: 'Probe' + STAMP, last: 'ZZPROBE', bday: `2023-${String((Number(STAMP) % 12) + 1).padStart(2, '0')}-${String((Number(STAMP) % 27) + 1).padStart(2, '0')}` }

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 980 } })
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

await page.goto(`${APP}/center/${ZZ_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.getByRole('button', { name: /Add Child/i }).first().click()
await page.waitForTimeout(1200)
await page.locator('[data-door="manual"]').click()
await page.waitForTimeout(2500)

// ─── 1. Открылась именно КАРТОЧКА ────────────────────────────────────────────
{
  const body = await page.locator('body').innerText()
  const tabs = ['Profile', 'Family', 'Enrollment', 'Health', 'CACFP', 'SafePass', 'Billing']
  const present = tabs.filter(t => body.includes(t))
  present.length >= 6 ? ok(`открылась полная карточка — вкладки: ${present.join(', ')}`)
                      : bad('полная карточка', `вкладок мало: ${present.join(', ')}`)
  body.includes('NOT SAVED YET') ? ok('в шапке сказано, что строка ещё не записана')
                                 : bad('шапка', 'нет пометки NOT SAVED YET')
  const short = await page.getByPlaceholder('First').count()
  short === 0 ? ok('короткого окна с этой двери больше нет') : bad('короткое окно', 'старая модалка всё ещё открывается')
  await page.screenshot({ path: path.join(SHOTS, 'manual-full-card.png'), fullPage: false })
}

// ─── 2. Отказ на пустом минимуме ГОВОРИТ ─────────────────────────────────────
{
  await page.getByRole('button', { name: /Add child/i }).last().click()
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()
  const named = body.includes('NOTHING WAS SAVED') && /First name|Birthday|Classroom/.test(body)
  named ? ok('пустой минимум отбит словами, поля названы') : bad('отказ', 'отказ без объяснения')
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)
}

// ─── 3. Минимум → Add child ──────────────────────────────────────────────────
{
  await page.locator('#field-first_name input').first().fill(KID.first)
  await page.locator('#field-last_name input').first().fill(KID.last)
  await page.locator('#field-birthday input').first().fill(KID.bday)
  const roomSel = page.locator('#field-classroom_id select').first()
  const roomOpts = await roomSel.locator('option').allTextContents()
  await roomSel.selectOption({ index: roomOpts.findIndex(t => t && !/select|—/i.test(t)) })
  await page.locator('#field-date_in input').first().fill('2026-08-05')
  await page.waitForTimeout(900)
  const dedup = await page.locator('[data-dedup="1"]').count()
  dedup === 0 ? ok('на новом имени подсказки о двойнике нет') : bad('дедуп', 'подсказка на новом имени')

  // И обратная сторона: на имени ребёнка, который в этом центре ЕСТЬ, подсказка
  // поднимается — дедуп живёт и в карточке, а не только в старом коротком окне.
  await page.locator('#field-first_name input').first().fill('Keytest')
  await page.locator('#field-last_name input').first().fill('ZZSMOKE')
  await page.waitForTimeout(1200)
  const hit = await page.locator('[data-dedup="1"]').count()
  const hitTxt = hit ? (await page.locator('[data-dedup="1"]').innerText()).replace(/\s+/g, ' ').trim() : ''
  hit === 1 ? ok(`дедуп в карточке работает — «${hitTxt.slice(0, 80)}»`) : bad('дедуп', 'на существующем имени подсказки нет')
  // возвращаем имя нового ребёнка
  await page.locator('#field-first_name input').first().fill(KID.first)
  await page.locator('#field-last_name input').first().fill(KID.last)
  await page.waitForTimeout(700)

  // МОЛОКО БОЛЬШЕ НЕ СПРАШИВАЮТ (канон 05.08): оно считается из ДР. Проверяем,
  // что строка расчёта стоит и живо меняется при смене даты рождения.
  await page.getByRole('button', { name: /CACFP/ }).first().click()
  await page.waitForTimeout(900)
  const milkRow = page.locator('#field-milk_kind')
  const line1 = (await milkRow.innerText()).replace(/\s+/g, ' ').trim()
  const byAge = /by age/.test(line1)
  byAge ? ok(`молоко — строка-расчёт: «${line1.split('Medical')[0].trim()}»`)
        : bad('молоко', `строки расчёта нет: ${line1.slice(0, 80)}`)
  const noSelect = await page.locator('#field-milk_kind select').count()
  noSelect === 0 ? ok('выбора молока в карточке нет — только расчёт') : bad('молоко', 'select всё ещё стоит')
  // меняем ДР на младенческую и смотрим, что расчёт пересчитался
  await page.getByRole('button', { name: /Profile/ }).first().click()
  await page.waitForTimeout(700)
  await page.locator('#field-birthday input').first().fill('2026-03-01')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /CACFP/ }).first().click()
  await page.waitForTimeout(700)
  const line2 = (await milkRow.innerText()).replace(/\s+/g, ' ').trim()
  const recalced = /Formula · 0 oz/.test(line2)
  recalced ? ok('смена ДР пересчитала строку: Formula · 0 oz')
           : bad('пересчёт', `строка не изменилась: ${line2.slice(0, 60)}`)
  // возвращаем настоящую дату
  await page.getByRole('button', { name: /Profile/ }).first().click()
  await page.waitForTimeout(700)
  await page.locator('#field-birthday input').first().fill(KID.bday)
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, 'manual-min-filled.png'), fullPage: false })

  await page.getByRole('button', { name: /Add child/i }).last().click()
  await page.waitForTimeout(4500)
  const body = await page.locator('body').innerText()
  const refusal = /NOTHING WAS SAVED[^\n]*/.exec(body)?.[0] ?? ''
  !body.includes('NOT SAVED YET')
    ? ok('ребёнок записан — карточка перестала быть черновиком')
    : bad('запись', `карточка всё ещё черновик${refusal ? ' · ' + refusal : ''}`)
  await page.screenshot({ path: path.join(SHOTS, 'manual-saved-card.png'), fullPage: false })
}

// ─── 4. Медицинская замена: сохраняется и показывается вместо расчёта ────────
// Карточка после записи остаётся открытой на созданной строке — этим и пользуемся,
// чтобы не ходить по списку: навигация здесь не предмет пробы.
{
  await page.getByRole('button', { name: /CACFP/ }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  const toggle = page.locator('[data-milk-sub="1"]').first()
  if (!(await toggle.count())) bad('медзамена', 'переключателя нет')
  else {
    // Переключатель ПРОИЗВОДНЫЙ от значения: клик только открывает ввод, а
    // отмеченным он станет, когда будет сказано, чем заменено. Поэтому click,
    // а не check — check ждал бы отметки, которой по замыслу ещё нет.
    await toggle.click()
    await page.waitForTimeout(700)
    const subField = page.locator('#field-substitute_milk input').first()
    const appeared = await subField.count()
    appeared === 1 ? ok('включение замены открыло поле «чем заменено»') : bad('медзамена', 'поля замены нет')
    if (appeared) {
      await subField.fill('Soy (lactose intolerance)')
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: /^✓ Save$|Save$/ }).last().click().catch(() => {})
      await page.waitForTimeout(4500)
      const row = (await page.locator('#field-milk_kind').innerText()).replace(/\s+/g, ' ').trim()
      const shown = row.includes('Soy') && row.includes('medical substitution')
      shown ? ok('замена показана вместо расчёта') : bad('медзамена', `в строке нет замены: ${row.slice(0, 90)}`)
      const stillByAge = /by age/.test(row)
      !stillByAge ? ok('расчёт по возрасту уступил место замене') : bad('медзамена', 'строка всё ещё показывает расчёт')
      await page.screenshot({ path: path.join(SHOTS, 'milk-substitution.png'), fullPage: false })

      // И то же самое в базе — через живую сессию, тем же источником, что читает сетка.
      const env2 = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n')
        .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
      const tok = await page.evaluate(() => {
        const raw = localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-')) ?? '')
        return raw ? JSON.parse(raw).access_token : null
      })
      const rr = await fetch(`${env2.VITE_SUPABASE_URL}/rest/v1/v_meal_grid?center_id=eq.${ZZ_ID}&select=child_name,milk_label,oz`, {
        headers: { apikey: env2.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${tok}`, 'Accept-Profile': 'menumaker' },
      })
      const grid2 = rr.ok ? await rr.json() : []
      const mine = grid2.find(g => String(g.child_name).includes(KID.first))
      mine && String(mine.milk_label).includes('Soy')
        ? ok(`сетка питания показывает замену: ${mine.child_name} · ${mine.milk_label} · ${mine.oz} oz`)
        : bad('сетка', `замена не дошла до сетки: ${mine ? mine.milk_label : 'строки нет'}`)
    }
  }
}

// ─── 5. Ребёнок в ростере и в сетке питания ──────────────────────────────────
{
  await page.keyboard.press('Escape').catch(() => {})
  await page.goto(`${APP}/center/${ZZ_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  // Комнаты в карточном виде свёрнуты: имя лежит внутри. Разворачиваем — иначе
  // проба прочитает пустоту и объявит провал там, где его нет.
  await page.getByText('Demo Room', { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(1500)
  const rosterTxt = await page.locator('body').innerText()
  rosterTxt.includes(KID.last) ? ok(`${KID.last} ${KID.first} стоит в ростере центра`)
                               : bad('ростер', 'ребёнка нет в списке комнаты')
  await page.screenshot({ path: path.join(SHOTS, 'manual-in-roster.png'), fullPage: false })

  // СЕТКА ПИТАНИЯ. ZZ Demo — не центр питания, экрана счёта у него нет; читаем
  // ТОТ ЖЕ источник, из которого экран его строит, — `v_meal_grid`, живой сессией.
  const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-')) ?? '')
    return raw ? JSON.parse(raw).access_token : null
  })
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/v_meal_grid?center_id=eq.${ZZ_ID}&select=child_name,age_group_food,milk_label,oz`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Accept-Profile': 'menumaker' },
  })
  const grid = r.ok ? await r.json() : []
  const row = grid.find(g => String(g.child_name).includes(KID.last))
  row ? ok(`и в сетке питания: ${row.child_name} · ${row.age_group_food} · ${row.milk_label} · ${row.oz} oz`)
      : bad('сетка питания', `ребёнка нет в v_meal_grid (строк у центра: ${grid.length}, HTTP ${r.status})`)
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
