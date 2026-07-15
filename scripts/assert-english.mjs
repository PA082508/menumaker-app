// STANDARD CHECK — user-facing strings are English (platform-standards, 2026-07-15).
//
// Renders every live form + the storefront and walks the RENDERED text: visible text
// nodes, placeholders, button labels, aria-labels, titles. Comments and commit messages
// are exempt — the DOM is not. A grep cannot tell a comment from a label; this can.
//
// Why it exists: form-kit shipped '✍️ Внести подпись' hardcoded next to an English hint
// and it reached 12 forms — every Ohio family that signed the Consent met a button they
// could not read. A dual-role smoke caught it by accident (2961d1c). The same sweep then
// found the LIVE Income Eligibility Application rendering "иначе PAID. Foster или
// валидный 7-значный SNAP/OWF номер" in its on-screen helper.
//
//   node scripts/assert-english.mjs            # against the local Pages checkout
//   node scripts/assert-english.mjs --live     # against pa082508.github.io
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const REPO = '/Users/nikolaykutsenko/Downloads/pa082508.github.io'
const LIVE = process.argv.includes('--live')
const ORIGIN = LIVE ? 'https://pa082508.github.io' : null
const CYRILLIC = /[Ѐ-ӿ]/

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf' }
  const s = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]))
    fs.readFile(p, (e, b) => {
      if (e) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' })
      res.end(b)
    })
  })
  return new Promise(r => s.listen(0, () => r({ server: s, origin: `http://localhost:${s.address().port}` })))
}

const reg = JSON.parse(fs.readFileSync(path.join(REPO, 'enroll-registry.json'), 'utf8'))
// Only what a user can actually reach: versions[current] of every form, + each packet.
const targets = []
for (const [slug, f] of Object.entries(reg.forms ?? {})) {
  const v = f.current && f.versions?.[f.current]
  const url = typeof v === 'string' ? v : (v && Object.values(v)[0])
  if (url && /\.html?$/i.test(url)) targets.push({ what: `form:${slug}@${f.current}`, path: url.replace(/^https:\/\/pa082508\.github\.io/, '') })
}
for (const key of Object.keys(reg.packets ?? {})) {
  targets.push({ what: `packet:${key}`, path: `/parent-forms.html?center=ridge&set=${key}` })
}

const ctxOrigin = ORIGIN ?? (await serve(REPO)).origin
const browser = await chromium.launch({ channel: 'chrome' })
let bad = 0

for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  const sep = t.path.includes('?') ? '&' : '?'
  const url = `${ctxOrigin}${t.path}${sep}center=ridge&cb=${Date.now()}`
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(700)
    const hits = await page.evaluate((src) => {
      const re = new RegExp(src)
      const out = []
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const tag = n.parentElement?.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE') continue          // not rendered
        const s = (n.textContent || '').trim()
        if (s && re.test(s)) out.push({ where: tag, text: s.slice(0, 90) })
      }
      for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')) {
        for (const a of ['placeholder', 'aria-label', 'title', 'alt']) {
          const v = el.getAttribute(a)
          if (v && re.test(v)) out.push({ where: `${el.tagName}[${a}]`, text: v.slice(0, 90) })
        }
      }
      return out
    }, CYRILLIC.source)
    if (hits.length) {
      bad++
      console.log(`❌ ${t.what}`)
      for (const h of hits.slice(0, 4)) console.log(`     <${h.where}> ${h.text}`)
    } else {
      console.log(`✅ ${t.what}`)
    }
  } catch (e) {
    console.log(`⚠️  ${t.what} — could not render: ${e.message.split('\n')[0]}`)
  }
  await page.close()
}

await browser.close()
console.log(bad ? `\n❌ ${bad} surface(s) show Cyrillic to a user` : `\n✅ every rendered surface is English (${targets.length} checked)`)
process.exit(bad ? 1 : 0)
