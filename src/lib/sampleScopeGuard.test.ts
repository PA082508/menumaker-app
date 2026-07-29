import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SAMPLE_SCOPE } from './signatureSamples'
// Предикат вынесен ради негативной пробы — см. guardNegativeProbes.test.ts.
import { declaredSampleScope } from './guardPredicates'

// ============================================================================
// SAMPLE-SCOPE GUARD — the build fails if the signature-sample shelf is live on
// EITHER surface. Two surfaces sign in this product and they must agree:
//   • the app          — src/lib/signatureSamples.ts   (director countersign)
//   • the parent forms — form-kit.js in the forms repo (every parent form)
// A flag flipped on one surface only would offer a shelf the other refuses to
// fill, and nobody would notice until a director tapped a signature that did
// not exist.
//
// WHY HARD, AND WHY HERE. Today there is ONE deployment serving ONE state
// (Play Academy, Ohio), where the canon is: no sample, a live signature drawn
// with a finger — or a mark — on each document. So the guard is a flat equality:
// 'none', no exceptions, no environment escape.
//
// FUTURE FORM (do NOT build now — there is no customer yet). When a multi-tenant
// layer exists, this guard is REWRITTEN, not deleted, into:
//     default is 'none' for every tenant, and Ohio / Play Academy RESOLVES to
//     'none' whatever the tenant default is
// i.e. the assertion moves from "the constant is none" to "the resolved policy
// for this jurisdiction × document type is none, and the default is off". The
// permission axis is JURISDICTION × DOCUMENT TYPE, not state alone — see
// docs/specs/2026-07-27-signature-sample-unconservation.md §Commercial.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '../..')
// The forms repo is a sibling checkout (pa082508.github.io). PA_FORMS_REPO overrides
// the location — it does NOT let the check be skipped: an unreadable kit fails too,
// because "we could not look" must never read as "we looked and it was off".
const KIT = process.env.PA_FORMS_REPO
  ? resolve(process.env.PA_FORMS_REPO, 'forms/1-data-sources/form-kit.js')
  : resolve(APP_ROOT, '../pa082508.github.io/forms/1-data-sources/form-kit.js')

describe('SAMPLE_SCOPE guard — both signing surfaces are conserved', () => {
  it('the app surface is off', () => {
    expect(SAMPLE_SCOPE).toBe('none')
  })

  it('the parent-form surface (form-kit.js) is off', () => {
    expect(existsSync(KIT), `form-kit.js not found at ${KIT} — check out the forms repo as a sibling, or set PA_FORMS_REPO. The guard fails closed: it cannot certify a surface it cannot read.`).toBe(true)

    const src = readFileSync(KIT, 'utf8')
    // The declaration, not a mention: comments in that file discuss the flag by name.
    const decl = declaredSampleScope(src)
    expect(decl, 'form-kit.js no longer declares SAMPLE_SCOPE — the conservation flag was renamed or removed').not.toBeNull()
    expect(decl).toBe('none')
  })

  it('the two surfaces agree', () => {
    const src = readFileSync(KIT, 'utf8')
    const kitScope = declaredSampleScope(src)
    expect(kitScope).toBe(SAMPLE_SCOPE)
  })

  it('the wiring the capability needs is still on the forms — reserved, not removed', () => {
    // data-fk-adopt / data-fk-mint are the sockets the sleeping capability plugs into.
    // Stripping them would turn a future switch-on from "flip a flag" into "re-mark
    // every form", so their presence is part of the contract, not leftovers.
    const dir = resolve(KIT, '..')
    const mint = readFileSync(resolve(dir, 'Parent_ESign_Consent_v4.html'), 'utf8')
    const adopt = readFileSync(resolve(dir, 'DCY_01234_v8.html'), 'utf8')
    expect(mint).toContain('data-fk-mint')
    expect(adopt).toContain('data-fk-adopt')
  })
})
