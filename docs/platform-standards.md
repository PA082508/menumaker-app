# MenuMaker — Platform Standards

Canonical, cross-cutting rules every feature must follow. Owner: Nikolay.

**Before building anything, read [`DECISIONS.md`](./DECISIONS.md)** — the index of every locked
decision across all 25 specs: what already exists, and what re-building it would look like.
Search it by the **noun of the function**, not by the word of your task. That mistake is why
`campaign_issues` became a second token store while the decision sat in `prefill-engine-spec.md`.
A new locked decision is written into that index **in the same commit as the code**.

---

## Before deciding — map what already exists (2026-07-22)

**Every order or fix begins with an inventory of what is already built — never a design from
memory.** Design only *on top of* the map. "We re-built what already existed" is a standard
violation, not a style nit.

The map has three lanes, gathered by **fact**, not recall:

- **(a) Code mechanisms** — `grep` by the *noun of the function* (see the DECISIONS index rule
  above), not by the word of your task. Name the functions that already do it.
- **(b) The forms' own built-in abilities** — a form often already computes, validates, or holds
  a slot the app is about to reinvent. Read the form (fetch the live edition if it lives on
  Pages), don't assume. Report the section headings and field keys you found.
- **(c) DB tables / patterns** — signature samples, registries, flags, RLS shapes. The pattern
  that already carries this concern is the one to extend.

Precedents that bought this rule:
- the **IEA form itself computes Free/Reduced/Paid** (Sponsor certification + a screen-only
  income-scale helper) and exposes it in `form_data` — yet the Review modal was about to offer
  a category "choose from scratch";
- **`pa_sig_sample` / `signature_samples`** existed for reusable stamps — yet the countersignature
  was drawn every single time;
- **Add Child** grew a second panel beside one that already existed.

The map goes **into the report before any edit.** A design that skipped the map is sent back.

---

## The original form is the review artifact, not just its fields (2026-07-24)

An online submission is OUR HTML replica of an official blank; the entered data
and the parent signature are what was signed. Reviewing it as a field-table alone
hides "what I signed."

- Approve shows BOTH: the ORIGINAL form ("what I signed") beside the field-diff
  ("what changes in the roster"). They are not interchangeable.
- The original view is 1:1 the official form — the same official-scan overlay and
  the same field coordinates as the storefront kit, rendered READ-ONLY from the
  FILED form_data + signatures. No redesign, no re-typeset substitute.
- A type with no replica shows the scan (paper) or the field-diff — never a
  fabricated look. Replicas register in the same forms registry/version ladder;
  no parallel path.
- Print emits ONLY the official pages (scans are content <img>, not CSS
  background; scaled one form-page = one sheet).
- Integrity = the signed data is sealed (content_hash/sealed_signatures); the
  inspection/print artifact is a SNAPSHOT of the replica at Approve — drift of the
  live template never changes what the record shows. (Steps 2–3.)

## Ready-made forms first (2026-07-24)

Before creating ANY blank, render, print view, or screen form:
1. MANDATORY check for an existing ready-made original, in order:
   `enroll-registry.json` (edition registry) → forms repo `pa082508.github.io` →
   `forms/3-library` → `public/forms/` (local copies).
2. A ready-made exists → use it byte-for-byte (copy carries an origin header comment:
   source, edition, storefront commit, date). Redesign of originals is FORBIDDEN.
3. None exists → build the new one to kit standards and REGISTER it in the
   registry/library upon acceptance — it becomes the ready-made for next time.
4. Every report involving a form carries the line
   `template source: <registry key + edition>` as this rule's read-back.

## A date beside a signature is a stamp, not a field (2026-07-24)

**A date beside a signature is a STAMP, not a field — auto-set at the moment of signing,
read-only, cleared with the signature, bound 1:1 to its own mark. Data dates are unaffected.**

The stamp is bound **strictly 1:1** to its own stroke: the date appears only next to the
signature/initials actually entered, at the moment of entry. An empty signature slot (or
empty initials row) means an **empty** date cell — nothing is pre-filled beforehand, and
neighbouring rows are never touched. Clearing a specific stroke clears only its own date.
In a renewal, only the active row of the review being signed is stamped.

- **Signing dates that are stamps:** Signature Date, Date of Review, the director's
  countersign date, the adoption-sample date. Never manual, never back-datable, never
  pre-filled on load.
- **Data dates that are NOT touched:** DOB, First Day, effective-from / effective-to, and
  any date that is a fact about the child/enrolment rather than a mark of when a signature
  was made.
- The director side already satisfies this: the in-app countersign date is set to `now`
  at Approve (`signatures.countersign_meta[slot].at`), under the approver's `auth.uid`.
- Applies to every live signing kit (enroll, iea, staff, parent_consent, usda_waiver,
  start_form, dcy_01234 review rows). Rolling it in bumps each form's edition in the
  registry, syncs its replica, and writes a history entry — form by form, flipped by word.

## Smallest move first (2026-07-22)

**The first thing formulated is the smallest solution to the essence of the order** — then
expansions are added as *conscious* increments, each justified. A feature that arrived as a tab +
a special fetch + a counter + a banner, when the essence ("the General Director sees income, the
director does not") was already carried by one RLS policy and the standard conveyor, is the
anti-pattern. Ask "what is the least code that satisfies the essence?" before "what would be
nice around it?" Precedent: the income lens (Ф2 кусок 1) was rebuilt as a plain visibility fact
(RLS) after first shipping as bespoke UI.

## Packet execution — don't ask to continue (2026-07-22)

Inside an issued packet or `go`, **execute every point to the end** — do not stop to ask
permission to proceed. The only stops are the **marked** ones:
- an item explicitly gated "on a separate word" / "on morning word";
- a red read-back (a verify that failed its expectation);
- a deviation from the stated expectation (`Отклонение = стоп`).

Everything else — copy questions, design options, things you'd like a second opinion on — is
**carried in the final report as one packet**, not surfaced one at a time mid-run. "Asking
permission to continue" without a reason from the stop list is a delivery-protocol violation.
The report is **one message** at the end.

---

## A page opened from a hub carries a return control back to that hub (2026-07-22)

Any page reached by a **button from a hub** (People hubs — Children / Staff — or a Doc-style
hub) MUST carry a prominent return control back to that hub. **Entered by a button → leave by
a button; never rely on the browser back arrow.** The control is the shared `BackBar`
component (`src/components/BackBar.tsx`) — a sticky, high-contrast bar reading "← Back to
{hub}" — **reused, not reinvented** per page; `to` is the hub route, `label` its name.

Placement: at the top of the page's render, bled full-width to the container's padding edges
(negative-margin wrapper matching the page's `wrap` padding, e.g. `margin: '-24px -32px 18px'`).
Put it on **every** exit path of the page, including a no-access/guard return — a stranded user
with no way back is the exact violation.

**Precedent that bought it:** Packet Sets (`/packet-sets`), opened from the Children page,
shipped WITHOUT a back button while the Enrollment Inbox (same hub) had one — an inconsistency
Nikolay caught 2026-07-22. Fixed by reusing `BackBar`, same as Inbox / Children Import / Daily
Time Log. When adding a hub-opened page, `BackBar` is part of its Definition of Done.

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
- **UI / doc label = "General Director (Owner)"** (chosen by Nikolay 2026-07-21). `(org-admin)` /
  `is_org_owner()` remain the internal key/predicate names. Applying the label across the UI and the
  user instructions is a separate pass; docs use "General Director (Owner)" now.

A center **director** is scoped to their own center and never inherits org-level rights — the
boundary is identical whether the org-level seat is the owner or a hired executive. This is why
income determination, base-set editing and forms authoring route to the General Director role,
not to whoever happens to own the company.

---

## 1. Child name — four independent axes (Николай, 2026-07-28)

### Факт, с которого всё начинается

**Хранимая строка `child_name` НЕ имеет известного порядка.** Замер 28.07 по 614 строкам
с обеими частями имени: **519 «Фамилия Имя», 96 «Имя Фамилия»**, третьего варианта нет.
Считать хранимую строку имеющей известный порядок **нельзя нигде и никогда** — это и есть
коллапс, из которого выросли остальные дефекты.

Прежняя редакция этого раздела утверждала обратное («Data is already correct… the import
pipeline sets `child_name = last_name + ' ' + first_name`»). Утверждение **опровергнуто
замером** и снято. Два пути записи одновременно пересобирали ключ в противоположных
порядках — см. [`rosterKey.ts`](../src/lib/rosterKey.ts).

Ещё **9 строк из 623** несут `child_name` при пустых обеих частях (фискальные строки
Master List). Для них показ можно взять только из строки, порядок которой не проверяем —
остаток под нормализацию, шаг (4).

### Четыре независимые оси

| Ось | Правило |
|---|---|
| **ХРАНЕНИЕ** | `first_name` и `last_name` **порознь**. Ключ строки — `roster.id`. `child_name` — легаси-денормализация и, пока `cellKey` от неё не отвязан, идентификационный ключ: **никогда не пересобирается** |
| **СОРТИРОВКА** | **КОНТЕКСТНАЯ** — см. ниже. Соседство сиблингов даёт сортировка по `last_name`, а НЕ порядок показа: трое Coleman встанут рядом при любом отображении |
| **ПОКАЗ ЛЮДЯМ (по умолчанию)** | **«Имя Фамилия»** — приложение, родительские формы, письма, экраны |
| **ПОКАЗ НА MASTER LIST И ЛИСТАХ MEAL COUNT** | **«Фамилия Имя»**. Основание: на печатном листе общая фамилия у **левого края** читается как блок, семью видно одним взглядом. Это **эргономика печати, НЕ норма регулятора** — не ссылаться на неё как на требование |

### Ось сортировки — контекстная

Первая редакция этой оси («ВСЕГДА по `last_name`») была **неверна и отозвана** в тот же день:
CACFP-контексты сортируются по возрасту не случайно.

| Контекст | Порядок |
|---|---|
| **Людские списки** — ростер, поиск, Master List | по `last_name` (семьи блоками — ровно та выгода, ради которой ось и вводилась) |
| **Листы meal count и печатные клеймовые формы** | по **возрастным полосам**, внутри полосы — по `last_name` |

Основание для второго: **порции и вид молока зависят от возрастной группы**, и лист читается
полосами. Это не эстетика — это то, как сверяют выданное.

**Сиблинги разных возрастов в фуд-листе рядом НЕ встают — и это правильно:** у них разные
меал-паттерны, и соседство в такой таблице подсказывало бы одинаковую порцию. Соседство
семьи — выгода людских списков, а не клеймового листа.

⛔ **Порядок строк на печатных листах meal count не меняется** — он claim-facing. **§2a ниже
не трогаем**, он описывает ровно это поведение и остаётся в силе.

**Возрастная группировка CACFP** — отдельная ось учёта меал-паттерна. К порядку строк
в людских списках отношения не имеет.

### ⚠ Запрет в обе стороны

«Имя Фамилия» не должно ломать вёрстку фуд-листа. «Фамилия Имя» с фуд-листа не должно
протечь обратно **в хранение**. Реализация — **одна функция форматирования с параметром
контекста**: не две реализации и **никогда** не запись в базу.

### Порядок работ

(1) запрет пересборки `child_name` при сохранении — **сделано** (`rosterKey.ts`,
`stripStoredKey`, тест) · (2) показ собирается из частей, порядок по контексту ·
(3) `cellKey` перевести с `child_name` на `roster.id` · (4) нормализация 9 остаточных строк,
если останется нужна.

⛔ **Существующие 614 значений не переписывать ни в каком варианте** — ключ разъедется
с уже записанными строками питания.

**Устаревший комментарий:** шапка [`src/lib/childName.ts`](../src/lib/childName.ts) всё ещё
повторяет снятое утверждение «the DB is correct». Правится шагом (2), вместе с
контекстным форматтером.

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

**The DB enforces owner-scoping, not just the client (2026-07-24).** Client discipline
(`loadSample`/`adoptSample` filtering to the logged-in owner) is not a security boundary —
RLS is. The `signature_samples` table now binds the **login shelves** (`director`, `sponsor`)
to `owner_auth_id = auth.uid()` in both `USING` and `WITH CHECK` (migration `20260724b`): a
director can read/write **only their own** stamp, and the General Director's `sponsor` stamp
never surfaces to a director (or vice-versa). The **no-login shelves** (`parent`, `staff`,
which carry no `auth.uid`) stay staff-managed on behalf, org-fenced, with the adopter stamped
(`adopted_by = auth.uid()`). Parents apply their own sample through a SECURITY DEFINER RPC
(token path), which is unaffected. `service_role` (edge/backend) bypasses RLS as before — the
only non-owner read of a login shelf that exists.

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

### Форма «НАОБОРОТ»: база опередила код (Николай, 2026-07-29)

Правило выше писалось про обычный порядок — код опережает базу, экран просит колонку,
которой ещё нет. **Обратная форма опаснее, и в тексте её не было.**

Случай 28–29.07. Колонка `staff.pin_hash` закрыта грантом в 03:22 UTC — **это правильно и
применено на боевом немедленно**. Починка `select('*')` на карточке сотрудника (явный список
колонок вместо звёздочки) лежала **в том же вечернем коммите — и коммит не был запушен**.
Итог: **десять часов** карточка сотрудника на боевом была мертва у всех до единого — Postgres
на `select *` отвечает `permission denied for table staff`, PostgREST отдаёт 42501, а
выложенный код разбирал ответ как `const [{data:R}] = await Promise.all([...])`, **без
`error`** (см. [«Never destructure data without error»]). Ошибки никто не увидел: экран
показал уверенную пустоту.

**Почему это не ловится обычной осторожностью.** Закрытие права в базе — единственная
половина пары, которая **действует немедленно и в одиночку**. Всё остальное (миграция
колонки, вью, RPC) ждёт кода, а отзыв гранта — нет.

**Правило.** Отзыв права (грант на колонку/таблицу, сужение политики) и код, который под
это право переписан, — **одна пара, и код обязан быть НА БОЕВОМ ПЕРВЫМ**. Порядок ровно
обратный тому, что выше: там вью раньше кода, здесь **код раньше отзыва**. Если так не
вышло — отзыв откладывается до выкладки, а не «пусть полежит до утра».

**Проверка, а не память:** перед отзывом права —
`grep -o 'from("<таблица>").select("[^"]*"' <живой бандл>` по **выложенному** файлу, не по
рабочему дереву. Звёздочка в этом списке = экран умрёт в момент отзыва.

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

---

## ПРАВИЛО №1 — шапка всего корпуса SafePass / GatePulse (2026-07-26)

**Безопасность и сохранность жизни ребёнка — правило №1. Всё остальное — следствия.**

Это не лозунг, а **решающий вопрос**: любой спор о фиче, экране, поле или упрощении решается
одним — **служит ли это правилу №1**. Скорость, красота, экономия кликов, «родителям так
привычнее», «директору так быстрее» — законные аргументы ровно до той черты, где они начинают
стоить достоверности того, кто взял ребёнка и кто его отдал. За этой чертой они проигрывают
всегда, без обсуждения.

Практические следствия, которые уже выведены из правила №1 и лежат ниже: подпись принявшего, а
не устройства; двухшаговость карточка→окошко; аварийный путь с флагом вместо глухой блокировки;
отказ, который не притворяется сбоем связи; фотография для человеческой сверки лица.

Каждый из четырёх документов GatePulse открывается той же строкой, адаптированной под аудиторию:
*«Rule #1 of this center: the safety of your child. Everything below exists for that rule alone.»*
Родительское письмо открывается ею же — согласованность проверяется при вычитке.

---

## Фото доверенного лица — норма, и дисциплина хранения (2026-07-26)

Фотография лица — инструмент правила №1: **человеческая** сверка того, кто стоит у двери.

**Норма съёмки.** Фото снимается при **КАЖДОМ** Register, а не только при выдаче карточки — шаг
«Take photo» встроен в сам жест выдачи (mobile-first, директорский карман). Существующие лица
догоняются при renewal или первой выдаче карточки. Выдача карточки = фото на месте.

**Двусторонний рельс согласия.**
- **Родитель** уведомляется release-формой v4 за всех вписанных лиц: *all authorized adults will
  be photographed for identification*.
- **Само лицо** соглашается галочкой при своём Register / выдаче карточки (рельс `AckSignModal`)
  → фото → ключ. Порядок именно такой: нет согласия — нет фото, нет фото — статус «no photo on
  file», а не тихий пропуск.
- Формулировка согласия — **расширенная**: *for visual identification by staff within the
  center's management system* (покрывает и передачу у двери, и внутренние экраны). Пункт о фото
  входит в Parents Book. Формулировка уходит юристу в памятку.

**Дисциплина хранения — запреты, не пожелания.**
- Только **приватный bucket** + RLS; в БД лежит **путь**, никогда URL; чтение — только
  **короткоживущий signed URL** для персонала. Публичных URL не существует.
- Удаление фото при **revoke** и по запросу лица.
- **НИКАКОГО автоматического распознавания лиц** — только человеческая сверка. Биометрический
  матчинг запрещён целиком, а не «пока не нужен».
- Публичное использование (сайт, соцсети, маркетинг, рассылки) — **НИКОГДА** без отдельного
  явного согласия. Согласие на идентификацию не является согласием на публикацию.

**Компенсация отказа.** Отказ лица фотографироваться — индивидуальное решение директора, а не
отказ в праве забирать. Компенсация — **Photo ID check**: галочка «документ проверен» в момент
выдачи. Статус **«no photo on file»** виден в журнале и на экране выдачи всегда.

---

## Подтверждение на общем планшете — именные окошки, не тумблер (2026-07-26)

**Решение Николая 26.07, финальная форма. Заменяет более раннюю формулировку «тумблер
"я такой-то" + подтверждение».**

На общем планшете класса подтверждение передачи = **именные окошки**: по одной крупной
кнопке-имени на каждого учителя, чек-нутого в этот класс сегодня. **Тапает тот, кто
фактически принял ребёнка** — один жест = выбор подписанта **и** подтверждение.
Двухшаговость сохраняется: карточка ребёнка → окошко. Атрибуция пишет **имя нажавшего** —
не имя дежурного, не имя владельца устройства, не имя того, за кем закреплена комната.

- Один чек-нутый → **одно окошко**. Жест не исчезает и не «упрощается до автоподтверждения»:
  подпись всегда остаётся осознанным тапом по своему имени.
- Флоатер чек-нулся в комнату → его окошко появляется тем же обновлением списка,
  без переклика устройства.
- **Дежурство** (первый чек-ин смены → до checkout → второй) влияет **только на порядок и
  размер окошек** (дежурный первым и крупнее). Дежурство **не гейт подписи**: подтверждает
  принявший, кем бы он ни был.

### Окошко заменяет не подтверждение, а ИДЕНТИФИКАЦИЮ

Сегодня личность подтверждающего выводится **исключительно** из PIN: `safepass_confirm_handoff`
берёт `staff` по `pin_hash = p_pin_hash` и из найденной строки пишет `teacher_id`/`teacher_name`.
Значит снятие PIN допустимо **только вместе** с окошком, которое несёт `staff_id`. Снять
проверку PIN, не передав личность нажавшего, — запрещено: это передача без подписанта.

PIN снимается **org-опцией** (`strict OFF` по умолчанию), а не удалением кода.
**PIN-рельс не сносится** — он остаётся включаемым и служит аварийным входом (ниже).

### Обеды и флоатеры — механика уже это несёт (подтверждено 2026-07-26)

Отдельной постройки не требует, следует из правил выше: перерыв учителя = **checkout** → его
окошко гаснет; флоатер чек-инится в этот класс → появляется **его** окошко; учитель вернулся =
чек-ин обратно. Дежурство при этом **перетекает само** (первый по времени среди тех, у кого
смена открыта). Инвариант один и тот же в любой момент дня: **подписант = фактически
присутствующий**, и подписать может только тот, кто сейчас в комнате.

Частный случай — один чек-нутый в комнате — **норма, а не дефект**: он законен в том числе в
сон-час (OAC 5180:2-12-20(A)(7), см. `compliance-map.md`). Одно окошко — рабочее состояние.

### Ноль чек-нутых → аварийный PIN-путь, НЕ блокировка

Если в комнате сегодня не чек-нулся никто, передачи **не запрещены**. Экран показывает
**«No teacher checked in — emergency confirm with staff PIN»**: PIN удостоверяет личность
там, где чек-ина нет, и запись сохраняется **с флагом «confirmed via PIN fallback,
no check-in»**, видимым директору в журнале. Планшет чек-ина сел, а родитель стоит у двери —
комната не встаёт; след того, что круг прошёл в обход чек-ина, остаётся честным и читаемым.

Запрещено: делать «ноль чек-нутых» глухой блокировкой; писать аварийное подтверждение
без флага (тогда обход чек-ина неотличим от нормы).

### Очерёдность

Окошки — часть **учительского захода** и строятся **вместе с чек-ином учителей**: раньше
чек-ина их источника не существует (на 26.07 `staff_time_events`, `staff_time_log`,
`staff_clock_devices`, `safepass_duty_sessions`, `safepass_duty_assignments` — все пусты).
BYOD-подтверждение со своего телефона — отдельный слой **поверх**, позже.

Смежное: `safepass_duty_assignments` (пустая) кодирует ДРУГУЮ модель дежурства — назначение
по расписанию (`duty_date/duty_start/duty_end/mode`). Этот канон её **замещает**: дежурство =
производная порядка чек-ина. Строить гейт из этой таблицы запрещено.

## «ПРОВЕРЕННЫЙ РАБОТАЮЩИЙ БЛОК» = БЛОК С ГАРД-ТЕСТОМ (Николай, 2026-07-28)

Просьба владельца — «Maintainer не даёт копаться в проверенных работающих блоках» —
превращается в **измеримое свойство**, а не в политику.

⛔ **Буквальный запрет не ставим,** и вот почему (довод владельца, принят целиком):

- почти всё, что починено за день, трогало **работающий** код — `catmap`, `child_name`,
  `approveIea`;
- **«работает» не значит «верно»**: `emergency_transport_auth` работал безупречно и утверждал
  вымысел на 623 детей;
- **замок без выхода обходят стороной**, и сигнал теряется — тот же изъян, что у необнуляемого
  счётчика.

### Определение

**Проверенный работающий блок — это блок, у которого есть ГАРД-ТЕСТ, падающий при изменении
поведения.** Защита работающего — не политика, а **тест**.

Уже работают именно так: `SAMPLE_SCOPE` · пол версии кита · `rosterKey` · снятие typed ·
`provenanceWireGuard`. Тронуть нельзя, не отредактировав тест **осознанно**.

### Правило прикосновения — три условия вместо запрета

1. **Назвать, ЧТО ЛОМАЕТСЯ** — вопрос 3 пса;
2. **Показать ТЕСТ**, доказывающий, что **прежнее** поведение сохранено — регрессия, а не
   «тесты зелёные»;
3. **СЛОВО ВЛАДЕЛЬЦА**, если блок claim-facing или родительский.

Прикосновение становится **дорогим и видимым, а не невозможным** — и не создаёт стимула обходить.

### Работа Maintainer, прямо отсюда следующая

**Искать блоки, которые работают, но НЕ защищены гардом.** Именно они ломаются молча. Проверено
по дню: **все четыре крупные дыры были ровно этого класса** — замок без гарда против обхода
через Approve · `child_name` без гарда, пока не порвал ключ питания · одобрение недели без гейта
до инцидента Pearl · вкладка Health без проверки пути записи 27 дней.

## ЧЕТЫРЕ ВОПРОСА ПЁСА — что делать, ПОЛУЧИВ новое правило (Николай, 2026-07-28)

**Стоячая обязанность, действует немедленно.** Относится к правилам, канонам и утверждениям
о норме — не к обычным рабочим поручениям.

**Повод, названный владельцем прямо:** Claude увлекается, забывает пользоваться существующими
правилами и сочиняет новые, которые уже ломали действующие функции. Четыре случая за один день:

| Случай | Что было не так |
|---|---|
| «сортировка ВСЕГДА по `last_name`» | §2a **уже существовал**, осознанный и claim-facing; проверка вместо исполнения спасла порядок строк на печатных клеймовых листах |
| «схему вперёд» | обобщение с одного случая — применимо к **одному окну из четырёх** |
| «родительский заменитель молока не возмещается» | утверждение о норме **по памяти**; оказалось наоборот |
| «учителя заблокированы» | **опровергнуто замером**: `readOnly` только в `DirectorMode`, 9 строк из 9 писались |
| «MealCount первыми — там данные клейма» (29.07, владелец) | приоритет выведен из **важности экрана**, а не из признака; замер: писателей там **нет вовсе** |
| «модель описана, но не внедрена» (29.07, владелец) | гипотеза принята за установленное и на ней написан целый блок. Замер: селектор источника **есть и выложен** (три варианта), уровни в `child_field_locks` верные (`allergies`/`medications` = `marked`), запись со слов проходит (`applied=true`). Мешали ключ и **недостижимость ответа** |
| «переименование **отвязывает** ребёнка от отметок» (29.07, владелец) | последствие названо, **механизм не проверен**. Замер: связь держит `roster_id` — он есть у **2352 строк из 2444 (96 %)**, имя лишь вторая копия; **164 строки уже разошлись, и ничего не потерялось**. Опасность была не та, которую называли |
| «поиск двойников **ребёнка**» (29.07, оба) | в отчёте стояло «поиск двойников», и к нему подставилось правдоподобное «ребёнка». Замер: `find_person_candidates` ищет **родителей и экстренные контакты**; ветка ребёнка ищет кандидатов на сервере и терять клиенту там нечего |

Общий корень один: **утверждал без замера или обобщал с одного случая, не поискав существующее
правило.** Шестой случай добавляет к нему оттенок, который стоит назвать отдельно: **подставлена
правдоподобная конкретика вместо вопроса «о чём именно речь»**. «Поиск двойников» — родовое имя;
сущностей под ним две, и они ведут себя по-разному. Дешёвый приём против этого: **прежде чем
рассуждать о механизме, назвать его точное имя** — функцию, таблицу, колонку. Имя проверяется
грепом за секунды, догадка проверяется аварией.

### Четыре вопроса — задать ДО применения, доложить, потом применять

1. **НЕТ ЛИ УЖЕ ПРАВИЛА об этом?** Искать в `platform-standards` и `DECISIONS` **перед** тем,
   как писать новое.
2. **ЧЕМ ЭТО ИЗМЕРЕНО?** Один случай — не правило. Утверждение о норме — только с первоисточником.
3. **ЧТО ЭТО ЛОМАЕТ?** Назвать **действующие** функции, которых новое правило касается.
4. **ЧЬЁ ЭТО РЕШЕНИЕ?** Если владельца — **не исполнять, вернуть ему.**
5. **КАК ВЫГЛЯДИТ ОТКАЗ ЭТОГО ПРЕДОТВРАЩЕНИЯ?** (добавлен 29.07, владельцем)
   **Если отказ механизма неотличим от честного «ничего не найдено» — окно шире объявленного
   ровно на этот путь.** Спрашивать у каждого «предотвращения»: поиска двойников, проверки
   права, гейта, ловушки. Механизм, чей отказ выглядит как пустой ответ, не защищает — он
   молчит, и молчание засчитывается за «всё чисто».

   ⭐ **И ноль проходов — не оправдание.** Окно людей в порте DCY стояло открытым сутки, и
   замер показал: прошло **ноль**. Это **не «обошлось»** — это значит, что **размера окна мы не
   знали, пока не замерили**. Величина риска и величина ущерба — разные числа, и первое не
   выводится из второго задним числом.

⭐ **Гипотезу называть УСЛОВНО и с запросом замера.** «ЕСЛИ пишется широко, то это эскалация —
замерь» стоило **один запрос** и закрыло вопрос одним шагом: запись в `role_module_access`
требует `is_org_owner(org_id)`, эскалации нет. Названная утвердительно, та же гипотеза стоила бы
переделку. Условная форма + запрос замера — самый дешёвый способ ошибаться.

### СЧЁТ ОКУПАЕМОСТИ ВОПРОСА 1 — чтобы правило не сочли обрядом

**Вопрос «нет ли уже правила/решения об этом?» окупился ВОСЕМЬ РАЗ за два дня.** Счёт ведётся здесь
и **пополняется каждым новым случаем**: правило, которое нельзя предъявить в цифрах, через месяц
начинают обходить как формальность.

| # | Что нашлось готовым | Что это спасло |
|---|---|---|
| 1 | **§2a уже существовал** (сортировка) | порядок строк на **печатных клеймовых листах** |
| 2 | **`matchRoster` уже нёс нужную семантику** | второй сопоставитель — и, что хуже, второй набор правил, который **разошёлся бы с первым** |
| 3 | **`menumaker.documents` уже был и пуст**, колонки под задачу | хранилище строить не пришлось: заход 2 оказался **проводкой, а не схемой** |
| 4 | **`medication_log` построен и ждал основания** | уточнён приоритет 01217: он первый **не потому, что его читают**, а потому что у него готов потребитель |
| 5 | **вторая `documentDateOf`** в `dcyPort` — имя то же, поведение другое | два правила под одним именем, расходящиеся молча |
| 6 | **третья копия того же правила** в `enrollmentValidationRules` | то же, третьим экземпляром |
| 7 | **`record_child_field_change` уже несёт белый список таблиц внутри** | защита клеймовых колонок строится **копированием своего же приёма**, а не изобретением |
| 8 | **68 сканов посещаемости уже лежат в хранилище** — собранные не нами, а **директорами, своими руками**, 68 раз подряд | подшивка делается **одной миграцией**; перезагружать не придётся ничего. **Четвёртый за сутки случай «факт уже собран, не подключён»** — после `documents`, `signature_date` в `form_data` и `medication_log` |

⭐ **И в четырёх из восьми собранное лежало РЯДОМ С ТЕМ МЕСТОМ, ГДЕ ИСКАЛИ** (`documents`,
`signature_date` в `form_data`, `medication_log`, сканы в хранилище). В последнем случае
**собирателем был человек**: директора складывали доказательство своими руками, а система его не
подхватывала.

**Из шести случаев четыре нашлись НЕ глазами, а проверкой** — гардом или замером. Вопрос 1 работает
не как память, а как **обязанность посмотреть**.

### ⚖️ Честная половина счёта: чаще Q1 ловит решения ВЛАДЕЛЬЦА, а не мои

Из пойманного вопросом 1 большинство — **распоряжения владельца**: ось сортировки («всегда по
`last_name`»), правило «схему вперёд», приказ поставить триггер-пол, «MealCount первыми»,
«модель описана, но не внедрена».

**Так и задумано, и владелец назвал это прямо:** он приносит решения, я проверяю, **есть ли они уже
и что они сломают**. Вопрос 1 — не защита от исполнителя, а **вторая пара глаз к тому, кто решает**.
Отсюда и форма ответа: **возврат с замером, а не отказ**.

**И обратный случай, тоже в счёт — он мой:** поиск **по имени** нашёл не ту таблицу
(`staff_time_log` вместо живой `staff_time_events`) и чуть не отправил регуляторную величину в
очередь за журналом посещаемости. **Имя не есть личность — ни когда ищешь, ни когда находишь**
(отдельный канон выше).

**Красный на любом = НЕ ПРИМЕНЯТЬ.** Форма — **возврат, а не отказ**: «пересекается с §X» ·
«измерено на одном случае» · «затронет вот эти функции» · «это решение владельца».

**Возражать владельцу — часть работы, а не помеха ей.** Формализуется то, что уже трижды
спасало в тот же день по собственной инициативе: §2a, «схему вперёд», `submit_public_form`.

⭐ **Первой добычей правила стал приказ владельца — в день его введения.** Приказ: «поставь
триггер-пол». Вопрос 3 «что это сломает» дал ответ: `approveCacfpUpdate` и `approveIea` пишут
шесть **запертых** полей **напрямую**, и триггер отбил бы **Approve** — путь, у которого документ
как раз есть. Пол не поставлен, найдена предпосылка. Проверка новых правил окупилась на первом же.

### Проверка блока самим собой (Q1, честно)

Найдены **два частичных пересечения**, дубликатом блок не является:

- [«Утверждение о состоянии данных обязано нести дату и способ проверки»](#) покрывает **Q2**,
  но только для утверждений **о состоянии данных**. Теперь читается как **частный случай Q2**,
  а не как отдельное правило;
- `DECISIONS` «Спор с владельцем о его формах: реестр, не память» — тот же Q2, суженный до форм.

Не покрыто ничем прежним: **Q1** (искать существующее правило), **Q3** (назвать, что ломается),
**Q4** (вернуть решение владельцу).

**Что этот блок сам может сломать (Q3 на себе):** он вставляет шаг возврата между поручением
и исполнением. Риск — превратиться в торможение. Границы: только для **новых правил, канонов
и утверждений о норме**; обычные рабочие поручения исполняются как прежде; форма — **возврат
с фактом**, а не отказ.

## Правило, живущее только в UI, — не правило (Николай, 2026-07-28)

Проверка, стоящая в интерфейсе, **не является правилом системы**. Интерфейс — лишь один из
клиентов данных; любой другой путь к тем же данным её не видит. Правило живёт там, **ниже чего
пройти нельзя**: в записи (триггер / CHECK), в RPC, в развёрнутом артефакте. Экранная проверка
остаётся — но как **вторая петля**: она даёт быстрый понятный отказ до сети, а не гарантию.

**Отказ обязан звучать словами.** Тихо не сработавший гард неотличим от сработавшего — это
отдельный урок, оплаченный «немым» Submit и «немым» Copy link.

Три прецедента, на которых правило сошлось (27–28.07.2026):

| Случай | Где НЕ работает | Где рубеж |
|---|---|---|
| Предохранитель репетиционной пробы | assert в скрипте съёмки | `BEFORE INSERT` на записи: центр приходит **параметром запуска**, и проверка в том же файле, что и параметр, не защищает |
| Пол версии кита | свойство, объявленное формой | свойство **развёрнутого кита**: форма может объявить что угодно, истина — то, что отдал сервер |
| Замок запертых полей карточки | гашение инпута | **save-путь**: три голых `update()` из `ChildSettingsPage` уходят прямо в PostgREST, гашение кнопки обходится |

Запрещено: называть гардом то, что живёт только в вёрстке; писать отказ в консоль вместо экрана.

## Гейт, поставленный ДО первого использования, когорты не имеет (Николай, 2026-07-28)

**Главное правило: ставить гейт до того, как фича пошла в дело.** Тогда записей «по неверную
сторону» не существует — не потому что их простили, а потому что их неоткуда взять.

Правило родилось из собственной ретроспективы: из шести гейтов недели **когорту «до» имеют
пять**, и единственный, у кого её нет, — `SAMPLE_SCOPE`, единственный поставленный **до** того,
как образцы подписи пошли в дело. Пять из шести опоздали.

**Измерение когорты — лечение опоздания, а не цель.** Следствие ниже описывает, что делать,
когда опоздали; оно не отменяет главного правила и не делает опоздание нормой.

### Следствие: опоздавший гейт обязан назвать свою когорту

Гейт, поставленный после того как данные пошли, **оставляет за собой записи, которых он
не касался**. Они не нарушают правило — правила тогда не было; они просто вне его.

**Требование: ставя гейт — СРАЗУ измерить, сколько записей уже по неверную сторону, и записать
результат РЯДОМ С ГЕЙТОМ.** Не потом и не отдельным аудитом: через полгода никто не вспомнит,
что список вообще нужен, а укусит он в день, когда до этих записей дойдёт первый потребитель.

Случай, на котором следствие родилось: одна запись с преждевременно проставленными строками
пересмотра нашлась **случайно, за год до того как она укусит**. Не искали — наткнулись.

### Ретроспектива по гейтам недели 22–28.07.2026

| Гейт | Когорта «до» | Чем это станет |
|---|---|---|
| **Замок полей** (`child_field_locks`) | `frp` 616 · `classroom_id` 344 · `birthday` 334 · `frp_expires` 278 · `date_in` 163 · `date_out` 20 · `emergency_transport_auth` 2 · `parent_signed_at` 0 · `physician_signature_date` 0 | значения 🔒-полей **без провенанса**: замок их не запрещает, но и доказать их нечем. Закрывается по мере ручного ввода, не разом |
| **Гард пробы** (`trg_enr_sub_probe_center`) | **1** | та самая проба; запечатана, `record_origin` останется NULL навсегда |
| **Пол версии кита** (`kitVersionFloor`) | **94** | все записи без самообъявленной версии; бэкфилл невозможен по определению |
| **Страж `SAMPLE_SCOPE`** | **0** | таблица образцов была пуста — редкий случай гейта без когорты |
| **`rosterKey`** (ключ не пересобирается) | **614** прошли через прежних писателей, из них **96** в меньшинственном порядке | различие видно, но переписывать нельзя: ключ разъедется со строками питания |
| **Гейт строк пересмотра** (кит, `f3b4c03`) | **1** | три строки на три года заняты датой первичной подписи; укусит в июле 2027 |

### ⚠ Эту таблицу читать как СРОК, а не как ДОЛГ

**Бэкфиллить эти значения не нужно.** Замок защищает **будущее**; прошлое закрыто **бумагой**
в папках центров. 616 `frp`, 344 `classroom_id`, 334 `birthday` не «ждут исправления» — они
просто существуют без провенанса, и это честное состояние, а не задолженность.

**Провенанс они получат САМИ за один цикл ежегодного обновления**: порт запишет их из свежих
подписанных форм, каждое значение придёт со своей документной датой и своим автором. Ничего
специально мигрировать не придётся.

**Следствие, меняющее приоритет кампании массового обновления (~300 семей):** у неё появляется
**вторая цель помимо комплаенса** — она же и есть **миграция провенанса**. Описывать и
приоритизировать её надо соответственно: это не только «собрать подписи за новый год», это
единственный проход, после которого у карточек появляется доказательство происхождения.

Читается так: **гейт без когорты — исключение (один из шести)**, а не норма.

**Седьмой гейт, 28.07 — «одобрять только завершённую неделю».** Когорта: **2 класса-недели**,
и обе — сам инцидент, который его и вызвал. Больше ни одной недели ни в одном центре до её
окончания не одобряли. **Опоздавший гейт стоил ровно одного случая** — редкий и приятный исход,
который стоит записать рядом с правилом, чтобы «опоздали» не читалось как «всегда катастрофа».

## У проверки состояния обязан быть УТОЧНЁННЫЙ признак (Николай, 2026-07-28)

**Первый пришедший в голову признак почти всегда даёт ложные срабатывания.** Каждый новый чек
сначала прогоняется **на заведомо здоровых объектах** — если он краснеет и на них, признак сырой.

**Случай, на котором правило родилось (28.07): признак уточнялся ЧЕТЫРЕ раза, итог отличается
от первого в десять раз.**

| Редакция признака | Нашлось | Что было не так |
|---|---|---|
| «ноль restrictive-политик» | **62** | у справочников (`cacfp_rates`, `meal_types`, `age_groups`) **арендатора нет вовсе** — удерживать нечего |
| + «таблица несёт `org_id`/`center_id`» | **27** | часть имеет **ноль политик вообще** — это не «открыто», а «закрыто для всех, кроме service_role» |
| + «есть permissive, который кого-то пропускает» | **14** | permissive может **сам** нести арендатора: у `role_module_access` запись требует `is_org_owner(org_id)` |
| + «permissive НЕ упоминает арендатора» и выдан **не `service_role`** | **6** | `USING(true) TO service_role` — не дыра |

Из шести две (`published_menus`, `policy_documents`) читаются публично **намеренно** — родители
смотрят опубликованное меню. Остаётся **четыре**, и вот они настоящие.

### Отдельный класс, не смешивать: RLS БЕЗ ПОЛИТИК

**24 таблицы** имеют RLS и **ноль политик вообще**. Это **не «открыто»**, а **«закрыто для всех,
кроме `service_role`»** — либо намеренно, либо сломанная функциональность. Держать отдельной
строкой отчёта: смешанные с «открыто», они делают число бессмысленным.

## ПРОВЕРЯТЬ ОТВЕТ, А НЕ ВХОД (Николай, 2026-07-29)

Парное правило к тому, что стоит в шапке `docs/maintenance/postflight.sql`: **отказ
засчитывается, только если отказал ТОТ механизм, который проверяют; зелёный от чужого
механизма хуже красного.** Это — про вторую сторону той же монеты.

**Чек-лист, измеряющий АРГУМЕНТЫ правила, пропускает случаи, где правило смотрит не туда.
Мерить надо то, что УВИДИТ ЭКРАН под реальной ролью.**

### Сильнейший случай: права были РОВНО как задумано — и экран был мёртв

Проверка S-1 послеполёта спрашивала справочник прав: выданы ли роли `authenticated` все колонки
`staff`, кроме закрытой. **29.07 она отвечала зелёным — и была права.** Права были в точности
такими, как решено накануне.

**И ровно в эти часы карточка сотрудника на боевом была мертва у всех до единого.** Потому что
экран просил `select *`, а звёздочка задевает и закрытую колонку: Postgres отвечает
`permission denied for table staff`, PostgREST отдаёт 42501, а выложенный код читал ответ без
`error` — и рисовал уверенную пустоту. Десять часов.

**Справочник прав сказать об этом не мог в принципе.** Он описывает вход правила («какие права
выданы»), а вопрос был про ответ («что вернёт база на тот запрос, который шлёт экран»). Оба
утверждения истинны одновременно: права верные, экран мёртвый.

Теперь S-1 не спрашивает, а **пробует**: выполняет от имени `authenticated` тот же запрос, что
шлёт экран. Рядом встала S-2b — `select *` по `staff` обязан быть **красным**, потому что это
ровно тот запрос, которым карточка себя убила.

**Случай второй, слабее, но нагляднее про формулу (29.07).** Вечерний предполёт к сужению `staff`
замерил «сколько центров у логина» и получил: админ 0 · офис-менеджер 0 · бухгалтер 0 —
отсюда вывод «нужна org-половина формулы», верный. Утренний прогон **под каждым из девяти
логинов**, считавший **строки, которые вернёт запрос**, дал: админ 105 · офис-менеджер 105 ·
**бухгалтер 0**. Причина: `core.has_org_role()` читает `core.memberships`, а у бухгалтера
там **нет строки вовсе** — его роль живёт только в `menumaker.user_roles`. Правило смотрело
не в ту таблицу, и «сколько центров» этого показать не могло **в принципе**: вход был
правильный, ответ — нет.

Отсюда `menumaker.in_org(org, roles[])` — спрашивает **оба** источника ролей.

### Форма отчёта: «видит строк» и «ПРАВИТ строк» — рядом, навсегда

**Ворота, закрытые всегда, в отчёте выглядят точно так же хорошо, как исправные.** Поэтому
у каждой проверки доступа две колонки: сколько строк логин **видит** и сколько **может
править** (`update ... where true` + `get diagnostics row_count`, внутри откатываемой
транзакции). Расхождение — находка, совпадение — доказательство.

Так и нашлось на `dispatch_routes` 29.07: после сужения все девять логинов правят **0**
строк. Замер грантов объяснил: у `authenticated` на этой таблице **грант только SELECT**,
и так было **до** миграции — снятая политика записи была декоративной дважды (предикат не
срабатывал никогда, права под ним не было). Не регресс — но узнали об этом только потому,
что колонка «правит» стояла рядом.

### Зеркало ложного зелёного — ЛОЖНЫЙ КРАСНЫЙ

Тот же прогон дал красный на `find_child_candidates`: «нет в выложенном бандле». Замер:
этой строки нет **ни в одном файле приложения и не должно быть** — кандидатов ищет сама
`resolve_or_create_child` на сервере и возвращает их вопросом. Проверка требовала **вход**
(имя функции в бандле) вместо **ответа** (доходит ли вопрос до человека), то есть краснела
от механизма, которого никто не заказывал.

**Красный от чужого механизма так же негоден, как зелёный от чужого:** первый заставляет
чинить исправное, второй — считать проверенным непроверенное.

### Третий вид: ПРОВЕРКА, КОТОРАЯ ОТСТУПИЛА

Отступление в отчёте выглядит зелёным. Журнальная проба 29.07 писала «⚠ журнал пуст — править
не на чем» и шла дальше; строка не красная, значит читается как «всё в порядке». На деле она
означала «мы не проверяли».

**Три вида одной болезни — отчёт говорит «проверено» там, где не проверено ничего:**

| Вид | Как выглядит | Чем лечится |
|---|---|---|
| **ложный зелёный** | отказал чужой механизм | сверять отказ с его СОБСТВЕННЫМ текстом |
| **ложный красный** | требуется вход, которого никто не заказывал | проверять ответ, а не имя |
| **отступление** | «не на чем проверить», «пропущено» | **проба обязана СОЗДАТЬ себе условие** — завести строку законным путём и уже её пробовать |

Правило: **проверка не отступает.** Нет данных для попытки — заведи их сам, в той же
откатываемой транзакции. Пропуск допустим только как **красный**, никогда как молчание.

### Прогон по этому признаку, 29.07: нашлись два отступления

| Где | Что писала | Чем было на деле |
|---|---|---|
| витрина родителя (`postflight.mjs`) | «на этой странице нет включений form-kit.js — проверять нечего» | витрина есть **список ссылок**; включений в ней нет и не будет, значит проверка **не могла покраснеть никогда** |
| печать под директором (`postflight.sql` П-1) | «строка не видна — печать этой ролью не проверена» | ровно то и значит: **не проверена**, то есть ❌ |

Обе переписаны. Витрина теперь идёт **по реестру** — берёт боевую редакцию каждой формы и
смотрит кит у неё; охват вырос с **нуля фактически проверенного** до **15 живых редакций**.

⭐ **И признак пришлось уточнить дважды, оба раза замером.** Первая редакция покраснела на пяти
формах; уточнение «спрашивать кит только там, где есть `signer`» вывело их из проверки — но замер
показал, что у **трёх из пяти кит на месте (v13), а `signer` в реестре просто не заполнен**.
Пустое поле реестра стало бы правом не проверять живую подписную форму. Итог: смотрим **все**
редакции, прощаем отсутствие кита **только карточкам для чтения** (`wic_information`,
`what_to_bring_infant`) — и **называем их вслух**, потому что молчаливое сужение охвата читается
как «всё проверено».

## УТОЧНЕНИЕ ПРИЗНАКА, СУЖАЮЩЕЕ ОХВАТ, ПРОВЕРЯЕТСЯ ЗАМЕРОМ ТОГО, ЧТО ОНО ИСКЛЮЧАЕТ (Николай, 2026-07-29)

**Уточнять признак — правильно** (канон 28.07: у проверки обязан быть уточнённый признак). Но
уточнения бывают двух родов, и путать их нельзя:

- **сужает ЛОЖНЫЕ срабатывания** — проверка перестаёт краснеть там, где всё в порядке;
- **сужает ОХВАТ** — проверка перестаёт СМОТРЕТЬ туда, где может быть беда.

Второе создаёт слепое пятно, и выглядит оно как улучшение: красных стало меньше.

**Правило: всякий раз, когда уточнение выводит объекты ИЗ проверки, замерить исключённые —
и убедиться, что там действительно нечего проверять.**

**Случай (29.07).** Проверка витрины краснела на пяти формах. Уточнение «спрашивать кит только
там, где в реестре заполнен `signer`» выглядело точным: карточку для чтения никто не подписывает.
Замер **исключённых пяти** показал: у **трёх из них кит на месте (v13)**, а `signer` просто **не
заполнен в реестре**. Уточнение сделало **пустое поле реестра правом не проверять живую подписную
форму** — то есть подарило слепое пятно ровно там, где важнее всего.

Итог: смотрим все редакции, прощаем только те две, где кита нет **и не должно быть**, и **называем
их вслух** в отчёте.

**Признак признака:** если уточнение звучит как «проверяем только там, где <поле> заполнено» —
оно опирается на **полноту данных**, а полнота данных не гарантирована ничем. Такое уточнение
годится, только если пустое поле проверено **отдельно**.

### Единственное законное жёлтое

После прогона в файле осталось **одно** предупреждение — S-3, «демо-центр всё ещё meal site».
Оно законно, потому что **сообщает измеренное состояние**, а не невозможность проверить: замер
сделан, ответ получен, и ответ — «так сейчас и надо, но это таймер». **Жёлтое допустимо только
для известного временного состояния с названным сроком; для «не смогли посмотреть» — никогда.** Проверка заменена на ответ:
литерал текста отказа, который обязаны произнести **оба** пути зачисления.

**И то же самое поймало настоящее.** Пока проверка правилась, обнаружилось, что второй путь
зачисления (ручное добавление в ростере) вызывал выдачу ключа как
`const { data: kid } = await ...` — **без `error`**, и `?? null` дописывал строку **без
ключа молча**. Путь, объявленный накануне закрытым, оставался открыт ровно в том случае,
ради которого проверка и ставилась.

## ВЫБРОШЕННЫЙ error: ЧИТАТЕЛЬ И ПИСАТЕЛЬ — РАЗНЫЕ БЕДЫ (Николай, 2026-07-29)

Из пары `{ data, error }` берут только `data`. Линт этого не ловит: он ищет **голый** `await` без
привязки, а привязка здесь есть — идиом выглядит аккуратно и молчит. **Читая код, этого не
видно, значит правило дешевле дисциплины, и место ему в сборке, а не в памяти.**

**Разделять по глаголу, а не по файлу:**

| Глагол | Что видит человек | Приоритет |
|---|---|---|
| **чтение** | пустой экран — **плохо, но ВИДНО** | храповик: потолок заморожен, опускается партиями |
| **запись** (`insert`/`update`/`upsert`/`delete`/`upload`) | «сохранено», а в базе ничего — **ТИХАЯ ПОТЕРЯ ДАННЫХ, не видно вовсе** | **ноль, без потолка** |
| **rpc** | неизвестно | считается писателем: имени функции недостаточно, чтобы поручиться, что она не пишет |

Обе аварии 29.07 — по одной каждого вида: карточка сотрудника (чтение) и ручное добавление
ребёнка (rpc). **Замер 29.07: 169 мест — 12 писательских и 157 читательских.** Писательские
погашены в тот же день все двенадцать; читательские заморожены потолком.

### Замер бьёт предчувствие — но знание владельца о собственной работе бьёт и наш замер

**Случай 29.07.** Три медицинские формы оценивались нами в **три дня**: «сделать форму» ×3. Оценку
уронил до **одного дня** не замер, а **факт, названный владельцем**: справки выдаются онлайн для
распечатывания, возвращаются **бумагой**, основной способ — ручной ввод со сканированием. Значит
онлайн-заполняемых версий **строить не надо**: нужна печатность и **путь приёма**, а он **один на
все три**.

**Наш замер этого не давал и дать не мог:** он видит реестр, схему и код — но не то, **как в этом
садике на самом деле ходит бумага**. Правило: **прежде чем оценивать работу с формой, спросить
владельца, каким путём документ ходит сегодня.** Один такой вопрос стоил двух дней.

⚠️ **Замер поправил ожидание — пятый случай к правилу «проверять ответ, а не вход».** Первыми
подозревались страницы Meal Count: данные клейма, по 7 мест каждая, важность очевидна. По
глаголу **ни одного писателя там не оказалось** — все их места чтения.

**ОЧЕРЕДЬ СТРОИТ ПРИЗНАК, А НЕ ПРЕДЧУВСТВИЕ.** Приоритет, выведенный из **важности экрана**,
а не из **признака поломки**, ставит в начало то, что страшнее звучит, а не то, что тише
ломается. Здесь это стоило бы ровно наоборот: пока чинили бы 14 чтений на видном экране, 12
писателей на неприметных продолжали бы терять данные молча.

### У храповика обязан быть РИТМ, иначе потолок замрёт

**Правило, а не намерение: открыл файл ради другой работы — погасил его нарушения ТЕМ ЖЕ
коммитом и опустил потолок (`node scripts/scan-error-discards.mjs --baseline`).**

Кампания «пройти 56 файлов» не состоится никогда: она ничья и всегда уступает срочному.
Правка же файла, который и так открыт, стоит минуты и не требует отдельной сверки — ты уже в
контексте этого экрана. Потолок падает сам собой, без плана.

**Законный отказ от `error` один:** `// error-ignored: <причина>` строкой выше, и причина обязана
быть **названа**. Пустая отговорка — то же молчание, только с виду законное.

## ОТКАЗ ДОЛЖЕН ЗВУЧАТЬ ТАМ, ГДЕ ПРОИЗОШЛО ДЕЙСТВИЕ (Николай, 2026-07-29)

**СЛОВА В НЕДОСТИЖИМОМ МЕСТЕ — ТО ЖЕ МОЛЧАНИЕ.**

Все прежние починки этой недели проверяли **наличие** текста отказа. Ни одна не проверяла его
**достижимость**.

**Случай.** Вкладка Health: баннер результата — **первый элемент вкладки** (строка 604), кнопка
Save — **в подвале** (строка 797), между ними **пятнадцать полей**. Директор нажимал внизу и
получал ответ наверху, вне поля зрения. **Отказ существовал, был написан словами и никем не
читался** — с его места это неотличимо от «ничего не произошло», и именно так и было доложено.

**Правило.** У каждого действия ответ появляется **в поле зрения того, кто действовал**: рядом с
кнопкой, либо прокруткой к ответу, либо и тем и другим. Проверяется **достижимость**, а не
присутствие в разметке.

**И то же самое — для сведений, которыми действие подписывается.** Переключатель источника жил
наверху вкладки: директор с бумагой в руках не видел, **чем подпишется** запись, в момент
нажатия. Теперь у кнопки стоит `🗣 Saving as: said, no document ✎` — состояние и одно касание до
переключателя.

### Прогон по этому признаку, 29.07 — список, не правки

Признак-заместитель: расстояние в строках между первым рендером ответа и кнопкой действия;
отдельно отмечено, есть ли у экрана «липкий» подвал.

| Разрыв | Подвал | Экран | ответ → кнопка |
|---|---|---|---|
| 1304 | да | `settings/SettingsPage.tsx` | 129 → 1433 |
| 525 | да | `documents/DocumentsPage.tsx` | 225 → 750 |
| 251 | — | `enrollment/PacketSetsPage.tsx` | 455 → 706 |
| 232 | да | `children/AddChildRouter.tsx` | 137 → 369 |
| 208 | да | `children/ChildSettingsPage.tsx` | 631 → 839 — **починен 29.07** |
| 82 | — | `reports/SiteClaimReport.tsx` | 237 → 319 |

### СКАНЕР, ИЩУЩИЙ ОДНУ ФОРМУ ЗАПИСИ, НАХОДИТ ТОЛЬКО ЕЁ (Николай, 2026-07-29)

**Признак, написанный под один синтаксис, слеп к тому же смыслу в другом синтаксисе — и молчит
об этом.**

Первая редакция признака искала `{error && …}` и нашла **один** экран. Она пропустила **сам
Health**, с которого всё началось, потому что там ответ подставляется переменной `{results}`.
Уточнение (любое имя ответа + учёт липкого подвала) дало **шесть**.

**Правило:** прежде чем верить охвату сканера, проверить его **на заведомо известном случае** —
на том, ради которого он писался. Если сканер не находит собственный повод, его охват неизвестен,
а не мал.

**И найденное проверяется глазами по одному, не чинится пакетом:** заместительный признак меряет
строки исходника, а не пиксели экрана.

### ПРИЗНАК-ЗАМЕСТИТЕЛЬ ОБЪЯВЛЯЕТ СВОЮ СЛЕПОТУ В ОТЧЁТЕ, А НЕ ПОСЛЕ (Николай, 2026-07-29)

Слепота есть у любого заместительного признака. Вопрос только в том, **когда** о ней узна́ют: из
оговорки в отчёте — или из аварии, когда на признак уже сослались как на полный.

**Образец, засчитанный владельцем.** Карта пустых таблиц строилась признаком «нет в дереве».
Оговорка «**нет в коде ≠ не используется**» стоит **первой строкой раздела**, с проверенным
примером: `child_person_events` пишется из базы функцией `SECURITY DEFINER`, читается видом и
потому **исключена руками**, а не пропущена.

Это тот же урок, что со сканером, не нашедшим сам Health, — **применённый до ошибки, а не после**.

**Правило:** называя цифру, полученную заместительным признаком, в том же абзаце сказать, **чего
этот признак не видит** и как это проверено. Оговорка после ссылки на цифру — уже оправдание.

⚠️ **Признак заместительный и это сказано вслух:** он меряет строки исходника, а не пиксели
экрана. Первая редакция признака нашла **один** экран и **пропустила тот самый Health**, потому
что искала `{error &&`, а там ответ подставляется переменной `{results}`. Уточнение (любое имя
ответа + учёт липкого подвала) дало шесть. **Проверять глазами по одному, а не чинить списком.**

## ГРАНИЦУ ПРОВОДИМ ПО НОСИТЕЛЮ, А НЕ ПО ДОЛЖНОСТИ (Николай, 2026-07-29)

**Когда носитель доступа ОБЩИЙ — граница проводится по нему, а не по названию должности.**

`deny_teacher` названо по должности «учитель». Должности такой в системе нет, и граница не
работала ни дня. А носитель, ради которого она задумывалась, существует и назван в базе прямо:

```sql
menumaker.is_door_account()   -- core.memberships.is_service_account
```

Три логина, `is_service_account = true`: `alpha.cook`, `pearl.cook`, `ridge.cook`. Это **общий
планшет на кухне**, к которому физически подходит любой, кто там оказался, — **устройство без
хозяина**, а не «сотрудник с правами».

**Почему это не придирка к слову.** Должность отвечает на вопрос «кому мы доверяем», носитель —
на вопрос «кто может подойти». Для общего устройства верен второй: доверие к людям тут ничего не
охраняет, потому что устройство не спрашивает, кто его взял. Ровно этим меряли и `staff`:
формулировка была не «любой пользователь», а «общий кухонный планшет в Pearl».

**Признак:** если к учётной записи имеет доступ больше одного человека — граница по должности
**неверна по построению**, сколько бы правильно она ни была написана.

## ВИДИМОСТЬ ЗАЩИТЫ — класс из трёх видов (Николай, 2026-07-29)

**Все три читаются в списке политик как исправная защита, и НИ ОДИН не ловится чтением этого
списка. Только замером.**

| Вид | Условие | Что на деле | Найдено |
|---|---|---|---|
| **политика на НЕСУЩЕСТВУЮЩЕЙ роли** | `NOT has_org_role(org_id, ['teacher'])` | роли нет ни у кого → условие истинно всегда → **пропускает всех** | 18 политик, 16 таблиц (29.07) |
| **политика на ВСЕГДА ПУСТОЙ колонке** | `org_id is not null and is_org_member(org_id)` | все строки несут `NULL` → условие ложно всегда → **не удерживает ничего** | `dispatch_routes`, 8 строк из 8 (29.07) |
| **политика БЕЗ ГРАНТА на действие** | политика на `ALL`, а роли выдан только `SELECT` | политика описывает право, которого нет | `dispatch_routes.dr_manage` (29.07) |

### КЛАСС ОПРЕДЕЛЯЕТСЯ ПОСЛЕДСТВИЕМ, А НЕ ФОРМОЙ (Николай, 2026-07-29)

**Одна и та же форма — «политика ссылается на роль, которой не существует» — даёт
ПРОТИВОПОЛОЖНЫЕ последствия в зависимости от знака:**

| Форма | Знак | Последствие | Замер 29.07 |
|---|---|---|---|
| `NOT has_org_role(org_id, ['teacher'])` | **ЗАПРЕТ** | условие истинно всегда → **дверь настежь** | `teacher` — **16 таблиц**, 18 политик |
| `get_user_role() = ANY(ARRAY['director','purchaser','cook'])` | **ДОПУСК** | мертва **одна нога массива** → **на одного получателя меньше**, политика работает | `purchaser` — **8 таблиц**; `driver` — 1; `cacfp_inspector` — 1 |

**Утверждение о классе, из которого нельзя вывести последствие, — не утверждение.** «Политика на
несуществующей роли» без знака звучит как находка, а на деле объединяет открытую дверь и
неиспользуемую должность. Это тот же сбой, что «поиск двойников» без указания, чьих: родовое имя
вместо механизма.

**Проверка перед тем, как назвать класс:** сказать вслух, **что случится**, если условие
вычислится не так, как задумано. Если ответ различается для двух случаев — это **два класса**, а
не один, и называть их надо порознь.

### Тот же класс на ЦЕПОЧКЕ ЧТЕНИЯ (29.07)

Владелец предложил правило: «отметка времени подачи и есть дата подписи». **Для электронной подачи
это верно** — родитель нарисовал подпись и нажал «отправить» в один момент.

Расширить его на всю цепочку было бы ошибкой той же формы: **для бумаги из папки подписание и
поступление расходятся на ГОДЫ** — в замере 29.07 встречались подписи 2020–2024 годов при вводе в
июле 2026. Одинаковая на вид цепочка (`колонка → запасной путь`) означает **разное** в двух
контекстах: для онлайна запасной путь верен, для бумаги он подменяет дату документа датой ввода.

Поэтому `created_at` **не входит** в `documentDateOf`, хотя входит в соседний `formAsOf` — у того
своя задача (свежесть расписания), и там подмена безвредна. **Правило переносится не по форме
цепочки, а по последствию в конкретном контексте.**

⭐ **И извлекатель обязан различать роль и значение.** Тот же замер выдал `'parent'` и `'staff'`
как «несуществующие роли»; на деле это **значения колонки `scope`** в `signature_samples`. Строка
в кавычках рядом со словом `role` — ещё не роль. Отбрасывается **сверкой со списком реальных
носителей**, а не на глаз.

### Полярность решает, чем именно это кончится

Ссылка на несуществующую роль ломается **по-разному**, и путать нельзя:

- **в ЗАПРЕТЕ** (`NOT has_org_role(…)`) → истинно всегда → **дверь настежь**. Все 18 политик
  `deny_teacher` — этого вида;
- **в ДОПУСКЕ** (`get_user_role() = ANY(ARRAY['director','purchaser','cook'])`) → мёртвой
  оказывается **одна нога массива**, а политика продолжает работать для живых ролей. Это **не
  дыра**, а неиспользуемая роль: `purchaser` (8 таблиц), `driver`, `cacfp_inspector`.

Замер 29.07 нашёл обе формы одним запросом, и это ровно тот случай, когда важно **назвать
механизм точно**, а не по родовому имени: «политика на несуществующей роли» без полярности —
утверждение, из которого нельзя вывести последствие.

### Признак для обзора

```sql
-- 1. роли, упомянутые в политиках, против ролей, которые кто-то реально носит
-- 2. для каждой политики: доля строк с NULL в колонке её предиката
-- 3. пара «политика + грант»: есть ли у роли право на действие, которое политика описывает
```

Все три — в чек №2 maintainer'а. Разбор по каждому — **по слову**.

## PERMISSIVE-политика не есть защита (Николай, 2026-07-28)

**Permissive-политики складываются по ИЛИ, restrictive — по И.** Одна permissive-политика
с `USING (true)` пропускает любого, кто дошёл до таблицы; удерживают **только** restrictive.

**Читать `pg_policies` без флага `polpermissive` — значит увидеть защиту, которой нет.**
Представление `pg_policies` этот флаг не показывает. Смотреть надо `pg_policy.polpermissive`:

```sql
select c.relname, pol.polname, pol.polpermissive,
       pg_get_expr(pol.polqual, pol.polrelid)
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'menumaker' and c.relname = '<таблица>';
```

**Пример, на котором правило и родилось.** Три сестринские таблицы публичных детских форм
выглядели почти одинаково — у каждой политика `auth_manage` и рядом что-то про организацию:

| Таблица | Политики | Кто фактически видит |
|---|---|---|
| `special_diet_forms` | `auth_manage` **permissive** `USING(true)` + `org_isolation` **restrictive** + `module_cacfp_active` **restrictive** | члены своей организации |
| `infant_meal_preferences` | то же | члены своей организации |
| `milk_substitutions` | **только** `auth_manage` **permissive** `USING(true)` | **любой аутентифицированный, поверх границ организаций** |

Разница была **исключительно во флаге**. Список имён политик её не показывал, и по нему третья
таблица читалась как защищённая.

**Следствие для ревью:** «на таблице есть RLS и есть политики» — не утверждение о защите.
Утверждение о защите звучит так: «удерживающие политики — вот эти restrictive, и вот что они
проверяют». Всё остальное — permissive-шум.

## Утверждение о состоянии данных обязано нести дату и способ проверки (Николай, 2026-07-28)

Прежний §1 этого документа утверждал: **«Data is already correct»** — импорт-де кладёт
`child_name = last_name + ' ' + first_name`. Замер 28.07 показал **519 «Ф И» против
96 «И Ф»** из 614. Документ стандартов нёс **непроверенное утверждение, которым
руководствовался код**: два пути записи пересобирали ключ, полагаясь на эту фразу.

**Правило.** Любое утверждение о СОСТОЯНИИ ДАННЫХ в стандарте обязано нести
**дату замера** и **способ проверки** (запрос, скрипт, файл). Без них это не утверждение,
а предположение, и ссылаться на него как на факт нельзя.

Форма записи: *«на 28.07.2026: 519/614 «Ф И», 96 «И Ф» — `select count(*) filter (…)`
по `menumaker.roster`»*.

**Четвёртый пример, 28.07 — тревога, умершая об замер.** Формулировка «учителя Pearl
заблокированы, каждый час это данные клейма, которых потом не будет» была **неверна**:
`readOnly` передаётся только внутри `DirectorMode`, экран отметки приёмов его не получает,
и у **9 строк из 9** `updated_at > director_signed_at` — отметки шли всё это время.
Заблокирован был директорский экран двух классов, а не работа учителей.
Три ложные тревоги за один день — все три сняты замером, ни одна не пережила вопроса
«чем это измерено?». Правила поведения (что делать) даты не требуют — требует её
только описание того, что УЖЕ ЛЕЖИТ в базе.

Смежное: устаревшее утверждение не правится молча — оно **снимается с указанием, чем
опровергнуто**, чтобы следующий читатель видел не только новую фразу, но и цену старой.

## Пункт назначения — запись ребёнка; форма — доказательство (Николай, 2026-07-28)

**Форма = ДОКАЗАТЕЛЬСТВО. Запись = СОСТОЯНИЕ.** Форма определяет, что может попасть в запись
ребёнка и с каким доказательством; запись хранит то, что есть сейчас.

**Как вышло иначе, без драматизации.** База строилась **от данных** — перенос из Brightwheel
плюс кухонный импорт, — а не от форм. Порядок был **продиктован реальностью**: 623 живых ребёнка
и клейм, который надо было подавать. У обратного порядка «от форм» свои провалы: формы меняются,
часть данных формы не имеет вовсе, формы пересекаются между собой. Ни один из двух порядков
не бесплатен.

Следы этого порядка, измеренные 28.07: DCY 01234 собирает 81 ключ и не отдаёт записи **ни одного**;
восемь колонок вкладки Health размечены под форму `dcy_01236`, которой **не существует**;
аллергии, отрицание аллергий, диета и замена молока живут **в одном свободнотекстовом поле**.

### ПРАВИЛО

**Нет колонки без формы, которая её заполняет. Нет поля формы, которое ничто не потребляет.**

Две половины проверяются двумя прогонами:

1. **Колонки-сироты** — поле карточки, которое не собирает ни одна действующая форма
   (сегодня: `date_out`, `milk_kind`, `doctor_name`, `doctor_phone`, `allergies`, `medications`,
   `parent_signed_at`, `physician_signature_date` и 8 полей DCY 01236).
2. **Поля-сироты формы** — ключ, который форма собирает, а платформа не читает
   (сегодня: 81 ключ `dcy_01234`, `race`/`ethnicity` из IEA, родительские контакты отовсюду).

**Прогон повторяемый, раз в месяц, у MAINTAINER'а, с дельтой к прошлому разу.** Смысл — не
разовый аудит, а постоянная проверка: список, который растёт, означает, что порядок «от данных»
вернулся.

## ПРЕЖДЕ ЧЕМ СТРОИТЬ СБОР — ПРОВЕРИТЬ, НЕ СОБРАНО ЛИ УЖЕ. НО НЕ ТАМ, ГДЕ ИЩУТ (Николай, 2026-07-29)

**Зеркало правила «схема опережает сбор»: там схема ждала фактов, здесь СБОР ОПЕРЕЖАЕТ ПРОВОДКУ.**

**Случай.** Мы спорили, дыра это в сборе или наследие. Замер: из 66 бумажных подач **50 несут дату
подписи внутри `form_data`** — OCR прочитал её с бумаги и положил, — а колонка
`enrollment_submissions.signature_date` пуста **у всех 66**. Собрано было; **не доехало**.

**Почему ошибиться легко.** Проверяют **место, куда смотрят** — колонку. Она пуста, и вывод
«не собирается» напрашивается сам. А факт лежит **рядом**, в свободном поле, куда его положил тот,
кто собирал, не зная, где его будут искать.

**Правило.** Прежде чем строить сбор — искать факт **во всех местах, куда его мог положить
собиратель**: свободные поля (`form_data`, `payload`, `meta`), журналы, соседние таблицы. Пустая
колонка доказывает **только пустоту колонки**.

**И следствие для решения.** Когда факт уже собран, задача меняет род: не «построить сбор»
(дни), а «проложить проводку» (часы). Здесь работа обрезалась **вчетверо: с 56 до 18**.

## ИНВАРИАНТ СОСЕДНЕЙ ПОДСИСТЕМЫ ПРОВЕРЯЕТСЯ ТАМ, ГДЕ ЕГО МОЖНО НАРУШИТЬ (Николай, 2026-07-29)

**Не только там, где он живёт.**

**Случай.** Инвариант клейма — `child_name` на существующем ребёнке **не переписывается**, потому
что это ключ в `meal_week_records`. Живёт он в `rosterKey.ts` и в правилах клейма. А **нарушить**
его можно в `approveCacfpUpdate`, который правит карточку по форме. Поэтому проверка «`child_name`
нет среди записываемых полей» стоит **в тесте Approve** — в чужом файле, про соседнюю подсистему.

**Почему так.** Инвариант ломается не там, где объявлен, а там, где **пишут**. Тест, стоящий
только у объявления, увидит переименование константы и **не увидит** нового пути записи, который
её обходит. Регресс всплыл бы в клейме — то есть в деньгах и через месяц.

**Правило:** перечислив места, где инвариант **можно нарушить**, поставить проверку в каждом из
них. Стоимость — одна строка `expect` в чужом тесте; цена пропуска — находка в отчётности.

## ПРИ ПРАВКЕ КОНТРАКТА ПРОВЕРКА ПЕРЕЕЗЖАЕТ ЗА РЕШЕНИЕМ (Николай, 2026-07-29)

**Обычно тесты при смене контракта молча теряют то, что охраняли:** их подгоняют под новую форму
вызова, и охрана исчезает вместе со старой формой.

**Случай.** `doc` стал обязательным, четыре запасные ветки с прямым `UPDATE` удалены. Два теста
проверяли «`child_name` **не уходит в тело `UPDATE`**» — тела больше нет. Подогнать их под новую
сигнатуру и оставить проверять «вызов не падает» значило бы **потерять инвариант клейма молча**.

**Проверка переехала за решением:** теперь она смотрит на **список колонок**, уходящих защищённым
путём, — туда, где решение «какие поля писать» **теперь принимается**.

**Правило:** меняя контракт, спросить о каждом тесте: **где теперь принимается то решение, которое
он охранял?** Тест переносится туда. Если ответ «нигде» — значит решение исчезло, и это отдельная
находка, а не повод удалить тест.

## ПОЛОВИНА МЕХАНИЗМА МОЖЕТ БЫТЬ ХУЖЕ ЕГО ОТСУТСТВИЯ (Николай, 2026-07-29)

Стоит рядом с правилом **«направление ошибки называть вместе с величиной»** и уточняет его:
**половина, которая переворачивает ЗНАК ошибки, хуже отсутствия — в отличие от половины, которая
ошибку уменьшает.**

**Случай.** Перерывы в отметках времени. Дешёвая половина — события `break_out` / `break_in`,
3 часа: педагог вышел на обед, ратио перестало считать его в комнате. Формально верно, и отчитаться
«перерывы сделаны за 3 часа» было бы правдой.

**Но вторая половина — флоатер, тот, кто встал вместо ушедшего.** Без неё комната в обед покажет
**ноль взрослых**. Ошибка не уменьшилась — она **сменила знак**: была лестной (взрослых больше,
чем есть), стала строгой (меньше, чем есть). **Строгая безопаснее лестной, но обе неверны**, а
величина, скачущая между двумя видами неправды, не годится ни для инспектора, ни для решения.

**Правило.** Разбивая механизм на части, спросить о каждой: **она УМЕНЬШАЕТ ошибку или МЕНЯЕТ ЕЙ
ЗНАК?** Первую можно поставить одну и назвать остаток. Вторую — **только вместе с парной**; отдельно
она продаётся как улучшение, а покупается как новая неправда.

## ПРИЗНАК, КОТОРЫЙ МОЖНО ВЫВЕСТИ, НЕ ХРАНЯТ (Николай, 2026-07-29)

Обобщение правила об очередях на **любое** производное свойство.

**Случай.** Обсуждалось, не завести ли у отметки времени признак «отметился **с детьми**» против
«отметился **на работу**». Не нужен: он **выводится из места отметки** — комната с
`is_roster = true` значит «с детьми», кухня или офис значит «на работу».

**Почему хранение хуже вывода.** Хранимый признак **расходится** с тем, из чего он выводился:
поставили `с детьми`, потом перевели человека в кухню — признак остался прежним, и никто не
заметил. Выводимый расходиться не может: он **и есть** ответ на вопрос, заданный данным.

**Когда хранить всё-таки надо** — и это не исключение, а другой случай: когда значение **зависело
от обстоятельств, которых больше нет** (курс на дату, редакция формы у подписанта, категория F/R/P
на момент приёма). Там хранят не признак, а **свидетельство**.

**Проверка:** можно ли ответить на вопрос **запросом к тому, что уже записано**? Если да — это
запрос, а не колонка.

## Очередь ВЫВОДИМ, а не храним (Николай, 2026-07-28)

Отдельный список задач рано или поздно **разойдётся с фактами**: строку забудут закрыть,
закроют дважды, закроют не ту. Список, **вычисленный ИЗ фактов**, разойтись не может — он
и есть факты, и **закрывается сам**, как только факт изменился.

Уже сделаны этим приёмом, и пусть это будет **осознанным паттерном, а не совпадением**:

| Очередь | Выводится из |
|---|---|
| Красный бейдж карточки | пустые обязательные поля + производные правила Family/SafePass |
| Манифест Doc Hub | `document_types` × наличие строк в `documents` |
| Вопросы об имени человека | последнее событие `child_person_events` по паре (ребёнок, человек) |
| Люди, ждущие решения директора | последнее событие по (ребёнок, роль, порядковый), `applied = false` |

### ⚠ У выводимой очереди должно быть НЕ МЕНЬШЕ ДВУХ ВЫХОДОВ

Та же болезнь, что у необнуляемого счётчика, заведённая с другой стороны. Вопрос об имени
закрывался **только согласием**: директор, посмотревший и сказавший «в документе опечатка,
не переименовывать», оставлял единицу, которую **нельзя снять никаким действием**.

**Отказ — тоже ответ**, и обязан закрывать очередь наравне с согласием. У каждого вопроса
пересчитать выходы: если он один — очередь неполна.

**Причина у отказа обязательна.** Отказ без причины — тихий отказ, а мы их выводим.

### Аудит по этому признаку, 28.07

- **вопрос об имени** — был один выход, добавлен второй (`dismiss_person_question`);
- **люди на подтверждение** — нашлась дыра **хуже**: очередь **вообще не хранилась**, вопрос
  жил только в сообщении Approve и умирал вместе с ним. Теперь пишется событием `applied=false`;
- **красный бейдж** и **манифест Doc Hub** — по два выхода и более, полны.

### Порядок в журнале обязан быть НАСТОЯЩИМ

Выводимая очередь читает **последнее** событие — значит порядок событий должен быть определён.
`now()` внутри транзакции **одинаков** для всех строк: отказ и согласие, записанные одной
транзакцией, спорят за первенство, и очередь отвечает случайно. Журналы используют
**`clock_timestamp()`**. Найдено собственным тестом; касается и `rename_person`, который пишет
по событию на каждого ребёнка одной транзакцией.

## ЧЕТЫРЕ ЭТАЖА МЕЖДУ «СДЕЛАНО» И «РАБОТАЕТ» (Николай, 2026-07-28, четвёртый — 29.07)

Каждый этаж — отдельная непроверяемая память, и каждый уже подводил.

| Этаж | Что значит | Чем поймали |
|---|---|---|
| **ЗАПУШЕНО ≠ ЗАДЕПЛОЕНО** | коммит в `origin` не есть код у людей | сборка отстаёт от пуша на минуты, а иногда падает молча |
| **ОДОБРЕНО ≠ ВКЛЕЕНО** | «владелец одобрил» не есть «лежит в проде» | девять текстов отказа одобрены без правок и не вклеены полсуток |
| **ПРИМЕНЕНО В БАЗЕ ≠ ДЕЙСТВУЕТ У ЛЮДЕЙ** | миграция в проде не есть правило в силе | замок жил в RPC, которую развёрнутое приложение не звало; прямой `UPDATE` проходил |
| **ОБЪЯВЛЕНО ≠ ПОДКЛЮЧЕНО** | проверка, объявляющая, что она валит сборку, может быть к сборке не подключена | четыре гарда неделю писали в шапке «the build fails», а сборка была `tsc && vite build` — vitest в неё не входил |

### Четвёртый этаж — на этаж выше прежних (29.07)

Три первых этажа — про **артефакт**: где он лежит, доехал ли, действует ли. Четвёртый — про
**проверку самого артефакта**, и потому опаснее: пока он проседает, все три нижних отчитываются
зелёным, потому что их проверяет механизм, которого нет.

**Случай.** `signatureMethodsGuard`, `sampleScopeGuard`, `provenanceWireGuard`, `kitVersionFloor` —
каждый заявлял в собственной шапке, что сборка падает. Ни один не был подключён к `npm run build`.
Целую неделю мы говорили «блок защищён», а защищал его **только тот, кто помнил запустить
тесты** — то есть дисциплина, ровно та, которую гард и должен был заменить.

**Проверка этажа:** не «есть ли файл проверки», а **что произойдёт со сборкой, если нарушить
правило**. Ответ добывается попыткой, а не чтением шапки — см. следующее правило.

## ПРОВЕРКА ЖИВЁТ НИЖЕ ТОЙ ТОЧКИ, ГДЕ СОБИРАЕТСЯ ИДЕНТИФИКАТОР (Николай, 2026-07-29)

Уточнение к правилу «правило живёт там, где его нельзя обойти» — оно называет **где именно**.

**Если имя таблицы, колонки или функции собирается из частей, всякая проверка ВЫШЕ этой точки
слепа.** Не «может ошибиться» — **слепа по построению**: искать нечего, полного имени не
существует ни в одной строке исходника.

**Случай (замер 29.07).** Имя клеймовой колонки собирается **с обеих сторон**: приложение —
`` `${day}_${SLOT_COL[slot]}` ``, база — `%1$I` из полезной нагрузки клиента. Тридцать колонок
`mon_b … fri_ps`, и **ни одного полного имени в дереве**. Все шесть наших текстовых гардов слепы
здесь **одновременно**.

**Правило:**

| Где собирается имя | Где обязана стоять проверка |
|---|---|
| в приложении | **в базе** (триггер, ограничение) — либо на **закрытом наборе** внутри самой функции |
| в теле функции базы | на **закрытом наборе там же**: белый список, `case`, перечисление |
| нигде (имя написано буквой) | текстовый гард годится |

⭐ **И это прямой довод за пол В БАЗЕ, а не за седьмой сканер дерева:** триггер видит `UPDATE`
**любой природы**, включая динамический — тот самый, что прошёл мимо описи. Сканер дерева, каким
бы точным ни был, увидел бы ровно то же, что и предыдущие шесть: пустоту.

⭐ **Приём уже есть у нас самих** — `record_child_field_change` **несёт белый список таблиц внутри**
(`p_table not in ('roster','child_medical','child') → отказ`). Значит защита строится **копированием
своего же решения**, а не изобретением: седьмой случай в счёте окупаемости вопроса 1.

## ИМЯ НЕ ЕСТЬ ЛИЧНОСТЬ — ни когда ищешь, ни когда находишь (Николай, 2026-07-29)

**Одна болезнь с двух сторон, и оба случая пойманы в один день:**

| Сторона | Случай 29.07 | Чем кончилось бы |
|---|---|---|
| **искал по имени — нашёл не то** | «жив ли вход `teachers_present`?» → посмотрел `staff_time_log` (0 строк) и ответил «нет». Живая таблица — **`staff_time_events`, 25 событий**; имя, по которому искал, принадлежит устаревшему дублю | регуляторная величина ушла бы в очередь за журналом посещаемости, хотя половина её уже собирается |
| **нашёл по имени — оказалось другое** | гард потребовал единого входа к документной дате и вскрыл **вторую функцию с именем `documentDateOf`** в `dcyPort` — с другим поведением | два правила под одним именем расходятся молча |

**И третья находка того же корня, тем же гардом:** `enrollmentValidationRules` держал **свою копию**
порядка «колонка → `form_data`». **Две реализации одного правила расходятся молча — всегда, вопрос
только когда.**

**Правило: искать по тому, ЧТО артефакт делает, а не как называется.**

- ищешь факт → иди **от пути записи** (какая функция/экран пишет и **куда**), а не от таблицы с
  подходящим названием;
- нашёл артефакт с нужным именем → проверь **поведение**, прежде чем на него положиться;
- нашёл **второй** с тем же именем → сведи к одному **сразу**; выбор «какой из двух правильный»
  всегда делается в худший момент.

⚠️ **И у поиска по тексту есть слепота, которую надо называть:** динамический SQL. Пол на `roster`
пишется функцией `record_child_field_change` через `execute format('update menumaker.%I …')` —
греп `update menumaker.roster` **её не находит**. Опись писателей, на которой строят защиту,
обязана быть проверена **на заведомо известном писателе**.

## ИЩИ, КУДА ПИШЕТ ФУНКЦИЯ, А НЕ ТАБЛИЦУ С ПОДХОДЯЩИМ ИМЕНЕМ (Николай, 2026-07-29)

**Тот же класс, что «проверять ответ, а не вход», и стоит рядом с ним: имя таблицы есть ВХОД,
цель записи есть ОТВЕТ.** Совпадение имени с ожиданием — предположение о том, куда пойдут данные;
куда они идут на самом деле, знает только путь записи.

**Случай.** На вопрос «жив ли вход `teachers_present`» я посмотрел `staff_time_log` (0 строк) и
`safepass_duty_sessions` (0) и ответил **«нет»**. Замер: живая таблица — **`staff_time_events`,
25 событий**, и пишет в неё `safepass_staff_check_in`. Имя, по которому я искал, принадлежит
**устаревшему дублю**.

**Правило:** проверяя, собирается ли факт, идти **от пути записи** — какая функция/экран его
пишет и **в какую таблицу**, — а не от таблицы с подходящим названием. Пустая таблица с верным
именем и живая с неочевидным выглядят одинаково ровно до этого шага.

```sql
-- куда на самом деле пишет функция
select proname, pg_get_functiondef(oid) ilike '%<таблица>%' from pg_proc where proname = '<rpc>';
```

**Цена ошибки здесь была прямой:** «присутствия педагогов нет» отправило бы регуляторную величину
в очередь за журналом посещаемости, тогда как половина её уже собирается — и считаемая часть
стоит **два часа**, а не «после GatePulse».

## ПОПРАВКА, КОТОРАЯ НЕ МЕНЯЕТ ДЕЙСТВИЕ, А ДЕЛАЕТ ЕГО ОСНОВАНИЕ ИСТИННЫМ (Николай, 2026-07-29)

**Образец, названный владельцем: «вывод тот же, причина точнее».**

**Случай.** Приоритет формы 01217 среди трёх тёмных был обоснован так: «у неё есть живой
потребитель уже сегодня». Замер: `medications` заполнено у 10 детей, но **не читает никто**, кроме
самой карточки (аллергии — читает, плашкой в сетке приёмов; лекарства — нет). Зато
`menumaker.medication_log` **существует, пуста и не упомянута в коде ни разу**.

Приоритет **остался тем же**, а основание сменилось на истинное: 01217 первым **не потому, что
его читают**, а потому что у него единственного **потребитель уже построен и ждёт основания** —
журнал выдачи без разрешения давать бессмыслен, а с ним работает сразу.

**Почему это отдельный род поправки.** Семь поправок этого дня были противоположными: **менялся
вывод**, потому что причина была выдумана. Здесь вывод устоял — проверка основания подтвердила
решение и **укрепила** его. Это и есть штатный, а не аварийный исход замера.

**Правило:** замерять основание **даже когда согласен с выводом**. Верный вывод на выдуманном
основании неотличим от верного вывода на измеренном — ровно до того дня, когда обстоятельства
сдвинутся, и держаться будет не на чем.

## НАЗВАНИЕ ЧИСЛА НЕСЁТ ЕГО ОХВАТ (Николай, 2026-07-29)

**Один корень, три повтора за сутки** — и лечение **не в расширении признака**, а в **имени
метрики**:

| Что считали | Как назвали | Чем оказалось |
|---|---|---|
| голый `await` без привязки | «линт это ловит» | ловил **одну форму**; авария пришла из другой |
| разбор `{ data }` без `error` | «мест 169 → 157» | **одна синтаксическая форма** из трёх |
| писатели, теряющие отказ | **«писателей 0»** | **41**, из них 6 на клеймовых данных |

**Каждый раз мы считали ОДНУ СИНТАКСИЧЕСКУЮ ФОРМУ и называли это счётом ПРОБЛЕМЫ.**

**Почему оговорка не спасает.** Мы писали её каждый раз — и каждый раз теряли при пересказе,
**потому что она живёт отдельно от цифры**. «Писателей 0 (в форме A)» в отчёте превращается в
«писателей 0» через одну передачу.

**Правило: имя метрики включает охват.** Не «писателей 0», а **«писателей, теряющих `error`
в формах A/B/C, — 0»**. Длиннее — и **непересказуемо неверно**.

**Применено 29.07:** переименованы заголовки карты (`scan-error-discards`) и графа `признак`
в базовой линии; в отчётах числа называются с охватом.

## ОПИСЬ, СДЕЛАННАЯ ОДНИМ СПОСОБОМ ПОИСКА, — ГИПОТЕЗА О ПОЛНОТЕ (Николай, 2026-07-29)

**Случай.** Опись писателей `roster` перед установкой пола:

| Способ | Нашлось |
|---|---|
| греп в одну строку (`from('roster').update`) | **8** |
| многострочный признак (вызов часто перенесён) | **13** — среди пропущенных была **моя собственная правка того же утра** |
| запрос к базе (функции, триггеры) | **ещё 3** |

**И четвёртая слепота — динамический SQL:** `record_child_field_change` пишет в `roster` через
`execute format('update menumaker.%I …')`, поэтому текстовый поиск `update menumaker.roster`
**её не находит вовсе**. Мимо описи прошёл **именно тот путь, ради которого пол и ставится**.

**Правило: полнота описи доказывается ВТОРЫМ способом поиска, а не тщательностью первого.**
Минимум два независимых: текст дерева **и** запрос к базе; для текста — признак, устойчивый к
переносу строки. И **проверить опись на заведомо известном участнике** — им здесь оказался сам
защищаемый механизм.

## ГАРД БЕЗ НЕГАТИВНОЙ ПРОБЫ — ЭТО ЗАЯВЛЕНИЕ, А НЕ ГАРД (Николай, 2026-07-29)

**Любое утверждение о МЕХАНИЗМЕ — «сборка падает», «триггер блокирует», «политика защищает»,
«ловушка держит» — доказывается ПОПЫТКОЙ СДЕЛАТЬ ЗАПРЕЩЁННОЕ, а не формулировкой.**

Причина та же, по которой у ворот считают обе половины: **проверка, никогда не видевшая
нарушения, в отчёте выглядит точно так же хорошо, как работающая.** Зелёный гард может значить
«нарушений нет», а может — «этот гард не сработал бы никогда»; отличить нельзя, пока не покажешь
ему нарушение.

## **ГАРД, НИКОГДА НЕ КРАСНЕВШИЙ, — ЭТО ГИПОТЕЗА, А НЕ ЗАЩИТА** (Николай, 2026-07-29)

**До 29.07 ни один из четырёх гардов ни разу не видел нарушения. Мы знали только, что они
зелёные.**

Зелёный гард — два разных утверждения, неразличимых снаружи: «нарушений нет» и «этот гард не
сработал бы никогда». Пока не показано красное, вторая возможность не исключена ничем, и всё
здание проверок стоит на предположении.

**Отсюда опись, а не вера.** У каждого защитного механизма — триггера, политики, гарда сборки —
спрашивается один вопрос: **роняла ли его хоть раз ПОПЫТКА сделать запрещённое?** Ответ ведётся
списком: [`docs/maintenance/guard-probe-inventory.md`](maintenance/guard-probe-inventory.md).
Механизм без такой попытки записан как **гипотеза** — и это не обвинение, а честная графа.

### У СПИСКА ИСКЛЮЧЕНИЙ ОБЯЗАН БЫТЬ ГАРД НА МЁРТВЫЕ СТРОКИ (Николай, 2026-07-29)

**Файл, переставший нарушать, обязан УЙТИ из списка исключений.** Это единственное место, где
списки исключений гниют: мёртвая строка ничего не значит сегодня и **прикроет живое нарушение
завтра** — тот же файл снова начнёт читать колонку, и гард промолчит, потому что «он же в списке».

**Форма:** отдельный тест, сравнивающий список с текущими нарушениями и требующий **пустого
пересечения наоборот** — ни одного исключения без причины его существования.

**Применено ко всем спискам исключений (29.07):** `ALLOW` в гарде документной даты и **базовая
линия храповика на выброшенный `error`**. Причина у каждого исключения обязательна и проверяется
отдельным тестом: список без причин превращается в свалку за месяц.

**Форма пробы.** Предикат гарда выносится из теста (`src/lib/guardPredicates.ts`), и отдельный
файл (`src/lib/guardNegativeProbes.test.ts`) кормит его **синтетическим плохим образцом**, требуя
красноты. Настоящий код при этом не портится. Для гардов, сканирующих дерево, проба строит
временное дерево из двух файлов — по одному на каждый идиом.

### Пара «предотвращает / обнаруживает» — обе половины называются вслух

**CI предотвращает у источника, послеполёт обнаруживает на выкладке.** Это не синонимы и не
замена одного другим: проверка на выкладке **не мешает** сделать плохое — она сообщает, что
сделали. Между этими двумя моментами машинерия жива.

Поэтому у каждой такой проверки в тексте стоит её **противовес**: `SAMPLE_SCOPE` проверяется
послеполётом по сети (правильный артефакт — то, что **развёрнуто**), а предотвращение — CI в
репозитории форм, в BACKLOG **с триггером** «при следующем касании того репозитория», а не
«когда-нибудь».

⭐ **И ещё один образец того же дня.** Проверка отставания прода родилась с изъяном нашего же
производства: «прод отстаёт» — **норма** между пушем и деплоем, и краснея на каждом пуше, она
стала бы постоянным красным, которое перестают читать. Изъян найден **на первом же прогоне после
починки** — до того, как успел приучить к красному. Теперь проверка сама различает отставание
**по документам** и **по коду**, и красное только для второго.

**Ретроспективно, 29.07:** все четыре прежних гарда получили негативные пробы и прогнаны —
15 проб, все срабатывают. До этого дня ни один из них ни разу не видел нарушения.

### Порядок проб: семейство с известным провалом проверяют раньше

Владелец поставил границу кухни второй **на эмпирическом основании**: «эта граница уже отказала
на этой неделе (`pin_hash`); семейство с известным провалом вероятнее имеет соседей».

**Основание подтвердилось буквально и в тот же час.** Проба нашла, что `deny_teacher` не может
отказать никому, и замер под кухонным логином дал: 301 ребёнок, 70 медкарт, 414 опекунов,
255 домохозяйств — десять таблиц целиком, org-wide. **`pin_hash` был первым симптомом, а не
исключением.**

Отсюда правило очерёдности: **известный провал — не закрытый инцидент, а указатель на
семейство.** Проверять соседей по механизму (та же роль, та же политика, тот же носитель) раньше,
чем механизмы, о которых ничего плохого не известно.

⭐ **Проба немедленно поймала себя саму.** Файл проб содержит строку
`from '../lib/typedSignature'` как образец — и гард подписи, сканирующий всё дерево, покраснел
**на собственном доказательстве**. Та же болезнь, что цитата дурного идиома в комментарии,
посчитанная нарушением: **разговор о нарушении — не нарушение**. Оба сканера теперь это
различают, и оба различия записаны в коде, а не в памяти.

**Следствие для read-back: проверять только из ЖИВОГО АРТЕФАКТА** — из базы, из задеплоенного
бандла, из `origin`. Рабочее дерево подтверждает **намерение**, а не факт.

⭐ **Правило поймало само себя через минуту после того, как было записано.** 28.07, сразу после
`git push`: первая проверка боевого домена нашла **вчерашний** бандл (`index-CZy4knOf.js`).
Через несколько минут — сегодняшний (`index-BkVrtE7w.js`). **Отчитайся мы сразу после `git push`,
отчёт был бы ложным** — и ложным именно в той строке, которая утверждает, что всё проверено.

⭐ **Мало читать живой артефакт — надо знать, что он делает с твоими маркерами.** Первая проверка
бандла дала три ❌ на `lockRefusal`, `approveErr`, `declaredVersion`: минификатор переименовывает
локальные идентификаторы. Проверять надо по **строковым литералам** — их минификатор не трогает
(`'can only be changed from a signed document'`, `'Where this change comes from'`, `'registry:'`).
Маркер, который артефакт вправе переписать, — не маркер.

**Аудит 28.07 — первый случай, когда это правило нашло то, чего никто не искал:** проверка
одобренного вскрыла, что база ушла на день вперёд приложения, и обещание инструкции не
исполнялось бы в понедельник.

### ⚠ ПОЛ СТАВИТСЯ ПОСЛЕ ТОГО, КАК ВЕРХНИЙ ЭТАЖ УМЕЕТ ЕГО ОБЪЯСНИТЬ

Интуиция говорит «сначала защита» — и здесь она **неверна**. Триггер, поставленный раньше, чем
развёрнуто приложение, умеющее показать отказ, начнёт отбивать прямые записи **старого** кода,
у которого нет ни обработки этого отказа, ни текста для него: директор получит сырую ошибку
базы посреди рабочего дня.

**Порядок: деплой → проверка живых потоков → пол.**

Пол **дополняет** верхний этаж, а не заменяет: RPC даёт **человеческий текст** отказа,
триггер — **этаж, который нельзя обойти**. Оба нужны; врозь каждый неполон.

## ОДОБРЕНО ≠ ВКЛЕЕНО (Николай, 2026-07-28)

Этажом выше «запушено ≠ задеплоено». Между **«владелец одобрил»** и **«лежит в проде»** нет
никакой автоматической проверки — только чья-то память.

**Третий случай одного класса за неделю:** блоки владельца не доходили · `enroll-registry.json`
остался незакоммиченным после трёх просьб · девять текстов отказа были **одобрены без правок**
и **не вклеены** — в базе полсуток стояла старая редакция, обещавшая кнопку, которой нет.

### Правило

1. **Read-back по одобренному читается ИЗ ЖИВОГО АРТЕФАКТА** — из базы, из задеплоенного файла,
   из `origin`. Не из рабочего дерева: оно подтверждает **намерение**, а не факт.
2. **В конце каждого отчёта — СПИСОК ОДОБРЕННОГО, НО НЕ ПРИМЕНЁННОГО.** Пустой список пишется
   строкой: его отсутствие ни о чём не говорит, а присутствие говорит.
3. У каждой строки списка — **почему** не применено. «Забыл» тоже причина, и она видна.

### ⚠ Третий этаж, найденный этим же аудитом: ПРИМЕНЕНО В БАЗЕ ≠ ДЕЙСТВУЕТ У ЛЮДЕЙ

База может уйти вперёд приложения. 28.07 все миграции применены в прод, а **33 коммита
приложения не запушены** — значит правило, живущее в RPC, **не действует**, пока развёрнутое
приложение эту RPC не вызывает. Проверено: прямой `UPDATE roster.classroom_id` под ролью
директора **проходит**.

Отсюда следствие для замков: **правило, живущее в RPC, — это правило только для тех, кто зовёт
RPC.** Настоящий пол — строка (триггер), как у гарда пробы. Тот же урок, третий раз.

## Весь пользовательский английский — АМЕРИКАНСКИЙ (Николай, 2026-07-28)

**center · enrollment · authorization · organization · license · color · behavior · enroll ·
canceled · program.**

Не стилистика: штат американский, семьи американские, а государственный бланк озаглавлен
**ENROLLMENT**. Форма, называющая себя иначе, чем документ, который она воспроизводит, —
уже расхождение.

**Правило стоячее**, потому что чинить это по одному тексту не работает: девять текстов отказа
поправили 28.07 и британские написания **вернулись в новом документе в тот же день**.

**Область:** всё, что читает человек — интерфейс, инструкции, записки директорам, тексты
отказов **в базе** (`child_field_locks.needs_document_text` и подобные). **Комментарии кода
не в счёт** — их читаем только мы.

**Замер 28.07:** пользовательских вхождений — **4** в приложении (`This centre only`,
`the whole centre in one room`, `The organisation has not loaded yet`,
`imported from the centre's books`) и **4** в текстах замка в базе. Все восемь исправлены.
Остальные 43+ вхождения — в комментариях кода, оставлены.

## Постоянная процедура живёт в ИНСТРУКЦИИ, объявление — только для разового события (Николай, 2026-07-28)

**Письмо читают один раз и теряют. Инструкцию открывают, когда случай повторится.**

Прежде чем писать директорам, спроси: **это событие или это порядок?**

| | Форма | Почему |
|---|---|---|
| **Разовое событие** — случилось, объяснили, не повторится | **объявление** (письмо) | у него нет будущих читателей |
| **Постоянная процедура** — повторится с каждым следующим случаем | **инструкция** (`docs/instructions/…`) | у неё читатели ещё не наступили |

**Ретроспектива 28.07, оба примера настоящие:**

- **27-дневный отказ вкладки Health** — правильно **письмо**: инцидент случился один раз,
  исправлен, повториться не может. Инструкция о нём была бы мусором через месяц.
- **Порядок смены центра** — правильно **инструкция**: это процедура, она повторится с каждым
  следующим ребёнком. Письмо про конкретного ребёнка прочли бы раз и забыли, а следующий случай
  начался бы с нуля.

**Следствие:** в инструкции **не называют имён** конкретных детей и семей — процедура пишется
обобщённо, иначе она читается как история одного случая, а не как порядок.

## Красный счётчик обязан быть обнуляемым (Николай, 2026-07-28)

**Каждая единица в красном бейдже обязана иметь действие, которое её снимает.** Счётчик,
который нельзя довести до нуля, учит игнорировать себя — и перестаёт работать там, где он прав.

Поле, которое **ни одна действующая форма не собирает**, — не недостача директора, а **пробел
нашего проектирования**. Его место в бэклоге, а не в бейдже.

### Три состояния поля вместо двух

| Состояние | В счёте | Действие, снимающее единицу |
|---|---|---|
| 1. собирается формой **и потребляется**, пусто | **считается** | запросить форму у семьи |
| 2. собирается и заполнено | не считается | — |
| 3. **никем не собирается** | **исключается полностью** | нет — значит и красного нет |

Состояние 3 не показывается как «требует обновления». Допустимо показать его **справочно** —
с источником и документной датой.

**Оговорка, выявленная замером 28.07:** между 1 и 3 лежит четвёртое, самое многочисленное
состояние — **форма поле собирает, но порт в карточку не построен**. Красное здесь снимается
не запросом формы (она уже подана и лежит запечатанной), а нашей стройкой. Считать его вместе
с состоянием 1 — обвинять директора в нашей недоделке. Оно идёт в счёт **только после** того,
как порт построен; до тех пор ведёт себя как состояние 3, но с другой причиной в подписи.

### Где живёт признак

**На `FieldDef` в едином реестре полей** (`src/lib/childFieldRegistry.ts`), а не россыпью по
вёрстке. Производные правила (`familyViolations`, `safepassViolations`) несут тот же признак —
они тоже дают единицы в бейдж.

### Пересчёт бейджа ничего не скрывает из данных

Поля-сироты остаются **видимыми и заполненными**. Меняется только то, что попадает в **счёт**.

### То же правило — в манифест Doc Hub

Считать только типы документов, которые **реально можно подать сегодня**. Остальные —
вне счётчика, с явной пометкой почему. Замер 28.07 по Ridge: 28 из 28 красные, подать нельзя
**ни один** (в приложении нет пути записи в `menumaker.documents`), а детских типов в
`document_types` нет вовсе. Значит сегодня честное число — не 28, а 0 при видимом списке
отслеживаемого.

## У СМЕНЫ СТАНДАРТА ЕСТЬ ДАТА ВСТУПЛЕНИЯ (Николай, 2026-07-29)

**Новый стандарт документа не действует задним числом.** Когда стандарт заменяется —
недельного листа, бланка, печатной формы, расчёта, — вместе с ним **обязательно называется
дата вступления**.

```
✅ записи, подписанные ДО даты вступления, остаются в прежнем виде
❌ перегенерация прошлых записей по новому стандарту ЗАПРЕЩЕНА
❌ стандарт без названной даты вступления НЕ ПРИМЕНЯЕТСЯ НИ К ЧЕМУ
```

**Почему.** Подписанный лист удостоверяет не только цифры, но и **правила, по которым он был
составлен**. Перерисовать его по сегодняшним правилам значит подделать то, что удостоверил
подписавший: он подписывал не этот документ. Для клеймовых записей это не косметика — это
разница между записью и её реконструкцией.

**Это тот же принцип, что уже действует для значений:** официальные величины резолвятся по
**отчётному периоду**, а не по дате расчёта (`P-дефолт: claim читает ПЕРИОД-ЭФФЕКТИВНЫЙ
income_eligibility` — `DECISIONS.md`, миграции 20260722c/d). Здесь он распространён с **значений
на ФОРМУ**: период определяет не только сколько, но и **по какому образцу**.

**Следствие, которое надо называть вслух:** расхождение живого экрана с подписанным документом
**ОЖИДАЕМО и не является багом**. Экран показывает сегодняшние правила, документ — те, что
действовали в его период. Обеспечивает это **запечатывание**: пакет накладывает оформление
**поверх целого документа** и никогда не правит сам лист.

**Кто назначает дату.** Владелец. Не автор изменения и не дата коммита: у смены стандарта есть
календарное значение для тех, кто по нему работает, и оно не совпадает с тем, когда код был
готов.

**Первое применение:** стандарт недельного листа Meal Count
(`docs/specs/2026-07-29-weekly-meal-count-sheet.md`) — принят 29.07, **дата вступления ждёт
слова владельца, до неё не применяется ни к одной неделе**.

---

## У ПЕРИОД-ЭФФЕКТИВНОСТИ ДВА РУБЕЖА: ДАТА ДОКУМЕНТА И ФАКТ ПОДАЧИ (Николай, 2026-07-30)

**ЕСЛИ КЛЕЙМ ЗА ПЕРИОД БЫЛ ПОДАН — ЛЮБЫЕ ДАТЫ ПОДПИСАНИЯ НА ЭТОТ ПЕРИОД НЕ РАСПРОСТРАНЯЮТСЯ.**
Поданный месяц не пересчитывается **ничем**.

```
рубеж 1 — ДАТА ДОКУМЕНТА: определение действует с даты подписи, не раньше
рубеж 2 — ФАКТ ПОДАЧИ:    поданный период закрыт для любых дат, даже верных
```

**Почему двух мало по отдельности.** Одна дата документа отвечает на вопрос «с какого месяца
это правда». Она **не** отвечает на вопрос «можно ли переписать месяц, о котором уже сказано
спонсору». Форма, подписанная в августе, действительно не покрывает июль — но и форма,
подписанная **в июле** и найденная в сентябре, **не пересчитывает июль, если июль уже подан**.
Второй рубеж — не про истину, а про **необратимость сказанного**.

**Тот же forward-only, что у миграций и подписанных записей:** поданный месяц исправляется
**новой записью следующего периода или отдельной корректировкой к спонсору**, а не пересчётом
задним числом.

**Состояние на 30.07.2026:** июнь **закрыт** (подан из прежней программы владельца), июль
**открыт**. Поэтому шесть обновлённых инком-форм Pearl могут повлиять на июль и **не могут** —
на июнь, независимо от того, какие даты на них напечатаны.

⚠️ **Проверяемость этого рубежа сегодня равна нулю, и это надо называть:** `monthly_claims`
пуста, факт подачи июня в системе **не записан ничем** — он живёт только в словах владельца.
Рубеж 2 существует как правило и **не существует как механизм**. Пока это так, его соблюдает
человек, а не код; первое, что делает механизм, — **записывает факт подачи**, а уже потом
отказывает.

**Следствие для расчёта:** нижняя граница по дате документа (рубеж 1) применяется **только к
незакрытым периодам**. Включить её глобально значило бы задним числом пересчитать закрытые
месяцы — то есть нарушить рубеж 2 тем самым механизмом, который вводится ради рубежа 1.

---

## МИГРАЦИЯ НЕ ОПЕРЕЖАЕТ КОД, КОТОРЫЙ УМЕЕТ ЕЁ ЧИТАТЬ (Николай, 2026-07-30)

**Миграция, меняющая МНОЖЕСТВО СТРОК, от которого зависит выборка в коде, не
применяется раньше, чем код с правилом выбора доставлен в прод.**

```
множество из одной строки → код без правила выбора РАБОТАЕТ СЛУЧАЙНО
множество из двух строк   → тот же код молча берёт произвольную
```

**Случай, породивший правило (30.07).** В `cacfp_rates` лежал один комплект ставок.
`SiteClaimReport.tsx` грузил таблицу целиком — без фильтра по `effective_date`, без
`order`, — и находил ставку через `find(slot, category)`. Это работало **не потому, что
было верно, а потому, что вариант был один**. Миграция `20260730a` добавила второй
комплект: у каждого `find` стало два кандидата без правила выбора, и живая страница
заявки начала брать ставки **произвольного года**. Между применением миграции и
доставкой кода прод считал деньги неизвестно по какому году.

**Почему это пятый случай одного класса, а не новая беда.** Ему предшествовали:
`emergency_transport_auth` (дефолт вместо ответа) · Health-вкладка (чужой ключ) ·
`meal_week_attachments` (полезная нагрузка мимо колонок) · факт подачи клейма (правило
без механизма). Общее — **система «работает» ровно до первого расширения множества**.

**Порядок, обязательный к соблюдению:**

```
1. код с правилом выбора → в прод
2. проверить на живом, что при ОДНОМ комплекте поведение не изменилось
3. только теперь миграция, расширяющая множество
4. read-back: старый период не сдвинулся ни на цент
```

**Признак, по которому это ловится ЗАРАНЕЕ** — задавать его при каждой миграции данных:
у любого чтения расширяемой таблицы спросить **«что вернёт этот запрос, когда строк
станет две?»**. Если ответ «любую» — код обязан ехать первым.

**Это частный случай «половина механизма может быть хуже его отсутствия»:** таблица
period-effective, а читатель — нет; вместе они дают не «приблизительно верно», а
**молча произвольно**.

---

## ГРАНИЦА МЕЖДУ ПОСЕЩАЕМОСТЬЮ И ПИТАНИЕМ (Николай, 2026-07-31)

**Аттенденс показывает, ЧТО ребёнок был и С КАКОГО ПО КАКОЕ время. Попало ли кормление в этот
период, сколько раз и ГДЕ ОНО ЗАПИСАНО — при подсчёте питания значения НЕ ИМЕЕТ.**

**Программа следит ТОЛЬКО ЗА ОДНИМ:** не отмечен ли один и тот же ребёнок **дважды на один приём в
один день** — в одном классе или в двух.

```
✅ программа ФЛАГУЕТ задвоение и показывает директору
❌ программа НЕ решает, где ребёнок был
❌ программа НЕ удаляет отметки
❌ анализ посещаемости — обязанность ДИРЕКТОРА, не программы
```

**Не строим никогда:** OCR сканов · сопоставление листов между собой · сверка питания с бумагой ·
автоматический разбор расхождений.

**Почему граница проведена здесь.** Задвоение — это **арифметическая невозможность**: один ребёнок
не мог получить один обед дважды. Это программа знает и обязана сказать. А вот **где** он был —
факт о мире, которого в данных нет ни в каком виде; любой ответ на него был бы догадкой,
выданной за учёт. Программа говорит только то, что следует из её собственных записей.

**Коммерческое следствие (владелец):** в коммерческом варианте программа работает **только** по
этому сценарию. Когда органы признают наш электронный учёт посещения, функция с бумажными формами
**отпадёт совсем** — то есть бумажный контур строится как **временный по замыслу**, и вкладываться
в его автоматизацию (OCR, сопоставление) значит строить то, что запланировано к сносу.

---

## ПОДАЧА МЕСЯЦА СОХРАНЯЕТ СНИМОК (Николай, 2026-07-31)

**Подача месяца сохраняет снимок: числа, ставки, категории, состав недель.**

Записано **одним требованием, а не тремя**, потому что тремя оно и выглядело — а не хватало
везде одного и того же:

| Где не хватало | Чего именно |
|---|---|
| нижняя граница период-эффективного правила | факта подачи: без него правка задним числом перепишет поданное |
| заморозка поданного месяца при **редактируемых** старых ставках | посчитанных чисел на момент подачи |
| срок хранения по 7 CFR 226.10(d) — «три года после подачи финального клейма» | самой даты подачи |

**Ключевое следствие для ставок.** Владелец требует держать **два комплекта ставок и оба всегда
редактируемыми** (отчёт за июнь подаётся в августе по старым расценкам, и только после этого
обновляют). Значит **заморозка обязана лежать на ПОСЧИТАННЫХ ЧИСЛАХ поданного месяца, а не на
ставках**. Иначе правка старой ставки задним числом перепишет уже поданное — а ставки обязаны
оставаться правимыми по замыслу.

```
❌ замораживать ставку — сломает законную правку старого комплекта
✅ замораживать СНИМОК месяца — ставка правится, поданное не двигается
```

**Порядок обязателен:** сначала запись факта подачи со снимком, **потом** всё, что от неё зависит.
До тех пор нижняя граница не включается, срок хранения не вычисляется, а «поданный месяц не
пересчитывается» соблюдает человек, а не код.

**Сегодня `monthly_claims` пуста — не подан ни один месяц через эту систему.** Значит цена
механизма минимальна ровно сейчас и растёт с первой подачей.
