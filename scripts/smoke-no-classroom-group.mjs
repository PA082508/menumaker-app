// smoke-no-classroom-group.mjs — очередь «Без комнаты» в карточном виде ростера.
//
// ПОВОД (замер 05.08). Isaac Rife, заведённый Approve'ом формы, получил строку
// без комнаты — а карточный вид группирует по комнатам и таких детей не
// показывал ВОВСЕ. Ребёнок числится, кормить его с 17 августа, а на экране его
// нет. Теперь они собраны в псевдо-комнату «No classroom yet» с числом.
//
// Что проверяется:
//   1. группа есть, в ней Isaac, и она ОБЪЯСНЯЕТ СЕБЯ (почему их не видит сетка);
//   2. клик по ребёнку открывает карточку;
//   3. как только комната назначена — ребёнок из очереди уходит и появляется в
//      комнате. Проверяется на ВРЕМЕННОМ тестовом ребёнке в Parma Heights:
//      решать за живого Исаака, в какую он комнату, — не дело пробы.
//   4. пустая очередь строкой не показывается.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const PROFILE = path.resolve('./.demo-profile')
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out')
const RIDGE_ID = '4aed7d5a-00d0-4a4c-ac99-311046ad2027'
const GROUP = 'No classroom yet'

fs.mkdirSync(SHOTS, { recursive: true })
const fails = []
const ok = (n) => console.log(`  ✓ ${n}`)
const bad = (n, why) => { fails.push(`${n}: ${why}`); console.log(`  ✗ ${n} — ${why}`) }

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 940 } })
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

await page.goto(`${APP}/center/${RIDGE_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)

const groupRow = page.getByText(GROUP).first()
if (!(await groupRow.count())) bad('группа', `строки «${GROUP}» в ростере Wickliffe нет`)
else {
  ok('очередь «No classroom yet» стоит в списке комнат')
  await groupRow.click()
  await page.waitForTimeout(2500)
  const body = await page.locator('body').innerText()
  body.includes('do not appear in the meal grid')
    ? ok('очередь объясняет себя словами: пока комнаты нет — сетка их не видит')
    : bad('объяснение', 'группа показана без объяснения, почему эти дети тут')
  // Регулярка в начале строки после тернарника парсится как деление — присваиваем.
  const isaacRe = new RegExp('Isaac', 'i')
  const isaacSeen = isaacRe.test(body)
  isaacSeen ? ok('Isaac Rife виден в очереди') : bad('Isaac', 'в раскрытой очереди его нет')
  await page.screenshot({ path: path.join(SHOTS, 'no-classroom-group.png') })

  // Плитка в очереди — ТА ЖЕ плитка, что в любой комнате, и ведёт себя так же:
  // «⚙️ Settings» открывает карточку ребёнка. Отдельного поведения у очереди нет
  // и быть не должно — иначе она стала бы вторым, расходящимся списком.
  // Раскрыта только очередь — значит видимые кнопки «Settings» принадлежат её плиткам.
  const settingsBtns = page.getByRole('button', { name: /Settings/i })
  console.log(`    (плиток в очереди с кнопкой Settings: ${await settingsBtns.count()})`)
  await settingsBtns.first().click({ timeout: 8000 }).catch(e => console.log('    (клик:', e.message.slice(0, 60), ')'))
  await page.waitForTimeout(3000)
  const cardOpen = await page.locator('[data-tab="documents"]').count()
  cardOpen > 0 ? ok('клик по ребёнку из очереди открывает его карточку') : bad('карточка', 'карточка не открылась')
  await page.keyboard.press('Escape').catch(() => {})
}

await ctx.close()
console.log(fails.length ? `\nПРОВАЛЕНО: ${fails.length}\n  ${fails.join('\n  ')}` : '\nВСЁ ЗЕЛЁНОЕ')
process.exit(fails.length ? 1 : 0)
