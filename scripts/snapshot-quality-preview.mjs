// Step 3 snapshot quality preview — render the REAL DCY 01234 v7 replica with fictional data,
// then capture each page two ways so Nikolay can pick the fork:
//   (A) Playwright headless element screenshot @ deviceScaleFactor 2  (baseline)
//   (B) html2canvas @ scale 2                                          (client capture)
// Fictional data only (Emma Carter). Output PNGs to the scratchpad.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const REPO = '/Users/nikolaykutsenko/Downloads/menumaker-app'
const OUT = '/private/tmp/claude-501/-Users-nikolaykutsenko-Downloads-menumaker-app-src-pages/8d901a96-0ade-46c8-be83-365b5939d737/scratchpad'
const REPLICA = process.env.REPLICA_URL || ('file://' + path.join(REPO, 'public/forms/DCY_01234_v7_original.html'))
const H2C = path.join(REPO, 'node_modules/html2canvas/dist/html2canvas.min.js')
console.log('html2canvas dist exists:', fs.existsSync(H2C))

// simple cursive signature as an SVG data URL (so the sig slots aren't empty)
const sig = (name, color = '#12315a') => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='90'>
   <text x='10' y='60' font-family='Segoe Script, Snell Roundhand, cursive' font-size='46' fill='${color}'>${name}</text></svg>`)

const formData = {
  center_code: 'ZZ Demo',
  child_name: 'Emma Carter', dob: '2022-03-14', first_day: '2026-08-01',
  address: '123 Demo Lane', city: 'Wickliffe', state: 'OH', zip: '44092',
  p1_name: 'Jordan Carter', p1_phone: '(555) 010-2233', p1_same: 'x',
  p1_email: 'jordan.carter@example.com', p1_cell: '(555) 010-2233',
  p2_na: 'x',
  ec1_name: 'Sam Rivera', ec1_phone: '(555) 010-9911', ec1_rel_y: 'x',
  health_n: 'x',
  child_name2: 'Emma Carter', dob2: '2022-03-14',
  na_dev: 'x', na_acc: 'x', svc_n: 'x', na_svc: 'x', trans_no: 'x',
  parent_sig_dt: '2026-07-24',
}
const signatures = {
  parent_sig: sig('Jordan Carter'),
  program_sig: sig('Alex Rivera'),
  countersign_meta: { program_sig: { name: 'Alex Rivera', role: 'Director', at: '2026-07-25' } },
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1330, height: 1720 } })
await page.goto(REPLICA, { waitUntil: 'load' })
// wait for both background scans to finish decoding
await page.waitForFunction(() => {
  const im = [...document.querySelectorAll('img.bg')]
  return im.length === 2 && im.every(i => i.complete && i.naturalWidth > 0)
}, null, { timeout: 15000 })
// render with our fictional data at actual size (zoom 1)
await page.evaluate(({ fd, sg }) => {
  window.renderOriginal(fd, sg)
  document.getElementById('doc').style.zoom = 1
}, { fd: formData, sg: signatures })
await page.waitForTimeout(500)

// (A) Playwright element screenshots
for (const id of ['page1', 'page2']) {
  await page.locator('#' + id).screenshot({ path: path.join(OUT, `pw-${id}.png`) })
}
console.log('playwright shots done')

// (B) html2canvas in-page
await page.addScriptTag({ path: H2C })
for (const id of ['page1', 'page2']) {
  const dataUrl = await page.evaluate(async (elId) => {
    const el = document.getElementById(elId)
    const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
    return canvas.toDataURL('image/png')
  }, id)
  fs.writeFileSync(path.join(OUT, `h2c-${id}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'))
}
console.log('html2canvas shots done')

// report sizes
for (const f of ['pw-page1.png', 'pw-page2.png', 'h2c-page1.png', 'h2c-page2.png']) {
  const p = path.join(OUT, f)
  console.log(f, fs.existsSync(p) ? (fs.statSync(p).size / 1024).toFixed(0) + ' KB' : 'MISSING')
}
await browser.close()
console.log('DONE')
