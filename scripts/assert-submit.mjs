// STANDARD CHECK — every kit form, every run + daily health-check.
// Asserts, with ?center=, that Submit is PRESENT + ENABLED + VISIBLE (measured
// contrast), that NO center picker is reachable (finding #6 — a wrong-center
// filing is a claim-integrity risk; center comes from ?center=/kiosk/embed only),
// that the printed center-name field is populated, and that the page raised ZERO
// JS exceptions. Presence alone is NOT enough: a white-on-white Submit passes a
// presence check and fails a human (finding #5, 2026-07-14).
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const REPO = '/Users/nikolaykutsenko/Downloads/pa082508.github.io';
const LIVE = process.argv[2] === '--live';
const FORMS = [
  ['enroll v9', '/forms/1-data-sources/CACFP_Enrollment_v9.html', 'f_center'],
  ['iea v6', '/forms/1-data-sources/IEA_FY2026-27_v6.html', 'p1_center'],
  ['dcy_01234 v6', '/forms/1-data-sources/DCY_01234_v6.html'],
  ['special_diet v2', '/forms/1-data-sources/special-diet-form-v2.html'],
  ['fluid_milk v2', '/forms/1-data-sources/fluid-milk-substitution-v2.html'],
  ['infant_meals v2', '/forms/1-data-sources/infant-meals-preference-v2.html'],
  ['usda_waiver v2', '/forms/1-data-sources/USDA_Waiver_v2.html'],
  ['parent_consent v2', '/forms/1-data-sources/Parent_ESign_Consent_v2.html'],
  ['child_release v2', '/forms/1-data-sources/Child_Release_Authorization_v2.html'],
  ['transition v2', '/forms/1-data-sources/transition-into-program-v2.html'],
  ['staff v1', '/forms/1-data-sources/Staff_Enrollment_v1.html'],
  ['dcy_01218 v2 DARK', '/forms/1-data-sources/DCY_01218_v2.html'],
  ['dcy_01217 v1 dark', '/forms/1-data-sources/DCY_01217_v1.html'],
  ['dcy_01236 v1 dark', '/forms/1-data-sources/DCY_01236_v1.html'],
  ['dcy_01305 v1 dark', '/forms/1-data-sources/DCY_01305_v1.html'],
];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let BASE = 'https://pa082508.github.io', srv;
if (!LIVE) {
  srv = http.createServer((rq, rs) => {
    const fp = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(fs.readFileSync(fp));
  });
  await new Promise(r => srv.listen(8801, r)); BASE = 'http://127.0.0.1:8801';
}
const lum = c => { const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const b = await chromium.launch(); const pad = (s, n) => String(s).padEnd(n).slice(0, n);
let fails = 0;
console.log('SOURCE: ' + BASE + '\n');
console.log(pad('FORM', 19), pad('present', 8), pad('enabled', 8), pad('contrast', 9), pad('pickers', 8), pad('ctrName', 8), pad('errs', 5), 'VERDICT');
console.log('-'.repeat(100));
for (const [name, p, nameField] of FORMS) {
  const ctx = await b.newContext(); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)); });
  try { await pg.goto(BASE + p + '?center=pearl', { waitUntil: 'networkidle', timeout: 30000 }); } catch (e) { errs.push('goto'); }
  await pg.waitForTimeout(800);
  const r = await pg.evaluate(nf => {
    const s = document.querySelector('[data-formkit="submit"]');
    // #6 — any center picker ANYWHERE in the document is a failure, visible or not
    const pickers = [...document.querySelectorAll('select')].filter(x =>
      x.id === 'ctr' || [...x.options].some(o => /select\s+center/i.test(o.text || '')));
    const f = nf ? document.getElementById(nf) : null;
    const base = { pickers: pickers.length, nameOk: f ? !!(f.value || '').trim() : true, hasName: !!f };
    if (!s) return { ...base, present: false };
    const cs = getComputedStyle(s), rc = s.getBoundingClientRect();
    return { ...base, present: true, enabled: !s.disabled, bg: cs.backgroundColor, fg: cs.color, w: rc.width, h: rc.height };
  }, nameField);
  let verdict = '✅ PASS';
  if (!r.present) { verdict = '❌ FAIL: absent'; fails++; }
  else {
    const d = Math.abs(lum(r.bg) - lum(r.fg));
    if (!r.enabled) { verdict = '❌ FAIL: disabled w/ ?center='; fails++; }
    else if (d < 40) { verdict = '❌ FAIL: invisible (contrast ' + d.toFixed(1) + ')'; fails++; }
    else if (r.w < 40 || r.h < 10) { verdict = '❌ FAIL: zero-box'; fails++; }
    else if (r.pickers) { verdict = '❌ FAIL: center picker present (#6)'; fails++; }
    else if (!r.nameOk) { verdict = '❌ FAIL: center-name field empty'; fails++; }
    else if (errs.length) { verdict = '❌ FAIL: JS exception'; fails++; }
    console.log(pad(name, 19), pad('yes', 8), pad(r.enabled, 8), pad(d.toFixed(1), 9), pad(r.pickers, 8), pad(r.hasName ? (r.nameOk ? 'filled' : 'EMPTY') : '-', 8), pad(errs.length, 5), verdict);
    await ctx.close(); continue;
  }
  console.log(pad(name, 19), pad('NO', 8), pad('-', 8), pad('-', 9), pad(r.pickers, 8), pad('-', 8), pad(errs.length, 5), verdict);
  await ctx.close();
}
await b.close(); if (srv) srv.close();
console.log('\n' + (fails ? '❌ ' + fails + ' FORM(S) FAILED' : '✅ ALL ' + FORMS.length + ' FORMS PASS — Submit present+enabled+visible, no center pickers, 0 exceptions'));
process.exit(fails ? 1 : 0);
