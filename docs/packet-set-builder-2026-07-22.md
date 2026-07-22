# Packet-Set Builder — CRUD + map-gate (branch `feat/packet-set-builder-crud`)

Task (3) of the 22.07 delegation. Built **on a branch, not merged** (new director
functionality stays off prod per the delegation). срок-fix (task 1) went to prod
separately as the campaign-52 gate.

## Interpretation used (default [к утверждению])
"заключительный форм-заказ / карта-ворота" read as: **finish the Packet-Set
Builder** — the concluding piece of the Campaign/Set Builder — with the paper-forms
map (task 2) as the gate for what a set may contain. Rationale: the two Explore
sweeps both point here; RLS already permits create/archive; only the UI was missing;
and "заказ/ZAKAZ" in this project means a work-order, not a customer order entity.
**If you meant something else by "форм-заказ" (e.g. a per-family issue/order record),
say so and I'll repoint — the branch is cheap to redirect.**

## What was built (all client-side; zero migrations, zero live-DB writes by me)
On `src/pages/enrollment/PacketSetsPage.tsx` (route `/packet-sets`, from the Children hub):
1. **＋ New set** — creates a `custom` set for the active center (owner in Org view picks
   the center). Starts empty. Readable slug auto-generated; on a unique-slug clash it
   retries with `slug:null` (the QR keys off the row id, so null is fine).
2. **Rename** — inline, custom sets only.
3. **Archive / Unarchive** — custom sets only (`status` toggle). No hard delete anywhere
   (RLS drops DELETE). Base sets show **no** rename/archive control — the DB blocks it and
   a dead button would lie.
4. **Map-is-the-gate** — the forms library seam (`src/lib/formsLibrary.ts`) gained a
   `publishable` flag (`isPublishable()`): a form the registry marks PENDING / `current:null`
   is shown in the picker but **greyed and unpickable**, and if it's already inside a set it's
   flagged **"not published"** (never silently dropped). Today this catches `dcy_01217`,
   `dcy_01236`. Rationale: a family must never get a link to a form that isn't built.

All new behavior mirrors the existing `packet_sets` RLS (`20260721_packet_sets.sql`,
`…c_packet_sets_org_admin.sql`) — director creates/edits custom sets for their center;
owner manages base + all centers; base un-archivable.

## Verification
- `npx tsc --noEmit` clean · `npx vitest run` **158/158** (+9 new: `isPublishable` +
  `toFormLibItems` wiring) · `npx vite build` clean.
- **Not yet done: Nikolay's live сверка** on the real page (headless is necessary, not
  sufficient — finding-closure rule). Checklist below.

## сверка checklist (3–5 taps, same entry point: Children → 🗂 Packet Sets)
1. **Create** — ＋ New set → name it → Create. Appears selected, empty, tagged `custom`.
2. **Gate** — in the library picker, `dcy_01217` and `dcy_01236` are greyed with a
   "not published" chip and can't be added; a normal form adds fine → Save composition.
3. **Rename** — Rename → new name → Save name. Header updates.
4. **Archive** — Archive → `archived` tag; the QR line still resolves. Unarchive → back to active.
5. **Base guard** — open base "Admission (Starter)": it shows `dcy_01217`/`dcy_01236` flagged
   "not published" in its list (not dropped), and as a **director** you see no Rename/Archive on
   it (view-only); as **owner** you can edit its composition but still can't archive it.

## Open questions → defaults [к утверждению]
1. **"форм-заказ" scope.** Default: this = finishing the Set Builder (above). If you want a
   persisted per-family *order/issue* record (the `campaign_issues` pattern exists as a
   template), that's a larger follow-up — flag it.
2. **Base-set PENDING members.** The base Admission set lists `dcy_01217`/`dcy_01236` today.
   Default: **leave them, flagged** (honest; they light up when built). Alt: strip them from the
   seed. — recommend leave.
3. **Storefront defense-in-depth.** `resolve_packet_set` / `parent-forms.html` (Pages repo)
   should also skip PENDING keys at render, so even a stale set can't serve an unbuilt form.
   Default: **add it as a Pages follow-up** (out of this branch).
4. **Create scope for owner.** Default: owner's ＋New creates a **custom** set for a picked
   center (never a base set — base stays seed/owner-curated). Confirm.
5. **Duplicate key cleanup.** `center_parent_info` (docx) vs `center_parent_information` (pdf) —
   reconcile to one? Default: **leave for now**, note in map.

## Preview
Branch pushed for a Vercel preview build (not prod). Link in the chat report.
