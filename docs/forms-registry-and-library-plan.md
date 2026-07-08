# Forms — registry, storefront, library & inspection-readiness plan

Living plan doc. **Gate #1 retired 2026-07-07** (Add-Child report + Ridge 4-pair merge landed; standing "no `current` flips" rule carries forward). Stage 1 (registry schema 2) committed; Stage 2 **started 2026-07-07** — see "Stage 2 execution log" below. Stage 4 is a separate follow-up.

Repos: **menumaker-app** hosts the loader (`public/embed.js`) + registry (`public/enroll-registry.json`) + review side (`src/pages/enrollment/…`). The **forms + storefront** live in the separate GitHub Pages repo `pa082508.github.io` (`forms/1-data-sources/`, `parent-forms.html`). See memory `enrollment-scan-ocr-pipeline`, `menumaker-embed-enrollment`.

---

## STAGE 1 — forms-registry (schema 2) — FINAL

Extend `public/enroll-registry.json`, `schema: 1 → 2`. Embed loader reads only `forms[key].{current,versions,fallbackUrl,submissionType}` + `centers`/`supabase` and does **not** assert `schema` → all new fields are ignored, embed unchanged (verified 2026-07-06).

Per-form fields added: `slug`, `aliases[]`, `title`, `requiringOrg` (`ODJFS/DCY` | `ODE Nutrition/CACFP` | `County Health` | `Internal`), `signer` (`parent` | `physician`), `intakeMode` (`paper_scan` | `online`), `conditional {triggeredBy, triggers[]}`, `medical`, `expiryDays` / `expiryMonths` (form-validity clock — NOT link TTL), `perInstance`, `substitution {allowed,note}`, `history[]`.

Forms (8):

| slug | title | requiringOrg | signer | intakeMode | conditional? | validity |
|---|---|---|---|---|---|---|
| `enroll` (alias cacfp_enrollment) | CACFP Enrollment | ODE Nutrition/CACFP | parent | **paper_scan** (badge "Paper + scan (online available)") | — | — |
| `iea` | Income Eligibility Application FY2026-27 | ODE Nutrition/CACFP | parent | online | — | — |
| `dcy_01234` | Child Enrollment & Health Info (DCY 01234) | ODJFS/DCY | parent | online | — | — |
| `special_diet` | Special Diet Statement | ODE Nutrition/CACFP | **physician** | online | triggeredBy dcy_01234: diet excludes food group / medical | — |
| `fluid_milk` | Fluid Milk Substitution | ODE Nutrition/CACFP | parent | online | triggeredBy dcy_01234: diet excludes milk | — |
| `dcy_01236` | Child Medical/Physical Care Plan (DCY 01236) | ODJFS/DCY | physician | online | triggeredBy dcy_01234: allergy w/ monitoring or emergency med = Yes; developmental delay/special condition w/ monitoring or meds = Yes; medical food = Yes | (no expiryDays — corrected 2026-07-06) · substitution: TL_48 combined DCY Health Care Plan or center's own form allowed |
| `dcy_01217` | Request for Administration of Medication (DCY 01217) | ODJFS/DCY | physician | online | triggeredBy dcy_01234: medication/medical food at center = Yes | `perInstance: true` (one per drug); `expiryMonths: 12` (med order ≤12 mo) |
| `dcy_01305` | Child Medical Statement (DCY 01305) — "the medical form" | ODJFS/DCY | physician | online | triggeredBy dcy_01234: child enrolled (medical exam) — **not required for school-age afterschool/camps** | `expiryDays: 30` (must be on file ≤30 days from start) |
| `usda_waiver` | USDA Food Program Waiver (internal) | **Internal** (CACFP-supporting) | parent | online | triggeredBy dcy_01234 / packet step "free/reduced-price meals?" = **No** → this form | — |

Conditional/accompanying set = **01236, 01217, 01305, special_diet, fluid_milk, usda_waiver**.

### Income-eligibility compliance slot (IEA ⊕ waiver)
Add `satisfies: "income_eligibility"` to BOTH `iea` and `usda_waiver`. They are mutually exclusive alternatives for the same child-record requirement:
- packet step "**Will you apply for free/reduced-price meals?**" → **Yes** ⇒ `iea`; **No** ⇒ `usda_waiver` (parent-signed). Exactly one is always in the child's file.
- Review / child-record checklist: `income_eligibility` slot **met** if an `iea` OR a `usda_waiver` submission is on file; **neither = 🔴**.
- `submissionType` for the waiver: **own type `usda_waiver`** (recommended — its fields are disjoint from IEA: no household/income, just attestation + parent signature; keeps IEA validation clean) sharing the `income_eligibility` slot. (Alt: fold into `iea` family with a `declined:true` flag — rejected: muddies IEA validation/reporting.)

`submissionType` for the three DCY medical forms (01236/01217/01305) = **`medical`** (single type + `form_data.dcy_form` discriminator) → same submissions pipeline.

### Conversions needed (Stage 2, fresh from official PDFs)
- `DCY_01234_v5.html` — from `~/Downloads/Fwd_ New Rules Posted & Updated Forms (3)/DCY-01234- Child Enrollment.PDF` (Rev. 8/2025). Prior 30 KB conversion incomplete → redo clean.
- `DCY_01305_v1.html` — source ✅ downloaded (Forms Central, 864 KB) → `scratchpad/forms-sources/DCY01305.pdf`.
- `DCY_01236_v1.html` — source ✅ downloaded (104 KB) → `scratchpad/forms-sources/DCY01236.pdf`.
- `DCY_01217_v1.html` — official ODJFS `num/DCY01217/pdf/` still 404s (bot-blocked/renamed), but source obtained via **brightpathkids mirror**, header verified `DCY 01217 (Rev. 10/2025)` → `scratchpad/forms-sources/DCY01217_mirror.pdf` (152 KB). Re-pull from official source if/when available; mirror is the working fallback.
- `USDA_Waiver_v1.html` — source ✅ `~/Desktop/ProjectFood/Неотложные формы/USDA food program waiver.docx` (text extracted → `scratchpad/forms-sources/usda_waiver.txt`). Convert per house form pattern (parent name + signature + date → submissions pipeline, type `usda_waiver`). **Fix source typos on conversion:** `DO11`→`DO` ("If you DO qualify…"), `ELIGIBIITY`→`ELIGIBILITY`, `PROCE`→`PRICE`, `USDS`→`USDA`. **Normalize header to:** "CHILD AND ADULT CARE FOOD PROGRAM: CHILD CARE COMPONENT — INCOME ELIGIBILITY APPLICATION FY 2026-2027 — WAIVER". Fields: attestation ("I have reviewed the Reduced and Eligibility Guidelines and I DO NOT qualify for the USDA food program"), parent_name (print), signature, signature_date; keep page-2 "HOUSEHOLD LETTER" guidelines reference.
- Race-safe bump: `current` flips to the new version only AFTER the file is deployed to Pages (same discipline as CACFP v8).

### Storefront drift to fix in Stage 2
- CACFP: storefront links `v7`, registry/embed at `v8` → bump storefront card to v8.
- DCY 01234: storefront on `v4`, publish fresh `v5`.

---

## STAGE 2 — storefront rendered from registry
- `parent-forms.html` fetches `enroll-registry.json`, renders cards grouped by `requiringOrg`; one `current` bump propagates to storefront + embed + Doc Hub library.
- Sync all `current` to actual latest (new filenames where re-converted; race-safe).
- Storefront stays on GitHub Pages for now; **Vercel migration is a separate backlog item — do not couple.**
- Mockup: HOLD until Stage 1 lands.

---

## STAGE 3 — Document Hub form library + send + time-limited links (SUB-PLAN)

### 3a. Library (read side, on the registry)
- New Document-Hub section: list from registry, grouped by `requiringOrg`; row = `title · version · requiringOrg` + `signer` badge + `intakeMode` badge (CACFP: "Paper + scan (online available)").
- Click → preview modal (iframe of `current` version) with Open / QR / Print.
- Multi-select checkboxes → "Send selection".

### 3b. Send a bundle (MVP)
- Multi-select → compose a copyable block / email body with links to current versions. Typical case: new child → whole enrollment packet.
- **Conditional auto-add:** when building a packet, forms whose `conditional.triggeredBy` question = Yes are injected (milk→fluid_milk; food-group/medical→special_diet; allergy/med/medical-food→dcy_01236; med-at-center→dcy_01217 per drug; enrolled non-school-age→dcy_01305).
- **Income-eligibility branch:** packet asks "Will you apply for free/reduced-price meals?" → Yes ⇒ add `iea`; No ⇒ add `usda_waiver`. Exactly one lands in the file; both carry `satisfies: income_eligibility` so the child-record checklist marks the slot met (neither = 🔴).

### 3c. Time-limited signed links + physician online signature
**Two distinct clocks — keep separate:**
1. **Link TTL** — how long the shareable link is *openable*. Proposed defaults: enrollment packet **14 days**; medical link **30 days**.
2. **Form validity** — how long the *signed* form stays compliant (drives Stage-4 tracking, not the link): `dcy_01305` 30 days on-file from start; `dcy_01217` med order ≤12 months.

**Mechanics:**
- Edge fn `form-link` (new):
  - `mint` (verify_jwt, director/office): `{center_id, child_id?, forms[], ttlDays}` → HMAC-signed token (secret `FORM_LINK_SECRET`) over `{v, center_id, child_id?, forms, exp, jti}`. Persist in new `menumaker.form_links` (jti, payload, expires_at, created_by, opened_at, used_at) for audit + revoke.
  - `open` (**verify_jwt=false**, public route): validate signature + `exp`; valid → serve the registry `current` form(s) in embed mode, pre-scoped to center/child, submit via anon RPC `submit_enrollment_form(p_source='medical_link')`. Invalid/expired → **"Link expired — contact your center"** page.
- **Physician signature path (reuses submissions pipeline — no parallel table):** parent opens 30-day medical link on phone → forwards to physician → physician fills + signs online (online signatures legally recognized) → submit → `enrollment_submissions(submission_type='medical', source='medical_link', form_data.dcy_form=01305|01236|01217)` → **lands in Inbox → Review → linked to child**; reviewer records signed date → validity expiry computed for Stage 4.

**Open decisions (confirm before code):**
- Link TTL defaults (packet 14d / medical 30d)?
- `form_links` table (recommend, for audit/revoke) vs stateless HMAC-only?
- Single `submission_type='medical'` + `dcy_form` discriminator (recommend) vs per-form types?
- Rate-limit + single-use vs re-openable-until-exp for the public `open` route.

---

### Note — child_documents ledger feeds ADD CHILD 2.0's return-window checklist (added 2026-07-08)
The ADD CHILD 2.0 "found → return window" (П.0) already renders the per-child document checklist from the registry, but **honest empty-state**: ✓/⚠/✗ only where real data lives today (the `income_eligibility` slot for IEA/waiver + APPROVED `enrollment_submissions` matched by `child_id`); every other form shows ○ *not tracked*, and the director's mandatory paper-folder attestation (snapshotted into `roster.admission_log`) is the legal basis until this ledger exists. Stage 4 must add a `menumaker.child_documents` ledger (per-child × form_slug: signature_date, expires_at, source) **auto-populated** from (a) Approve of typed forms in the Inbox and (b) a one-time backfill from existing `enrollment_submissions`. Then the ○ marks in the return window fill in on their own — **the window is NOT redesigned**; `buildReturnChecklist()` (`src/lib/childReadmission.ts`) simply gains the ledger as a data source.

## STAGE 4 — ODJFS Inspection Readiness (separate plan)
Per-center checklist to inspection, with statuses + due dates. Official DCY checklist to bake in:
- **Child records:** DCY 01234 (enrollment), 01305 (medical statement), 01217 (medication), 01236 (care plan), 01235, "cot", 01229, alt-milk; 01299.
- **Attendance:** DCY 01208.
- **Ratios.**
- **Staff records.**
- Licenses: from `menumaker.center_licenses` (FSO/food-safety filed 2026-07-06 for Ridge/Pearl).
- **Retention rule: 12 months from signature.**
- OAC refs from earlier note: 5180:2-12-15 (child records), -04 (building/fire/food service).
- (Confirm exact titles for 01235 / "cot" / 01229 when drafting.)
