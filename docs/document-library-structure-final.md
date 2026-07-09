# Document Library — final structure

Status: **LOCKED 2026-07-09 (Nikolay).** Build is **queued — after the Staff flip**,
per the queue. This doc is the target the Doc-Hub reorg builds to; nothing is
reorganized yet. Supersedes the current flat `DOCS` + category layout in
[`DocumentHubPage`](../src/pages/instructions/DocumentHubPage.tsx).

Shape = **4 sections + 1 campaign panel** (the panel is a working tab that overlays
sections 1–2, not a fifth section).

## Section 1 — Ohio DCY

The state childcare-licensing packet.
- **Enrollment packet:** DCY 01234 (v5), DCY 01236, DCY 01217, DCY 01305 + attachments.
- **Step Up To Quality (SUTQ)** — a **subgroup** under this section.

Registry: the `dcy_*` records in [`enroll-registry.json`](../public/enroll-registry.json)
(01234/01236/01217/01305). 01234 is the trigger form; 01236/01217 are physician-signed
conditionals.

## Section 2 — CACFP (participation forms)

The food-program forms families/officials fill.
- CACFP Enrollment **v9**, IEA **v6**, USDA Waiver, Fluid Milk Substitution,
  Special Diet, Infant Meals Preference.

Registry: `enroll`, `iea`, `usda_waiver`, `fluid_milk`, `special_diet`, `infant_meals`.

## Section 3 — Claim results (generated exports, NOT blank forms)

A **separate section** for the outputs that feed a monthly claim — generated, not fillable:
- Meal counts / attendance (**the checkmarks**), menu, purchases/receipts, F/R/P registry.
- A **"month claim-packet"** button that assembles them for the period.

Ties to the **claim-bridge invariant** (checkmark export must keep working — protected
till Oct 1). This section is the human-facing surface of that export.

## Section 4 — Our documents

Play Academy's own documents.
- Start-form / Admissions, Fee Agreement.
- **Staff Enrollment + role JDs + BYOD** — the **in-app** signing surface
  (`StaffJdOnboarding` + `AckSignModal`, PRs #4/#3/#5; `staff_agreement_signatures`
  staging → `safepass_agreements` ledger at Approve→staff).
- Instructions, QR cards.

## Campaign panel — "New Period 2026-27"

**Not a section — a working campaign tab that overlays sections 1–2.**
- Per-child **awaiting** statuses.
- Personal **packet generator** + **prefill-tokens** (see
  [`prefill-engine-spec.md`](./prefill-engine-spec.md)).
- **Batches**; tracking **sent / filled / approved**.
- Operates on the documents of sections 1–2 (the fillable enrollment + CACFP forms).

## Document card (every listed doc)

Shows: **version**, **live/dark** state, **QR**, **personal link**.
(live/dark = registry `current` points at a built file vs `versions:{…:'PENDING'}`.)

## Build order

**After the Staff flip**, per the queue. When it starts: reorganize `DocumentHubPage`
into the 4 sections (driven by the registry, not a hand-kept flat list), add the
Claim-results section (wire to the existing exports), and add the campaign tab
(reads `pa_*` awaiting flags + the prefill/token engine).
