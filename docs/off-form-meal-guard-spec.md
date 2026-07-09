# Off-Form Meal Guard — spec

Status: **SPEC, not built.** Nikolay's decision. Queue position: **immediately after library + prefill**
(reuses their token/prefill/notification mechanics). Cascade (unchanged): gate → Staff-flip → library →
child flips → portions → **GUARD**. Related: `prefill-engine-spec.md`, `forms-registry-and-library-plan.md`,
memory `menumaker-claim-bridge-invariant`.

A compliance guard for **form ↔ actual meals served** — nudges the *form* to reflect reality, never the count.

---

## Hard rule (invariant) — counting is NEVER gated
There is **no counting hardness anywhere**: a meal that was actually served is **always counted and
claimed**. The guard is a **detector + form-revision nudge only** — it must never block, delay, or reduce
a claimed meal. (Consistent with the claim-bridge invariant: do not break counting/export.)

## 1 · Detector
- Compare each child's **daily meal counts** against the meals on their **active approved form**
  (the schedule in the latest approved `cacfp_enrollment` submission / the roster's stored schedule:
  per-weekday meal set B/AMS/L/PM/Supper).
- An **off-form meal** = a meal counted on a day whose form schedule does not include that meal for that
  weekday.
- Maintain an **off-form counter per child, per week, by meal type** (B / AMS / L / PM / Supper).

## 2 · Threshold → flag + prefilled link + email
**≥ 3 off-form meals in a week** (configurable, `app_settings`) triggers, for that child:
- **(a) Flag "form revision needed"** — visible to the director, **per-center list**. Same UI pattern as
  the **"awaiting 2026-27 form"** flag.
- **(b) Auto-generated PERSONAL prefilled form link** — via the portion/token mechanics: mint a
  per-child token; the `get_prefill` payload is pre-filled with **current data + the actually-received
  meals** so the parent's form already reflects reality. (Whitelist stays fixed; the "actual meals"
  become the schedule/meals field of the payload.)
- **(c) Explanatory email** — template: "your child's meal schedule has changed — the form must reflect
  reality; the schedule is tied to teachers' hours and meals." **Template must be agreed with Nikolay
  before first use.** Notification cadence follows the start-form policy (1–2 weeks).

## 3 · Reset
**Approve of the updated form** resets the off-form counter and clears the "form revision needed" flag.

## 4 · Audit (block-claim protection)
Persist a **per-child history of guard triggers** (week, off-form counts by type, link issued, email
sent, resolved-at). This is the ready-made answer to the review question **"why did the meals differ
from the form"** — evidence that the discrepancy was detected and the form corrected.

---

## Mapping to existing / planned mechanisms
- **Prefill link (2b):** the **prefill engine** (`prefill-engine-spec.md`) — mint token into `form_links`
  (add a `reason='off_form'`), `get_prefill` returns current data with **actual meals** as the schedule.
- **Flag + per-center list (2a):** same surface as the `awaiting_2026_27_form` flag / `action_items`
  (a `data_quality` item, or a dedicated roster flag — decide at build).
- **Reset on Approve (3):** hooks the Inbox Approve path (`approveCacfpUpdate`) for the child.
- **Counting untouched:** the detector reads the meal-count data; it never writes to it.

## Open items (resolve at build)
1. **Source of daily per-child meal counts** — identify the table/view the meal grid + Sheets export
   read from (per child × day × meal type). The detector reads this.
2. **Off-form counter storage** — a table (`off_form_meals`: child_id, week, meal_type, count) vs derived
   on demand; plus the trigger-history/audit table.
3. **Detector cadence** — background scan (a block in `refresh_action_items`?) vs a scheduled job; weekly
   boundary definition (Mon–Sun / claim week).
4. **Flag home** — `action_items` category vs a roster/`child` column; how it renders in the per-center
   director list.
5. **Threshold config** — `app_settings` key (`off_form_week_threshold`, default 3); per-org override.
6. **Email template** — Nikolay-approved copy + who sends (edge fn / office action) + de-dup (one email
   per open flag, not per week).
