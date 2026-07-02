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
