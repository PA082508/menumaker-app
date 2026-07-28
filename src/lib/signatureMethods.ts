// ============================================================
// signatureMethods.ts — how a signature may be MADE in this app.
//
// CANON (Nikolay, unconditional): a signature is a live mark — a finger, a
// stylus, a mouse, or an X — made on the document at that moment. A typed name
// is not a signature. DCY put it plainly: "It can't just be the parent typing
// their name in."
//
// WHAT THIS CLOSES. The 2026-07-27 draw-only pass removed the typed autograph
// from all six parent forms in the kit — and did not notice the ADMINISTRATIVE
// side. The director's countersign in the app kept its ⌨ Type tab, three script
// faces and the renderer behind them. Measured 2026-07-28: reachable by
// director / office_manager / admin, live in production, and used exactly ZERO
// times — the single countersignature on file is method='drawn'. The cost of
// removing it was nil; the cost of leaving it was that the canon was true on
// one surface and merely intended on the other.
//
// WHY A FLAG WITH A TEST, NOT A DELETED BRANCH. Typed survived the last pass by
// being invisible in a place nobody looked. A deleted branch can be written
// again by anyone who thinks it looks convenient; a guard that fails the build
// cannot. Same reasoning as rosterKey.ts and SAMPLE_SCOPE.
//
// THE RENDERER IS KEPT, UNIMPORTED. src/lib/typedSignature.ts stays on disk and
// out of every import graph. It may matter in the commercial version, where
// another jurisdiction may allow what Ohio does not — exactly the reasoning
// that kept the signature-sample machinery alive behind SAMPLE_SCOPE. Deleting
// it would make the future rebuild guess at what was already decided.
//
// FUTURE FORM (do NOT build now): when a multi-tenant layer exists this becomes
// a resolved policy per JURISDICTION × DOCUMENT TYPE whose default is draw-only
// and whose Ohio answer is draw-only whatever the tenant default is — the flat
// constant below is rewritten, never simply widened.
// ============================================================

/** The only way a signature may be made here. */
export const SIGNATURE_MODE_POLICY = 'draw-only' as const

/** The only value `signature_method` / countersign `method` may carry. */
export const SIGNATURE_METHODS = ['drawn'] as const
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number]

/** Typed autographs are off. Mirrors samplesEnabled() in signatureSamples.ts. */
export const typedSignaturesEnabled = (): boolean => false
