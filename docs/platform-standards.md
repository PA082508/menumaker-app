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
