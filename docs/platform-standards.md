# MenuMaker — Platform Standards

Canonical, cross-cutting rules every feature must follow. Owner: Nikolay.

---

## 1. Child name display — "Last First" (CACFP canonical)

**Rule.** Children are always displayed as **`Last First`** (e.g. `Rodriguez Juan`).
Brightwheel's native `First Last` order is *display-only* divergence and must be
normalized on render — **never** in the database.

**Data is already correct.** `first_name` and `last_name` always live in their own
columns. The import pipeline writes them structured and sets the denormalized
`child_name = last_name + ' ' + first_name`. We do **not** rewrite stored data to
"fix" display.

**Helper — the single source of truth:** [`src/lib/childName.ts`](../src/lib/childName.ts)

```ts
displayChildName(child)  // "Last First"; falls back to child_name when
                         // first_name/last_name are empty (fiscal rows imported
                         // from the Master List — child_name is already "Last First")
```

**Use `displayChildName` everywhere a child name is rendered.** Do **not**
hand-roll `[first_name, last_name].join(' ')` — that produces the wrong order.

`child_name` remains the identity / join key into records tables
(`meal_week_records`, etc.) — only the *label* changes.

Wired: CenterRosterPage, ChildrenPage, ChildSettingsPage (header), MealCountPage,
MealCountDirectorPage. SafePass portals expose only a stored `child_name` string
(roster-joinable first/last unavailable — see SafePass tech-debt) and so render it
as-is.

---

## 2. Child list sorting — two contexts

Sorting depends on the context. Two comparators live in
[`src/lib/childName.ts`](../src/lib/childName.ts): `byEnrollmentName`, `byAgeOldestFirst`.

### 2a. CACFP contexts → **by age, oldest first** (`birthday ASC`)

Meal count (pages **and** parent/teacher portals), the milk panel, CACFP reports,
and every printed CACFP form. Children with no `birthday` sort to the **end**.

- SQL: `.order("birthday", { ascending: true, nullsFirst: false })` then a stable
  tiebreak (`child_name` / `last_name`).
- In-memory: `byAgeOldestFirst`.

Wired: MealCountPage, MealCountDirectorPage, `utils/PrintMealCountForm.ts`.

### 2b. Enrollment contexts → **alphabetical** (`last_name, first_name`)

Roster / class lists and cards (CenterRosterPage), ChildSettings pickers, the
Smart List.

- SQL: `.order("last_name", { nullsFirst: false }).order("first_name")`.
- In-memory: `byEnrollmentName`.

Wired: CenterRosterPage, ChildrenPage (already alphabetical).

---

## 3. Fiscal / roster data import

See [`import-alpha-pearl-plan.md`](./import-alpha-pearl-plan.md). Key invariants:

- Active roster rows created from Food + Brightwheel → `source = 'food_import'`;
  departed / fiscal rows from the Master List → `source = 'masterlist_fiscal'`.
  Operational roster rows keep `source = null`. Enables one-query cleanup.
- `income_eligibility` snapshots are `source = 'MasterListFood'`, keyed unique on
  `(org_id, roster_id, source, fiscal_year)`.
- Fiscal SQL is **idempotent**: roster `INSERT … WHERE NOT EXISTS` +
  income `… ON CONFLICT DO UPDATE`.
- **Dedup within a run:** roster `SELECT DISTINCT ON (norm_name)`,
  income `SELECT DISTINCT ON (roster_id) ORDER BY roster_id, income_doc DESC` — a
  single INSERT must never touch the same conflict target twice
  (Postgres error 21000). Known same-name collisions (e.g. Cruz Robert in Pearl)
  are excluded from the main INSERT and added manually as `MasterListFood#2`
  history rows.

---

## 4. Definition of Done — documentation ships with the code

**Rule.** The **Definition of Done for any new feature = code + a section/paragraph
in [`docs/instructions/`](./instructions/).** The instruction is updated in the
**same commit** as the code — never "later".

- Each user-facing module has one markdown file: `docs/instructions/<module>.md`,
  rendered in-app on the **Instructions** page (route `/instructions`).
- Files carry frontmatter with the roles the section is for, e.g.
  `roles: [director, cook, teacher, admin]`, so content filters by role.
- Applies from **D.1 / D.2 onward** (Menu Planner cosmetics + Official Print form
  were the first features documented under this rule).

> A feature with no `docs/instructions/` update is **not done** and should not be
> merged.

**Shippable = the *committed* tree builds, not just your working tree.** A local
`tsc`/`build` can pass on files that are only on disk (untracked). Before calling
work shippable, verify the committed tree in isolation — e.g.
`git archive HEAD | tar -x -C /tmp/clean && (cd /tmp/clean && ln -s <repo>/node_modules . && tsc --noEmit)` —
and **push**. "Done" means **committed ✓ · pushed ✓ · deployed ✓** (Vercel Ready),
not just committed.

---

## 5. Parent-forms packet standard

Established in **IEA FY 26-27**. **Apply to every form in the parent-forms packet**
when it is created or reworked. Reference implementation (the helpers
`fmtPhone` / `kidAge` / `loadProfile` / `saveProfile` / `applyProfile`) lives in
**`IEA_FY2026-27_full_v1.html`**.

### 5.1 Dates
- Every date field is `type="date"`.
- **Signature dates**: default to **today**; set `data-touched` when the user edits
  one manually.
- On **`beforeprint`**: untouched signature dates refresh to today; **empty** date
  fields temporarily switch to `type="text"` so the `mm/dd/yyyy` placeholder does
  **not** print (switch back after).

### 5.2 Phones
- `type="tel"` with a `(XXX) XXX-XXXX` mask (`fmtPhone`), `autocomplete="tel"` /
  `tel-work` as appropriate.

### 5.3 Address / name
- `autocomplete`: `name`, `address-line1`, `address-level2`, `postal-code`.
- **County** is a `datalist` (options: Cuyahoga, Lake).

### 5.4 Cross-form autofill
- `localStorage` key **`pa_packet_profile`** = `{ ts, data: { child1_name,
  child1_dob, …, parent_name, phone_day, phone_work, street, city_state_zip,
  county, center_name } }`. **TTL 90 minutes.**
- Opening a form with a fresh profile shows a **"Fill known fields"** banner
  (`applyProfile` fills **only empty** fields — never overwrites).
- Each form writes its own fields back to the same key **on blur** (`saveProfile`).

> **Rollout to existing packet forms** is a separate task, scheduled **after**
> D.2 → STABLE-E → F. Tracked in [`BACKLOG.md`](./BACKLOG.md).

---

## 6. Date-input normalization (2-digit year)

**Rule.** Every date field entered as **text** normalizes its value with
**`normalizeDateInput`** ([`src/lib/dateInput.ts`](../src/lib/dateInput.ts)).

- Accepts a **2-digit year** and expands it; separators `/`, `-`, `.`, or none:
  `7/2/26`, `07/02/26`, `7-2-26`, `070226`, `7/2/2026` → **`07/02/2026`**.
- **Century window:** year `00–49` → `20xx`, `50–99` → `19xx`.
- Apply **on blur** (not per keystroke). On invalid input (`13/45/26`, `2/29/26`),
  **soft-highlight** the field and **keep the value** — never erase it.
- The util returns `{ ok, display: 'MM/DD/YYYY', iso: 'YYYY-MM-DD' }`; store `iso`,
  show `display`. `isoToDisplay(iso)` converts stored values back for editing.
- **Native `<input type="date">` fields are exempt** — the browser completes the
  year. Do **not** touch them.

**Inventory (2026-07-02):** the app currently has **no text date fields** — all 28
date inputs (Add Child, staff, Settings, report filters, etc.) are native
`type="date"`. The util + tests exist and stand ready; wire it the moment a text
date field is introduced (in-app or in a GitHub-Pages packet form). Tests:
[`src/lib/dateInput.test.ts`](../src/lib/dateInput.test.ts) (documented formats +
century window + edges: `13/45/26` invalid, `2/29/24` valid, `2/29/26` invalid).

---

## Finding-closure rule (2026-07-14)

A defect found on a specific **entry point** (surface + full URL) is **closed only
by Nikolay's live sverka on that same entry point** — not by a passing headless
render of the target URL.

- A headless render of the resolved URL is **necessary** (proves the target is
  healthy) but **NOT sufficient** — it does not exercise the surface that built
  the link, the device, the cache, or the embed context.
- A diagnostic must enumerate **every** surface that can open the artifact
  (storefront default + `set=`/`only=`, AddChildPacketPanel, /issue-packet,
  Library/DocumentHub, in-app embed) as a table: surface → slot → URL → what is
  actually served → verdict. Covering one entry is not covering the finding.
- Re-open, don't re-close, when a symptom recurs: the earlier "fixed" was scoped
  to one entry; find the entry that still reproduces.

---

## form-kit versioning (kit-bust rule, 2026-07-14)

Every `<script>` that loads `form-kit.js` from a kit form MUST carry a version
query: `src="form-kit.js?v=<N>"`. **Any change to `form-kit.js` = bump `?v=<N>`
in all kit-form includes in the same commit.**

- Without the bump, returning devices (especially in-app webviews) serve a
  **cached old kit**, which silently hides newly added functions — the feature
  ships but users never see it. (Learned from the Consent stale-cache incident;
  applied to the kit itself.)
- Current: `?v=3` across all kit-form includes (Pages `pa082508.github.io`).
- This is separate from the watchdog's dynamic `form-kit.js?r=<ts>` retry, which
  cache-busts a *failed* load; `?v=<N>` cache-busts a *changed* file for everyone.

---

## Submit assert — presence is not enough (2026-07-14)

**Every kit form, every run, plus the daily health-check, MUST assert that Submit is
PRESENT *and* ENABLED (with `?center=`) *and* VISIBLE, and that the page raised ZERO
JS exceptions.** Run `scripts/assert-submit.mjs` (`--live` to hit Pages).

Visible means measured, not assumed: compute `getComputedStyle` on the Submit button
and require real contrast between `background-color` and `color`. A presence check
(`querySelector` + `!disabled`) **passes a button that is white-on-white** — that is
exactly how finding #5 escaped a headless matrix and reached a live parent surface.

Why it happens: the kit **reuses the form's own toolbar div**, so any CSS the form
ships for `.toolbar button` still cascades onto the kit's buttons. A form rule
`.toolbar button{background:#fff}` (0,1,1) outranks a bare `.fk-tb-submit` (0,1,0).

- Kit toolbar button rules MUST stay scoped `.fk-toolbar button.<cls>` (0,2,1).
  **Never weaken these selectors** back to a bare class.
- A new kit form that ships its own `.toolbar button` CSS is not a bug by itself —
  the kit must out-specify it. Add the form to the assert list and prove it.
- Corollary to the finding-closure rule: a green assert is necessary, not
  sufficient. For anything the parent SEES, look at a screenshot before closing.

### Center pickers are forbidden (finding #6, 2026-07-14)

The center is authoritative from `?center=` / kiosk / embed **only**. No form may
ship a reachable center `<select>`: a parent filing against the wrong center is a
claim-integrity risk. The kit sweeps the whole document in `boot()`
(`stripCenterPickers`) — position on the page must never decide, which is exactly
how USDA's `.center-pick` block survived a strip that only walked toolbar children.
An unresolved center is a dead end (Submit disabled + "open from your center's
link/QR" banner), never a picker fallback.

- The assert fails on any center picker in the DOM, visible or not.
- If a picker fed a printed field, the kit must refill it from the resolved center
  (`FormKit.centerName()` → `#f_center` / `#p1_center` / `[data-fk-center-name]`).
  Removing the picker without this silently blanks the field — that is how enroll v9
  and IEA v6 printed an EMPTY Center for two days.
