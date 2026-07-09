# Prefill Engine — spec (portioned distribution)

Status: **SPEC, not built.** Nikolay's requirement — portions don't work without it. Refines
**Forms Library v1** (see `forms-registry-and-library-plan.md` Stage 3). Build order (unchanged):
gate → Staff-flip → **library (with prefill)** → child form flips → portions. Do not build ahead
of the v9 re-smoke / flip gate.

Library v1 scope this clarifies: **per-child statuses + personal-packet generator + batches +
tokens/prefill + tracking.**

---

## A. Existing children (in DB) — prefill from the database

**A1 · Per-child tokenized link (library, at batch time).**
When the library builds a portion (batch), it generates a **per-child link carrying a token**:
random, unguessable, **scope = one child**, **expiry ~30 days**, **reissued** when the child is
included in a later batch (old token expires / is replaced).

**A2 · `get_prefill(token)` RPC → whitelist payload.**
SECURITY DEFINER, anon-callable (same pattern as `submit_enrollment_form`). Validates the token
exists and is unexpired, then returns a **whitelist JSON**: identity (child name, DOB), address,
parent contacts (phone/email), schedule / meals, `center_id`. **No sensitive numbers** (no SSN,
DL#, work-auth#; no FRP/eligibility). Token invalidated by expiry (re-openable until then; not
single-use, since a parent may reopen the link).

**A3 · Kit consumes `?t=`.**
`form-kit.js`: on `?t=<token>` → `POST get_prefill` → fill `[data-fk-field]` + schedule/meals +
resolve center from `payload.center_id` (a resolution source in the center-auto-detect chain) →
banner **"We've pre-filled this for you — please review & correct."** Never overwrites a field the
parent already touched (same rule as the session packet). Compatible with center-auto-detect.

**A4 · Review shows the DIFF against the DB.**
A prefilled submission carries the known `child_id` (from the token) → the Inbox pre-matches it →
`EnrollmentReviewModal` shows submitted-vs-current **diff**, changed fields highlighted (buildDiff
already renders this). **Approve = Update** the existing roster/record (`approveCacfpUpdate`), not
insert.

**A5 · Privacy.**
Token links are sent **only to the family's email on file** (from the DB). The form shows the
**child's name** so the family can confirm "this is about us" before filling.

## B. New clients — prefill from the first completed form

**B6 · "Apply my previous answers" across the WHOLE personal packet** (form 1 → 2 → … N).
The start form is autofill **source #0** (already in `form-ux-standard.md` §7). The kit's session
packet (`pa_packet_profile`, 90-min TTL, canonical `data-fk-field` keys) must carry every shared
field forward through the packet, form to form.

**B7 · Verify the chain doesn't break** between forms of a packet (session / navigation via the
packet's links) — each form both **reads** the packet on load (offer "Apply my previous answers")
and **writes** its own fields back, so form N sees everything from forms 0..N-1.

---

## Mapping to what already exists / is planned

- **Kit session packet (B):** BUILT — `form-kit.js` `savePacket`/`applyPacket` + `[data-fk-field]`
  canonical keys + the autofill banner. B6/B7 = verify continuity across the packet (mostly test +
  ensure every packet form declares `data-fk-field` on shared fields + a `data-formkit="autofill-banner"`).
- **Token path (A):** overlaps the deferred **Stage-3 signed-link** design (edge fn `form-link` +
  `form_links` table, `open` route `verify_jwt=false`). Recommend **one mechanism**: extend
  `form_links` with a `purpose` (`prefill` | `submit`) and a `child_id` scope, rather than a
  separate table. `get_prefill` = the read side of that token.
- **Review diff + Approve=Update (A4):** BUILT foundation — `EnrollmentReviewModal.buildDiff` +
  `approveCacfpUpdate`. Needs: pre-match on the token's `child_id` so the diff/Update path is taken.

## Decisions — LOCKED (Nikolay 2026-07-08)

1. **Token store:** extend `form_links` — add `purpose` (`prefill` | `submit`), `child_id`, `expires_at`,
   `batch_id`, `status`. No new table. (Doubles as the Stage-3 groundwork.)
2. **Mint surface:** minting is privileged → **authenticated RPC** called from the app library session
   (`verify_jwt`, director/office). No edge fn required. Reading `get_prefill(token)` stays **anon
   SECURITY DEFINER**.
3. **Whitelist — FIXED in the RPC, not configurable:** child name, DOB, home address, parent
   phone/email, schedule/meals, `center_id`. **EXCLUDED:** FRP/income, document numbers, notes,
   everything else.
4. **Expiry / reissue:** 30 days; re-openable until expiry (parent may return); **one active token per
   child** — a new portion reissues and **invalidates the old**; **Approve of the form invalidates the
   token**.
5. **`portion_batch`** (thin): `batch(batch_id, center_id, form_set, size, created_at)`; `form_links.batch_id`
   FK. Statuses = **event timestamps** (sent / opened / submitted / approved); dashboard counters are
   **derived** from events. Drives per-batch / per-center tracking + re-portion lists.
6. **Delivery v1:** email-only + "Form N of M" from the portion's `form_set`. **Families without email:**
   NOT a shared QR carrying a token (leak risk) — the director opens the family's personal link on a
   kiosk/tablet at drop-off (same token, controlled channel).

Per-family selection ties to the **"awaiting 2026-27 form"** flag (from the three-decision order): the
checklist of missing/expiring forms → each parent gets their own short list.
