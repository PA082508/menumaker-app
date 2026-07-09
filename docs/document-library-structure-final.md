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
- **`Parent_ESign_Consent_v1`** — "Parent Consent for Electronic Signatures". Text
  supplied by Nikolay (paper original from the director). Fields: **Parent/Guardian
  Name, signature, Date, Child(ren)'s Names** (autofilled from the packet). Typo to
  fix in the source text: "for the pass a couple weeks" → "for the past couple of
  weeks". Signing this is the **signature-adoption capture point** (see below).
- Start-form / Admissions, Fee Agreement.
- **Staff Enrollment + role JDs + BYOD** — the **in-app** signing surface
  (`StaffJdOnboarding` + `AckSignModal`, PRs #4/#3/#5; `staff_agreement_signatures`
  staging → `safepass_agreements` ledger at Approve→staff).
- Instructions, QR cards.

### Signature adoption (parent side)

`Parent_ESign_Consent_v1` is the **first document** of the Child-enrollment scenario.
Signing it **captures the parent's adopted signature** (drawn or typed) once; every
later form in the packet then offers **"Tap to sign"** with that adopted signature
instead of re-drawing. Mirrors the `signature_method='adopted'` hook on the staff
side. Context/why: e-signatures are **already in use on field-trip forms (~2 weeks)** —
this consent legitimizes the existing practice.

## Campaign panel — "New Period 2026-27"

**Not a section — a working campaign tab that overlays sections 1–2.**
- Per-child **awaiting** statuses.
- Personal **packet generator** + **prefill-tokens** (see
  [`prefill-engine-spec.md`](./prefill-engine-spec.md)).
- **Batches**; tracking **sent / filled / approved**.
- Operates on the documents of sections 1–2 (the fillable enrollment + CACFP forms).

## Package scenarios (generator input)

A **scenario** is a **named preset of a document set** — the input the campaign
panel's personal-packet generator expands into per-child links. Data-driven: the
scenario registry grows by adding rows, not code.

- **a) Child enrollment** — `Parent_ESign_Consent_v1` **first** (adopts the parent
  signature → "Tap to sign" downstream), then the full set (Ohio DCY packet + CACFP
  Enrollment v9 + IEA v6 + attachments). Modes:
  - **full packet** — everything;
  - **single form** — pick ONE form to update (e.g. re-sign one doc);
  - **truncated** — a named subset (example: **renewal = CACFP + IEA**).
- **b) Employee** — Staff Enrollment + the **first-day sign-set** (role JD + BYOD),
  i.e. `signSetForRole(role)` from the staff-JD registry.

**Candidate scenarios** (add as data): "New Period" wave, "Schedule change",
"Special Diet" / off-form-meal GUARD, Drop-In.

**Wiring:** `scenario + mode → purpose` on the generated `form_links`; drives the
per-child **awaiting** statuses and the **batches** in the campaign panel. A batch is
built from a scenario; a child's status is per (child × scenario).

## Document card (every listed doc)

Shows: **version**, **live/dark** state, **QR**, **personal link**.
(live/dark = registry `current` points at a built file vs `versions:{…:'PENDING'}`.)

## Build order

**After the Staff flip**, per the queue. When it starts: reorganize `DocumentHubPage`
into the 4 sections (driven by the registry, not a hand-kept flat list), add the
Claim-results section (wire to the existing exports), and add the campaign tab
(reads `pa_*` awaiting flags + the prefill/token engine).
