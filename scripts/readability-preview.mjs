#!/usr/bin/env node
// readability-preview.mjs — renders the two SafePass surfaces that a teacher reads under
// pressure (the check-in strip and the PIN pad) in the OLD palette and the NEW one, side by
// side, and screenshots both. The point is approval by eye on the same screen, not a promise.
//
//   node scripts/readability-preview.mjs
//   → docs/previews/readability-before.png · readability-after.png · readability-preview.html
//
// Colours are read from src/pages/safepass/shared/theme.ts so the preview cannot drift from
// what the app actually ships.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const src = readFileSync(new URL('../src/pages/safepass/shared/theme.ts', import.meta.url), 'utf8')
const grab = (name) => {
  const block = src.split(`export const ${name}: SafePassPalette = {`)[1].split('}')[0]
  const out = {}
  for (const m of block.matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]] = m[2]
  return out
}
const NEW = grab('LIGHT')
// what shipped before this pass — the constant that lived inline in each screen
const OLD = {
  bg: '#0f1117', surface: '#1a1d27', surface2: '#22263a', border: '#2e3350',
  text: '#f0f2ff', muted: '#7b82a6', green: '#00e896', amber: '#ffb740',
  red: '#ff4d6a', redDim: 'rgba(255,77,106,0.12)', blue: '#5b8bff', onAccent: '#0f1117',
}

const lum = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const r2 = (a, b) => ratio(a, b).toFixed(1)

const screen = (C, label, isOld) => `
<section style="background:${C.bg};padding:22px;border-radius:14px;font-family:Inter,system-ui,sans-serif">
  <div style="font:600 12px/1 Inter;color:${C.muted};letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px">${label}</div>

  <!-- error banner: the sentence that was unreadable in the room -->
  <div style="background:${isOld ? '#3a1420' : C.redDim};border-bottom:2px solid ${C.red};padding:12px 16px;border-radius:8px;
              color:${C.red};font:${isOld ? '600 13px' : '700 15px'}/1.35 Inter;margin-bottom:14px">
    ⚠️ This tablet is not registered — ask the director to register it.
    <span style="opacity:.8;font-weight:400"> · contrast ${r2(C.red, isOld ? '#3a1420' : C.surface)}:1</span>
  </div>

  <!-- check-in strip -->
  <div style="background:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
    <span style="font:700 11px/1 Inter;letter-spacing:.09em;text-transform:uppercase;color:${C.muted}">In this room today</span>
    <span style="display:flex;align-items:center;gap:6px;background:${C.surface2};border:1px solid ${C.green};border-radius:999px;padding:6px 14px;
                 font:800 ${isOld ? 15 : 21}px/1 Inter;color:${C.text}">Carolyn Hercik
      <span style="font:700 10px/1 Inter;color:${C.green}">DUTY</span>
      <span style="font:400 11px/1 Inter;color:${C.muted}">07:12</span></span>
    <span style="display:flex;align-items:center;gap:6px;background:${C.surface2};border:1px solid ${C.border};border-radius:999px;padding:4px 12px;
                 font:600 ${isOld ? 13 : 19}px/1 Inter;color:${C.text}">Maureen Minadeo
      <span style="font:400 11px/1 Inter;color:${C.muted}">07:45</span></span>
    <span style="margin-left:auto;display:flex;gap:8px">
      <button style="padding:8px 16px;border-radius:10px;border:0;background:${C.green};color:${C.onAccent};font:700 13px Inter">Check in</button>
      <button style="padding:8px 16px;border-radius:10px;background:transparent;border:1px solid ${C.muted};color:${C.muted};font:700 13px Inter">Check out</button>
    </span>
  </div>

  <!-- queue card + Accept -->
  <div style="background:${C.surface};border:1px solid ${C.border};border-radius:14px;overflow:hidden;max-width:330px;margin-bottom:14px">
    <div style="padding:14px 16px">
      <div style="font:${isOld ? '700 19px' : '800 20px'}/1.2 Inter;color:${C.text};letter-spacing:-.3px">Laylanii Robinson</div>
      <div style="font:400 12px/1.4 Inter;color:${C.muted};margin-top:3px">Parent · waiting 0:24</div>
    </div>
    <button style="width:100%;padding:15px;border:0;background:${C.blue};color:${C.onAccent};font:700 ${isOld ? 14 : 17}px Inter">✓ Accept</button>
  </div>

  <!-- PIN pad -->
  <div style="width:300px;background:${C.surface};border:1px solid ${C.border};border-radius:18px;padding:18px">
    <div style="text-align:center;font:800 ${isOld ? 17 : 17}px Inter;color:${C.text}">Check in — Red</div>
    <div style="text-align:center;font:400 12px Inter;color:${C.muted};margin-top:3px">Enter your 4-digit staff PIN</div>
    <div style="display:flex;justify-content:center;gap:14px;margin:16px 0 8px">
      ${[1, 1, 0, 0].map(f => `<div style="width:14px;height:14px;border-radius:50%;background:${f ? C.green : 'transparent'};border:2px solid ${f ? C.green : C.border}"></div>`).join('')}
    </div>
    <div style="text-align:center;border-radius:8px;padding:${isOld ? '0' : '4px 6px'};background:${isOld ? 'transparent' : C.red + '14'};
                font:${isOld ? '400 12.5px' : '700 15px'}/1.3 Inter;color:${C.red};min-height:32px">
      Wrong PIN — 3 tries left
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:10px">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<div style="padding:14px 0;text-align:center;border-radius:12px;background:${isOld ? '#272c42' : C.surface2};color:${C.text};font:600 ${isOld ? 22 : 24}px Inter">${k}</div>`).join('')}
    </div>
  </div>
</section>`

const html = `<meta charset="utf-8"><title>SafePass readability — before / after</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<body style="margin:0;padding:26px;background:#8e99ab;font-family:Inter,system-ui,sans-serif">
<h1 style="font:800 20px Inter;color:#fff;margin:0 0 4px">SafePass — teacher check-in &amp; PIN pad</h1>
<p style="font:400 13px/1.5 Inter;color:#f0f2f7;margin:0 0 18px;max-width:760px">
  Left: what shipped (dark constant inlined in each screen). Right: the shared palette — light by default,
  body text ≥ 4.5:1, key elements ≥ 7:1, measured by <code>scripts/check-contrast.mjs</code>.
  Secondary text on the old surface measured <b>${r2(OLD.muted, OLD.surface)}:1</b> — exactly on the AA floor and far under the 7:1
  a teacher needs across a room; it is now <b>${r2(NEW.muted, NEW.surface)}:1</b>. The error sentence went from
  <b>${r2(OLD.red, '#3a1420')}:1</b> to <b>${r2(NEW.red, NEW.surface)}:1</b>, and is set larger and bold.
</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start">
  ${screen(OLD, 'Before — shipped', true)}
  ${screen(NEW, 'After — light default', false)}
</div></body>`

mkdirSync(new URL('../docs/previews/', import.meta.url), { recursive: true })
const out = new URL('../docs/previews/readability-preview.html', import.meta.url)
writeFileSync(out, html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 }, deviceScaleFactor: 2 })
await page.goto(out.href)
await page.waitForTimeout(1200)
await page.screenshot({ path: 'docs/previews/readability-before-after.png', fullPage: true })
await page.locator('section').first().screenshot({ path: 'docs/previews/readability-before.png' })
await page.locator('section').nth(1).screenshot({ path: 'docs/previews/readability-after.png' })
await browser.close()
console.log('written: docs/previews/readability-before-after.png (+ before/after crops, + .html)')
