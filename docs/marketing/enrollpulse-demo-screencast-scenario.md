# EnrollPulse demo screencast — scenario list (v2)

> **DRAFT — AWAITING NIKOLAY'S APPROVAL. Do not record until "go."**
> Fictional data only — no real child, parent, or staff PII. Four parts: setup → parent →
> office → retrieval.

**Owner:** Nikolay · **2026-07-25 (v2)** · Pairs with
[`enrollpulse-product-description.md`](./enrollpulse-product-description.md). v2 adds **Part 0
Setup** and **Part 3 Retrieval** (the frozen approved-form snapshot) now that Step 3 is verified.

## Conventions (fictional)

- **Center:** **"ZZ Demo"** — a **one-time demo center** (not live): minimal slot/QR setup, its
  **own separate roster**, **not part of any CACFP claim**. Registry slug `zzdemo` is deployed so
  the storefront resolves it. Deactivated (not deleted) after the take; rows stay **sealed test
  rows** (see the description's "Production use status").
- **Child:** **Emma Carter**, DOB 03/14/2022 · **submission tag `ZZSMOKE`**.
- **Parent:** "Jordan Carter." **Director:** "Alex Rivera."
- No real phone/address — 555 numbers, fake street.
- Per [[screencast protocol]]: rehearse every selector **headless on the persisted profile**
  first; record the human take only after the dry run is clean. Captions stay honest — anything
  **Planned** (form-side consent checkbox; hard attendance meal gate) is never shown as in force.

---

## Part 0 — Setup (not on camera, or a 5-second title card)

| # | Beat | Notes |
|---|------|-------|
| 0a | **Checked, not assumed** (canon «a label is not the content»): `GET pa082508.github.io/enroll-registry.json` contains `zzdemo`, **and** `parent-forms.html?center=zzdemo` renders **≥1 card** with a centre-specific header (not the generic «PLAY ACADEMY · ENROLLMENT PACKET»). `window.__build` = current sha | Takes 2 and 3 both died here: the app's own copy of the registry knew `zzdemo`, the **deployed** one did not, so the packet rendered empty and there was no form to open. Fixed 2026-07-27 (Pages `3695e64`). The rehearsal now counts the cards and blocks the run |
| 0b | Director "Alex Rivera" logged in on desktop/Chrome | the office/retrieval parts need the director session |
| 0c | Fictional data sheet ready (Emma Carter, Jordan Carter, 555 numbers) | no real PII on screen |

## Part 1 — Parent path (from home)

| # | Beat | On screen | Screen-rule |
|---|------|-----------|-------------|
| 1 | Hand over the packet | ➕ Add Child → tile **ADMISSION** — **not Starter**: the Starter tile is `parent_consent · start_form · dcy_01305` and contains **no DCY 01234**, which cost takes 3–5. **Hold a beat on the packet contents, resting on the Income Eligibility line** — that is the line that convinces a centre (VO: *«…including CACFP income eligibility for the food program»*). Then open the packet link → card **Child Enrollment & Health (DCY 01234)** → **Open**; the official form loads, pre-scoped | The rehearsal blocks the run unless the deployed registry's ADMISSION tile really contains `dcy_01234`. **The income form itself stays out of this take** — IEA is under the «not placed into production use» gate until 1 Oct; the sweep must leave `income_eligibility` untouched. Video #2 (ClaimPulse) picks it up after that date |
| 2 | Guided entry | Child + parent details; DOB date picker; phone/address validation catches a bad phone, then accepts a good one | pause on the validation catch — the "fewer errors" beat |
| 3 | Meal times | Pick care days + meal times from the center's schedule | brief |
| 4 | Sign — draw (**FKPad**) | Tap the parent slot → **FKPad** opens; parent **draws big**, it **scales to fit** the small slot (bbox scale-to-fit, no clipping) | **wow beat #1** — draw-big/fits-small |
| 5 | Date auto-stamps | The date beside the signature **fills itself**, read-only | **wow beat #2** — linger 1s |
| 6 | (Optional) Type instead | Quick cut: clear, **type** the name, pick a script style — same result | keep short |
| 7 | Submit | Submit → confirmation | **assert Submit visible by measured contrast** ([[submit assert]]); screenshot confirmation |

## Part 2 — Office / Director path

| # | Beat | On screen | Screen-rule |
|---|------|-----------|-------------|
| 8 | Inbox | Director opens the enrollment Inbox and **types "Emma" into the search FIRST** — exactly **one row** stays on screen — then opens it | **name safety by construction** (word of Nikolay, 27.07): the unfiltered list holds real children of other centres, so it is never framed. The recorder refuses the beat if more than one row is visible |
| 9 | View original form | Tap **"View original form"** — the real official state form, filled with Emma's answers + the parent's signature in place (not a field table) | the "see the real thing" beat |
| 10 | Countersign | Director signs the "Program Administrator / Designee" slot — one tap on a saved signature (or draw); date stamps itself | note saved-signature reuse |
| 11 | Approve | Tap **"✓ Approve"** → a brief **"🔒 Freezing a copy of the signed form…"** flashes as the snapshot is captured | ⚠️ selector gotcha: the check glyph in "✓ Approve" — rehearse headless ([[screencast protocol]]); catch the freezing status |
| 12 | Integrity close | One-line caption: the record is **sealed** — SHA-256 hash + server timestamp, cannot be edited or deleted; a frozen **copy of exactly what was signed** is now on file | still frame; ties to the product description |

## Part 3 — Retrieval (the frozen snapshot — Step 3)

| # | Beat | On screen | Screen-rule |
|---|------|-----------|-------------|
| 13 | Open the child | Roster → **Emma Carter** card → **Documents** tab | — |
| 14 | Approved forms | "Enrollment forms (approved)" lists the DCY 01234 with **🔒 Snapshot on file** | the badge declares its source |
| 15 | View from snapshot | Tap **"View original form"** → the **frozen snapshot** opens with the green **"COPY — WHAT WAS SIGNED · Snapshot at Approve · sha…"** bar | this is the snapshot viewer (green bar + sha), NOT the small replica badge |
| 16 | Print clean | **Print** → **2 clean official pages, 1:1**, no on-screen banner in the print | screenshot the print preview — confirm the banner is absent on paper |
| 17 | (Mention) Backfill | Note: an older approval without a snapshot shows **"Create snapshot"** — one tap freezes it | brief; don't need to trigger on camera |

---

## After recording (not part of the take)

- **Deactivate the ZZ Demo center (do NOT delete it).** The `ZZSMOKE` rows + snapshot stay as
  **sealed test rows** — sealed rows can't be deleted by design ([[menumaker-signature-trail-live]]),
  which is why the recording lives in a disposable demo center. `is_active=false` afterward;
  nothing touches a claim.
- Keep captions honest (Planned ≠ in force).

## Awaiting your word

Approve this v2 scene list (or edit the beats), and I'll rehearse the selectors headless, then
it's ready for your live take. **No recording happens until you say go.**
