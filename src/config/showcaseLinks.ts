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
