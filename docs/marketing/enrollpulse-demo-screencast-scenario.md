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
| 0a | ZZ Demo center exists (`zzdemo`), registry deployed, `window.__build` = current sha | verify deploy, rule out cache |
| 0b | Director "Alex Rivera" logged in on desktop/Chrome | the office/retrieval parts need the director session |
| 0c | Fictional data sheet ready (Emma Carter, Jordan Carter, 555 numbers) | no real PII on screen |

## Part 1 — Parent path (from home)

| # | Beat | On screen | Screen-rule |
|---|------|-----------|-------------|
| 1 | Open the link | Parent opens the ZZ Demo QR/link on a phone; the official enrollment form loads, pre-scoped | show the URL is pre-scoped (center already set) |
| 2 | Guided entry | Child + parent details; DOB date picker; phone/address validation catches a bad phone, then accepts a good one | pause on the validation catch — the "fewer errors" beat |
| 3 | Meal times | Pick care days + meal times from the center's schedule | brief |
| 4 | Sign — draw (**FKPad**) | Tap the parent slot → **FKPad** opens; parent **draws big**, it **scales to fit** the small slot (bbox scale-to-fit, no clipping) | **wow beat #1** — draw-big/fits-small |
| 5 | Date auto-stamps | The date beside the signature **fills itself**, read-only | **wow beat #2** — linger 1s |
| 6 | (Optional) Type instead | Quick cut: clear, **type** the name, pick a script style — same result | keep short |
| 7 | Submit | Submit → confirmation | **assert Submit visible by measured contrast** ([[submit assert]]); screenshot confirmation |

## Part 2 — Office / Director path

| # | Beat | On screen | Screen-rule |
|---|------|-----------|-------------|
| 8 | Inbox | Director opens the enrollment Inbox; the new **Emma Carter `ZZSMOKE`** is at the top | filter/scroll to the ZZSMOKE row |
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
