# EnrollPulse demo screencast — scenario list

> **DRAFT — AWAITING NIKOLAY'S APPROVAL. Do not record until "go."**
> Fictional data only — no real child, parent, or staff PII. Two paths: parent + office.

**Owner:** Nikolay · **2026-07-25** · Pairs with
[`enrollpulse-product-description.md`](./enrollpulse-product-description.md).

## Conventions (fictional)

- **Center:** "Demo Center" (a throwaway/sandbox center scope, not a live one).
- **Child:** **Emma Carter**, DOB 03/14/2022 · **submission tag `ZZSMOKE`** so the row is
  obviously test data and easy to purge/ignore.
- **Parent:** "Jordan Carter." **Director:** "Alex Rivera."
- No real phone/address — use 555 numbers and a fake street.
- Per [[screencast protocol]]: rehearse every selector **headless on the persisted profile**
  first; record the human take only after the dry run is clean.

---

## Part 1 — Parent path (from home)

| # | Beat | On screen | Notes / screen-rule |
|---|------|-----------|---------------------|
| 1 | Open the link | Parent opens the center QR/link on a phone; the official enrollment form loads, pre-scoped to Demo Center | show the URL is pre-scoped (center already set) |
| 2 | Guided entry | Type child + parent details; date picker for DOB; phone/address validation catches a bad phone, then accepts a good one | pause on the validation catch — it's the "fewer errors" beat |
| 3 | Meal times | Pick care days + meal times; options come from the center's real schedule | brief |
| 4 | Sign — draw | In the parent signature slot, **draw** a signature; it scales to fit | first-signature moment |
| 5 | Date auto-stamps | The date beside the signature **fills itself**, read-only | linger 1s — key trust beat |
| 6 | (Optional) Type instead | Quick cut: clear, **type** the name, pick a script style — same result | keep short |
| 7 | Submit | Tap Submit → confirmation screen | **assert Submit visible by measured contrast** before tapping ([[submit assert]]); screenshot the confirmation |

## Part 2 — Office / Director path

| # | Beat | On screen | Notes / screen-rule |
|---|------|-----------|---------------------|
| 8 | Inbox | Director "Alex Rivera" opens the enrollment Inbox; the new **Emma Carter `ZZSMOKE`** submission is at the top | filter/scroll to the ZZSMOKE row |
| 9 | View original form | Tap **"View original form"** — the real official state form appears, filled with Emma's answers and the parent's signature in place (not a field table) | the "see the real thing" beat |
| 10 | Countersign | Director signs the "Program Administrator / Designee" slot — one tap on a saved signature (or draw); date stamps itself | note saved-signature reuse |
| 11 | Approve | Tap **"✓ Approve"** | ⚠️ selector gotcha: the check glyph in "✓ Approve" and status badges — rehearse the exact selector headless ([[screencast protocol]]) |
| 12 | Print | **Print** → the real **2-page government form** renders | screenshot the print preview |
| 13 | Integrity close | Cut to a one-line caption: record is sealed — hash + server timestamp, can't be edited or deleted | still frame; ties to the product description |

---

## After recording (not part of the take)

- Purge/ignore the `ZZSMOKE` Emma Carter row (it's parallel-run test data; and remember the
  seal — a sealed test row can't be deleted, so prefer a sandbox center or self-abort test
  path, per [[menumaker-signature-trail-live]]).
- Keep captions honest: anything not live (form-side consent checkbox; hard attendance meal
  gate) is **not** shown as if in force.

## Awaiting your word

Approve this scene list (or edit the beats), and I'll rehearse the selectors headless, then
it's ready for your live take. **No recording happens until you say go.**
