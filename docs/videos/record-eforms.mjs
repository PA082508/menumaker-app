// record-eforms.mjs — FULLY-AUTOMATED drive + recorder for "E-Forms for Directors".
// Playwright performs every click itself; you only log in, then hands-off.
//
//   node docs/videos/record-eforms.mjs login      # phase 1: you log in once (saves the session)
//   node docs/videos/record-eforms.mjs rehearse    # (I run this) headless dry-run, validates selectors, NO Approve, NO video
//   node docs/videos/record-eforms.mjs record      # headed, records 1280x800, auto-drives ALL beats incl. Approve
//
// Beats are the CURRENT UI (the Jul-15 shot-list predates the no-checkbox Add-Child modal):
//   01 open Add Child   02 select Starter   06 enlarge a per-form QR   (03-04 storefront & 07-08 phone = composited in post)
//   09 Enrollment -> open "Emma Carter" -> Approve   10a roster search "Emma Carter"   10b Staff door
// Holds land ONLY on name-safe screens; the wide roster (teacher-name column) is passed through fast.

import { chromium } from 'playwright'
import readline from 'node:readline'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MODE = (process.argv[2] || 'record').toLowerCase()
const PROD = 'https://menumaker-app.vercel.app'
const OUT = join(homedir(), 'Downloads', 'eforms-vo')
const RAW = join(OUT, 'raw')
const PROFILE = join(OUT, '.pwprofile')
mkdirSync(RAW, { recursive: true })

const ask = (q) => new Promise((r) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a) }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

// A visible fake cursor (recordVideo does not capture the OS cursor).
const CURSOR_INIT = `() => {
  const add = () => { if (document.getElementById('__cur')) return;
    const d = document.createElement('div'); d.id = '__cur';
    Object.assign(d.style, { position:'fixed', zIndex:2147483647, width:'22px', height:'22px', left:'-40px', top:'-40px',
      pointerEvents:'none', transition:'left .10s linear, top .10s linear',
      background:"center/contain no-repeat url(\\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M2 1l6 17 3-7 7-3z' fill='%23111' stroke='white' stroke-width='1.5'/></svg>\\")" });
    document.body.appendChild(d);
    addEventListener('mousemove', e => { d.style.left = e.clientX+'px'; d.style.top = e.clientY+'px' }, true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
}`

async function hoverCenter(page, locator, steps = 26) {
  await locator.first().waitFor({ state: 'visible', timeout: 9000 })
  const b = await locator.first().boundingBox()
  if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps }); await sleep(450) }
}
async function isLoggedIn(page) {
  await page.goto(PROD + '/children', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await sleep(1500)
  return !/\/login/.test(page.url())
}

// The beats. `live` = true → actually click Approve (record); false → validate only (rehearse).
async function runBeats(page, { live }) {
  const results = []
  const beat = async (name, fn) => { try { await fn(); results.push(['✓', name]); log('  ✓', name) } catch (e) { results.push(['✗', name + ' — ' + (e.message || e).split('\n')[0]]); log('  ✗', name, '—', (e.message || e).split('\n')[0]) } }

  await beat('01 open Add Child modal', async () => {
    await page.goto(PROD + '/children', { waitUntil: 'domcontentloaded' }); await sleep(1200)
    const btn = page.getByRole('button', { name: /Add Child/i })
    await hoverCenter(page, btn); await btn.click()
    await page.getByText(/Add Child — enrollment packet/i).waitFor({ state: 'visible', timeout: 9000 })
    await sleep(2500)
  })
  await beat('02 select Starter set', async () => {
    const starter = page.getByText('Starter', { exact: false }).first()
    await hoverCenter(page, starter); await starter.click(); await sleep(1800)
  })
  await beat('06 show a packet QR', async () => {
    const qr = page.locator('[title="Scan / share"]').last() // whole-set QR at the bottom of the modal
    try {
      await hoverCenter(page, qr); await qr.click({ timeout: 4000 })
      await page.locator('canvas').last().waitFor({ state: 'visible', timeout: 4000 }); await sleep(2500)
      // The QR popup closes on its own "Close" (rendered last) or an overlay click.
      const close = page.getByRole('button', { name: /^Close$/ }).last()
      if (await close.count()) await close.click({ timeout: 2000 }).catch(() => {})
      await page.mouse.click(60, 60).catch(() => {}) // overlay click as a fallback
      await sleep(400)
    } catch { await sleep(1200) }
  })
  await beat('close Add Child', async () => {
    const x = page.getByRole('button', { name: 'Close' }).first()
    if (await x.count()) await x.click().catch(() => {})
    await page.keyboard.press('Escape').catch(() => {}); await sleep(600)
  })
  await beat('09 open Emma Carter in Enrollment', async () => {
    await page.goto(PROD + '/enrollment-inbox?from=children', { waitUntil: 'networkidle' }); await sleep(2500)
    const card = page.getByText(/Emma Carter/).first()
    await card.waitFor({ state: 'visible', timeout: 15000 })
    await hoverCenter(page, card)
    const review = page.getByRole('button', { name: /^Review$/ }).first()
    await hoverCenter(page, review); await review.click()
    await page.getByRole('button', { name: /Approve/ }).first().waitFor({ state: 'visible', timeout: 9000 })
    await sleep(2000)
  })
  await beat(live ? '09b APPROVE (live)' : '09b locate Approve (dry)', async () => {
    const approve = page.getByRole('button', { name: /Approve/ }).first()
    await hoverCenter(page, approve)
    if (!live) { log('     (dry-run: NOT clicking Approve — seed preserved)'); return }
    page.on('dialog', (d) => d.accept().catch(() => {})) // anti-misclick window.confirm
    await approve.click()
    // possible "Approve with warnings?" modal
    const confirm = page.getByRole('button', { name: /Approve|Yes|Confirm/i })
    await sleep(800); if (await confirm.count()) await confirm.first().click().catch(() => {})
    await sleep(2500)
  })
  await beat('10a roster search "Emma Carter"', async () => {
    await page.goto(PROD + '/children', { waitUntil: 'domcontentloaded' }); await sleep(1000)
    const search = page.getByPlaceholder(/Search active/i).first()
    await hoverCenter(page, search); await search.click(); await search.type('Emma Carter', { delay: 70 })
    await sleep(2500)
  })
  await beat('10b Staff door (best-effort)', async () => {
    await page.goto(PROD + '/enrollment-inbox?from=staff', { waitUntil: 'domcontentloaded' }); await sleep(2000)
  })
  return results
}

// ── Modes ────────────────────────────────────────────────────────────────────
if (MODE === 'login') {
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1280, height: 800 } })
  const p = ctx.pages()[0] ?? await ctx.newPage()
  await p.goto(PROD + '/login').catch(() => {})
  await ask('\n→ Log in as the RIDGE director, land on the app (pick Ridge), then press ENTER… ')
  await ctx.close(); log('\n✅ Session saved to the profile. Now run:  node docs/videos/record-eforms.mjs record\n'); process.exit(0)
}

if (MODE === 'rehearse') {
  log('REHEARSE (headless, no video, no Approve) — validating selectors on the saved session…')
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1280, height: 800 } })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  if (!(await isLoggedIn(page))) { log('✗ Not logged in (session expired). Run `login` first.'); await ctx.close(); process.exit(2) }
  const res = await runBeats(page, { live: false })
  await ctx.close()
  const bad = res.filter((r) => r[0] === '✗')
  log(`\nRehearsal: ${res.length - bad.length}/${res.length} beats OK.` + (bad.length ? '  Fix: \n  ' + bad.map((b) => b[1]).join('\n  ') : '  All selectors resolve.'))
  process.exit(bad.length ? 1 : 0)
}

// MODE === 'record'
{
  // Phase A (no video): ensure logged in without recording the login.
  const warm = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1280, height: 800 } })
  const wp = warm.pages()[0] ?? await warm.newPage()
  const authed = await isLoggedIn(wp)
  if (!authed) { await wp.goto(PROD + '/login').catch(() => {}); await ask('\n→ Not logged in. Log in as the Ridge director, then press ENTER… ') }
  await warm.close()

  // Phase B (recording): reuse the now-authed profile, auto-drive hands-off.
  log('\n=== RECORDING (1280×800). Hands off — the script drives everything. ===')
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false, viewport: { width: 1280, height: 800 },
    recordVideo: { dir: RAW, size: { width: 1280, height: 800 } },
  })
  await ctx.addInitScript(CURSOR_INIT)
  const page = ctx.pages()[0] ?? await ctx.newPage()
  await runBeats(page, { live: true })
  await sleep(800)
  await ctx.close() // finalizes the webm
  log(`\n✅ Raw saved under ${RAW} (newest .webm). Hand it back for VO + subtitles + mux.\n`)
  process.exit(0)
}
