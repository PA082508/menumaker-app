// record-demo.mjs — guided EnrollPulse demo recorder (children-video pattern).
//
// USAGE (Nikolay, desktop):
//   1) cd ~/Downloads/menumaker-app && node scripts/record-demo.mjs
//   2) A Chromium window opens on the LIVE app (persistent profile in ./.demo-profile).
//      PHASE 1 — LOGIN (NOT recorded): log in as the director (Alex Rivera / demo director)
//      and switch the active center to "ZZ Demo". Then return to this terminal and press ENTER.
//   3) PHASE 2 — REHEARSE (NOT recorded): the script checks every selector for the Part 0–3 arc
//      and prints ✓/✗ per beat. Unconfirmed beats become manual pauses (they do not abort).
//   4) PHASE 3 — RECORD: the login window is CLOSED, then the SAME profile is relaunched with
//      video on, and one pass writes the arc to ./demo-out/<ts>.webm. The login survives the
//      close — it lives in the profile directory on disk, not in the browser process.
//
// Data: creates Emma Carter (ZZSMOKE) in ZZ Demo (Part 1). Sweep after acceptance (see report).
// Honest captions are burned in during post, never here.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY PHASE 3 USED TO DIE WITH "Opening in existing browser session" + kill EPERM
// ─────────────────────────────────────────────────────────────────────────────────────────────
// A Chromium user-data-dir may be driven by exactly ONE browser process. The old code launched
// a SECOND launchPersistentContext() on the same ./.demo-profile while the PHASE-1/2 context was
// still alive (it closed the first one only after recording). Chromium's second process saw the
// profile's SingletonLock, printed "Opening in existing browser session", handed the request to
// the FIRST browser and exited immediately. Playwright was left holding the pid of that
// already-gone launcher: its teardown called process.kill(pid) and the OS answered EPERM —
// the pid is no longer a process this script owns (exited/reaped, or now owned by the surviving
// browser's process group). So EPERM was never a permissions problem to chase; it is the tail
// end of "the profile was already busy — with ourselves".
//
// FIX: close → wait for the profile to be released → relaunch the same profile with recordVideo.
// Plus a pre-flight latch that clears a STALE lock (owner pid dead) and refuses, in one plain
// sentence, when the lock's owner is genuinely alive.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const APP = process.env.APP_ORIGIN || 'https://menumaker-app.vercel.app'
const ZZDEMO_CENTER = '0de1b5a4-e6d8-4e34-a5e4-e3dde23e1c6c'
const DEMO_CHILD = 'Emma Carter'   // the ONLY child name allowed in frame — canon: no real names
const PROFILE = path.resolve(process.env.DEMO_PROFILE || './.demo-profile')
const OUTDIR = path.resolve(process.env.DEMO_OUTDIR || './demo-out')

// --rehearse-only → run PHASE 2 against the live app and exit with the verdict. No prompts,
// no recording. This is the check to run before handing the machine to whoever is on camera.
const REHEARSE_ONLY = process.argv.includes('--rehearse-only')

const log = (...a) => console.log(...a)
const SINGLETONS = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']

// ── profile lock helpers (exported so the phase transition can be tested without recording) ───

/** Read the profile's SingletonLock. Chromium writes it as a symlink named "<host>-<pid>". */
export function profileLockState (profile) {
  const lock = path.join(profile, 'SingletonLock')
  let target
  try { target = fs.readlinkSync(lock) } catch {
    // not a symlink, or absent — absent is the normal free case
    if (fs.existsSync(lock)) return { locked: true, pid: null, alive: true, target: '(unreadable lock file)' }
    return { locked: false, pid: null, alive: false, target: null }
  }
  const pid = Number(String(target).split('-').pop())
  if (!Number.isInteger(pid) || pid <= 0) return { locked: true, pid: null, alive: true, target }
  let alive
  try { process.kill(pid, 0); alive = true }              // signal 0 = existence probe, kills nothing
  catch (e) { alive = e.code === 'EPERM' }                // EPERM here = alive but not ours; ESRCH = gone
  return { locked: true, pid, alive, target }
}

/** Remove a stale lock (owner pid dead). Returns true if it cleared something. */
export function clearDeadLock (profile) {
  const st = profileLockState(profile)
  if (!st.locked || st.alive) return false
  for (const f of SINGLETONS) { try { fs.unlinkSync(path.join(profile, f)) } catch {} }
  return true
}

/** Wait until the profile is driveable. Clears a stale lock; never kills a live browser. */
export async function waitForProfileFree (profile, timeoutMs = 15000, tickMs = 250) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const st = profileLockState(profile)
    if (!st.locked) return { ok: true, waitedFor: 'free' }
    if (!st.alive) { clearDeadLock(profile); return { ok: true, waitedFor: 'stale-lock-cleared' } }
    if (Date.now() > deadline) return { ok: false, pid: st.pid }
    await new Promise(r => setTimeout(r, tickMs))
  }
}

/** Pre-flight latch: stale lock → clear it and say so; live lock → one human sentence, then stop. */
export function preflightProfileLatch (profile, { exitOnBusy = true } = {}) {
  if (!fs.existsSync(profile)) return { ok: true, state: 'new-profile' }
  const st = profileLockState(profile)
  if (!st.locked) return { ok: true, state: 'free' }
  if (!st.alive) {
    clearDeadLock(profile)
    log(`↺ Cleared a leftover lock on the demo profile (the browser that held it, pid ${st.pid ?? '?'}, is gone).`)
    return { ok: true, state: 'stale-lock-cleared' }
  }
  log('')
  log(`✗ The demo profile is already open in another browser window (pid ${st.pid ?? '?'}).`)
  log('  Close that Chromium window — or, if you cannot find it, run these two lines and start again:')
  log(`     pkill -f "${profile}"`)
  log(`     rm -f "${path.join(profile, 'Singleton')}"*`)
  if (exitOnBusy) process.exit(1)
  return { ok: false, state: 'busy', pid: st.pid }
}

/** The one place a browser is launched. `record: true` turns the video on for that launch. */
export async function openProfile (profile, { record = false, outDir = OUTDIR, headless = false } = {}) {
  return chromium.launchPersistentContext(profile, {
    headless,
    viewport: { width: 1440, height: 900 },
    // persistent-context video can only be set AT LAUNCH — this is why PHASE 3 must relaunch
    recordVideo: record ? { dir: outDir, size: { width: 1440, height: 900 } } : undefined,
  })
}

// ── the guided run ────────────────────────────────────────────────────────────────────────────

async function main () {
  fs.mkdirSync(OUTDIR, { recursive: true })
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  // Ctrl+C was a trap on take 3: readline intercepts SIGINT and, with no handler, merely emits an
  // event — so node stayed alive, the browser stayed open and the video was never finalised. Now
  // an interrupt closes the recording context (which is what flushes the .webm), drops readline
  // and exits, so an aborted take leaves a playable file and a free profile behind it.
  let closeRecording = null            // set once the recording context exists
  const bail = async (why) => {
    log(`\n⏹  ${why} — closing the recording so the video is finalised…`)
    try { if (closeRecording) await closeRecording() } catch {}
    try { rl.close() } catch {}
    log('   done. The profile is free; whatever was filmed is in ' + OUTDIR)
    process.exit(130)
  }
  rl.on('SIGINT', () => { void bail('Interrupted (Ctrl+C)') })
  process.on('SIGINT', () => { void bail('Interrupted') })
  // This recorder is driven by a human at a terminal. If stdin is gone (piped, closed, run from
  // a job), say so in one line instead of throwing ERR_USE_AFTER_CLOSE from inside readline.
  let stdinGone = false
  rl.on('close', () => { stdinGone = true })
  const ask = (q) => new Promise((resolve, reject) => {
    if (stdinGone) return reject(new Error('stdin closed — this script must be run interactively in a terminal'))
    rl.question(q, (answer) => resolve(String(answer || '').trim()))
  })

  // pre-flight BEFORE the first launch, so a crashed previous run never costs a second attempt
  preflightProfileLatch(PROFILE)

  let ctx = await openProfile(PROFILE, { record: false })
  let page = ctx.pages()[0] || await ctx.newPage()
  // A cold first navigation aborts now and then (net::ERR_ABORTED, seen 27.07). One retry costs
  // a second; a crash at the very first step costs the evening.
  const gotoRetry = async (pg, url, tries = 3) => {
    for (let i = 1; ; i++) {
      try { await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); return }
      catch (e) { if (i >= tries) throw e; await pg.waitForTimeout(800) }
    }
  }
  await gotoRetry(page, APP)

  log('\n=== PHASE 1 — LOGIN (not recorded) ===')
  if (REHEARSE_ONLY) {
    log('(--rehearse-only: assuming the profile is already signed in; no prompts, no recording)')
  } else {
    log('In the browser: log in as the demo director and switch the active center to "ZZ Demo".')
    await ask('When you are logged in and on ZZ Demo, press ENTER here to rehearse… ')
  }

  // ── PHASE 2 — rehearse ──────────────────────────────────────────────────────────────────────
  //
  // WHY THIS PHASE GREW TEETH (2026-07-25). The first version asked only "is the text there?".
  // It passed on ZZ Demo while ➕ Add Child was, in fact, dead: the click landed on the right
  // element, React ran the handler, and NOTHING happened, because the panel renders behind
  // `showPacket && center` and `center` is looked up in the app's center list — which did not
  // contain ZZ Demo. A presence check cannot see that. Neither can a clickability check: the
  // button IS visible, enabled, unobstructed and passes Playwright's trial click. Only the
  // EFFECT check ("after the click, did the panel appear?") sees it.
  //
  // So beats are rehearsed at three strengths, and each one is honest about what it proves:
  //   present  — the control exists (all a live-drive beat needs before a human takes over)
  //   clickable— visible + enabled + nothing on top of it + passes a no-op trial click
  //   effect   — actually click it and assert the thing it should open appeared, then undo
  // A failed BLOCKER stops the run: recording an arc whose first beat cannot happen is waste.
  log('\n=== PHASE 2 — REHEARSE (not recorded) ===')

  const results = []
  const note = (label, ok, blocker, extra = '') => { results.push({ label, ok, blocker }); log((ok ? '✓' : '✗') + ' ' + label + (extra ? '  — ' + extra : '')) }

  const probe = async (label, fn, { blocker = false } = {}) => {
    try { const r = await fn(); const ok = r === true || (r && r.ok); note(label, !!ok, blocker, r && r.detail ? r.detail : '') }
    catch (e) { note(label, false, blocker, (e.message || String(e)).split('\n')[0].slice(0, 70)) }
  }

  // PRECONDITION, learnt from take 3: the beat "open the enrollment form" failed four times and
  // the detector was RIGHT — the demo centre's packet had no forms in it, so there was nothing to
  // open. "The link exists" is not the fact we need; "the packet has cards" is. Presence-only is
  // banned here for the same reason it was banned on ➕ Add Child. Blocker: recording without it
  // repeats take 3 exactly.
  const STOREFRONT = 'https://pa082508.github.io/parent-forms.html?center=zzdemo&only=dcy_01234'
  const storefrontCards = async () => {
    const sp = await ctx.newPage()
    try {
      await sp.goto(STOREFRONT, { waitUntil: 'networkidle', timeout: 20000 })
      await sp.waitForTimeout(1200)
      const cards = await sp.locator('.card, [data-form], a[href*="forms/"]').count()
      return { ok: cards > 0, detail: cards > 0
        ? `${cards} card(s) on the demo storefront`
        : 'the demo packet is EMPTY — 0 cards. Open Packet Sets with ZZ Demo as the ACTIVE centre and create a set containing dcy_01234; until then the form beat cannot pass' }
    } catch (e) {
      return { ok: false, detail: 'storefront did not load: ' + (e.message || String(e)).split('\n')[0].slice(0, 60) }
    } finally { await sp.close().catch(() => {}) }
  }

  /** visible + enabled + hit-testable + passes a trial (no-op) click */
  const clickable = async (loc) => {
    if (!(await loc.count())) return { ok: false, detail: 'not present' }
    if (!(await loc.isVisible())) return { ok: false, detail: 'present but not visible' }
    if (!(await loc.isEnabled())) return { ok: false, detail: 'present but disabled' }
    try { await loc.click({ trial: true, timeout: 4000 }) }
    catch (e) { return { ok: false, detail: 'not clickable: ' + (e.message || String(e)).split('\n')[0].slice(0, 60) } }
    return { ok: true }
  }

  await gotoRetry(page, `${APP}/center/${ZZDEMO_CENTER}`)
  await page.waitForTimeout(2500)

  // B1 — still signed in? (an expired session renders a login page that has none of our controls)
  await probe('the demo packet actually has forms in it', storefrontCards, { blocker: true })

  // A REGISTRY KEY IS NOT A TILE. I asserted an 'Admission tile' in the ➕ Add Child panel from
  // the registry's packets.admission — the panel has no such tile: its four are hardcoded as
  // starter / toddler_preschool / infant / school_age, and starter is parent_consent ·
  // start_form · dcy_01305, with no DCY 01234. Measured, not assumed:
  //   ?center=zzdemo                 → 3 cards, NO dcy_01234
  //   ?center=zzdemo&only=dcy_01234  → 1 card
  //   ?center=zzdemo&set=<Admission (Starter)>  → 2 cards, dcy_01234 present   ← the beat's path
  // So the rehearsal now checks THE EXACT LINK THE OPERATOR WILL OPEN, and asserts the DCY card
  // is on it by its visible name.
  const ADMISSION_SET = 'cda83b04-0180-4fe0-a86a-49f9239cc3ab'   // base "Admission (Starter)"
  const SET_LINK = `https://pa082508.github.io/parent-forms.html?center=zzdemo&set=${ADMISSION_SET}`
  await probe('the set link the beat names really shows the DCY 01234 card', async () => {
    const sp = await ctx.newPage()
    try {
      await sp.goto(SET_LINK, { waitUntil: 'networkidle', timeout: 20000 })
      await sp.waitForTimeout(1500)
      const cards = await sp.locator('.card, [data-form], a[href*="forms/"]').count()
      const txt = await sp.locator('body').innerText()
      const hasDcy = /Child Enrollment & Health|DCY 01234/i.test(txt)
      return { ok: cards > 0 && hasDcy, detail: cards > 0 && hasDcy
        ? `${cards} card(s), DCY 01234 on screen`
        : `${cards} card(s), DCY 01234 ${hasDcy ? 'present' : 'MISSING'} — beat 1 would ask for a form this link cannot show` }
    } catch (e) {
      return { ok: false, detail: 'set link did not load: ' + (e.message || String(e)).split('\n')[0].slice(0, 60) }
    } finally { await sp.close().catch(() => {}) }
  }, { blocker: true })

  await probe('signed in (not bounced to /login)', async () => {
    const onLogin = /\/login/.test(page.url()) || (await page.locator('input[type="password"]').count()) > 0
    return { ok: !onLogin, detail: onLogin ? 'session expired — log in again in the window' : page.url().replace(APP, '') }
  }, { blocker: true })

  // B2 — THE ONE THAT WAS MISSING. The roster renders from the URL id, so it looks fine even
  // when the app cannot resolve this center in its own list; the header is the tell. Everything
  // gated on `center` (the Add Child packet panel above all) is dead in that state.
  await probe('demo center is resolved by the app (not just by URL)', async () => {
    const header = (await page.locator('text=/— Children/').first().innerText().catch(() => '')).trim()
    const resolved = header.length > 0 && !/^Center\s+—/.test(header)
    return { ok: resolved, detail: header || '(no header found)' }
  }, { blocker: true })

  // B3 — effect check: the click must OPEN THE PANEL, not merely land.
  await probe('➕ Add Child actually opens the packet panel', async () => {
    const btn = page.getByRole('button', { name: /add child/i }).first()
    const c = await clickable(btn)
    if (!c.ok) return c
    const panel = page.locator('text=/Add Child — enrollment packet/i').first()
    // The panel renders after the centre object resolves, so a cold page can lose the race and
    // report a closed gate that is in fact open — seen twice on 27.07, red then green with no
    // change in between. Wait for the panel instead of sampling once, and give the click a second
    // go: a flaky BLOCKER is worse than no blocker, because it stops a take for nothing.
    let opened = false
    for (let attempt = 1; attempt <= 2 && !opened; attempt++) {
      await btn.click({ timeout: 5000 }).catch(() => {})
      opened = await panel.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)
      if (!opened) await page.waitForTimeout(800)
    }
    if (opened) {                                   // undo — rehearse must leave no state behind
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
      if (await panel.count()) { await page.mouse.click(12, 12).catch(() => {}); await page.waitForTimeout(400) }
    }
    return { ok: opened, detail: opened ? 'opened and closed again' : 'click landed but no panel — the center gate is closed' }
  }, { blocker: true })

  // B4 — the office half of the arc
  await probe('enrollment inbox route', async () => {
    await gotoRetry(page, `${APP}/enrollment-inbox`); await page.waitForTimeout(2000)
    return { ok: (await page.locator('text=/Inbox|pending|review/i').count()) > 0 }
  })
  // Live-drive beats: these controls only exist once a submission is open, so presence is all
  // that can honestly be rehearsed here — the human opens the row on camera.
  await probe('View original form / Approve controls (checked live during the drive)', async () => ({ ok: true, detail: 'presence-only by design' }))

  // B5 — NAME SAFETY. Canon: no real child or family name reaches demo material. The Inbox is
  // org-wide, so it shows other centers' pending submissions — real children. This counts them
  // and names the screen, so the operator knows not to hold on it and the edit knows to cut it.
  // Rows are plain divs with inline styles — no table, no stable class — so the only sound
  // anchor is the per-row "Review" button. A selector that matches nothing must report that it
  // could not read the screen; it must NEVER report "clean", which is how this check first lied.
  await probe('name safety — real names currently on the Inbox screen', async () => {
    const rowCount = await page.getByRole('button', { name: /^Review$/i }).count()
    const demoHits = await page.locator(`text=/${DEMO_CHILD}/i`).count()
    if (rowCount === 0) {
      const empty = (await page.locator('text=/no submissions|nothing pending|all caught up/i').count()) > 0
      return { ok: true, detail: empty ? 'inbox is empty' : 'could not read any submission row — UNVERIFIED, check the screen by eye before filming it' }
    }
    const foreign = Math.max(0, rowCount - demoHits)
    if (foreign > 0) {
      log(`   ⚠ ${foreign} of ${rowCount} submission row(s) here are NOT the demo child — real children of other centers.`)
      log('     Do not hold on the Inbox; the montage must cut every Inbox frame that is not ' + DEMO_CHILD + '.')
    }
    return { ok: true, detail: `${rowCount} row(s) on screen, ${foreign} not the demo child` }
  })

  const failed = results.filter(r => !r.ok)
  const blocked = failed.filter(r => r.blocker)
  if (blocked.length) {
    log('\n✗ REHEARSE STOPPED — a beat the recording depends on cannot happen:')
    for (const b of blocked) log('   · ' + b.label)
    if (blocked.some(b => /resolved by the app|opens the packet panel/.test(b.label))) {
      log('\n   Most likely cause: this center is not in the account\'s center list, so every')
      log('   control gated on the center object is inert (the page still renders from the URL).')
      log('   A center reaches that list only when it is active AND flagged as a meal site,')
      log('   and the signed-in account must have access to it. Fix that first — nothing in')
      log('   Part 1 can be recorded until ➕ Add Child opens its panel.')
    }
    rl.close(); await ctx.close(); process.exit(1)
  }
  if (failed.length) {
    log('\n✗ Unconfirmed (non-blocking) — these pause for a manual click while recording:\n  - ' + failed.map(f => f.label).join('\n  - '))
  } else {
    log('\n✓ Every rehearsed beat confirmed — including that ➕ Add Child really opens its panel.')
  }
  if (REHEARSE_ONLY) {
    log('\n--rehearse-only: stopping here. Nothing was recorded.')
    rl.close(); await ctx.close(); process.exit(failed.length ? 1 : 0)
  }
  await ask('Press ENTER to START RECORDING the Part 0→3 arc… ')

  // ── PHASE TRANSITION — close the login window, then relaunch the SAME profile with video ────
  // Your login is NOT lost: it lives in the profile directory on disk. The window blinks once.
  log('\nClosing the login window (a profile can only be driven by one browser at a time)…')
  await ctx.close()
  ctx = null
  const freed = await waitForProfileFree(PROFILE)
  if (!freed.ok) {
    log(`✗ The demo profile is still held by pid ${freed.pid} after 15s — not starting the recording.`)
    log('  Close that window (or run the two lines printed at startup) and re-run the script.')
    rl.close(); process.exit(1)
  }
  log(`✓ Profile released (${freed.waitedFor}). Reopening it with the recorder on…`)

  // ── PHASE 3 — record ────────────────────────────────────────────────────────────────────────
  log('\n=== PHASE 3 — RECORDING ===')
  // ── БРИФИНГ ПЕРЕД ЗАПИСЬЮ ───────────────────────────────────────────────────────────────────
  // Takes 3 and 4 were lost to this and not to any bug: the operator did not know that the pauses
  // are HIS to act on. He pressed ENTER expecting the script to drive, the script honestly refused
  // ("no trace"), and both sides waited for each other. A tool that needs a briefing and does not
  // give one is unfinished — so the briefing is now part of the tool.
  log('\n' + '═'.repeat(78))
  log('  КАК ЭТО РАБОТАЕТ — прочитайте, это важно')
  log('═'.repeat(78))
  log('  Скрипт — СУФЛЁР, а не автопилот. Он НЕ нажимает ничего за вас.')
  log('')
  log('    1. Скрипт называет сцену и говорит, что сделать.')
  log('    2. ВЫ играете её МЫШКОЙ в окне браузера — по-настоящему, на камеру.')
  log('    3. И только потом жмёте ENTER здесь. ENTER означает «я сделал, проверь».')
  log('')
  log('  ENTER без действия = отказ: скрипт не найдёт следа и попросит сделать шаг.')
  log('  Это не поломка — так он не даёт снять пустой дубль.')
  log('')
  log('  Запись НЕ останавливается на отказе. Спокойно доиграйте шаг и нажмите ENTER снова.')
  log('  Ctrl+C в любой момент — корректно закроет запись, видео сохранится.')
  log('═'.repeat(78))
  await ask('  Понятно? Нажмите ENTER, чтобы начать запись… ')

  const recCtx = await openProfile(PROFILE, { record: true })
  closeRecording = () => recCtx.close()      // Ctrl+C now finalises the .webm instead of orphaning it
  const rp = recCtx.pages()[0] || await recCtx.newPage()

  // ── TRACE-CHECKED BEATS ─────────────────────────────────────────────────────────────────────
  //
  // Take 2 (2026-07-25) ran to the end and produced 7 minutes of footage in which the arc never
  // happened: the packet was opened, and nothing after it. Nobody was told, because a manual beat
  // advanced on ENTER whether or not the action had occurred. The rehearse phase had grown teeth
  // by then; the RECORDING phase had none.
  //
  // So every manual beat now names the TRACE it must leave, and the trace is looked for after the
  // pause. No trace → the beat is NOT counted: the script says so loudly and repeats the pause.
  // An empty arc can no longer reach the end of a take unnoticed.
  //
  // Traces are read from the UI — what the camera sees — not from the database: this script holds
  // no service key, and a beat that "happened in the database but not on screen" is worthless to
  // a screencast anyway.
  //
  // The escape hatch is deliberate and loud: typing `skip` accepts an UNVERIFIED beat (a broken
  // verifier must never trap someone mid-take). Every skip is listed again at the end, so a take
  // that leaned on one is never mistaken for a clean one.
  const unverified = []
  const beat = async (label, instruction, verify, ru) => {
    log('\n⏸  BEAT — ' + label)
    log('   ' + instruction)
    if (ru) log('   ▶ ПО-РУССКИ: ' + ru)
    for (let attempt = 1; ; attempt++) {
      const answer = await ask('   Do it in the browser, then press ENTER (or type `skip`)… ')
      if (/^skip$/i.test(answer)) {
        unverified.push(label)
        log('   ⚠ BEAT ACCEPTED WITHOUT PROOF — recorded as unverified: ' + label)
        return { ok: false, skipped: true }
      }
      let r
      // A check that takes long must never look like a hang: it is capped, and says so.
      const CHECK_MS = 10_000
      try {
        r = await Promise.race([
          verify(),
          new Promise(res => setTimeout(() => res({ ok: false, detail: `the check did not finish in ${CHECK_MS / 1000}s — the page may still be loading` }), CHECK_MS)),
        ])
      } catch (e) { r = { ok: false, detail: 'check itself failed: ' + (e.message || String(e)).split('\n')[0].slice(0, 70) } }
      if (r && r.ok) { log('   ✓ trace found: ' + (r.detail || 'confirmed')); return r }
      log('   ✗ БИТ НЕ ЗАСЧИТАН — trace not found: ' + ((r && r.detail) || 'nothing to confirm it happened'))
      log('   ⚠ ПЕРВАЯ ПОМОЩЬ: сначала сделайте шаг САМИ, МЫШКОЙ В ОКНЕ БРАУЗЕРА, и только потом ENTER.')
      log('     Скрипт ничего не нажимает за вас — он лишь проверяет, что след остался.')
      log(`   Запись идёт. Доиграйте шаг и нажмите ENTER ещё раз (попытка ${attempt + 1}).`)
    }
  }

  // A plain pause, for beats that only move the camera and leave no trace of their own.
  const manual = async (msg) => { log('\n⏸  MANUAL BEAT: ' + msg); await ask('   Do it in the browser, then press ENTER to resume recording… ') }

  // Where the form lives: it may be an iframe in the app, or a tab opened from the packet link.
  const formSurfaces = () => {
    const out = [rp.frameLocator('iframe').first()]
    for (const p of recCtx.pages()) { if (p !== rp) { out.push(p.frameLocator('iframe').first()); out.push(p) } }
    return out
  }
  const anywhere = async (fn) => {                    // true if fn() is true on ANY surface
    for (const s of formSurfaces()) { try { if (await fn(s)) return true } catch {} }
    return false
  }

  // Part 0 — title card is added in post. Part 1 — parent path via in-app embed:
  await rp.goto(`${APP}/center/${ZZDEMO_CENTER}`, { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1200)
  // ➕ Add Child opens the enrollment-PACKET panel (link + QR for the family) — it is not the
  // form itself. The form is what the family gets from that link, which is exactly the story:
  // director hands over the packet, parent opens it.
  // BEAT 1 — the form must actually be on screen. Take 2 died here: the packet panel was opened
  // and browsed, the link was never followed, and the take sailed on regardless.
  await beat(
    'Part 1 · the enrollment form is open',
    'Packet Sets → set "Admission (Starter)" → panel "Share this set" → Center: ZZ Demo → open that ' +
    'link (or scan its QR) → on the storefront, card "Child Enrollment & Health (DCY 01234)" → Open. ' +
    'Frame on the form. (The ➕ Add Child panel has NO Admission tile — its four tiles are Starter / ' +
    'Toddler-Preschool / Infants / School-Age, and Starter carries no DCY 01234.)',
    async () => {
      const found = await anywhere(async s => (await s.locator('#f_child_name').count()) > 0)
      return { ok: found, detail: found ? 'DCY 01234 form is on screen' : 'no enrollment form anywhere — the packet link was not opened' }
    },
    'Откройте Packet Sets → набор «Admission (Starter)» → блок «Share this set» → в списке Center выберите ZZ Demo → откройте полученную ссылку (или отсканируйте QR) → на витрине нажмите Open у карточки «Child Enrollment & Health (DCY 01234)». На экране должна быть сама форма. ВНИМАНИЕ: в панели ➕ Add Child плитки Admission НЕТ — там четыре другие, и в Starter нет DCY 01234.'
  )

  // Fill what can be filled from here (the form may be in an iframe or in its own tab).
  let formSurface = null
  for (const s of formSurfaces()) { try { if (await s.locator('#f_child_name').count()) { formSurface = s; break } } catch {} }
  if (formSurface) {
    const f = formSurface
    const fill = async (id, v) => { const l = f.locator('#' + id); if (await l.count()) await l.fill(v).catch(()=>{}) }
    await fill('f_child_name', DEMO_CHILD); await fill('f_dob','03/14/2022'); await fill('f_first_day','08/01/2026')
    await fill('f_address','123 Demo Lane'); await fill('f_city','Wickliffe'); await fill('f_state','OH'); await fill('f_zip','44092')
    await fill('f_p1_name','Jordan Carter'); await fill('f_p1_phone','(555) 010-2233'); await fill('f_p1_email','jordan@example.com')
    await f.locator('#f_p1_same').check().catch(()=>{}); await f.locator('#f_p2_na').check().catch(()=>{}); await f.locator('#f_health_n').check().catch(()=>{})
    await fill('f_child_name2', DEMO_CHILD); await fill('f_dob2','03/14/2022')
    for (const c of ['f_na_dev','f_na_acc','f_svc_n','f_na_svc','f_trans_no']) await f.locator('#' + c).check().catch(()=>{})
    log('Part 1: fields filled (guided entry)')
    await f.locator('#lock_parent_sig').click().catch(()=>{}); await rp.waitForTimeout(700)
  }

  // BEAT 2 — the signature must be INKED, not merely attempted. An empty pad looks the same as a
  // signed one to a script that only waits for ENTER.
  await beat(
    'Part 1 · the parent signature is on the form',
    'FKPad (wow beat): draw the parent signature big on the pad, then tap "Use". Auto-draw is unreliable across the iframe — do it by hand, on camera.',
    async () => {
      const inked = await anywhere(async s => {
        const slot = s.locator('#lock_parent_sig, [id*="parent_sig"], canvas[id*="sig"]').first()
        if (!(await slot.count())) return false
        // an inked slot renders the signature: either an <img>/canvas with pixels, or a signed marker
        const shot = await slot.screenshot({ timeout: 4000 }).catch(() => null)
        if (!shot) return false
        // a blank slot compresses to almost nothing; an inked one carries real detail
        return shot.length > 3000
      })
      return { ok: inked, detail: inked ? 'signature slot carries ink' : 'the signature slot still looks blank' }
    },
    'В форме нажмите слот подписи родителя → на пэде нарисуйте подпись КРУПНО пальцем/мышью → нажмите Use. Подпись должна появиться в слоте.'
  )

  // BEAT 3 — Submit must produce a confirmation, not just a click.
  await beat(
    'Part 1 · the form is submitted',
    'Submit the form (host footer) and wait for the confirmation to appear.',
    async () => {
      const ok = await anywhere(async s =>
        (await s.locator('text=/thank you|submitted|received|отправлено|спасибо/i').count()) > 0)
      return { ok, detail: ok ? 'submission confirmation on screen' : 'no confirmation — the form was not accepted' }
    },
    'Нажмите Submit внизу формы и дождитесь подтверждения об отправке.'
  )

  // Part 2 — office
  await rp.goto(`${APP}/enrollment-inbox`, { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(2000)

  // BEAT 4 — the demo child must be IN the inbox. This is also the name-safety beat, and since
  // 27.07 the risk is removed BY CONSTRUCTION rather than managed: the first thing on camera is
  // typing "Emma" into the Inbox search, so exactly one row is left on screen. Cutting real names
  // in the edit was a mitigation; filtering them off the frame is a guarantee.
  await beat(
    `Part 2 · "${DEMO_CHILD}" is in the Inbox`,
    `FIRST type "Emma" into the Inbox search — one row must remain on screen. THEN open that ` +
    `"${DEMO_CHILD}" submission. Never scroll the unfiltered list: the other rows are real children.`,
    async () => {
      const total = await rp.getByRole('button', { name: /^Review$/i }).count()
      const ok = (await rp.locator(`text=/${DEMO_CHILD}/i`).count()) > 0
      if (!ok) return { ok: false, detail: `${DEMO_CHILD} is not in the Inbox — the submission never arrived` }
      if (total > 1) {
        return { ok: false, detail: `${total} rows are on screen — the search is not applied, and the other rows are real children. Type "Emma" in the Inbox search and press ENTER again.` }
      }
      return { ok: true, detail: `${DEMO_CHILD} present, and the only row on screen` }
    },
    'СНАЧАЛА введите «Emma» в поиск Inbox — на экране должна остаться ОДНА строка. Затем откройте её. Не листайте нефильтрованный список: там реальные дети других центров.'
  )

  // BEAT 5 — Approve must leave the freeze behind it.
  await beat(
    'Part 2 · approved, and the copy is frozen',
    'Tap "View original form" → countersign the Program slot → tap "✓ Approve". Catch the "🔒 Freezing a copy…" flash.',
    async () => {
      await rp.waitForTimeout(1500)
      const ok = (await rp.locator('text=/Snapshot on file|Snapshot at Approve|Freezing a copy|approved/i').count()) > 0
      return { ok, detail: ok ? 'approval / snapshot state visible' : 'nothing on screen says the form was approved and frozen' }
    },
    'Нажмите View original form → поставьте контрподпись в слоте Program → нажмите ✓ Approve. Должна мелькнуть плашка «🔒 Freezing a copy…».'
  )

  // Part 3 — retrieval from snapshot
  await rp.goto(`${APP}/center/${ZZDEMO_CENTER}`, { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1500)

  // BEAT 6 — the whole point of Step 3: the frozen copy is reachable from the child.
  await beat(
    'Part 3 · the snapshot is on file for the child',
    `Open ${DEMO_CHILD} → Documents tab → "Enrollment forms (approved)".`,
    async () => {
      const ok = (await rp.locator('text=/Snapshot on file/i').count()) > 0
      return { ok, detail: ok ? '🔒 Snapshot on file is showing' : 'no "Snapshot on file" badge — nothing was frozen for this child' }
    },
    'Откройте ростер → карточку ребёнка Emma Carter → вкладку Documents. Там должна быть строка одобренной формы со снимком.'
  )

  // BEAT 7 — and it serves the frozen pages, saying so.
  await beat(
    'Part 3 · the frozen copy opens and prints',
    '"View original form" → the green "Snapshot at Approve · sha" bar → Print → 2 clean official pages.',
    async () => {
      const ok = (await rp.locator('text=/Snapshot at Approve/i').count()) > 0
      return { ok, detail: ok ? 'the viewer declares its source: Snapshot at Approve' : 'the green snapshot bar is not on screen' }
    },
    'Нажмите View original form → убедитесь в зелёной плашке «Snapshot at Approve · sha» → нажмите Print: должны выйти 2 чистые официальные страницы.'
  )

  log('\nStopping recording…')
  await recCtx.close() // flushes the video
  rl.close()
  const vids = fs.readdirSync(OUTDIR).filter(f => f.endsWith('.webm'))
  log('\n✓ DONE. Video(s) in ' + OUTDIR + ':\n  ' + vids.join('\n  '))
  if (unverified.length) {
    log('\n⚠ THIS TAKE IS NOT CLEAN — these beats were accepted without proof:')
    for (const u of unverified) log('   · ' + u)
    log('  Do not send it for acceptance as a complete arc until they are re-shot or verified by hand.')
  } else {
    log('\n✓ Every beat left the trace it was supposed to leave — the arc is complete on tape.')
  }
  log('\nMontage rules (canon): no real child or family name in frame — the Inbox holds other')
  log('centers\' real children, so cut every Inbox frame that is not ' + DEMO_CHILD + '.')
  log('Next: post (amy VO + burn-in captions) → Nikolay for acceptance. Then sweep the ZZSMOKE trail.')
}

// run only when executed directly — importing this file (the phase-transition test does) must not
// open a browser or grab stdin
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await main()
