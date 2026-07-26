#!/usr/bin/env node
// make-driver-icons.mjs — renders the Trip app icon and the iOS "Add to Home Screen" gesture
// strip. Playwright is already a dependency (the demo recorder uses it), so no image toolchain
// is added for this.
//
//   node scripts/make-driver-icons.mjs
//   → public/driver-icon-180.png · driver-icon-512.png · public/guides/driver-add-to-home.png
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const GREEN = '#05603a'
const icon = (size) => `<!doctype html><meta charset="utf-8">
<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;
             background:${GREEN};border-radius:${Math.round(size * 0.22)}px;
             font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif">
  <div style="font-size:${Math.round(size * 0.56)}px;line-height:1">🚌</div>
</body>`

const panel = (n, title, body, art) => `
<div style="flex:1;background:#fff;border:1px solid #c9d0de;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px">
  <div style="display:flex;align-items:center;gap:8px">
    <div style="width:24px;height:24px;border-radius:999px;background:${GREEN};color:#fff;display:grid;place-items:center;font:700 13px Inter">${n}</div>
    <div style="font:700 15px Inter;color:#101521">${title}</div>
  </div>
  <div style="font:400 13px/1.45 Inter;color:#4a5568">${body}</div>
  <div style="margin-top:auto;background:#f4f6fa;border-radius:12px;padding:14px;display:grid;place-items:center;min-height:120px">${art}</div>
</div>`

const share = `<div style="font-family:Inter;text-align:center">
  <div style="font-size:38px;line-height:1">⬆️</div>
  <div style="font:600 12px Inter;color:#4a5568;margin-top:6px">Share, in the Safari bar</div></div>`
const addRow = `<div style="width:100%;background:#fff;border:1px solid #c9d0de;border-radius:10px;padding:11px 13px;display:flex;align-items:center;gap:10px">
  <div style="font-size:19px">➕</div><div style="font:600 14px Inter;color:#101521">Add to Home Screen</div></div>`
const home = `<div style="text-align:center;font-family:Inter">
  <div style="width:64px;height:64px;border-radius:15px;background:${GREEN};display:grid;place-items:center;font-size:36px;margin:0 auto">🚌</div>
  <div style="font:600 12px Inter;color:#101521;margin-top:7px">Trip</div></div>`

const strip = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<body style="margin:0;padding:20px;background:#eef1f7;width:900px;font-family:Inter,system-ui,sans-serif">
  <div style="font:700 16px Inter;color:#101521;margin-bottom:4px">Put Trip on your home screen — once</div>
  <div style="font:400 13px Inter;color:#4a5568;margin-bottom:14px">iPhone, Safari. After this it opens like any other app, with no address bar.</div>
  <div style="display:flex;gap:14px;align-items:stretch">
    ${panel(1, 'Tap Share', 'With the Trip screen open, tap the Share button at the bottom of Safari.', share)}
    ${panel(2, 'Add to Home Screen', 'Scroll the list and choose <b>Add to Home Screen</b>, then tap Add.', addRow)}
    ${panel(3, 'Open it like an app', 'A 🚌 <b>Trip</b> icon appears. It opens full screen — the bus, and nothing else.', home)}
  </div>
</body>`

mkdirSync(new URL('../public/guides/', import.meta.url), { recursive: true })
const browser = await chromium.launch()
for (const size of [180, 512]) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await p.setContent(icon(size)); await p.waitForTimeout(250)
  await p.screenshot({ path: `public/driver-icon-${size}.png`, omitBackground: true })
  await p.close()
}
const p = await browser.newPage({ viewport: { width: 940, height: 400 }, deviceScaleFactor: 2 })
await p.setContent(strip); await p.waitForTimeout(900)
await p.locator('body').screenshot({ path: 'public/guides/driver-add-to-home.png' })
await browser.close()
console.log('written: public/driver-icon-180.png, driver-icon-512.png, public/guides/driver-add-to-home.png')
