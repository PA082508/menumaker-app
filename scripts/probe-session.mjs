// probe-session.mjs — жив ли профиль ./.demo-profile (читающая проба, ничего не пишет).
import { chromium } from 'playwright'
import path from 'node:path'

const PROD = process.env.PROD_ORIGIN || 'https://menumaker-app.vercel.app'
const ctx = await chromium.launchPersistentContext(path.resolve('./.demo-profile'), {
  headless: true, viewport: { width: 1400, height: 1000 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') console.log('   console:', m.text().slice(0, 160)) })
await page.goto(PROD, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(15000)
console.log('url:', page.url())
console.log('title:', await page.title())
const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
console.log('текст:', body)
const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sb-')))
console.log('ключи сессии:', keys.join(', ') || '(нет)')
const exp = await page.evaluate((k) => {
  const raw = k ? localStorage.getItem(k) : null
  try { return raw ? JSON.parse(raw).expires_at : null } catch { return 'unparsed' }
}, keys[0] ?? null)
console.log('expires_at:', exp, exp ? `(${new Date(exp * 1000).toISOString()})` : '')
await page.screenshot({ path: './smoke-out/probe-prod.png' })
await ctx.close()
