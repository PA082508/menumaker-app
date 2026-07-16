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
// The slug is REQUIRED. It used to be optional and the centre was silently dropped when
// falsy, which produced ".../parent-forms.html?only=parents_book" — the storefront has
// no centre to resolve, so it shows the gate ("Please open this packet from your
// center's link or QR code") and the scan dead-ends. The owner scanned exactly that
// from the Library in Organization mode, where there is no active centre (2026-07-15).
// Second time this class shipped; the first was 8b620c0 (Library Keep downloads lost
// their per-centre scope). A link with no centre is not a degraded link — it is a dead
// one, so the type makes it unrepresentable: no centre → no QR, not a broken QR.
export function storefrontOnlyUrl(slug: string, formKey: string): string {
  if (!slug) throw new Error('storefrontOnlyUrl: center slug is required — a storefront URL without center= dead-ends at the packet gate')
  return `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(slug)}&only=${encodeURIComponent(formKey)}`
}

// Whole-packet storefront link (optionally a set + an explicit only= selection).
export function storefrontPacketUrl(slug: string, setKey?: string, only?: string[]): string {
  if (!slug) throw new Error('storefrontPacketUrl: center slug is required — a storefront URL without center= dead-ends at the packet gate')
  let u = `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(slug)}`
  if (setKey) u += `&set=${encodeURIComponent(setKey)}`
  if (only?.length) u += `&only=${only.map(encodeURIComponent).join(',')}`
  return u
}

// ── Personal (tokenized) link — the prefill engine ───────────────────────────
// A RENEWAL is not matched by name, it is RECOGNISED by this token: mint_prefill_token
// put it in prefill_tokens (child + centre + batch + 30-day expiry), get_prefill(t)
// fills the form from it, and it comes back with the submission so enrollment-autofile
// knows exactly whose document this is. See docs/prefill-engine-spec.md.
//
// ⚠️ NEVER QR THIS, and never print it on anything shared. Locked decision 6: a shared
// QR carrying a token is a leak — anyone who photographs the wall gets a link that
// prefills a named child's data. This link goes to ONE family, through a controlled
// channel: the email on file, or the director opening it on a kiosk at drop-off.
// The centre-scoped, token-FREE QR on the Issue Packet page stays fine — it carries no
// identity.
export function storefrontTokenUrl(slug: string, token: string, formKeys?: string[]): string {
  if (!slug) throw new Error('storefrontTokenUrl: center slug is required')
  if (!token) throw new Error('storefrontTokenUrl: token is required — a personal link without ?t= prefills nothing and cannot be auto-filed')
  let u = `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(slug)}`
  if (formKeys?.length) u += `&only=${formKeys.map(encodeURIComponent).join(',')}`
  return `${u}&t=${encodeURIComponent(token)}`
}
