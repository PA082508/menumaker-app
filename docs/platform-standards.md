# MenuMaker — Platform Standards

Canonical, cross-cutting rules every feature must follow. Owner: Nikolay.

**Before building anything, read [`DECISIONS.md`](./DECISIONS.md)** — the index of every locked
decision across all 25 specs: what already exists, and what re-building it would look like.
Search it by the **noun of the function**, not by the word of your task. That mistake is why
`campaign_issues` became a second token store while the decision sat in `prefill-engine-spec.md`.
A new locked decision is written into that index **in the same commit as the code**.

---

## Roles: the org-level seat is a hired General Director, not the owner (2026-07-21)

The organization-level role — internal keys `admin` / `office_manager`, predicate
`menumaker.is_org_owner()`, "org-admin" in code — is a **job, not ownership**. In a large
multi-center group the owner does not run the platform day to day; a **hired General Director**
executes the org-level duties. Every org-level right therefore attaches to the **ROLE**, never
to a person or to ownership:

- the forms library (create/edit the forms themselves) and the forms-dev agent;
- base, "network-standard" packet sets;
- income determination (IEA / USDA waiver) — its content, countersignature and Approve;
- which library forms a center director may compose from (the access layer).

Rules every spec and feature follows:
- **Rights are role-bound.** Name the ROLE (*General Director* / org-admin), never a person.
  "At Play Academy this seat is held by Tatiana" is a deployment fact — written as a
  parenthetical, never as the binding itself.
- **Internal keys are frozen.** `admin`, `office_manager`, `org-admin`, `is_org_owner()`,
  `can_manage_base()` and every RLS predicate stay exactly as they are. This canon renames only
  the **human-facing LABEL**, never a role key or a policy.
- **UI / doc label — TBD.** Nikolay picks the English label from the proposed options; until then
  write `General Director (org-admin)`.

A center **director** is scoped to their own center and never inherits org-level rights — the
boundary is identical whether the org-level seat is the owner or a hired executive. This is why
income determination, base-set editing and forms authoring route to the General Director role,
not to whoever happens to own the company.

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

Wired: MealCountPage, MealCountDirectorPage, `utils/PrintMealCountForm.ts`,
`AttendanceBlankReport`.

**The Weekly Attendance Report blank is 2a, not 2b** (settled 2026-07-16). It looks
like a class list, so alphabetical is the intuitive read — and it's wrong. The owner's
sample sheet, the one inspectors passed unremarked, is age-ordered: Bates 9/2023 →
Robinson 10/2023 → … → Kendzierski 4/2024. The blank is a **replica**, so it follows
the sample. When a printed form is a replica of a form the centre already uses, the
form decides its own order — check the sample before reasoning from the rule.

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

## Only a signed document may state what decides money (2026-07-16)

Nikolay's rule: **trust only the signed document where it bears on reimbursement; a
director may change only what does not affect rate determination** — phone, e-mail,
address and the like.

A director sitting with a parent will always be able to *say* the right birthday. That
is not the point. The claim is evidence, and its evidence is the parent's signature. The
only honest way to change what the parent stated is a **corrected form they sign again**,
which supersedes the first — never a click in the review panel.

- The list is `RATE_CRITICAL` in `src/lib/enrollmentFieldMap.ts`, enforced in the shared
  `row()` builder, not at call sites — a row added later cannot forget the lock. Dropping
  `editPath` is what forbids the write; `rateLocked` only lets the panel say why.
- Locked today: **`birthdate`** (age → meal pattern *and* the reimbursement age band) and
  **`signature_date`** (the document's own fact — and it decides which schedule wins in
  `scheduleIsStale`, so an editable date would let a click flip that outcome).
- A locked field that arrives **empty stays empty**. The panel says *"only a signed form
  may state this"*. Filling it in would be exactly the substitution the rule forbids.
- Days, hours and meals were already read-only: one summary row, no `editPath`, and they
  reach the roster only through `buildSchedulePort`.
- The F/R/P determination in IEA Review is **not** an exception to this. There the
  director signs as the **sponsor** — it is their own signed statement, not an edit to
  the parent's.

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

## Every generated storefront URL carries `center=` (2026-07-15)

A storefront URL is built **only** through `storefrontOnlyUrl(slug, key)` /
`storefrontPacketUrl(slug, set?, only?)`. Both **require** the slug and throw without it.
No surface hand-rolls the string.

**No centre → no QR.** Not a QR without `center=`. The storefront has nothing to resolve
and shows its gate, so the scan dead-ends — and a director hands the code to a family
before anyone scans it. In Organization mode (no active centre) the QR button is simply
not rendered.

**Why:** second time this class shipped. First `8b620c0` — Library Keep downloads lost
their per-centre scope and the WIC flyer fell back to the org-level contact. Then the
owner scanned the Library's handbook QR in Organization mode and got
`parent-forms.html?only=parents_book`: **the gate fired correctly, the link was built
wrong.**

It survived because **a test asserted it**: *"drops center= when no center is resolved,
still a storefront URL"* — treating a dead link as an acceptable degradation. A test that
pins the defect is worse than no test. It now asserts the throw, plus a sweep that every
generated URL for every centre × every key contains `center=`.

- The helper's **type** carries the rule: an optional slug makes the broken URL
  representable, and anything representable ships eventually.
- End-to-end, not just the string: QR(centre) → storefront → the card resolves **that
  centre's** file (`parents_book` → each centre's own handbook, asserted for all three).

## A registry version may be per-centre (2026-07-15)

`versions.<v>` is either **one URL string** for everyone, or an **object keyed by centre
slug** when the document genuinely differs — the Parent Handbook carries each centre's
address, licence and administrator, so one shared file would hand an Alpha family Parma's
handbook and ask them to sign a receipt for it.

Every resolver must handle both. `formUrl()` in the Add Child / Add Staff panels tested
`/^https?:/` against the value and returned **null** for the object form, so the handbook
rendered as "no link" the moment the mirror carried per-centre files — a regression
introduced by the mirror merge itself, in the same hour.

## A write is not saved until the database confirms rows (2026-07-15)

Row-level security denies by returning **zero rows and no error**. So an
`await supabase…update(…)` whose result is discarded reports success over a write
that never happened. **A silent 0-row update is an interface lie** — the owner
toggled a Ridge employee Inactive, saw "Saved ✓", logged back in, and the toggle
was Active again; the same page's class transfer never stuck either. Nothing was
wrong with the payload — the whole UPDATE hit 0 rows.

Every mutation that a human is told "saved":

- appends **`.select(...)`** so the affected rows are observable;
- treats **`error`** as failure **and** an **empty result** as failure —
  "no error" is not proof of a write under RLS;
- shows the failure to the user (a blocked write must never render as saved),
  and states plainly that **nothing was written**, not "try again";
- never flips the success state on either branch.

Found in `StaffSettingsPage.save()`: [src/pages/staff/StaffSettingsPage.tsx](../src/pages/staff/StaffSettingsPage.tsx).
The proof of a fix is a **read-back across a session** — change the value, log out,
log back in, and the new value is there — plus a `SELECT`, never the toast alone.

---

## Push ≠ deploy — a push closes only on a confirmed deploy (2026-07-15)

§4 already says "Done" is **committed ✓ · pushed ✓ · deployed ✓**. This is the missing
half: **how you know the third tick is real.** `git push` reports success for reaching
GitHub. It says nothing about whether the host built anything, and the trigger can
silently not fire.

**Why:** the Alpha canon rename (`55cb031`) pushed clean — `origin/main` held it, and
"pushed" looked like done. Vercel created **no deployment at all**: 16 minutes later there
were still 0 check-runs and 0 statuses on the commit, while the previous commit had
deployed in ~6. The live bundle went on serving `alpha:"Mayfield Hills"` to every director
— the exact string the commit existed to delete. An empty commit re-fired the trigger and
it deployed in minutes. Nothing was wrong with the code, the push, or the build.

A push is closed only when **one of these is observed**, never inferred from `git push`:

- a **deployment record for that ref** reaching a terminal state —
  `gh api repos/<owner>/<repo>/deployments --jq '.[0].ref'` then its
  `/statuses` → `success`; or
- the **live artefact** carrying the change — fetch the deployed bundle/page and grep for
  the string the commit added or removed.

Do not verify by asset hash: the host builds with its own env, so its hash legitimately
differs from a local build's and proves nothing either way.

**Mirror rule.** When a change spans two deploy targets (app + storefront), the operation
is not closed until **both** markers are confirmed. One-sided is worse than neither: the
storefront said "Highland Heights" while the app still said "Mayfield Hills", and each
looked correct on its own screen.

---

## A signed record is never rewritten (2026-07-15)

**Default: what a person signed stays as they signed it** — even when it is now known to be
wrong, even when the correction is trivial and true.

**Why:** the Alpha canon sweep found `form_data.center_name = 'Play Academy Mayfield Hills'`
in **3 `enrollment_submissions`** — all `status='rejected'`, all carrying a real signature
(one of them a *Ridge* submission that had picked up Alpha's name). A global rename would
have "fixed" them in passing. It must not: `form_data` is the record of what was on screen
when a parent signed. Editing it does not correct history, it fabricates a different one.
The rows are rejected and reach no claim, so the wrong string is inert — while a rewrite
would be permanent and invisible.

The three rows stay as they are. Correcting the name at the source (registry, form-kit,
storefront, `centers.name`) is what stops new records from carrying it.

**Scope by the exact string, never the family of strings.** The same sweep had to remove
"Mayfield Hills" (a place that does not exist) while leaving **"Mayfield Heights"**
untouched — a real city in Cuyahoga County where **21 households, 8 children and 4 staff**
actually live. A `%mayfield%` cleanup would have corrupted 33 live records of real
families. Audit with the loose pattern to see the neighbourhood; act only on the exact one,
and read back the count of what you deliberately left alone.

## An avatar's tap follows what the avatar already does (2026-07-16)

An avatar is never *only* a photo — on most screens it already stands for a person you can
open. So the camera does not get to claim the tap by default. Two cases, and which one
applies is decided by the surface, not by the component:

**Free avatar → the tap IS the camera.** Where the avatar carries no existing action —
a child in the Attendance grid, a face in a class list that opens nothing — tapping it
opens the three-action sheet directly (Take photo / Choose from library / Remove photo).
Nothing is lost, and the fastest path to "photograph this child" is one tap.

**Avatar with an existing action → that action wins.** Where tapping already opens
something — a staff card, a child's record — the tap keeps doing that. The photo editor
lives *inside* the card that opens: the large avatar in its header carries the 📷 badge
and opens the sheet there. A teacher's profile modal is the canonical example.

**Why:** the collision is not hypothetical. Stealing the tap from an existing action to
give it to the camera means a person who wants the record gets the camera instead — and
they will not discover the record's new entry point by being surprised. A photo is a
detail of a person; the person is the subject. The detail does not get the front door.

The badge is the tell: 📷 on an avatar promises the sheet. Never render it on an avatar
whose tap does something else. Note also that a roster child card already spends its
bottom-right corner on the presence dot — a second overlay goes top-right, or the two
fight at 36px.

**A camera surface and its Hub card ship together, and not before.** A guide card for an
audience that has no camera surface yet (teacher, until Attendance ships and the write
policy is applied) is worse than no card: it documents a button the reader cannot find,
and the reader concludes the app is broken rather than that the feature is pending.

## An interface never claims a fact it did not establish — reads AND writes (2026-07-16)

**This supersedes and generalises the write-side rule.** The Staff save fix taught the
write half: a silent 0-row UPDATE reported as "Saved ✓" is a lie. 2026-07-16 taught the
read half, twice, and it is the same lie pointing the other way: a failed SELECT
rendered as "nothing here". **Silent emptiness is an interface lie in both directions** —
one invents a success, the other invents an absence. Both assert a fact the code never
established.

So the rule is one rule, and it covers every Supabase call:

> **Bind `error`. Always. On reads exactly as on writes.**
> `const { data, error } = await ...` — never `const { data } = await ...`.
> On a write, also inspect the affected rows (`.select('id')`, then check `length === 0`).
> A call that binds only `data` is a bug whether or not it works today.

Twice in one day the same bug took out a live screen, and both times it looked like
"there is no data" rather than "the query failed":

- **Parents** — selected `relationship` off `guardian` (it lives on `child_guardian`).
  360 real families rendered as *"No family records on file yet."*
- **Meal Count + SafePass Teacher** — selected `photo_url` off `v_meal_grid` (the view
  never got the column `20260715b` added to `roster`). The **live kitchen** rendered
  as a class with no children in it, on the screen that IS the claim record.

The mechanism is always identical and worth naming: **PostgREST rejects the ENTIRE
select on one unknown column.** `const { data } = await ...` then yields `null`, the
error is never bound to a variable, and `setState([])` paints a confident empty state.
One wrong field name empties a whole page, silently, and looks exactly like a quiet day.

**Rules:**
1. **Always bind `error`.** `const { data, error } = await ...` — then `throw` it,
   banner it, or handle it. A call that binds only `data` is a bug regardless of
   whether it works today.
2. **A failed load must SHOUT.** Render a distinguishable failure state that says the
   list is *not* empty, it failed. Never let a failure share a code path with "no rows".
3. **A view is not its table.** Adding a column to a table does NOT add it to views
   over that table. When a migration adds a column, grep for views selecting from it.
4. **Verify column names against the live catalog**, not against the table you think
   you're reading. `information_schema.columns` costs one query; a silent outage costs
   a day of meal counts.
5. **`[BRANCH — do not deploy]` in a commit subject stops nothing.** `bc07e18` said
   exactly that and shipped via merge `f4e549e`. Intent in a message is not a gate — if
   something must not deploy, it must not be mergeable.

## A migration that touches columns owns everything that reads them (2026-07-16)

`20260715b_avatars.sql` added `roster.photo_url`, shipped, and was correct. It still
took the live kitchen down a day later — because a column added to a **table** does not
appear in **views** over that table, and two screens were already selecting it from
`v_meal_grid`. PostgREST rejected the whole select and the kitchen rendered as a class
with no children (see the rule above).

A column change is not done when the `ALTER` succeeds. It is done when everything that
reads that column still reads it. **Checklist — run it inside the migration pass, not
after:**

1. **Dependent views.** Every view over the table must be re-created if it should carry
   the new column. Find them, don't recall them:
   ```sql
   select distinct dependent_ns.nspname||'.'||dependent_view.relname as view
   from pg_depend d
     join pg_rewrite rw           on rw.oid = d.objid
     join pg_class dependent_view on dependent_view.oid = rw.ev_class
     join pg_namespace dependent_ns on dependent_ns.oid = dependent_view.relnamespace
     join pg_class source_table   on source_table.oid = d.refobjid
   where source_table.relname = '<the table>' and dependent_view.relkind = 'v';
   ```
2. **grep the select strings.** `grep -rn "<column>" src/ --include=*.ts --include=*.tsx`
   — then check, for **each hit**, whether the relation it selects from actually has the
   column. The table having it proves nothing about the view.
3. **RPCs and edge functions** that build their own column lists (`get_prefill` was one).
4. **Say what you did NOT update, and why.** A view deliberately left alone is a
   decision; a view forgotten is an outage.

Re-creating a view is itself a migration and goes through prepare+go. When the view and
the code must both change, **the view lands first** — code that asks for a column before
the view has it empties the screen, which is exactly the failure being fixed.

Build the new view body by `replace()`-ing `pg_get_viewdef()` output **inside the
transaction** and assert `after = before || ',<newcol>'` on the column list. That makes
column-order drift structurally impossible instead of merely watched for — a positional
consumer breaks silently otherwise.

## A verdict binds to a surface that could physically have shown the result (2026-07-16)

"Photo ✓ — the owner's screenshot shows a child photo on SafePassTeacherPage" was
recorded as a verified verdict. It could not have been true: that screen's roster select
was rejected whole (it asked v_meal_grid for photo_url), so it rendered NO children at
all; after the emergency fix it rendered initials. The photo the owner saw was almost
certainly the Children roster, which reads raw `roster` and always worked.

**A ✓ on a surface that cannot express the result closes nothing** — it retires the
question while the defect lives. Before accepting a verdict, ask: *could this screen have
shown this, given the code that was deployed when the screenshot was taken?* If not, the
verdict belongs to a different surface, and the named one is still open.

Corollary to the finding-closure rule: enumerate the surfaces, and check each verdict
against the one it actually names.

## A client filter that disagrees with the policy is a bug either way (2026-07-16)

When RLS decides what a user may read, a second filter in the browser can only be wrong
in one of two directions: **it either hides rows the database allows, or promises rows
the database refuses.** Both are defects, and the second is worse — the UI advertises
data the user will never receive, and the failure looks like "nothing here" rather than
"not for you".

So: **when a policy expresses the rule, delete the client filter.** Do not re-state the
rule in TypeScript "for clarity" — a restatement is a second source of truth for one
question, and the two drift the first time either changes.

Live example (`PortalMessagesPanel`): the panel filtered `org + recipient_value in
(uid, teacher, cook, all)` while the policy also enforced the CENTRE. The filter was
simultaneously too loose (it would have shown another centre's messages if the policy
had not caught them) and destined to go stale. It was removed; the policy stands alone.

Keep in the client only what the policy cannot express: ordering, limits, and the
narrowing a *screen* wants (this classroom, this week) — never the narrowing a *rule*
requires.

## §Buttons — top action rows use one component (2026-07-16)

**Use `src/components/ui/Button.tsx`.** New pages inherit the row for free; do not
hand-roll a button in a top action row, and do not copy a style const into a new file.

```tsx
import Button, { ButtonRow } from '@/components/ui/Button'

<ButtonRow style={{ marginBottom: 16 }}>
  <Button variant="primary" onClick={addChild}>➕ Add Child</Button>
  <Button onClick={openInbox} badge={pendingCount}>📥 Enrollment</Button>
  <Button onClick={openImport}>⇪ Import</Button>
</ButtonRow>
```

**Shape:** outlined, rounded (radius 9), **one height (38px)**, one typography (13/600).
Height is fixed, not padding-derived — padding-derived heights are exactly how a row ends
up with buttons a pixel apart.

**Colour is the platform green `#0f4c35`.** The sample this was specced from is indigo;
the platform is not. Override only on the owner's explicit word.

**Variants:** `default` (outlined green on white — the ordinary action) · `primary`
(filled — the one action the row is FOR, **at most one per row**) · `onDark` (outlined
white, for a row on the green header strip).
**`disabled` is pale, not merely faded** — a dimmed-but-live button still invites the tap.
**`badge`** carries the counter pill (the red Enrollment count); it keeps its existing
look and was never the problem.

**Why this exists.** Before it: ~9 button styles and no component. `BTN_PRI`/`BTN_SEC`
existed as **five byte-identical copies** in five files; `btnPri`/`btnSec` in four more;
then one-offs. Nothing was *wrong* in any single file — the rows had simply drifted in the
ways only visible side by side: fontWeight 700 here and 600 there, padding 8 vs 9, radius
8 vs 9, rem vs px, one row with a border no other row had. **A copied style const is a
fork with no merge.** The fix is not to tidy the copies; it is to stop having them.

**Hover lives in the component**, via listeners, not a `:hover` rule in `index.css` —
these styles are inline, and a stylesheet rule would be a second place the row can drift
from. One question, one answer, one file.

## A label is not the content — verify the artefact, not its header (2026-07-18)

Class of bug: **«ярлык ≠ содержание»**. A file, comment, or status field asserts a
state; the state is assumed; the assertion is wrong. Second confirmed case, so it
is a class and not an incident.

**Case 1 (2026-07-16).** `20260715` carried a comment saying the anon tables were
closed. They were open for a day. A migration comment is not evidence.

**Case 2 (2026-07-18).** `20260717_renewal_wave1.sql` opens with `✅ APPLIED
2026-07-16` and a full read-back transcript. Measured against the live database,
three of its four sections were there and one was not: `campaign_issues` — the
table the whole renewal tracker rests on — did not exist. The renewal page had
been silently writing the issue fact to `prefill_tokens.batch_id` instead. The
header was not lying about a detail; it was lying about the critical path.

**The rule.** A header, comment, changelog line, or `status` column is a CLAIM.
Before building on it, measure the artefact it describes:

- migration applied → query `information_schema` / `pg_proc` for the objects it
  creates, not the file and not the migrations list
- a table is not its columns — `select` the specific column you need
- a view is not its table (see §"A migration that touches columns…")
- «applied» is per-object, never per-file: a partial apply looks exactly like a
  full one from the outside

Cheap to check, and both cases cost a day. When a claim and a measurement
disagree, the measurement wins and the claim gets corrected in place.

### The mirror case: the tree is not the database (2026-07-18)

Same class, opposite sign. Case 2 was a file claiming applied when the database
said no. **Case 3 is the database saying yes while the file says nothing at all.**

On 2026-07-18 five prepare-scripts were applied to live — `20260717e`,
`20260718` door_scope, `20260718b`, `20260718c` (corrected version, after a
P0001 rollback), `20260718d` — each with its own read-back. In git they stayed
`??` untracked or ` M` modified. A status report built from `git status` listed
all five as "waiting for go", and was wrong about every one of them.

**The rule: the state of a change is read from the database, never from the
working tree.** `git status`, a filename, a `.DRAFT` suffix, an untracked marker
— none of them are evidence about live. They describe what a text file did, not
what the schema is. Both directions of this error are now confirmed, so treat
the tree and the header as equally non-authoritative: **query the objects.**

**Marking applied prepare-files.** Since neither the header nor the tree can be
trusted alone, the marker's job is only to point at the evidence — the read-back
that was actually run — so the next person re-measures cheaply instead of
believing prose. Proposed form, one commit per apply-wave:

```
docs(prepare): mark <n> scripts applied — read-back <date>
```

and at the top of each applied file, a three-line block:

```sql
-- APPLIED: 2026-07-18  (claim — verify before building on it)
-- READ-BACK: 1·t·t·f          <- the counts/booleans actually observed
-- VERIFY:   select ... ;      <- the query that re-measures it today
```

The `VERIFY` line is the load-bearing one: it makes re-measuring a copy-paste,
which is what turns the standard from a habit into the cheap default. `APPLIED`
stays explicitly labelled a claim, because that is what Case 2 proved it is.

### Case 5: имя колонки — тоже ярлык (2026-07-18)

Заказ звучал так: «истина = заполненная старая пара `license_capacity` /
`license_capacity_under2`, страницу перевести на неё, пустую новую пару снести».
Разумно с виду: в одной паре данные, в другой пусто.

Измерение по миграциям, а не по именам, дало обратное. `20260705` завела пару
как `license_under3_max` / `license_3plus_max`, `20260705b` переименовала их в
`license_under2_5_max` / `license_total_max` с объяснением: бланк DCY просит
«Total Under 2½ Years» и «Total Capacity», а не under-3 / 3+. То есть в четырёх
колонках жили **три разных порога**, и `license_capacity_under2` — это «до
**2** лет», а не «до 2½». Ridge 57 — корректный ответ на другой вопрос.

Исполнить заказ буквально значило подставить под поле «Under 2½» число по
границе 2 года и молча разойтись с бумажной лицензией.

**Правило: имя колонки — такой же ярлык, как заголовок файла или строка
`status`.** «`_under2` значит под 2½, там же примерно» — это чтение имени, а не
смысла. Смысл живёт в миграции, которая колонку завела, и в форме, ради которой
она заведена; и то и другое читается за минуту.

**И следствие про исполнение.** Когда заказ опирается на семантику, а
семантика при замере оказалась другой, — правильное поведение не «исполнить
буквально» и не «сделать по-своему молча», а **назвать расхождение до действия
и остановиться**.

**⚠️ РАЗВЯЗКА (18.07) — и она бьёт по моему же выводу.** Владелец перечитал
БУМАЖНУЮ лицензию Pearl: «total capacity of 158; of this, **36 may be under 2
1/2 years**». То есть `license_capacity_under2 = 36` — это лицензионные
**under-2½**, а не under-2. Врало **имя колонки**; содержимое было верным всё
это время.

Мой вывод «в старой паре лежит under-2» пришёл из комментария миграции
`20260705` — то есть **из другого ярлыка**. Я правильно отказался верить имени
колонки и немедленно поверил комментарию рядом с ней.

**Настоящая формулировка правила:**

- имя колонки — ярлык; комментарий миграции — ярлык; заголовок файла — ярлык;
- **артефакт здесь — бумага**: лицензия DCY, бланк, закон. Для регуляторного
  поля первоисточник лежит вне репозитория, и его надо взять в руки;
- цепочка ярлыков любой длины измерением не становится. Три согласных между
  собой документа — это по-прежнему ноль измерений, если ни один не
  первоисточник.

Процесс сработал — остановка не дала записать неверное число и заставила
перечитать бумагу. Вывод при этом был неверен. Эти две вещи стоит различать,
иначе из удачного исхода вырастет ложная уверенность в методе.

### Case 6: ближайший носитель ≠ канон, даже внутри одной базы (2026-07-18)

Пара к Case 5, и разница тонкая. Case 5 — про то, что **имя** артефакта врёт.
Case 6 — про то, что артефакт **настоящий**, данные в нём настоящие, и он всё
равно не канон, потому что расчёт читает не его.

Целый день мы спорили, какая из двух пар колонок в `menumaker.centers` —
истина. Обе оказались **дублями**. Первоисточник в базе —
`menumaker.center_licenses`: там номер, дата выдачи, ёмкости, администраторы,
орган, а «Continuous» выражено как `expires_date IS NULL`. И `compute_monthly_claim`
читал именно его всё это время (`20260707:136`) — то есть **клейм был прав,
спорили копии.**

Тем же часом я поднял тревогу «FSO-лицензия Pearl просрочена четыре месяца» —
по `centers.fso_license_expires`. В трекере лежала действующая лицензия с
`is_current = true`, а просроченная строка была помечена `is_current = false`.
Тревога была ложной, и подняла её копия.

**Правило: прежде чем объявить поле истиной или поднять по нему тревогу —
спроси, КТО ЕГО ЧИТАЕТ.** Не «где лежит значение» и не «где оно выглядит
свежее», а какой расчёт, отчёт или выгрузка на нём стоит. Читатель определяет
канон; всё остальное — копии, даже если они в той же схеме, той же таблице и
заполнены аккуратнее.

Практически это один запрос: грепнуть имя колонки по `pg_get_functiondef` и по
`src/`. Минута против дня спора и одной ложной тревоги.

**Следствие для дублей:** пока копии живы, они будут порождать и ложные тревоги,
и ложные споры — обе ошибки уже случились за один день. Сведение к одному
носителю не косметика.

### Case 4: the measurement that never ran — and the rule that caught it (2026-07-18)

Cases 1–3 were about trusting someone else's label. Case 4 is mine, and it is
worse, because it wore the costume of a measurement.

I reported that `safepass_confirm_handoff` had **zero callers** in `src/`, and
built a whole §3 of a prepare-file on it. The grep behind that claim had run
from `src/pages`, so it searched `src/pages/src/` — a path that does not exist.
It printed nothing. **I read "no output" as "no callers".** In reality
`src/lib/safepassDevice.ts`, `PinPad.tsx` and a parity test were all sitting
there, complete.

Then I tried to `Write` my own thinner version of `safepassDevice.ts` over the
real one. It was refused: **a file must be Read before it can be overwritten.**
That rule — which exists for ordinary edit-safety, not for this — is the only
thing between a bad measurement and destroyed working code.

**Two rules, and they are a pair.**

1. **An empty result is not a finding until the probe is proven to work.** A
   search that finds nothing and a search that ran nowhere are indistinguishable
   from the output alone. Before reporting absence, prove the probe: `pwd`, or
   run it against something you know it must hit. Absence-claims are the ones
   that most need a positive control, because they license deletion and
   rebuilding.
2. **Never overwrite what you have not read.** Not as a formality — as the last
   catch. Every other check had already passed by the time this one fired.

The second rule caught the first rule's failure. That is what defence in depth
is supposed to look like, and it is why "the linter/tool is being annoying" is
usually the wrong reading of a refusal.

**Case 5, same class, 2026-07-19 — `raise notice` is invisible, so it cannot
carry a verdict.** A `do $$ … $$` block in prepare-file `20260718e` signalled its
result three ways: `raise exception 'FAIL — …'`, `raise notice 'PASS — …'`, and
`raise notice 'stopped at: %'`. Run in the Supabase SQL editor, it returned
**"Success. No rows returned"** — the editor swallows notices entirely. PASS,
"stopped at something else", and a block that did nothing at all are **the same
output**. Only the FAIL branch was legible, and only because an exception is the
one thing the editor cannot hide.

The verdict was still recoverable here — no exception means the FAIL branch did
not fire, so the gate was passed by construction — but that is reasoning about
what *didn't* appear, which is precisely the shape of the earlier cases.

**Rule: in a `do` block, encode success and failure ONLY as exception vs. no
exception — never as a notice.** If a positive result needs to be visible, it is
not a `do` block: make it a `select` returning a boolean column. Notices are for
colour, never for verdicts. Same family as the swallowed-`error` cases: a channel
that can silently drop the message cannot be the channel the answer travels on.

**Corollary, same day:** I also reported the v3 flip left no `history` entry in
the registry. It had left one — I printed `history[-1]` on an array that is
**newest-first**, so I read the oldest record and called it the latest. Same
class again: the probe was wrong, the output was believed. Check the ordering of
a list before indexing into its end.

## A flip writes its own history entry, in the same pass (2026-07-18)

`enroll-registry.json` is the source of truth about a form's state — not memory,
not the changelog. A `current` that moves without a `history` entry leaves the
registry saying **what** is live and nothing about **when or why**, which is
exactly the state that makes the next person rebuild from guesswork.

**Rule: the commit that moves `current` also appends the `history` entry, with
the deploy markers (commit SHAs of both repos) once they exist.** Not a
follow-up commit — the same pass, because the follow-up is what gets forgotten.

If an entry ever has to be added after the fact, it is labelled `backfilled`
explicitly. An honest late record is not a forgery; an undated one that pretends
to be contemporaneous is.

## Где живёт публикуемое: Pages/Storage — да, Drive — нет (2026-07-18)

**Канон (Николай, 18.07).** Всё, что публикуется родителям или персоналу как
документ, живёт **в Pages-репозитории или в Supabase Storage, с версией в
реестре**. Google Drive — место для черновиков и исходников; **витрина на Drive
не ссылается никогда**.

**Почему это правило, а не вкусовщина.** Проверено в тот же день: три
SafePass-карточки Doc Hub ведут на Drive-файлы, которых **нет**. Не «нет
доступа» — нет:

- Drive API под аккаунтом-владельцем (`playacademyusa@gmail.com`) на все три
  ID → `Requested entity was not found`;
- папка «Play Academy — SafePass Documents» в том же Drive — **пустая**;
- поиск по `title contains 'SafePass' | 'Parent Letter'`, включая
  `sharedWithMe` → ничего;
- анонимный `curl` по всем четырём Drive-ссылкам витрины → **401**.

То есть **живая витрина ведёт родителя в тупик**, и заметить это изнутри
приложения нельзя: карточка выглядит целой, ссылка выглядит целой, ломается
только клик. Файл на Drive может быть перемещён, удалён или перевыпущен с новым
ID кем угодно и когда угодно — у ссылки нет ни версии, ни владельца в реестре,
ни способа проверить её из CI.

**Правило.**

- публикуемый документ → Pages-репо (или Storage), URL резолвится анонимно,
  версия записана в реестре, история флипов ведётся (см. §«A flip writes its
  own history entry»);
- Drive → черновики, исходники, внутренняя переписка. С витрины на него ссылок
  нет;
- ссылка на витрине обязана проверяться **анонимно** — авторизованный клик
  автора ничего не доказывает, ровно как push не доказывает деплой;
- **описание карточки проверяется против того, что реально открывается.**
  Ссылка может резолвиться в 200 и всё равно врать: `safepass-driver` обещал
  bus-run checklist и открывал Teacher View. Живая ссылка — не живое обещание;
  проверяются оба конца.

**Текущие кандидаты на переезд** (все — `driveUrl` в `DocumentHubPage.tsx`,
захардкожены в странице, а НЕ в `src/config/showcaseLinks.ts`):

| карточка | состояние |
|---|---|
| `safepass-parent-letter` | Drive, файл не найден · **родительская, приоритет** |
| `safepass-teacher-guide` | Drive, файл не найден |
| `safepass-concept` | Drive, файл не найден |
| `byod-policy` | Drive, анонимно 401 — проверить отдельно |

**Смежная находка, не про хранение:** `safepass-driver` и `safepass-director`
ведут на `/safepass/teacher` — тот же роут, что и `safepass-teacher-app`, при
том что карточки обещают «bus run checklist» и «Director Dashboard: monitor all
classrooms». Ярлык ≠ содержание на живой витрине; отдельный кандидат на правку.

## Записи SafePass/attendance готовятся как legal evidence (2026-07-18)

У наших стандартов появился документ-источник. Concept v1.1 §2.3 описывает
петицию в ODJFS с **шестью месяцами данных** — то есть журнал приёма и передачи
пишется не «для себя», а как материал, который однажды будут читать
посторонние, недоброжелательно и построчно.

Отсюда три требования, и они объясняют, почему прежние правила были такими
занудными:

- **append-only** — запись не переписывается задним числом; исправление
  добавляется, а не подменяет;
- **именные отказы** — «не удалось» обязано называть, кто и почему; безымянная
  ошибка в юридической записи хуже её отсутствия;
- **честные признаки** — офлайн-признак, `already`, «подтверждено кем» должны
  означать ровно то, что означают. Признак-эвристика, выданный за факт, — это
  дефект доказательства, а не UI (см. 5-секундное правило в
  `teacher-portal-order.md`).

Concept v1.1 — **канон-родитель** для спек SafePass и attendance: при
расхождении спеки с ним расходится спека.

## Инструкция к живой смене печатается только под фактически задеплоенное (2026-07-18)

Брифинг для комнаты (кто что нажимает) финализируется **после** того, как
деплой подтверждён зелёным, и никогда заранее «под план».

Формулировка, ради которой правило и записано: **лист с PIN на планшете без
PIN хуже отсутствия листа.** Без листа человек спросит. С неверным листом он
будет уверенно делать не то, причём в момент, когда перед ним стоит родитель с
ребёнком.

Отсюда же запрет печатать лист с двумя вариантами «либо так, либо этак»:
выбирает автор инструкции, а не воспитатель на ходу.

## A read-back never writes (2026-07-18)

**Read-back = только чтение, ЛИБО явная транзакция с `rollback`. Третьего вида не
бывает.**

Пойман в `20260718_door_scope_and_deny_teacher.sql`: чтобы доказать, что дверь Ridge
больше не пишет в чужой центр, read-back-блок предлагал `update ... set first_name =
first_name` по живому ребёнку — «пробу», которая на самом деле пишет. На репетиции она
шла внутри `begin/rollback`, но в текст файла откат не попал, и следующий человек
выполнил бы её на живой строке: `updated_at`, триггеры, аудит.

Проба, меняющая состояние, — законный инструмент: иногда единственный способ проверить
RLS — попробовать написать. Незаконно другое — оставить её без отката. Если блок
содержит хоть один `insert`/`update`/`delete`, он открывается `begin;` и закрывается
`rollback;` — и это видно глазом в самом файле, а не держится в голове у того, кто
проводил репетицию.

Смежное: разметочные шаги, которые в транзакцию НЕ входят (пометить сервис-аккаунты,
проставить признак), пишутся в файл отдельным блоком с явным «делается один раз, до
замера, откатом не снимается» — иначе `rollback` в конце читается как «я ничего не
менял», что неверно.

## Замерная конструкция годна только после прогона в том же редакторе (2026-07-18)

Замер прав — это код, и он ломается по своим причинам, отдельно от того, что он
измеряет. Годной считается только та конструкция, которая **пережила живой прогон в
том самом клиенте**, где её будут выполнять. Стройность SQL ничего не гарантирует.

Две ловушки, пойманные в один вечер на шаге (2) применяй-серии 18.07:

**1. Редактор показывает только последний result set.** Многостейтментный замер из
пяти проверок вернул одно число; четыре молча исчезли. Лечится накоплением во
временную таблицу и одним финальным `select` — либо, надёжнее, разбиением на
самостоятельные блоки, у каждого ровно один результат.

**2. Temp-таблица, созданная ДО смены сиденья, невидима после неё.** Порядок
`create temp table` → `grant ... to authenticated` → `set local role authenticated` →
`insert into _probe` упал с `42P01: relation "_probe" does not exist`, хотя грант был
выдан. Рабочий порядок — обратный: сменить сиденье, и только потом создавать temp
(владелец — само сиденье, грант не нужен), обращаться schema-qualified `pg_temp._probe`,
а финальный `select` держать ДО `reset role`.

Отсюда общее правило: **чем меньше состояния переживает границу между стейтментами,
тем надёжнее замер.** Одиночная самодостаточная проба — одна транзакция, один
результат, свой `rollback` — всегда предпочтительнее накопителя, если выбор есть.

Смежное: отказ RLS — это ошибка, а ошибка обрывает транзакцию. Пробу, которая ДОЛЖНА
упасть (`insert` под запрещающей политикой), нельзя ставить в середину замера: всё
после неё вернёт «current transaction is aborted». Она живёт отдельным блоком. И
хороший отказ — **именной**: `42501 policy "door_no_insert"` доказывает, какая именно
политика сработала, а безымянный `42501` — только то, что что-то запретило.

## Формат нормализации не хардкодится в проверках (2026-07-18)

Страховка в `20260718c` сравнивала `menumaker.norm_name(...) = 'yabborova sofiya'` —
то есть проверяла не факт, а **догадку автора о том, что функция вернёт**. Измерено:
`norm_name` переставляет токены и отдаёт `'sofiya yabborova'`. Условие не выполнилось бы
никогда, заход откатился бы с «ожидалась 1 живая строка, получено 0», и разбирались бы
не с данными, а с фантомом.

Правило: **сверка либо по `id`, либо через саму функцию с ОБЕИХ сторон сравнения** —
`norm_name(a) = norm_name(b)`. Литерал в правой части допустим только если он получен
измерением в этой же сессии и рядом стоит комментарий, откуда он взят.

Общий класс: проверка, воспроизводящая внутреннюю логику проверяемого кода, доказывает
совпадение двух реализаций, а не корректность. Родня «read-back ≠ пересчёт того, что
страница должна была отрисовать» — та же ошибка с другой стороны.

Отдельно стоит отметить, что здесь сработала защита: страховка была ЗАПРЕЩАЮЩЕЙ, поэтому
ошибка проверки означала откат, а не тихую порчу. Проверки нужно писать так, чтобы их
собственная поломка вела к остановке, а не к ложному «успеху».

### Канонический пример (18.07, измерено)

```sql
select id, child_name,
       menumaker.norm_name(child_name) as norm
  from menumaker.roster
 where id in ('18312be2-…','0a3e36ab-…');
--  Yabborova Sofiya → 'sofiya yabborova'
--  Yabborova Sofiya → 'sofiya yabborova'
```

Автор проверки предполагал `'yabborova sofiya'` — «как написано в карточке». Функция
сортирует токены и отдаёт `'sofiya yabborova'`. Разница в одном пробеле и порядке двух
слов остановила бы весь заход. Ни одно рассуждение об «очевидном» формате не заменяет
этого `select`.
