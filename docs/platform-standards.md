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
- Current: `?v=5` across all kit-form includes (Pages `pa082508.github.io`).
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

---

## The registry is never fetched cacheably (2026-07-14)

`enroll-registry.json` **is** the flip mechanism — `current` is how a new version
reaches parents. Every read of it, in the app and on the Pages storefront/forms,
**must** be `fetch(url + '?t=' + Date.now(), { cache: 'no-store' })`.

- `cache: 'no-cache'` is **not enough**: it revalidates, but GitHub Pages' edge TTL
  can still return a stale registry, so a flip lands on one surface and not another.
- All app fetches were covered by PR #25; five kit forms were still reading it bare
  and were fixed in the same sweep (Pages f03b3b0).

---

## QR and share links point at the storefront, never a file (2026-07-14)

**Any QR or copied link a PARENT receives must encode
`parent-forms.html?center=<slug>&only=<formKey>`** — use `storefrontOnlyUrl()` /
`storefrontPacketUrl()` from [`src/config/showcaseLinks.ts`](../src/config/showcaseLinks.ts).
Never `versions[current]`, never `fallbackUrl`, never a raw file URL.

**Why:** the storefront re-reads the registry on every open, so a flip reaches the
parent instantly. A QR that encodes a file URL freezes that version **on paper**. The
Add-Child panel QR for DCY 01218 encoded
`.../3-library/ohio-dcy/Basic Infant 2026 DCY-01218.PDF?center=alpha`, so scanning it
kept returning the flat PDF after v2 went live — a QR on a wall would have done that
forever.

- Director-facing **Download / Print may** hit the file directly — the director wants
  the artifact, not the storefront. Only the parent-facing QR/link is constrained.
- Surfaces under this rule: `AddChildPacketPanel`, `/issue-packet`
  (`ParentPacketPage`), `DocumentHubPage`. Guarded by
  [`src/config/showcaseLinks.test.ts`](../src/config/showcaseLinks.test.ts) — every
  form × center must be a storefront URL and must not look like a file.

---

## Staging: `git add` only an explicit list of TRACKED files (2026-07-14)

**Never `git add -A`, `git add <dir>`, or `git add $(grep -rl ...)` in a repo that
holds dark work.** Use `git add -u` (tracked, modified) or name the files.

**Why:** a kit-bust ran `git add $(grep -rl 'form-kit.js?v=3' .)`. grep walks the
**working tree** and cannot know what is dark, so it swept in the untracked
`Staff_Consent_v1.html` and published an unreviewed staff form to Pages (HTTP 200,
commit 31027c2). No card linked it, but the URL was guessable and the form would have
written real `enrollment_submissions` rows. Unpublished in efb0576 (verified 404);
`enrollment_submissions` held **0** staff rows, so nothing was filed.

A "mechanical" bulk edit is exactly when this bites: the change is trivial, so the
staging step gets no attention. Check `git status --short | grep '^??'` before any
commit that touched more than one file.

---

## Signature samples are scoped per signer role (2026-07-14)

Adopted-signature samples live on **per-role shelves**: `pa_sig_sample:<scope>`, where
scope is the **value** of `data-fk-mint` / `data-fk-adopt`. A bare attribute means
`parent`, so forms written before scoping are unaffected.

**Why:** Staff Consent shipped `data-fk-mint="staff"` — which *looked* namespaced but
was inert: the kit matched on attribute presence, ignored the value, and used a single
shared key. Add-Staff runs on the director's **kiosk, the same tablet that just filled a
family's packet**, so a staff pad would have offered the **parent's** signature. A JD
acknowledgment signed that way is a forged signature.

- A pad reads **only** its own scope's key. **Never** collapse the shelves back to one
  key, and **never** let adopt fall back to another scope when its own is empty — an
  empty shelf must degrade to draw/type.
- The **name on a sample is declared, not guessed**: `data-fk-mint-name="<selector>"`
  or `CFG.mintNameSelector`. The old hardcode (`#parent_name` / `#f_parent_name`)
  silently produced an empty name on any non-parent form.
- Smoke that must stay green, in all four directions: parent shelf → parent offers,
  staff does not; staff shelf → staff offers, parent does not; both shelves → each pad
  from its own; legacy unscoped key → parent honours it, staff ignores it.

## The app registry mirror ships with the flip (2026-07-15)

The app keeps its **own copy** of the registry at `public/enroll-registry.json`. The
Library, the Add Child / Add Staff panels, the Inbox and the review modal all read
**that copy**, not the one on Pages. A Pages flip therefore changes nothing a director
sees until the mirror is merged.

**A Pages marker without a mirror marker means the flip is NOT closed.** Put the mirror
merge on the flip checklist next to the kit-bust.

**Why:** twice in twenty-four hours. WIC v1 went live on Pages (`e7a715c`) and needed a
separate mirror commit (`f085c74`). Then start_form and the Parent Handbook went live
(`74e1c04`, `5967899`) while the app still described both as *"director provides"* — the
storefront handed families a form the app told their director did not exist yet. The same
merge revealed `conditions.sleep_position_waiver` had been missing from the mirror since
the 01218 v2 flip, so the app never knew a non-back sleep position needs a waiver.

- Mirror **forms / packets / conditions** wholesale — every other block is identical, and
  hand-picking keys is how drift starts.
- Read back from the deployed app (`/enroll-registry.json` on Vercel), not from the file
  you just wrote.

## Read-back of a surface is not a recompute of its data (2026-07-15)

Deriving what a page *should* render from the data it reads is **not** a read-back. It
proves the input, not the surface: not that the card rendered, that it is clickable, that
it is legible, or that nothing above it swallowed the click.

If a surface is behind auth and cannot be driven, **say so and hand it to a human** — do
not publish the derivation as if it were the check. This is the [Finding-closure
rule](#finding-closure-rule-2026-07-14) applied to our own reports: a finding closes on
the same surface a person uses.

## User-facing strings are English (2026-07-15)

Every string a family or an employee can read is **English**. We spec in Russian; the
product does not.

**Why:** `form-kit.js` shipped `btn.textContent = '✍️ Внести подпись'` — hardcoded, next
to an English hint. **12 forms** carry an adopt pad, including the whole parent packet, so
every Ohio family that signed the Consent then met a button they could not read. It
leaked straight out of the spec conversation into the product and no one saw it for a
day; the dual-role smoke caught it while asserting something else entirely
(`2961d1c`).

- Assert it with **`scripts/assert-english.mjs`** — it renders every live form + packet
  (`versions[current]` from the registry) and walks the **rendered DOM**: text nodes,
  placeholders, aria-labels, titles. Comments and commit messages are exempt; the DOM is
  not. A grep cannot tell a comment from a label and flags both — this can.
  ```bash
  node scripts/assert-english.mjs          # local Pages checkout
  node scripts/assert-english.mjs --live   # pa082508.github.io
  ```
- It earned its keep on the first run: the **live** Income Eligibility Application was
  rendering `иначе PAID. Foster или валидный 7-значный SNAP/OWF номер` in its on-screen
  helper — the one line explaining the Free/Reduced/Paid determination, unreadable to the
  family it explains it to (`19fef52`).
- A Russian label in a spec is a **description of intent**, not the copy. Translate it at
  the code boundary.

## Smoke rows are tagged and swept (ZZSMOKE, 2026-07-15)

A smoke that writes goes through the **real channel** the user's device uses — the public
RPC with the anon key, not an elevated SQL insert — because that is the path that can be
broken.

- Tag every smoke row `form_data.smoke_tag = 'ZZSMOKE'`, then delete by that tag and
  **read back the count as 0**, plus the table total and `max(created_at)`, to prove the
  baseline is untouched.
- **Prove the delete before the insert.** Write one row you fully control, delete it, see
  0 — *then* smoke for real. `enrollment_submissions` is live and a director is looking
  at it; discovering you cannot clean up afterwards is discovering it too late.
- The tag lives in `form_data` and never renders. Give a demo row a **human name** — a
  screencast or an Inbox showing "ZZSMOKE Parent" reads as test garbage to a director.

## Assert scripts declare their dependencies (2026-07-15)

An assert that cannot run is not a check. `scripts/assert-submit.mjs` — the mandatory
per-run check — imported `playwright`, which was never in `package.json`. On any clean
checkout `npm ci` succeeded and the assert failed at import, so the check silently did not
run for anyone who installed from scratch (`c945252`).

Every dependency an assert imports is declared. The check is `npm ci` → assert, on a clean
environment.
