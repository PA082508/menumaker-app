# MenuMaker — Backlog

Tracked, not-yet-started work. Owner: Nikolay. Newest context at top of each item.

> **Enrollment source of truth:** [`docs/specs/Enrollment_Approval_Loop_Spec.md`](specs/Enrollment_Approval_Loop_Spec.md)
> (v2, approved 2026-07-03 — includes the SafePass-channel decision). Imported into the
> repo 2026-07-04 so the spec is version-controlled here, not only in `~/Downloads`.

## Publish v2 — post-publication actions

**Scheduled after** current priorities (Deactivate → migration → Фаза 1). OK to land as
small commits opportunistically. **Channel principle (locked in the Approval Loop spec —
apply to ALL future notifications):** primary channel is **SafePass push + on-page
delivery log**; **email is a manual button only**, for families without the app; **no
automatic email blasts, ever.**

Current wiring (verified 2026-07-03): Publish lives on
[`MenuPrintOfficialPage`](./../src/pages/menu/MenuPrintOfficialPage.tsx) — button `📢 Publish
(next v{n})` at `:166`, gated `canPublish = director || office_manager || admin` (`:45`) +
RLS (`director/office_manager`). It inserts a new **version** row into
`menumaker.published_menus` (never overwrites). Read-only parent view already exists:
route `menu/published/:center/:year/:month` → `MenuPublishedPage` (public RLS read).
`send-push` edge function (`supabase/functions/send-push/index.ts`) is the only push
sender; payload `{ org_id, center_id, role, user_ids, title, body, url, tag, urgent }`;
today only `MessagesPage` calls it (raw fetch — **no shared `sendPush` helper yet**).

1. **SafePass push to parents on Publish** — send `«July menu published»` + deep-link to the
   published page (via `send-push`). Record a **delivery log**. (Build a reusable client
   helper instead of copying MessagesPage's raw fetch.)
2. **`/menu/current` route** — ✅ **DONE in-app (2026-07-03)** as a **redirect resolver**
   ([`MenuCurrentPage.tsx`](./../src/pages/menu/MenuCurrentPage.tsx), route `menu/current`
   in App.tsx): resolves center (`currentCenter` → first accessible fallback) + current
   calendar month, redirects to `menu/published/:center/:year/:month` (which already picks
   the latest version). **Remaining:** the route still sits under `ProtectedRoute`, so
   playacademyusa.com can't yet embed it anon — public/website exposure (an unauthenticated
   published route + the public read RLS is already in place) is the open sub-task here.
3. **PDF packet → Document Hub on Publish** — auto-file the print-ready PDF set into the
   Document Hub / `center-docs` storage so stands can be printed without manual generation.
   (Menus currently print client-side via `OfficialMenu` + `window.print()` — no server PDF
   yet; this needs headless/SSR render of `OfficialMenu`.)
4. **No email on Publish** — decision (Nikolay): SafePass is the single channel; email stays
   manual/point-based only. Nothing to build; guardrail for reviewers.
5. **Nav discoverability** — ✅ **DONE (2026-07-03):**
   - MenuPlanner Publish button was hidden behind `📄 Official Menu (Month)` → renamed to
     **`📢 Publish / Official Menu`** with a clearer tooltip, so director/office_manager
     (who already have `canPublish`) can find it. (`MenuPlannerPage.tsx`.)
   - Added a **"Current Menu"** sidebar item under Planning → `/menu/current`
     (`AppLayout.tsx`). Shares Menu Planner's `menu_planner` module gating (basePath
     `/menu`), so whoever sees the planner sees it. cook/teacher use the flat `NAV_ITEMS`
     and don't see it — fine.

## Instructions — Stage 2: short feature videos

Add short per-feature walkthrough videos to the Instructions page. The renderer
**already supports video** — frontmatter `video: <url>` or a `![video](url)` in the
body embeds a YouTube/mp4 player. Stage 2 is producing the clips and dropping the
URLs into each `docs/instructions/<module>.md`. Video scripts to be written by the
architect. Direct-mp4 clips can live in org-files.

## Task F — policy_documents + SafePass Agreement version binding

Implement versioned `policy_documents` storage and bind the **SafePass Agreement to a
policy version**, so SafePass access requires the current signed agreement
(re-signing when the version changes). Process is documented in
[policies-handbook.md](./instructions/policies-handbook.md); spec sent earlier.

## Classroom UPDATEs (Nikolay's decisions) — ✅ DONE (verified 2026-07-02)

Verified already applied in `menumaker.classrooms.name` (and the denormalized
`meal_week_records.classroom`); **0 stale rows** — July accounting already uses the
new names.
- **Pearl** — Red Room → **Pre-K** ✓ · Orange → **Orange 1 Room** (+ Orange 2 Room) ✓
  · School Age → **School-Age 1** (+ School-Age 2) ✓
- **Alpha** — SA → **SA Room** ✓ · Orange split → **Orange 1 Room / Orange 2 Room** ✓

## Holidays — consider org-scope (or org-template-generated center rows)

The org has a single holiday calendar and a single menu for all centers, but
`holidays` is **center-scoped** in the DB (one row per center). Parity is currently
maintained by hand. Consider moving holidays to **org-scope**, or generating the
per-center rows from an **org template**, so Pearl/Alpha/Ridge stay identical
automatically. (Parity verified clean 2026-07-02; the official form filters by
`center_id`, so any drift would silently change one center's holiday columns.)

## [HIGH] Deactivate child — END DATE ≠ deactivation (CACFP claim risk)

**Bug-pairing (verified 2026-07-02).** `ChildSettingsPage` END DATE saves
`roster.date_out` **only** — it never sets `is_active=false`. Filters diverge:
- Roster / Children views filter `is_active=true` **AND** `date_out null OR ≥ today`
  → ended child is hidden.
- **Meal Count** (`MealCountPage`, `MealCountDirectorPage`) and **Reports**
  (`KitchenPlanningReport`, site claim, etc.) filter **`is_active=true` only** — an
  ended child (date_out past, still `is_active=true`) **remains countable** →
  departed children can be claimed. The office works around this by flipping
  `is_active` via **raw SQL**.

**Full Deactivate task (spec'd earlier) — do this:**
- **Deactivate button** with a confirmation dialog → sets `is_active=false`
  (+ `date_out` if not set). Optional reason.
- **Reactivate** action; an **"Inactive" filter/tab** on the roster to view/restore.
- Make meal-count + report roster queries **also honor `date_out`** (defense in depth),
  or standardize a single "active on date D" predicate used everywhere.
- Instruction in `children.md` (per DoD).

## [HIGH] Harden safepass_sign before real signature collection

The anon `safepass_sign` RPC currently **trusts the client** — OK for the test phase,
**not** for legally-significant signatures. Before collecting real signatures:
- **Server-side verified-phone check** — move OTP to a DB-backed session
  (`safepass_sms_otp`), not `sessionStorage`; `safepass_sign` should only accept a
  person whose phone was verified server-side in the current session.
- **Rate-limit** the RPC (per phone / per device / per IP).
- Consider binding the signature to the verified session id + captured IP.

## SafePass addendum — teacher-side enforcement (Staff onboarding)

Task F wired the **parent** consent gate (sign the active `safepass_addendum` version
before Home; re-sign on version bump). **Teachers** must also acknowledge the addendum
— deferred to the **Staff onboarding** flow: gate the teacher SafePass app on a
`safepass_agreements` row with `person_type='teacher'` bound to the active version
(reuse `safepass_has_signed` / `safepass_sign`).

## Parent-forms packet standard — roll out to existing forms

Apply [`platform-standards.md §5`](./platform-standards.md) (dates / phones /
address / cross-form autofill via `pa_packet_profile`) to every existing form in the
parent-forms packet. Reference implementation: `IEA_FY2026-27_full_v1.html`
(`fmtPhone` / `kidAge` / `loadProfile` / `saveProfile` / `applyProfile`).
**Scheduled after** D.2 → STABLE-E → F.

## Permission-driven sidebar

Drive the sidebar nav from the user's permission set / modules (rather than the
static SECTIONS list), so each role sees exactly the nav it's entitled to.

## Roster ↔ center license reconciliation (economics-engine input)

Reconcile the live roster against each center's DCY license (2026-07-05, Capacity
& Ratio rework). For a center, count active roster children **under 3** vs **3+**
(by `birthday` on a given date) and compare to `centers.license_under3_max` /
`license_3plus_max`. Surface an indicator (headroom / at-cap / over). The unused
headroom = licence reserve = potential revenue → feeds the economics engine.

Also: **license-field overlap to reconcile.** `centers` now has FOUR license-ish
ints: legacy `license_capacity` (total) + `license_capacity_under2` (under-2,
edited in Center Info) AND new `license_under3_max` / `license_3plus_max` (DCY
under-3 / 3+, edited in Capacity & Ratio). Different thresholds (under-2 vs
under-3) — decide the single source of truth and retire/migrate the rest.
Per-room `capacity_ohio` is kept in the DB but hidden in the UI (per-room numbers
are inspection facts on a date, not limits).
