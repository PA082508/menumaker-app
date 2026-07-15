// QR / share standard (ZAKAZ 11, app side).
//
// The rule these tests defend: anything a PARENT scans or receives as a link must
// point at the storefront, which re-reads the registry on every open. A QR that
// encodes versions[current] freezes that version the day it is printed — the
// DCY 01218 panel QR kept serving ".../Basic Infant 2026 DCY-01218.PDF?center=alpha"
// after the v2 flip was live, because the QR held the file URL (2026-07-14).
import { describe, it, expect } from 'vitest'
import { SHOWCASE_ORIGIN, PARENT_FORMS_URL, storefrontOnlyUrl, storefrontPacketUrl } from './showcaseLinks'

// Every registry key a card can render, incl. the ones that bit us.
const FORM_KEYS = [
  'parent_consent', 'dcy_01234', 'enroll', 'iea', 'usda_waiver',
  'child_release_authorization', 'dcy_01218', 'infant_meals', 'special_diet',
  'fluid_milk', 'what_to_bring_infant', 'transition_into_program',
  'center_parent_information', 'building_for_the_future', 'wic_information',
]
const CENTERS = ['pearl', 'alpha', 'ridge']

// A QR value is only legal if it is a storefront URL — never a file.
function isStorefront(url: string): boolean {
  return url.startsWith(`${SHOWCASE_ORIGIN}/parent-forms.html?`)
}
function looksLikeFile(url: string): boolean {
  return /\.(pdf|html|docx?|png|jpe?g)(\?|$)/i.test(url) && !url.includes('parent-forms.html')
}

describe('storefrontOnlyUrl — the QR/share target', () => {
  it('every form × every center encodes the storefront, never a file', () => {
    for (const c of CENTERS) {
      for (const k of FORM_KEYS) {
        const url = storefrontOnlyUrl(c, k)
        expect(isStorefront(url), `${k}@${c} → ${url}`).toBe(true)
        expect(looksLikeFile(url), `${k}@${c} must not be a file URL`).toBe(false)
        expect(url).toContain(`center=${c}`)
        expect(url).toContain(`only=${k}`)
      }
    }
  })

  it('never encodes a registry file URL even when one is at hand', () => {
    // the exact URL the broken 01218 panel QR carried
    const fileUrl = `${SHOWCASE_ORIGIN}/forms/3-library/ohio-dcy/Basic%20Infant%202026%20DCY-01218.PDF?center=alpha`
    expect(looksLikeFile(fileUrl)).toBe(true)
    const qr = storefrontOnlyUrl('alpha', 'dcy_01218')
    expect(qr).not.toContain('3-library')
    expect(qr).not.toContain('.PDF')
    expect(qr).toBe(`${SHOWCASE_ORIGIN}/parent-forms.html?center=alpha&only=dcy_01218`)
  })

  it('encodes center and key so a slug/key with URL-unsafe chars cannot break out', () => {
    expect(storefrontOnlyUrl('a b&c', 'x/y')).toBe(`${SHOWCASE_ORIGIN}/parent-forms.html?center=a%20b%26c&only=x%2Fy`)
  })

  // This used to assert the opposite — "drops center= when no center is resolved, still a
  // storefront URL" — and so locked the defect in: the storefront has no centre to resolve
  // and shows its gate, so the scan dead-ends. The owner scanned exactly
  // `?only=parents_book` off a Library QR in Organization mode (2026-07-15). A link
  // without a centre is not degraded, it is dead; callers must render no QR instead.
  it('refuses to build a URL with no center rather than silently dropping it', () => {
    // @ts-expect-error — the signature now forbids this; the guard is for JS callers
    expect(() => storefrontOnlyUrl(null, 'iea')).toThrow(/center slug is required/)
    // @ts-expect-error — same for undefined
    expect(() => storefrontOnlyUrl(undefined, 'iea')).toThrow(/center slug is required/)
    expect(() => storefrontOnlyUrl('', 'iea')).toThrow(/center slug is required/)
  })
})

// Every storefront URL any surface hands a parent must carry center=. Two shipped
// without it: 8b620c0 (Library Keep downloads) and the Library QR above.
describe('every generated storefront URL carries center=', () => {
  const hasCenter = (u: string) => /[?&]center=[^&]+/.test(u)

  it('only= links carry it, for every center and key', () => {
    for (const c of ['pearl', 'alpha', 'ridge']) {
      for (const k of ['parents_book', 'parents_book_ack', 'start_form', 'iea', 'wic_information']) {
        const u = storefrontOnlyUrl(c, k)
        expect(hasCenter(u), `${c}/${k} lost center=`).toBe(true)
        expect(u).toContain(`center=${c}`)
      }
    }
  })

  it('packet links carry it, with and without a set', () => {
    for (const c of ['pearl', 'alpha', 'ridge']) {
      expect(hasCenter(storefrontPacketUrl(c)), `${c} packet lost center=`).toBe(true)
      expect(hasCenter(storefrontPacketUrl(c, 'staff')), `${c} staff packet lost center=`).toBe(true)
      expect(hasCenter(storefrontPacketUrl(c, 'infant', ['iea', 'start_form'])), `${c} only-selection lost center=`).toBe(true)
    }
  })

  it('packet links refuse an empty center too', () => {
    expect(() => storefrontPacketUrl('', 'staff')).toThrow(/center slug is required/)
  })
})

describe('storefrontPacketUrl — whole-packet share', () => {
  it('is a storefront URL for a bare center', () => {
    expect(storefrontPacketUrl('pearl')).toBe(`${SHOWCASE_ORIGIN}/parent-forms.html?center=pearl`)
  })

  it('carries set and the only= selection', () => {
    expect(storefrontPacketUrl('pearl', 'infant', ['parent_consent', 'dcy_01218']))
      .toBe(`${SHOWCASE_ORIGIN}/parent-forms.html?center=pearl&set=infant&only=parent_consent,dcy_01218`)
  })

  it('omits only= for an empty selection', () => {
    expect(storefrontPacketUrl('ridge', 'starter', [])).toBe(`${SHOWCASE_ORIGIN}/parent-forms.html?center=ridge&set=starter`)
  })
})

describe('PARENT_FORMS_URL', () => {
  it('is the storefront landing page', () => {
    expect(PARENT_FORMS_URL).toBe(`${SHOWCASE_ORIGIN}/parent-forms.html`)
  })
})

// Add Staff panel — Link + QR must both resolve through the storefront, never a file URL:
// a printed QR that points at a file freezes the version live the day it was printed.
describe('storefrontPacketUrl — staff onboarding packet', () => {
  it('builds the staff packet link for a center', () => {
    expect(storefrontPacketUrl('ridge', 'staff')).toBe(`${SHOWCASE_ORIGIN}/parent-forms.html?center=ridge&set=staff`)
  })
  it('is a storefront URL, not a form file', () => {
    const u = storefrontPacketUrl('ridge', 'staff')
    expect(u).toContain('/parent-forms.html')
    expect(u).not.toContain('/forms/1-data-sources/')
    expect(u).not.toMatch(/\.html\?center=[^&]*$/)
  })
  it('carries the center for every center', () => {
    for (const c of ['pearl', 'alpha', 'ridge']) {
      expect(storefrontPacketUrl(c, 'staff')).toContain(`center=${c}`)
    }
  })
})
