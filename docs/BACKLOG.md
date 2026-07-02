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

## Permission-driven sidebar

Drive the sidebar nav from the user's permission set / modules (rather than the
static SECTIONS list), so each role sees exactly the nav it's entitled to.
