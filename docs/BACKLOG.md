# MenuMaker — Backlog

Tracked, not-yet-started work. Owner: Nikolay. Newest context at top of each item.

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
