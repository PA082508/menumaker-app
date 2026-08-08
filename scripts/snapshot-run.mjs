// snapshot-run.mjs — добор «замороженных снимков» и сверка образца.
//
// Три режима:
//   --view "Aaron Broadwater"     открыть снимок глазами (сверка 1:1 с form_data)
//   --child "Имя Фамилия"         сделать снимок одному
//   --all scripts/.snapshot-todo.json   пройти список
//
// ПОЧЕМУ ЧЕРЕЗ БРАУЗЕР. Снимок делает КЛИЕНТ: реплика бланка рисуется офскрин,
// html2canvas снимает страницы, единственный писатель — edge-функция
// `enrollment-snapshot`. Второй писатель означал бы второй способ получить
// «официальную копию», то есть две разные правды. Скрипт жмёт ту же кнопку,
// что и человек.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out/snapshot-run')
const args = process.argv.slice(2)
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const viewName = argOf('--view')
const oneName = argOf('--child')
const allFile = argOf('--all')

fs.mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(...a)

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, viewport: { width: 1500, height: 1050 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()

await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
if (!Object.keys(store).some(k => k.startsWith('sb-'))) {
  console.error('НЕТ сессии в .demo-profile'); process.exit(2)
}
await page.goto(APP + '/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(async () => {
  try {
    const rs = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(rs.map(r => r.unregister()))
    const keys = await caches?.keys?.() ?? []
    await Promise.all(keys.map(k => caches.delete(k)))
  } catch { /* нет SW — тем лучше */ }
})
await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) }, store)

let currentCenter = null
async function pickCenter(center) {
  if (currentCenter === center) return
  await page.getByText('Organization', { exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(700)
  await page.getByText(new RegExp(center), { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(3000)
  await page.keyboard.press('Escape').catch(() => {})
  currentCenter = center
}

/** Открыть карточку ребёнка: поиск по фамилии → «⚙ Settings» ЕГО плитки. */
async function openCard(name) {
  const parts = name.split(' ')
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0]
  const search = page.getByPlaceholder(/Search active/i).first()
  await search.waitFor({ timeout: 30000 })
  await search.fill('')
  await search.fill(last)
  await page.waitForTimeout(2200)
  const rev = parts.slice().reverse().join('\\s+')
  const tile = page.locator('div')
    .filter({ hasText: new RegExp(`${rev}|${name.replace(/\s+/g, '\\s+')}`, 'i') })
    .filter({ has: page.getByRole('button', { name: /Settings/i }) }).last()
  await tile.getByRole('button', { name: /Settings/i }).first().click({ timeout: 20000 })
  await page.waitForTimeout(4500)
  await page.getByRole('button', { name: /Documents/i }).first().click({ timeout: 15000 })
  await page.waitForTimeout(3000)
}

async function closeCard() {
  await page.getByRole('button', { name: /^Close$/ }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(600)
}

// ─── режим сверки: показать снимок глазами ──────────────────────────────────
if (viewName) {
  await page.goto(APP + '/children', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await pickCenter(process.env.CENTER || 'Wickliffe')
  await openCard(viewName)
  await page.getByRole('button', { name: /View original form/i }).first().click({ timeout: 20000 })
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${SHOTS}/view-${viewName.replace(/\s+/g, '_')}.png`, fullPage: true })
  log(`снимок открыт глазами: ${SHOTS}/view-${viewName.replace(/\s+/g, '_')}.png`)
  await ctx.close()
  process.exit(0)
}

// ─── режим прогона ──────────────────────────────────────────────────────────
const todo = allFile
  ? JSON.parse(fs.readFileSync(path.resolve(allFile), 'utf8'))
  : [{ child_name: oneName, center: process.env.CENTER || 'Wickliffe' }]

await page.goto(APP + '/children', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)

const done = [], skipped = [], failed = []
for (const [i, t] of todo.entries()) {
  const label = `${i + 1}/${todo.length} ${t.child_name} (${t.center})`
  try {
    await pickCenter(t.center)
    await openCard(t.child_name)
    const btn = page.getByRole('button', { name: /Create snapshot/i }).first()
    if (await btn.count() === 0) {
      const has = await page.getByText(/Snapshot on file/i).count()
      log(`  · ${label} — кнопки нет (${has ? 'снимок уже есть' : 'нет одобренной формы на вкладке'})`)
      skipped.push(t.child_name)
    } else {
      await btn.click()
      await page.waitForTimeout(18000)
      const okNow = await page.getByText(/Snapshot on file/i).count()
      if (okNow > 0) { log(`  ✓ ${label}`); done.push(t.child_name) }
      else { log(`  ✗ ${label} — после захвата «Snapshot on file» не появилось`); failed.push(t.child_name) }
    }
  } catch (e) {
    log(`  ✗ ${label} — ${String(e).slice(0, 90)}`)
    failed.push(t.child_name)
  }
  await closeCard()
}

log(`\nИТОГ: снято ${done.length} · пропущено ${skipped.length} · не вышло ${failed.length}`)
if (failed.length) log(`не вышло: ${failed.join(', ')}`)
await ctx.close()
