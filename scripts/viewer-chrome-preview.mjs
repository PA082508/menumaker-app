// Preview of ApprovedFormViewer's screen chrome (provenance banner) around a real snapshot page.
// Reproduces the exact inline styles from ApprovedFormViewer.tsx. Screenshot to scratchpad.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const OUT = '/private/tmp/claude-501/-Users-nikolaykutsenko-Downloads-menumaker-app-src-pages/8d901a96-0ade-46c8-be83-365b5939d737/scratchpad'
const pngB64 = fs.readFileSync(path.join(OUT, 'h2c-page1.png')).toString('base64')
const img = 'data:image/png;base64,' + pngB64

const html = `<!doctype html><html><head><meta charset=utf8><style>
  body{margin:0;font-family:'DM Sans',system-ui,sans-serif;background:#334}
  .modal{width:900px;height:1120px;margin:18px auto;background:#fff;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  .bar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#0f4c35;color:#fff}
  .t1{font-weight:800;font-size:13px;letter-spacing:.05em}
  .t2{font-size:11px;color:#bfe8d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .btn{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer}
  .print{border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff}
  .close{border:none;background:#fff;color:#0f4c35}
  .body{flex:1;overflow:auto;background:#eef1f4;padding:16px}
  .body img{display:block;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.15);background:#fff}
</style></head><body>
  <div class="modal">
    <div class="bar">
      <div style="flex:1;min-width:0">
        <div class="t1">COPY — WHAT WAS SIGNED</div>
        <div class="t2">Snapshot at Approve · 7/25/2026, 1:24:07 PM · v7 · sha a1b2c3d4e5…</div>
      </div>
      <button class="btn print">🖨 Print</button>
      <button class="btn close">Close</button>
    </div>
    <div class="body"><img src="${img}"></div>
  </div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 940, height: 1160 }, deviceScaleFactor: 2 })
await page.setContent(html, { waitUntil: 'load' })
await page.waitForTimeout(300)
await page.screenshot({ path: path.join(OUT, 'viewer-chrome.png') })
await browser.close()
console.log('viewer-chrome.png', (fs.statSync(path.join(OUT, 'viewer-chrome.png')).size / 1024).toFixed(0) + ' KB')
