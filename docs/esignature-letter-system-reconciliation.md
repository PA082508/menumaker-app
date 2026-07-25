# Letter ↔ System Reconciliation — e-signature / enrollment integrity

**Rebuilt in-repo:** 2026-07-25 · **«letter» column synced to verbatim:** 2026-07-25 ·
**Owner:** Nikolay · Companion to [`esignature-system-description.md`](./esignature-system-description.md)

> **What this is.** The sent letter to the state (AS SENT 2026-07,
> [`regulatory/letter-2026-07-odew-sent.md`](./regulatory/letter-2026-07-odew-sent.md))
> describes an e-signature and enrollment-record system. This table isolates the points where
> the **letter runs ahead of what the system actually does**, and records how each is closed.
> The **«letter»** column now quotes/paraphrases the **verbatim** sent text.

## The four primary points

| # | Point | «letter» (verbatim) | System today | Closure | Status |
|---|-------|---------------------|--------------|---------|--------|
| 1 | **Server timestamp** | "a server-authoritative timestamp"; "server timestamp … with signed records sealed against alteration" | seal trigger present, but no signature-specific server seal moment distinct from client `signature_date` | added `sealed_at` — server `now()` in the function, frozen by the seal trigger; `signature_date` kept as client-entered/sealed (distinction named, §7) | ✅ **Implemented** — prod 2026-07-25 |
| 2 | **Consent** | "The signer's consent to electronic signature, IP address, and device are recorded with each submission." | **IP + device ARE recorded** (`submit_ip`/`submit_user_agent`, server-set) for enrollment; **consent has no emitter yet** (column + write-path exist, nothing sets it) | platform-side consent capture wired (function + `embed.js`); parent-facing consent checkbox that emits the signal = storefront follow-up | 🟡 **Partly** — IP/device Implemented; **consent Planned**, form-side emission by **2026-09-15** |
| 3 | **Form version** | "the form version" recorded with each signed submission | version frozen at storefront but not written onto the record | `form_version` written at submit — `embed.js` sends the resolved registry version; manual entries `manual_entry` | ✅ **Implemented for new submissions** — from 2026-07-25 |
| 4 | **Meal gate** | "Meal counts are recorded at point of service against same-day verified attendance — **a meal cannot be recorded for a child who is not checked in.**" | advisory — a meal **can** currently be recorded without a verified check-in; attendance/SafePass loop is pilot-stage, not a hard gate | **honest wording**, not a code claim: *"meal counts are advisory against the active roster today; a hard attendance-anchored gate launches with the GatePulse rollout"* | ✅ **Reworded** (description §4) — hard gate **Planned** with GatePulse |

**Correction (verbatim sync):** an earlier draft of #4 read "gates enrollment on meal
eligibility." The letter's actual claim is about **meal counts gated on same-day verified
attendance** (point-of-service), a different subsystem. Row above corrected to match.

## Additional claims in the letter — honest cross-check

The letter/overview asserts more than the four points. None require a code change to *close*,
but each must be represented honestly to the agency — flagged here so nothing reads as more
mature than it is.

| Claim (verbatim) | System today | Honest framing |
|------------------|--------------|----------------|
| "**none of the electronic forms have been placed into production use**" | `enrollment_submissions` already holds 83 rows (25 online / 56 paper / 2 manual, latest 2026-07-24) | **Confirm scope before relying on this sentence:** those rows are test/import/pre-approval data; **no CACFP claim has been filed from them** (claim bridge is protected until Oct 1). If the agency reads "production use" strictly, be ready to explain the existing rows are not claim-filing use. |
| "all records are **retained for three years plus the current year**" | retention is a **documented operational practice**; no automated retention/disposition enforcement | Description §10: "documented operational practice; automated enforcement planned." Do not imply automated enforcement is in force. |
| "Child attendance is **anchored by a documented hand-off** … (SafePass) … staff clock in and out … documenting supervision hours and ratios" | SafePass is **pilot-stage** (loop does not fully close; live teacher path can bypass the handoff); staff-clock/ratio documentation is partial | Present SafePass/attendance-anchoring as **piloted / rolling out**, not fully operational org-wide. Ties to #4 (GatePulse). |
| "Monthly claim data is assembled … with **rates applied by the reporting period in effect**" | period-effective rate resolution is a **spec, not confirmed implemented** | Present claim assembly as **in development**; do not assert period-effective rates are live until verified. |
| "signature method … recorded"; "IP address, and device are recorded" | signature method recorded on the form (in the sealed signature payload); IP + device server-recorded **for enrollment**; the 3 dedicated public forms (special diet / fluid milk / infant) do **not** yet capture IP/UA | True for enrollment. If citing the 3 public forms, note IP/device capture is being added with their seal (below). |
| "Every record can be **printed on demand in the state form layout**" | print/replica path exists for the registered replica forms | Fair as stated for forms that have a registered replica. |
| "cryptographically sealed … cannot be edited or deleted — any **correction creates a new linked record with a stated reason**" | true for `enrollment_submissions`; **and now for the 3 dedicated public forms** (special diet / fluid milk / infant) — `content_hash` + server `sealed_at` + immutable-when-sealed + no-delete + `supersedes_id`/`correction_reason` | ✅ **Closed 2026-07-25** (migration `20260725b_public_forms_seal`; read-back R1–R4 green). |

## Evidence (2026-07-25)

- §1 `sealed_at`: migration `20260725_signature_server_sealed_at.sql` applied to prod;
  read-back R1–R4 green.
- §3/§2 wiring: `embed.js` + `AddChildRouter` merged to `main` and **deployed** (Vercel);
  deployed `embed.js` confirmed carrying `p_source:'online'`, `p_form_version`,
  `p_esign_consent`, `p_signature_sample_id`.
- Path smoke (self-abort, no residue): submit `source='online'`, `form_version='v7'`,
  consent=true → `source=online · form_version=v7 · consent_set · sealed_at set · hash_len=64`.
- Fixed en route: `embed.js` `p_source 'embed'→'online'` (old v9 reject bug).

## Checklist — DUE 2026-09-15 (before Oct 1 program year)

- [x] **`submit_public_form` seal** — ✅ **DONE 2026-07-25** (migration `20260725b_public_forms_seal`,
  applied to prod, R1–R4 green): the 3 dedicated public forms (special diet / fluid milk /
  infant meals) now get `content_hash` + server `sealed_at` + immutable-when-sealed + no-delete
  + forward-only correction (`supersedes_id` + `correction_reason`). *(form_version /
  esign_consent parity for these 3 follows with their form-kit, 2026-09-15.)*
- [ ] **Storefront consent checkbox** on the parent form (form-kit, `pa082508.github.io`) +
  **emit `esignConsent: true`** in `save` → `embed.js` already forwards it. Coordinated
  **kit-bust** (`?v=<N>` bumped in all includes, same commit).
- [ ] Read-back: a real storefront submission shows `esign_consent_at` populated → flip
  consent **Planned → Implemented** (description §9, table #2).
- [ ] **Live storefront сверка by Nikolay** on the same entry point closes #3 (and #2 once
  form-side ships) — headless verification alone is necessary but not sufficient.
- [ ] Before any production/claim use: reconcile the "no production use" sentence against the
  existing 83 rows and the Oct 1 claim window.
