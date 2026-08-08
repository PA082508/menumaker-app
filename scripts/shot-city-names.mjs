// shot-city-names.mjs — читающий снимок: центры зовутся городами (канон 08.08).
// Ничего не пишет. Смотрит вкладки центров на странице детей — там кличка была
// видна прямее всего («Ridge · Alpha · Pearl»).
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const APP = process.env.APP_ORIGIN || 'http://localhost:4173'
const SHOTS = path.resolve(process.env.SHOTS || './smoke-out/city-names')
fs.mkdirSync(SHOTS, { recursive: true })

const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, viewport: { width: 1400, height: 1000 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(12000)
const store = await page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
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

await page.goto(APP + '/children', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const nick = text.match(/\b(Ridge|Pearl|Alpha)\b/g) ?? []
const city = ['Wickliffe', 'Highland Heights', 'Parma Heights'].filter(c => text.includes(c))
console.log(`города на экране: ${city.join(' · ') || '(нет)'}`)
console.log(`клички на экране: ${nick.length ? [...new Set(nick)].join(' · ') : '(нет)'}`)
await page.screenshot({ path: `${SHOTS}/children-tabs.png` })
console.log(`снимок: ${SHOTS}/children-tabs.png`)
await ctx.close()
process.exit(nick.length ? 1 : 0)
