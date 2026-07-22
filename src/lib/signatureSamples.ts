// ============================================================
// signatureSamples.ts — the three shelves (20260722_signature_samples.sql).
//
// A sample is NOT a signature on a document. The signature on a document is
// evidence of that signing and is never rewritten; a sample is a reusable stamp
// the owner may apply again. Adoption happens at Approve — before that the
// person does not exist as a record (staff: 105 rows, no login column at all;
// guardian: created at Approve; auth.users: 9 in total).
//
// THE SHELF IS THE SIGNING ROLE, NOT THE PERSON. Sonia Texidor is both
// Izabella's parent and Ridge's administrator: her `parent` sample and her
// `director` sample are different rows, and neither may ever stand in for the
// other. A pad reads ONLY its own shelf and NEVER falls back — an empty shelf
// degrades to draw/type. Collapsing them is how a staff pad once offered a
// parent's signature (platform-standards, 2026-07-14).
// ============================================================

import { supabase } from './supabase'

const S = () => supabase.schema('menumaker')

// sponsor = the General Director / org owner (owner_auth_id), the IEA sponsor_sig
// role. It is its OWN shelf, never the center `director` shelf — the shelves forbid
// that collapse (20260722b_signature_samples_sponsor_scope.sql, DECISIONS §12 п.15).
export type SigScope = 'parent' | 'staff' | 'director' | 'sponsor'
export type SigMethod = 'drawn' | 'typed'

export interface SignatureSample {
  id: string
  scope: SigScope
  owner_name: string
  signature_image: string
  signature_method: SigMethod
  adopted_at: string
}

// The owner is a discriminated union so a caller cannot ask for "the sample of
// this person" without saying in WHICH role — the mistake the shelves exist to
// prevent. Each shelf has its own owner column (CHECK signature_samples_one_owner).
export type SampleOwner =
  | { scope: 'director'; authId: string }
  | { scope: 'sponsor'; authId: string }
  | { scope: 'parent'; guardianId: string }
  | { scope: 'staff'; staffId: string }

const OWNER_COL: Record<SigScope, string> = {
  director: 'owner_auth_id',
  sponsor: 'owner_auth_id',   // same column as director; scope keeps them distinct
  parent: 'owner_guardian_id',
  staff: 'owner_staff_id',
}

const ownerId = (o: SampleOwner): string =>
  o.scope === 'director' || o.scope === 'sponsor' ? o.authId
    : o.scope === 'parent' ? o.guardianId : o.staffId

const COLS = 'id,scope,owner_name,signature_image,signature_method,adopted_at'

/** The owner's live sample on THIS shelf, or null. Never looks at another shelf. */
export async function loadSample(owner: SampleOwner): Promise<SignatureSample | null> {
  const { data, error } = await S().from('signature_samples')
    .select(COLS)
    .eq('scope', owner.scope)
    .eq(OWNER_COL[owner.scope], ownerId(owner))
    .is('revoked_at', null)
    .maybeSingle()
  // Bind the error: a failed read must not read as "no sample on file", which
  // would silently send the owner back to redrawing (or worse, look like the
  // shelf was cleared). PostgREST rejects the whole select on one unknown column.
  if (error) throw error
  return (data as any) ?? null
}

export interface AdoptInput {
  owner: SampleOwner
  orgId: string
  centerId?: string | null
  /** The name ON the sample — declared by the caller, never guessed from a
   *  hardcoded selector (that silently produced empty names on non-parent forms). */
  ownerName: string
  image: string
  method: SigMethod
  /** The approved consent this came from. null for a director: they mint theirs
   *  under their own login, there is no form behind it. */
  sourceSubmissionId?: string | null
  adoptedBy: string
}

export interface AdoptResult { id: string; undo: () => Promise<void> }

/** Adopt a sample onto a shelf. A live sample on that shelf is revoked first —
 *  the partial unique index allows exactly one, and the old one is kept (never
 *  deleted) because it is evidence of what the owner signed with before. */
export async function adoptSample(input: AdoptInput): Promise<AdoptResult> {
  const { owner, orgId, centerId, ownerName, image, method, sourceSubmissionId, adoptedBy } = input
  if (!ownerName.trim()) throw new Error('A sample needs the name it is signed with')
  if (!image.startsWith('data:image/')) throw new Error('A signature sample must be an image')

  const prior = await loadSample(owner)
  const now = new Date().toISOString()

  if (prior) {
    const { data, error } = await S().from('signature_samples')
      .update({ revoked_at: now, revoked_by: adoptedBy })
      .eq('id', prior.id).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Could not revoke the previous sample — nothing was written')
  }

  const { data, error } = await S().from('signature_samples').insert({
    org_id: orgId,
    center_id: centerId ?? null,
    scope: owner.scope,
    [OWNER_COL[owner.scope]]: ownerId(owner),
    owner_name: ownerName.trim(),
    signature_image: image,
    signature_method: method,
    source_submission_id: sourceSubmissionId ?? null,
    adopted_by: adoptedBy,
    adopted_at: now,
  }).select('id').single()
  if (error) throw error
  const id = (data as any).id as string

  return {
    id,
    undo: async () => {
      await S().from('signature_samples').update({ revoked_at: now, revoked_by: adoptedBy }).eq('id', id)
      if (prior) await S().from('signature_samples').update({ revoked_at: null, revoked_by: null }).eq('id', prior.id)
    },
  }
}

export async function revokeSample(id: string, by: string): Promise<void> {
  const { data, error } = await S().from('signature_samples')
    .update({ revoked_at: new Date().toISOString(), revoked_by: by })
    .eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Nothing was revoked — the sample was not written')
}

// ─── which slot a director's countersignature belongs in ─────────────────────
// MEASURED from the live submissions, not invented. A form declares its own
// slot; we fill the slot the form already has, and never mint a key it lacks.
//
//   dcy_01234                   → program_sig   (2 rows, 0 filled)
//   iea                         → sponsor_sig   (the General Director's slot; backed
//                                 by the `sponsor` shelf since 20260722b — she may
//                                 apply a reusable sample or draw/type as fallback)
//   child_release_authorization → NO SLOT — carries only parent_sig, yet the
//                                 registry marks it requires_countersign:director.
//                                 Flagged for Nikolay; not invented here.
//   transition_into_program     → no submissions yet, slot unknown.
//   start_form                  → admin_sig. The pad EXISTS on the form
//                                 (id="sig-admin", "Play Academy Administration")
//                                 and the form already submits it under this key;
//                                 the map simply forgot to name it, so the Inbox
//                                 never drew the director's pad. Confirmed against
//                                 the live form's submit block, 2026-07-17.
export const COUNTERSIGN_SLOT: Readonly<Record<string, string>> = {
  dcy_01234: 'program_sig',
  iea: 'sponsor_sig',
  start_form: 'admin_sig',
}

export const countersignSlot = (submissionType: string): string | null =>
  COUNTERSIGN_SLOT[submissionType] ?? null
