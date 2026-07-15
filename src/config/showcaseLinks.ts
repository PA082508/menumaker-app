// showcaseLinks.ts — single source of truth for the public "showcase" pages
// hosted OUTSIDE the app (currently the GitHub Pages storefront at
// pa082508.github.io — the same origin the embed forms live on, see
// public/enroll-registry.json). These pages are linked from the app (e.g. the
// Document Hub "Parent Forms" card) but are not part of the SPA bundle.
//
// When the storefront migrates to Vercel, change SHOWCASE_ORIGIN here — every
// link below follows, so no component needs editing.

export const SHOWCASE_ORIGIN = 'https://pa082508.github.io'

// Public landing page listing the CACFP parent-facing forms (enrollment, IEA…).
// Permanent link — shared with parents, opened in a new tab, and QR-encoded.
export const PARENT_FORMS_URL = `${SHOWCASE_ORIGIN}/parent-forms.html`

// ── QR / share standard ──────────────────────────────────────────────────────
// A QR or a copied link that a parent scans MUST point at the STOREFRONT, never
// at a file in the registry. The storefront re-reads enroll-registry.json on
// every open, so a flipped `current` reaches the parent immediately; a QR that
// encodes versions[current] freezes whatever version was live the day it was
// printed — a QR on a wall would keep serving the old PDF forever.
//
// This is not hypothetical: the Add-Child panel QR for DCY 01218 encoded
// ".../3-library/ohio-dcy/Basic Infant 2026 DCY-01218.PDF?center=alpha", so a
// scan kept returning the flat PDF after the v2 flip went live (2026-07-14).
//
// Use for EVERY parent-facing QR and Copy-link. Director-facing Download/Print
// may still hit the file directly — the director wants the artifact, not the
// storefront.
export function storefrontOnlyUrl(slug: string | null | undefined, formKey: string): string {
  const c = slug ? `center=${encodeURIComponent(slug)}&` : ''
  return `${SHOWCASE_ORIGIN}/parent-forms.html?${c}only=${encodeURIComponent(formKey)}`
}

// Whole-packet storefront link (optionally a set + an explicit only= selection).
export function storefrontPacketUrl(slug: string, setKey?: string, only?: string[]): string {
  let u = `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(slug)}`
  if (setKey) u += `&set=${encodeURIComponent(setKey)}`
  if (only?.length) u += `&only=${only.map(encodeURIComponent).join(',')}`
  return u
}
