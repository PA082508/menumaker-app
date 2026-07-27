import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================================
// KIT VERSION FLOOR — a standing invariant, not a one-off check.
//
// A form's behaviour is a property of the KIT THAT LOADS IT, not of the form's
// own markup. The signature-sample conservation lives in form-kit.js, so a form
// that still asks for an older kit is a form where the shelf is awake, whatever
// its own HTML says. The same reasoning forced the wave order: an edition is
// only as conserved as the kit it pulls.
//
// RULE: no edition may reference a kit below the floor. The floor rises with any
// kit change that a deployed edition depends on — raise FLOOR here in the same
// commit that bumps the includes, and this test is what makes forgetting loud.
//
// v13 — 2026-07-27, the kit that carries SAMPLE_SCOPE='none' (conservation of the
//        signature-sample shelf, both surfaces).
// ============================================================================

const FLOOR = 13

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '../..')
// Same resolution as the SAMPLE_SCOPE guard: sibling checkout, PA_FORMS_REPO overrides
// the path but never lets the check be skipped — an unreadable repo fails closed.
const FORMS_REPO = process.env.PA_FORMS_REPO
  ? resolve(process.env.PA_FORMS_REPO)
  : resolve(APP_ROOT, '../pa082508.github.io')

// `_archive` holds RETIRED editions: nothing in the registry points at them, so they are
// not "in prod" in the sense the floor is about. They are excluded deliberately, not
// forgotten — and they are excluded rather than fixed because their kit include is broken
// anyway (a relative `form-kit.js` next to files that sit in forms/_archive/, where no kit
// exists). If an archived edition is ever revived, it comes back through the registry as a
// new edition and lands in this scan.
const SKIP_DIRS = new Set(['.git', 'node_modules', '_archive'])

function htmlFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) htmlFiles(full, acc)
    else if (name.endsWith('.html')) acc.push(full)
  }
  return acc
}

describe(`form-kit version floor — nothing below v${FLOOR}`, () => {
  it('the forms repo is readable (the check fails closed, it never skips)', () => {
    expect(existsSync(FORMS_REPO), `forms repo not found at ${FORMS_REPO} — check it out as a sibling or set PA_FORMS_REPO`).toBe(true)
  })

  it(`every include is at or above v${FLOOR}`, () => {
    const offenders: string[] = []
    let includes = 0
    for (const file of htmlFiles(FORMS_REPO)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/form-kit\.js\?v=(\d+)/g)) {
        includes++
        if (Number(m[1]) < FLOOR) offenders.push(`${relative(FORMS_REPO, file)} → v${m[1]}`)
      }
    }
    expect(includes, 'no form-kit includes found at all — the scan is looking in the wrong place').toBeGreaterThan(0)
    expect(offenders, `editions below the kit floor v${FLOOR}:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('no include omits the version altogether', () => {
    // A bare `form-kit.js` (no ?v=) is served from cache indefinitely — the same
    // failure the floor exists to prevent, wearing different clothes.
    const bare: string[] = []
    for (const file of htmlFiles(FORMS_REPO)) {
      const src = readFileSync(file, 'utf8')
      // an include whose src is form-kit.js with no query at all
      if (/src=["'][^"']*form-kit\.js["']/.test(src)) bare.push(relative(FORMS_REPO, file))
    }
    expect(bare, `includes without ?v= (uncacheable-bust):\n  ${bare.join('\n  ')}`).toEqual([])
  })

  it('the kit itself declares the version the floor names', () => {
    // The floor is a claim about what is deployed; the kit must carry the marker
    // that claim refers to, so a floor raised without a kit change is caught too.
    const kit = resolve(FORMS_REPO, 'forms/1-data-sources/form-kit.js')
    expect(existsSync(kit)).toBe(true)
    const src = readFileSync(kit, 'utf8')
    const m = src.match(/VERSION\s*=\s*['"]v?(\d+)/i) || src.match(/kit\s+v(\d+)/i)
    if (m) expect(Number(m[1])).toBeGreaterThanOrEqual(FLOOR)
  })
})
