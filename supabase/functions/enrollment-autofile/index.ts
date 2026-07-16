// enrollment-autofile — the runtime the auto-file rule never had.
//
// ✅ DEPLOYED 2026-07-16 in DRY-RUN posture. `commit:true` is NOT to be used until the
//    first token-bearing issues exist — Nikolay's word. Spec: docs/specs/renewal-contour-spec.md §2a/§2e.
//
// WHY THIS EXISTS
// ───────────────
// submit_enrollment_form files status='pending', child_id=null and stops. matchRoster
// and validateSubmission are CLIENT code — they run only when a human opens the Inbox.
// So "auto-file without a manual Approve" had no executor at all: the row sat pending
// until someone looked at it, which is exactly what the contour exists to escape.
// Measured 2026-07-16: of 72 submissions, child_id is set only on the 17 approved ones —
// Approve sets it, intake does not.
//
// THE RULE (spec §2a) — all four, or it waits for a person:
//   1. renewal: the submission IDENTIFIES exactly one active child (see below)
//   2. validation clean (no errors, no missing)
//   3. the form carries auto_file:true in the registry
//   4. the form does NOT carry requires_countersign
// → status='received', child_id set, validation recorded. Anything else stays 'pending'.
//
// ⚠️ HOW A RENEWAL IS IDENTIFIED — the spec said "match by name" and that is WRONG for a
// renewal. Measured on live rows 2026-07-16:
//   · parent_consent carries NO birthdate → matchRoster's soft branch can never fire
//     (it only fires when a DOB corroborates), so only an exact name hit could match;
//   · the one real consent says "Izabella Rodriguez"; the roster says
//     "Rodriguez-Texidor Izabella" → exact hits: 0.
//   A parent types the child's name freehand. It will rarely equal the canonical roster
//   string, and there is nothing to corroborate a near-miss with. Name-matching would
//   have auto-filed NOTHING — and any attempt to loosen it would file documents into the
//   wrong child's record, which is the one outcome worse than a queue.
//
// The contour already answers this and I missed it when writing the rule: a renewal is
// ISSUED. prefill_tokens.token rides out in the link (?t=) and comes back with the
// submission — so we do not need to work out who it is, we already know. That is what
// makes it a renewal in the first place.
//
// ONE token store: `prefill_tokens` (prefill-engine-spec, decision 1, settled 2026-07-19).
// It already carries child_id + center_id + batch_id + a 30-day expiry, and
// mint_prefill_token upserts on child_id, so a child has exactly one live token. I briefly
// built a SECOND store (campaign_issues.issue_token) without reading that spec — dropped
// in 20260719.
//   · token present  → child_id comes from prefill_tokens. No guessing. THIS is the
//                      ONLY auto-file path. Filing deletes the token (decision 4).
//   · token absent   → a walk-in. NEVER auto-filed, not even on a single exact name hit
//                      (Nikolay, 2026-07-16). The name is still matched, but only to put
//                      a useful reason on the queue row. Why: across 332 active children,
//                      14 names have exactly ONE active row while a namesake exists —
//                      so "one hit" is an accident of who is active today, not an
//                      identity. And consent carries no DOB to corroborate with.
//
// NEVER auto-filed regardless of flags: the F/R/P determination (roster.frp +
// income_eligibility). IEA may auto-file as *document received*; the determination stays
// manual under the claim-bridge. This function never touches frp.
//
// ⚠️ ONE ANSWER, ONE PLACE. This function WRITES enrollment_submissions.validation, which
// is what enrollmentValidationRules.ts always anticipated ("a DB trigger can populate the
// column later without changing shape"). The client keeps its own copy for live feedback
// while a director edits a row — but for the auto-file decision, THIS is the answer. If
// the two ever disagree, the client is the one that is wrong, because this one is what
// actually wrote the status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REGISTRY_URL = Deno.env.get('REGISTRY_URL') ?? 'https://menumaker-app.vercel.app/enroll-registry.json'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'menumaker' } })

// ── name handling — ported verbatim from src/lib/enrollmentApprove.ts ─────────
const normName = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()

function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

type RosterLite = {
  id: string; first_name: string | null; last_name: string | null
  child_name: string | null; birthday: string | null; is_active: boolean
}

/** Exact normalized name (either order / stored child_name), or a soft hit ONLY when the
 *  DOB corroborates. A conflicting DOB always rules a candidate out. Verbatim rule from
 *  matchRoster — a renewal that cannot be matched is never guessed at. */
function matchRoster(candidates: RosterLite[], name: unknown, dob?: unknown): RosterLite[] {
  const target = normName(name)
  if (!target) return []
  const d = dob ? String(dob).slice(0, 10) : ''
  return candidates.filter(c => {
    const forms = [
      normName(`${c.first_name ?? ''} ${c.last_name ?? ''}`),
      normName(`${c.last_name ?? ''} ${c.first_name ?? ''}`),
      normName(c.child_name ?? ''),
    ].filter(Boolean)
    const cd = c.birthday ? String(c.birthday).slice(0, 10) : ''
    if (d && cd && d !== cd) return false
    if (forms.some(f => f === target)) return true
    if (d && cd && d === cd) {
      const tol = target.length <= 6 ? 1 : 2
      return forms.some(f => lev(f, target) <= tol)
    }
    return false
  })
}

// ── validation ───────────────────────────────────────────────────────────────
type Validation = { status: 'ready' | 'warnings' | 'errors' | 'unknown'; errors: string[]; warnings: string[]; missing: string[] }

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const isISODate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v.slice(0, 10)))

/** Signature-acknowledgement forms (parent_consent, parents_book_ack).
 *
 *  Grounded in what the forms ACTUALLY post, not in a guess — parent_consent rows carry
 *  {child_name, parent_name, center_code, signature_method, signature_typed_value} with
 *  signatures.parent_sig and a signature_date; Parents_Book_Ack_v1.html declares exactly
 *  child_name + parent_name + an adopted signature. Same shape, one rule set.
 *
 *  ⚠️ These two forms had NO validator before today, so validateSubmission returned
 *  'unknown' for both — and 'unknown' is not 'ready', which means wave 1 would have
 *  auto-filed NOTHING. The two forms chosen for wave 1 were exactly the two that could
 *  not be graded. See the report. */
function validateSignatureAck(fd: any, sigs: any, signatureDate: string | null): Validation {
  const errors: string[] = [], warnings: string[] = [], missing: string[] = []

  if (blank(fd?.child_name)) missing.push("Child's name")
  if (blank(fd?.parent_name)) missing.push("Parent/guardian name")
  if (blank(fd?.center_code)) missing.push('Centre')

  // The signature is the whole point of these forms — unlike the packet forms, where the
  // paper is wet-signed and the drawn signature is deliberately optional.
  const method = String(fd?.signature_method ?? '').toLowerCase()
  const drawn = typeof sigs?.parent_sig === 'string' && sigs.parent_sig.startsWith('data:image')
  const typed = !blank(fd?.signature_typed_value)
  if (!drawn && !typed) missing.push('Signature')
  else if (method === 'typed' && !typed) errors.push('Signature method is "typed" but no typed name was captured')
  else if (method === 'drawn' && !drawn) errors.push('Signature method is "drawn" but no drawn signature was captured')

  if (blank(signatureDate)) missing.push('Signature date')
  else if (!isISODate(signatureDate)) errors.push(`Signature date is not a valid date: ${signatureDate}`)
  else if (signatureDate! > new Date().toISOString().slice(0, 10)) {
    // Future-dated: a real thing that happens with a wrong device clock. A warning, not
    // an error — but never auto-filed, because `warnings` is not `ready`.
    warnings.push(`Signature date is in the future: ${signatureDate}`)
  }

  const status: Validation['status'] =
    errors.length || missing.length ? 'errors' : warnings.length ? 'warnings' : 'ready'
  return { status, errors, warnings, missing }
}

const VALIDATORS: Record<string, (fd: any, sigs: any, sd: string | null) => Validation> = {
  parent_consent: validateSignatureAck,
  parents_book_ack: validateSignatureAck,
}

function validate(type: string, fd: any, sigs: any, sd: string | null): Validation {
  const v = VALIDATORS[type]
  if (!v) return { status: 'unknown', errors: [], warnings: [], missing: [`No validation rules for "${type}" yet`] }
  return v(fd, sigs, sd)
}

// ── registry ─────────────────────────────────────────────────────────────────
type FormEntry = { submissionType?: string; auto_file?: boolean; requires_countersign?: string | null }

/** submission_type → registry entry. The registry keys by slug, and only some entries
 *  declare submissionType, so match on either. */
async function loadRegistryFlags(): Promise<Record<string, FormEntry>> {
  const r = await fetch(`${REGISTRY_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`registry ${r.status}`)
  const j = await r.json()
  const out: Record<string, FormEntry> = {}
  for (const [slug, e] of Object.entries<any>(j.forms ?? {})) {
    const entry: FormEntry = {
      auto_file: e.auto_file === true,
      requires_countersign: e.requires_countersign ?? null,
    }
    out[slug] = entry
    if (e.submissionType) out[e.submissionType] = entry
    for (const a of e.aliases ?? []) out[a] = entry
  }
  return out
}

// ── the pass ─────────────────────────────────────────────────────────────────
type Outcome = { id: string; type: string; decision: 'received' | 'pending'; reason: string }

async function run(orgId?: string, dryRun = true): Promise<{ dry_run: boolean; scanned: number; would_file: number; outcomes: Outcome[] }> {
  const flags = await loadRegistryFlags()

  let q = db.from('enrollment_submissions')
    .select('id,org_id,center_id,child_id,submission_type,form_data,signatures,signature_date,status')
    .eq('status', 'pending')
  if (orgId) q = q.eq('org_id', orgId)
  const { data: subs, error } = await q
  if (error) throw error

  const outcomes: Outcome[] = []
  const rosterCache = new Map<string, RosterLite[]>()

  for (const s of subs ?? []) {
    const f = flags[s.submission_type]
    const push = (decision: 'received' | 'pending', reason: string) =>
      outcomes.push({ id: s.id, type: s.submission_type, decision, reason })

    // Countersign is checked FIRST even though auto_file alone would already stop the
    // row: "needs director countersign" is the useful truth for a human reading the
    // queue, and "not auto_file" would have hidden it. The reason string IS the product.
    if (f?.requires_countersign) { push('pending', `needs ${f.requires_countersign} countersign`); continue }
    if (!f?.auto_file) { push('pending', 'form is not auto_file'); continue }

    const val = validate(s.submission_type, s.form_data, s.signatures, s.signature_date)
    if (val.status !== 'ready') {
      // Record the verdict even when we don't file: the Inbox can show WHY it waits.
      if (!dryRun) await db.from('enrollment_submissions').update({ validation: val }).eq('id', s.id)
      push('pending', `validation ${val.status}: ${[...val.errors, ...val.missing].join('; ')}`)
      continue
    }

    if (!s.center_id) { push('pending', 'no centre on the submission'); continue }

    // ── identity: the prefill token we handed the family ───────────────────────
    // A renewal is not matched, it is RECOGNISED. mint_prefill_token put this token in the
    // link; get_prefill filled the form with it; it came back with the submission.
    const token = s.form_data?.t ?? s.form_data?.issue_token ?? s.form_data?.prefill_token ?? null
    if (token) {
      const { data: pt } = await db.from('prefill_tokens')
        .select('child_id,center_id,expires_at')
        .eq('token', token).maybeSingle()
      if (!pt) { push('pending', `prefill token not found: ${String(token).slice(0, 12)}…`); continue }
      // Expired is NOT "file it anyway": the token IS the identity claim, and an expired
      // claim is not evidence. It goes to a person — who can still see who it was.
      if (pt.expires_at && new Date(pt.expires_at) < new Date()) {
        push('pending', `prefill token expired ${String(pt.expires_at).slice(0, 10)} — needs a person`); continue
      }
      if (pt.center_id !== s.center_id) { push('pending', 'token centre != submission centre'); continue }
      if (dryRun) { push('received', `WOULD file by prefill token -> ${pt.child_id}`); continue }
      const { data: up, error: e2 } = await db.from('enrollment_submissions')
        .update({ status: 'received', child_id: pt.child_id, validation: val, reviewed_at: new Date().toISOString() })
        .eq('id', s.id).eq('status', 'pending').select('id')
      if (e2) { push('pending', `write failed: ${e2.message}`); continue }
      if (!up?.length) { push('pending', 'someone else took it first'); continue }
      // Decision 4 (locked): approving/filing the form invalidates the token. Otherwise the
      // link stays live for 30 days and a second submit re-files over a settled record.
      await db.from('prefill_tokens').delete().eq('token', token)
      push('received', `filed by prefill token -> ${pt.child_id}`)
      continue
    }

    // ── fallback: no token. A walk-in, not a renewal. ──────────────────────────
    if (!rosterCache.has(s.center_id)) {
      const { data: r } = await db.from('roster')
        .select('id,first_name,last_name,child_name,birthday,is_active')
        .eq('center_id', s.center_id).eq('is_active', true)
      rosterCache.set(s.center_id, (r ?? []) as RosterLite[])
    }
    const hits = matchRoster(rosterCache.get(s.center_id)!, s.form_data?.child_name, s.form_data?.birthdate ?? s.form_data?.child_dob)

    // ── WALK-IN NEVER AUTO-FILES. ───────────────────────────────────────────────
    // Nikolay's proposal, and the roster agrees. "Exactly one ACTIVE hit" is NOT the
    // same as "this name identifies one child": measured 2026-07-16 across 332 active
    // children, 30 names repeat inside a centre, 16 of them on two ACTIVE rows (those
    // already go to a human), and **14 more have exactly ONE active row while a namesake
    // exists** — allen zaiden ×2, green dominic ×2, singleton daryl ×2, rakhmanov erulan
    // ×2, wynn devyn ×2. A single active hit there is an accident of who is active today,
    // not proof of identity. And consent carries NO DOB (0 of the submissions do), so
    // there is nothing to corroborate with.
    //
    // A walk-in is by definition someone we did NOT issue to, so the prior that "this is
    // a renewal" is weak to begin with. Cost of being wrong: a signed document filed into
    // another child's record. Cost of being right but manual: one queue row.
    const why = hits.length === 0 ? 'no issue token and no roster match — new enrolment / walk-in'
      : hits.length === 1 ? `no issue token; single name hit "${hits[0].child_name ?? hits[0].id}" — a name is not an identity, sent to a person`
      : `no issue token; ambiguous name: ${hits.length} candidates`
    push('pending', why)
  }

  return {
    dry_run: dryRun,
    scanned: subs?.length ?? 0,
    would_file: outcomes.filter(o => o.decision === 'received').length,
    outcomes,
  }
}

Deno.serve(async req => {
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    // DRY RUN IS THE DEFAULT. This function writes to a claim-adjacent table; a caller
    // that forgets a flag must get a report, not a mutation. Writing requires saying so.
    const result = await run(body.org_id, body.commit !== true)
    return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})

// Deploy: supabase functions deploy enrollment-autofile --project-ref trrmyqfpxntmgxnqkikp
//
// DRY RUN IS THE DEFAULT — `{}` reports what it WOULD do and writes nothing.
// To actually file:  { "org_id": "...", "commit": true }
// Read the outcomes of a dry run before ever passing commit:true. Every row carries the
// reason it was or wasn't filed, so a wrong rule shows up as a list, not as a surprise
// in the Inbox.
