# Paper / official forms — the map (2026-07-22)

Task (2) of the 22.07 delegation package: an inventory ("map") of every paper /
official document the platform handles, so the Packet-Set Builder can be **gated
by what actually exists** (task 3, "карта-ворота"). Facts verified against
`public/enroll-registry.json` (`schema: 2`) and the code seams below — not memory.

## Where the map lives (source of truth)
- **`public/enroll-registry.json`** → `forms{}` (32 records), `packets{}` (6 ordered
  packets referencing form keys), `conditions{}` (one conditional-logic map). Mirrored
  to `dist/`. The **Pages** copy (repo-root `enroll-registry.json` in `pa082508.github.io`)
  must stay identical.
- App reads it through **`src/lib/formsLibrary.ts`** (`useFormsLibrary()`), URLs built in
  **`src/config/showcaseLinks.ts`** (origin `https://pa082508.github.io`).
- Form artifacts (HTML form-kit / overlay / scanned PDF·docx) live in the **separate
  Pages repo** under `forms/1-data-sources/` and `forms/3-library/{ohio-dcy,our-documents}`.

## Publishable gate (the "ворота")
A form is **publishable** to a family iff it resolves to a live version today:
`current != null` AND `versions[current]` is a real URL (string or per-center object),
NOT the literal `"PENDING"`. Encoded as `isPublishable()` / `FormLibItem.publishable`
in `formsLibrary.ts`. **Not publishable today: `dcy_01236`, `dcy_01217`** (both
`current:null`, `versions.v1:"PENDING"`). `dcy_01235` (Sleep Position Waiver) isn't even
a `forms{}` record yet — referenced only in `conditions.sleep_position_waiver`.

## Signature shelves (who signs)
Four shelves (`src/lib/signatureSamples.ts`): `parent`, `staff`, `director`, `sponsor`.
- **`sponsor` = the General Director / org owner** — the IEA `sponsor_sig` countersignature,
  a shelf separate from the center `director` (one person can hold both; they never mix).
- **`requires_countersign:"director"`** marks center-director countersign: `dcy_01234`,
  `child_release_authorization`, `transition_into_program`.
- Shelves never fall back across roles.

---

## Enrollment / CACFP / DCY forms (registry `forms{}`)

| key | title | edition | requiringOrg | signer | intake | validity | publishable |
|---|---|---|---|---|---|---|---|
| `enroll` (aliases `school_enrollment_regular/_fullday`, `cacfp_enrollment`) | CACFP Enrollment | **v9** | ODE Nutrition/CACFP | parent | paper_scan | — | ✅ |
| `iea` | Income Eligibility Application FY2026-27 | **v6** | ODE Nutrition/CACFP | parent + **GD sponsor countersign** | online | **12 mo** (month-end, from signature — see срок-fix) | ✅ |
| `usda_waiver` | USDA Income Eligibility Waiver (declined IEA) | **v3** | Internal | parent | online | — (shares `income_eligibility` slot w/ IEA) | ✅ |
| `dcy_01234` | Child Enrollment & Health (DCY 01234, Rev 7/2026) | **v6** | ODJFS/DCY | parent + director countersign | paper_scan (overlay-fillable) | — | ✅ |
| `dcy_01236` | Care Plan for Child w/ Special Needs | **PENDING** | ODJFS/DCY | physician | — | — | ❌ not built |
| `dcy_01217` | Request for Administration of Medication | **PENDING** | ODJFS/DCY | physician | — | perInstance (1/drug), 12 mo | ❌ not built |
| `dcy_01305` | Child Medical Statement (JFS 01305) | v2021pdf | ODJFS/DCY | physician | paper_scan | **30 days** on file from start | ✅ (scanned PDF, wet sig) |
| `dcy_01218` | Basic Infant Care Plan (Rev 7/2025) | **v2** | ODJFS/DCY | parent | online (form-kit) | — | ✅ |
| `dcy_01225` | Routine Trip (Rev 6/2025) | v1 | ODJFS/DCY | — | scanned PDF | — | ✅ |
| `dcy_01226` | Field Trip (Rev 6/2025) | v1 | ODJFS/DCY | — | scanned PDF | — | ✅ |
| `dcy_01235` | Sleep Position Waiver | — | ODJFS/DCY | physician | — | — | ❌ not a forms{} record |
| `special_diet` | Special Diet Statement | **v2** | ODE Nutrition/CACFP | physician | paper_scan (form-kit) | — | ✅ |
| `fluid_milk` | Fluid Milk Substitution Request | **v2** | ODE Nutrition/CACFP | parent | online | — | ✅ |
| `infant_meals` | Infant Meal Preference | **v2** | ODE Nutrition/CACFP | parent | online | — | ✅ |

## House / center forms (Play Academy)

| key | title | edition | signer | countersign | kind | publishable |
|---|---|---|---|---|---|---|
| `parent_consent` | Parent Consent (E-Signature) — **adopts parent signature** | **v2** | parent | — | signature (auto_file) | ✅ |
| `child_release_authorization` | Child Release Authorization + media consent | **v2** | parent | director | document | ✅ |
| `parent_responsibilities` | Parent Responsibilities | v1 (docx) | parent | — | document | ✅ |
| `transition_into_program` | Transition Into Program | **v2** | parent | director | document | ✅ |
| `topical_product_consent` | Topical Product Consent 2025 | v1 (docx, futureFormKit) | parent | — | document | ✅ |
| `what_to_bring_infant` | What To Bring | **v2** | — | — | keep | ✅ |
| `building_for_the_future` | Building For the Future | v1 (docx) | — | — | keep | ✅ |
| `start_form` | Registration Start Form (9 req fields; office-setup section) | v1 | parent | — | signature (online·kiosk) | ✅ |
| `parents_book` | Parent Handbook (per-center PDF: pearl/alpha/ridge) | v1 | — | — | keep | ✅ |
| `parents_book_ack` | Parent Handbook Receipt | v1 | parent | — | signature (auto_file) | ✅ |

## Other org / reference forms
| key | title | edition | requiringOrg | kind | publishable |
|---|---|---|---|---|---|
| `center_parent_info` | Center Parent Information (Appendix 5101:2-12-07) | v1 (docx) | ODJFS/DCY | document | ✅ |
| `center_parent_information` | Center Parent Information (PDF, near-dup key) | v1 | ODJFS/DCY | keep | ✅ |
| `sutq_family_needs_survey` | Family Needs Survey (SUTQ) | v1 | ODE/SUTQ | document | ✅ |
| `wic_information` | WIC Information (links to ODH, doesn't mirror the PDF) | v1 | ODH HEA 4460-4466 | keep | ✅ |
| `staff` | Staff Enrollment | v1 | Play Academy | staff | ✅ |
| `staff_consent` | Staff Consent for E-Signatures (**mints staff sig**, signed first) | v1 | Play Academy | staff | ✅ |

## CACFP claim/cost paper forms — NOT in the registry
App-generated print templates at `public/forms/*.html` (unversioned, client-side print):
`FoodCostWorksheet*.html`, `OtherMonthlyCosts_Template.html`, `Sep_Food_Inventory.html`,
`Sep_NonFood_Inventory.html`. Plus the daily **Meal Count sheet** — generated in code
(`src/utils/PrintMealCountForm.ts`), signed Cook + Director initials/date. These sit
outside the packet system by design (they aren't parent-facing enrollment forms).

## Drift / open items (for the report)
- Two near-duplicate keys `center_parent_info` (docx) vs `center_parent_information` (pdf) —
  worth reconciling to one.
- `dcy_01236` / `dcy_01217` PENDING — the base **Admission** seed set already *lists* both;
  they now show a "not published" flag in the editor rather than being dropped.
- Storefront defense-in-depth: `resolve_packet_set` / `parent-forms.html` should also skip
  PENDING keys at render (Pages repo — out of this branch). **[к утверждению]**
