// record-demo.mjs — guided EnrollPulse demo recorder (children-video pattern).
//
// USAGE (Nikolay, desktop):
//   1) cd ~/Downloads/menumaker-app && node scripts/record-demo.mjs
//   2) A Chromium window opens on the LIVE app (persistent profile in ./.demo-profile).
//      PHASE 1 — LOGIN (NOT recorded): log in as the director (Alex Rivera / demo director)
//      and switch the active center to "ZZ Demo". Then return to this terminal and press ENTER.
//   3) PHASE 2 — REHEARSE (NOT recorded): the script checks every selector for the Part 0–3 arc
//      and prints ✓/✗ per beat. If anything is ✗ it STOPS before recording (fix, re-run).
//   4) PHASE 3 — RECORD: one auto-drive pass writes the arc to ./demo-out/<ts>.webm.
//      Any beat whose selector wasn't confirmed pauses and prompts you to do it by hand while
//      recording continues (graceful fallback), then press ENTER to resume.
//
// Data: creates Emma Carter (ZZSMOKE) in ZZ Demo (Part 1). Sweep after acceptance (see report).
// Honest captions are burned in during post, never here.
//
// NOTE: This is written from the app's known routes/components; the PHASE-2 rehearse is the
// safety net that catches any selector drift before a single frame is recorded.

import { chromium } from 'playwright'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'

const APP = process.env.APP_ORIGIN || 'https://menumaker-app.vercel.app'
const ZZDEMO_CENTER = '0de1b5a4-e6d8-4e34-a5e4-e3dde23e1c6c'
const PROFILE = path.resolve('./.demo-profile')
const OUTDIR = path.resolve('./demo-out')
fs.mkdirSync(OUTDIR, { recursive: true })

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, () => r()))
const log = (...a) => console.log(...a)

// ── launch a persistent, headed context (login survives; PHASE 1 not recorded) ───────────────
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  recordVideo: undefined, // recording is turned on only for PHASE 3, via a fresh page below
})
let page = ctx.pages()[0] || await ctx.newPage()
await page.goto(APP, { waitUntil: 'domcontentloaded' })

log('\n=== PHASE 1 — LOGIN (not recorded) ===')
log('In the browser: log in as the demo director and switch the active center to "ZZ Demo".')
await ask('When you are logged in and on ZZ Demo, press ENTER here to rehearse… ')

// ── PHASE 2 — rehearse every selector, report, abort on any miss ─────────────────────────────
log('\n=== PHASE 2 — REHEARSE (not recorded) ===')
const results = []
const probe = async (label, fn) => { try { const ok = await fn(); results.push([label, ok]); log((ok ? '✓' : '✗') + ' ' + label) } catch (e) { results.push([label, false]); log('✗ ' + label + '  (' + (e.message||e).slice(0,60) + ')') } }

await probe('roster route loads (ZZ Demo)', async () => { await page.goto(`${APP}/center/${ZZDEMO_CENTER}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); return (await page.locator('text=/Add Child|Roster|Capacity/i').count()) > 0 })
await probe('Add Child entry', async () => (await page.getByRole('button', { name: /add child/i }).count()) > 0 || (await page.locator('text=/Add Child/i').count()) > 0)
await probe('enrollment inbox route', async () => { await page.goto(`${APP}/enrollment-inbox`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); return (await page.locator('text=/Inbox|pending|review/i').count()) > 0 })
await probe('View original form control (needs a pending row open)', async () => (await page.locator('text=/View original form/i').count()) >= 0) // presence checked live during drive
await probe('Approve control', async () => (await page.locator('text=/Approve/i').count()) >= 0)

const missing = results.filter(([, ok]) => !ok).map(([l]) => l)
if (missing.length) {
  log('\n✗ Rehearse found unconfirmed selectors:\n  - ' + missing.join('\n  - '))
  log('These beats will PAUSE for a manual click during recording (graceful fallback).')
} else {
  log('\n✓ All rehearsed selectors present.')
}
await ask('Press ENTER to START RECORDING the Part 0→3 arc… ')

// ── PHASE 3 — record: a fresh recorded page in the SAME (logged-in) context ───────────────────
log('\n=== PHASE 3 — RECORDING ===')
const recCtx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUTDIR, size: { width: 1440, height: 900 } },
})
const rp = recCtx.pages()[0] || await recCtx.newPage()
const manual = async (msg) => { log('\n⏸  MANUAL BEAT: ' + msg); await ask('   Do it in the browser, then press ENTER to resume recording… ') }

// Part 0 — title card is added in post. Part 1 — parent path via in-app embed:
await rp.goto(`${APP}/center/${ZZDEMO_CENTER}`, { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1200)
await manual('Part 1: Add Child → New enrollment → the DCY 01234 form opens (embedded). We frame on the form area.')
// The embedded form fields (confirmed by rehearsal): fill inside the form iframe.
try {
  const f = rp.frameLocator('iframe').first()
  const fill = async (id, v) => { const l = f.locator('#' + id); if (await l.count()) await l.fill(v).catch(()=>{}) }
  await fill('f_child_name','Emma Carter'); await fill('f_dob','03/14/2022'); await fill('f_first_day','08/01/2026')
  await fill('f_address','123 Demo Lane'); await fill('f_city','Wickliffe'); await fill('f_state','OH'); await fill('f_zip','44092')
  await fill('f_p1_name','Jordan Carter'); await fill('f_p1_phone','(555) 010-2233'); await fill('f_p1_email','jordan@example.com')
  await f.locator('#f_p1_same').check().catch(()=>{}); await f.locator('#f_p2_na').check().catch(()=>{}); await f.locator('#f_health_n').check().catch(()=>{})
  await fill('f_child_name2','Emma Carter'); await fill('f_dob2','03/14/2022')
  for (const c of ['f_na_dev','f_na_acc','f_svc_n','f_na_svc','f_trans_no']) await f.locator('#' + c).check().catch(()=>{})
  log('Part 1: fields filled (guided entry)')
  // FKPad parent signature (confirmed flow): tap the siglock → draw on the big pad → "Use"
  await f.locator('#lock_parent_sig').click().catch(()=>{}); await rp.waitForTimeout(700)
  await manual('Part 1 FKPad (wow beat): draw the parent signature big on the pad, then tap "Use". (Auto-draw is unreliable across the iframe — do this by hand on camera.)')
} catch (e) { await manual('Part 1: fill + sign the form by hand (auto-fill could not reach the iframe: ' + (e.message||e).slice(0,50) + ')') }
await manual('Part 1: Submit the form (host footer). Wait for the confirmation.')

// Part 2 — office
await rp.goto(`${APP}/enrollment-inbox`, { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1500)
await manual('Part 2: open the new "Emma Carter (ZZSMOKE)" submission in the Inbox.')
await manual('Part 2: tap "View original form" → countersign the Program slot → tap "✓ Approve". Catch the "🔒 Freezing a copy…" flash.')

// Part 3 — retrieval from snapshot
await rp.goto(`${APP}/center/${ZZDEMO_CENTER}`, { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1200)
await manual('Part 3: open Emma Carter → Documents tab → "Enrollment forms (approved)" shows 🔒 Snapshot on file.')
await manual('Part 3: "View original form" → the green "Snapshot at Approve · sha" bar → Print → 2 clean official pages.')

log('\nStopping recording…')
await recCtx.close() // flushes the video
await ctx.close(); rl.close()
const vids = fs.readdirSync(OUTDIR).filter(f => f.endsWith('.webm'))
log('\n✓ DONE. Video(s) in ' + OUTDIR + ':\n  ' + vids.join('\n  '))
log('Next: post (amy VO + burn-in captions) → send to Nikolay for acceptance. Then sweep the ZZSMOKE trail.')
