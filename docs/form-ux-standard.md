# Form UX Standard ("form-kit") — spec

Status: **APPROVED 2026-07-07, build = tomorrow's batch.** Tonight nothing is flipped,
swapped, or committed. This doc is the build target for the retrofit.

**Scope.** A shared behavior layer applied to every parent/physician form on GitHub Pages
(`pa082508.github.io/forms/1-data-sources/`). Retrofit the **5 fresh conversions**
(`DCY_01234_v5`, `DCY_01236_v1`, `DCY_01217_v1`, `DCY_01305_v1`, `USDA_Waiver_v1`) **before**
they are wired into the storefront/registry `current` — cheapest to do while they are still dark.
Then extend to the already-live forms (`CACFP_Enrollment`, `IEA`, `special-diet`, `fluid-milk`,
`infant-meals`) in the same batch. **Retrofit + storefront `current` flips ship together.**

**Packaging.** One shared `forms/1-data-sources/form-kit.js` + `form-kit.css`, `<script defer>`-included
by each form (same origin as the embed iframe → embed keeps working; one cached file, no per-form
duplication). Forms opt in by adding `data-formkit` attributes to existing fields — no rewrite of the
per-form markup. The kit must be a no-op when its hooks are absent (progressive enhancement), so a form
without the attributes still submits exactly as today.

---

## 1. Inline validation + "N remaining"

- Validate on `blur` and on `input` (debounced ~250 ms), not only on Submit. Required fields carry
  `data-required` (+ `data-label` for the message). Invalid → red underline + a small message under
  the field; valid → clear it. Never block typing.
- A sticky mini-counter near the Submit button: **"N required fields remaining"**, live-decrementing.
  At 0 the Submit button goes primary/enabled; above 0 it stays but a click scrolls to + focuses the
  first unfilled required field (don't hard-disable — accessibility + paper-print parity).
- Reuse each form's existing `validate()` as the source of truth for *what* is required; the kit only
  renders the per-field state and the counter. Signature pads count as required fields when their box
  is `data-required` (e.g. parent_sig on 01234; parent_sig on the conditional medical forms).

## 2. Conditional sections (show/hide)

- Declarative: a container carries `data-show-when="<fieldId>:<value|truthy>"` (supports
  `!=`, comma-OR). Hidden sections are `hidden` AND their inputs are marked
  `data-inactive` so validation + `collectData()` skip them (no phantom required fields, no stale
  values in the payload).
- Drives the real branches already in the forms: 01234's allergy/medication/special-condition
  sub-questions → reveal the "see DCY 01236 / 01217" prompts; special-diet basis checkboxes → reveal
  the matching describe box; USDA waiver attestation → enable Submit. Mirror the registry
  `conditional.triggers[]` semantics so the packet-builder (Stage 3) and the form agree on the same
  trigger vocabulary.

## 3. Smart Monday — "Apply to whole week" (CACFP schedule)

- On the CACFP enrollment schedule grid: filling Monday's arrival/departure (and meal checks) shows a
  one-tap **"Apply Monday to Tue–Fri"** chip. Copies arr1/dep1/arr2/dep2 + meal checkboxes down to the
  other in-care days (skips days left unchecked as "not in care"). Fully undoable (one-level undo chip).
- Per-day override still works after applying — it's a seed, not a lock.

## 4. Meals auto-derived from hours × slots

- Given a day's in-care window (arrival→departure), auto-check the meals whose CACFP service window the
  child is present for, using a per-center meal-slot table (breakfast / AM snack / lunch / PM snack /
  supper / evening snack with start–end times). Presence overlap ⇒ pre-check that meal.
- **Auto-check is a suggestion, not a lock:** the parent can uncheck. Show a tiny "auto" tag on
  kit-checked meals so it's clear why they're on. Slot times come from center config (fall back to a
  sensible default table if the center hasn't set them). This removes the most error-prone manual step
  on the enrollment form (parents guessing which meals apply).

## 5. Explicit choice / consent buttons ("волеизъявление")

- Replace bare consent checkboxes with an explicit two-button segmented control where the form
  demands an affirmative *choice*, not a silent default: **Give permission / Do NOT give** (01234
  transportation authorization — already two separate signature blocks), **I DO NOT qualify** (USDA
  waiver attestation), immunization **Immunized / Medical exception / Parent declines** (01305 §B/§C).
- Neither preselected; a choice is a required field (counts in the §1 counter). The chosen value +
  which button routes to the correct signature block (e.g. transport give-sig vs deny-sig on 01234).

## 6. Tooltips

- `data-tip="…"` renders an ⓘ affix that shows on hover/focus/tap (touch = tap-to-toggle, dismiss on
  outside tap). Plain-language help for the jargon: "recognized state medical authority", "special
  diet vs disability", "reduced-price income guideline", "one form per medication", the 30-day /
  12-month validity clocks. Tooltips are `print:hidden`.

## 7. Cross-form autofill — "Apply my previous answers"

- **Canonical source = DCY 01234** (the enrollment record holds the fullest identity set). Extends the
  existing `pa_packet_profile` / `cacfp_packet` localStorage packet (90-min TTL) into a single shared
  schema keyed by canonical field names (child_name, dob, parent_name, parents/guardians, address,
  phones, email, center_code).
- On any subsequent form: a dismissible banner **"Apply my previous answers"** → fills matching
  empty fields, then `status('↳ Auto-filled from a previous form — please verify')`. Never overwrites a
  field the parent already touched. "New family / New child" clears the packet.
- **Session-only, client-side now.** The server-side, cross-device version rides the **Stage-3
  signed-link token** (the mint payload already carries `child_id`/`center`; the open route can seed the
  packet from the child record). Do not build a server packet store now — the token path supersedes it.

## 8. Encouragement banner + progress

- Top banner on packet forms: **"✨ Enrolling is faster than it looks"** + a **"Form N of M"** progress
  chip. N/M comes from the packet the parent is working through (from the storefront/library "Send
  selection" set, or the conditional set assembled by the Stage-3 packet builder). Standalone opens
  (no packet context) show the banner without the counter.
- The chip advances as each form's `packetSave()`/`done[FORM_ID]` flips, so returning to the storefront
  shows completed forms checked.

---

## Retrofit order (tomorrow)

1. Land `form-kit.js` + `form-kit.css` (no-op without attributes) on Pages.
2. Add `data-*` hooks to the 5 dark conversions; smoke each (fill → validate → submit to a test row).
3. Add hooks to the 5 live forms.
4. **Then** flip storefront `current` + swap `parent-forms.html` → the registry-driven v2 in the same
   deploy (race-safe: files live before `current` points at them).

**Standing constraints:** self-contained enough that the embed iframe still works; paper-print parity
preserved (all kit chrome is `print:hidden`); progressive enhancement (kit absent ⇒ today's behavior).
