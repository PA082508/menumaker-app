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
& Ratio rework). For a center, count active roster children **under 2½ years**
(boundary = 30 months by `birthday` on a given date) vs the **total** headcount,
and compare to `centers.license_under2_5_max` / `license_total_max`. Surface an
indicator (headroom / at-cap / over). Unused headroom = licence reserve =
potential revenue → feeds the economics engine.

Also: **license-field overlap to reconcile.** `centers` now has FOUR license-ish
ints: legacy `license_capacity` (total) + `license_capacity_under2` (under-2,
edited in Center Info) AND new `license_under2_5_max` / `license_total_max` (DCY
under-2½ / total, edited in Capacity & Ratio). `license_total_max` vs legacy
`license_capacity` are the same concept; `under-2` vs `under-2½` differ slightly.
Decide the single source of truth and retire/migrate the rest.
Per-room `capacity_ohio` is kept in the DB but hidden in the UI (per-room numbers
are inspection facts on a date, not limits).

## ~~403 `rest/v1/internal_messages` on the cook door~~ → SPEC'D (2026-07-16)

**Superseded — and my diagnosis below was wrong.** Nikolay's decision: a deliberate
grant. Spec + prepared SQL: `docs/specs/cook-messages-spec.md`,
`20260717c_internal_messages_rls.sql`. The measurement that corrected me:
`internal_messages` has RLS on, **0 policies and no authenticated grants at all** — so
the 403 hits *everyone*, including the director on /messages, not just the cook.
Messaging has never worked in the platform. Original (wrong) note kept below.

## 403 `rest/v1/internal_messages` on the cook door (2026-07-16, do NOT fix now)

Seen in the console on `/portal/cook/<slug>` during the Meal Count outage read-back.
**Unrelated to that outage** and pre-existing: the cook service account has no access to
`menumaker.internal_messages`, so the messages panel 403s on every kitchen load. Nothing
visible breaks — but it means "console clean" is not literally true on that door, which
costs a real signal the next time something IS wrong there.

Two ways out, decision deferred:
- **hide the messages panel on the cook door** — it is a director/office surface anyway; or
- **a deliberate grant** — if a cook is genuinely meant to receive internal messages.

Do not "fix" by broadening the grant reflexively: that is a read-access decision about
who sees internal messages, not a console-noise cleanup.

---

## [MED] Дедуп-очередь: две пустые staff-псевдогруппы Ridge

**НЕ трогать до пилота** (решение Николая 18.07) — Ridge держит две
не-ростерные группы сразу, обе пустые:

| центр | комната | заведена | живых строк |
|---|---|---|---|
| Ridge | `Staff Room` | 2026-06-21 | 0 |
| Ridge | `Staff`      | 2026-06-26 | 0 |

Всего дверей (`classrooms.is_roster = false`) — **4**, не 3: сверх этих двух
Highland `Staff Room` (17 строк) и Pearl `Staff` (15). Число всплыло при
VERIFY-прогоне маркеров 18.07: read-back миграции `20260718` писал «двери
помечены: 3», и расхождение — не регрессия, а вторая пустая группа Ridge,
заведённая пятью днями позже первой.

Обе пустые, поэтому ничего не ломают и ничего не искажают в клейме. Разбирать
вместе с остальной дедуп-очередью, после 27.07.

---

## [MED] SafePass: поверхности Driver и Director

Карточки `safepass-driver` и `safepass-director` в Doc Hub обещали bus-run
checklist и Director Dashboard, а открывали `/safepass/teacher` — тот же роут,
что и карточка учителя. Описания исправлены на честные 18.07 («открывает
Teacher View (временно); поверхность в разработке»), **сами поверхности не
построены**.

Строить после пилота 27.07. До тех пор описания обязаны оставаться честными —
см. стандарт «описание карточки проверяется против того, что реально
открывается».

## [MED] Early / Late Care: клауза OAC в расчёте ratio

`is_early_care` / `is_late_care` сегодня инертны — их не читает ни одна функция,
вьюха или страница, кроме SettingsPage (замерено 18.07). Подсказка на странице
переформулирована честно 18.07; **правило смешанных возрастов первого и
последнего часа не реализовано**.

Заказ после пилота: клауза OAC → пересчёт ratio для Early/Late часов. Тогда же
ручной переключатель «Gathering room» на странице учителя (введён 18.07) станет
тем, что этот режим автоматизирует — сейчас он его ручной предвестник.
## Named features из Concept v1.1 / Parent Letter — после пилота

Источник: Concept v1.1 и Parent Letter v1 (разбор 18.07). Все — **обещаны в
документах, но не построены**; каждое измерено против кода, а не предположено.

- **[HIGH] Late Care: эскалация 15/30/45/60 + запрет закрытия смены.** Пороги
  рисуются, но `onEscalate` — всплывающая подсказка: ни звонка, ни уведомления,
  ни записи. `🔒 Cannot close shift` — текстовый бейдж, ничего не блокирует.
- **[HIGH] Наполнение панелей Early/Late Care.** `dutyChildren` объявлен и
  никогда не наполняется — обе панели всегда пусты. Экран без источника данных.
  Это предусловие пункта выше.
- **[MED] Транспорт: GPS-чеклист.** Слово GPS живёт только в поясняющем тексте;
  геолокации в коде нет. `safepass_transport_runs` пишет статус — и всё.
- **[MED] Field-trip BYOD** — не найдено в коде вовсе.
- **[MED] Родительский доступ к журналу «в любой момент».** Чтение есть;
  append-only и именных отказов, которых требует legal-evidence стандарт, нет.
- **[MED] Staff BYOD как система** — реестр устройств (make/model/phone из
  соглашения), стипендия $20/мес → стык Payroll, **офбординг ≤24 ч при
  увольнении**, увязка со Staff-модулем. См. readiness §«Осей на самом деле три».

**Кандидат сверки после пилота:** Enrollment Agreement и Employee Handbook —
носители формулировки про physical handoff. Проверить, что три документа
(Concept, Parent Letter, эти два) описывают момент передачи одинаково; сегодня
это не проверялось.

---

## [MED] Лицензионные факты живут в ТРЁХ местах — свести

Сверка с бумагой Pearl (18.07) вскрыла не пробел, а размножение. Один и тот же
факт хранится трижды:

| # | где | кто пишет | состояние |
|---|---|---|---|
| 1 | **`menumaker.center_licenses`** | License-трекер | **канон** — полный, актуальный |
| 2 | `centers.license_capacity` / `_under2` | Center Info (`CenterInfoSettings.tsx`) | дубль |
| 3 | `centers.license_total_max` / `_under2_5_max` | Capacity & Ratio (`SettingsPage.tsx`) | дубль, заполнен 18.07 из #2 |

**License-трекер хранит всё, что спрашивалось** — проверено по Pearl:

| поле | бумага | `center_licenses` |
|---|---|---|
| номер | 000000300629 | ✅ |
| выдана | 10/06/2014 | ✅ `issued_date` |
| ёмкость / под 2½ | 158 / 36 | ✅ `capacity` / `capacity_under2` |
| Administrator | Cynthia Patsko + Tatiana Kogan | ✅ `administrator` — **хранится** |
| Continuous | — | ✅ выражено как `expires_date IS NULL` |
| орган | ODCY | ✅ `issuing_authority` |

**Единственный настоящий пробел:** редакция бланка — «JFS 01256 (rev. 12/2016)».
Колонки нет, а именно редакция устаревает при смене бланка ODJFS.

**⚠️ ОТМЕНА МОЕЙ ВЧЕРАШНЕЙ ТРЕВОГИ про FSO.** Я написал, что FSO-лицензия Pearl
просрочена: `centers.fso_license_expires = 2026-03-01`. **Это неверно.** В
трекере лежит действующая FSO: `MJAE-9N5L63`, выдана 2026-02-09, истекает
**2027-03-01**, `is_current = true`; строка с 2025-03-01 помечена
`is_current = false` как прошлая. Просрочки нет — устарела **колонка в
`centers`**, то есть дубль №2. Я поднял тревогу по дублю, не заглянув в канон;
это ровно тот вред, ради которого дубли и сводят.

**⚠️ И трекер неполон:** строка `child_care` есть **только у Pearl**. У Ridge и
Highland лицензии на уход за детьми в трекере нет вовсе — их 215/57 и 106/42
живут только в `centers`. Поэтому «перевести всех на трекер» сегодня нельзя:
сначала завести две недостающие строки с бумаги.

**План:** (1) Ridge + Highland в `center_licenses` с бумаги → (2) обе UI-формы
перевести на трекер → (3) снести оба дубля в `centers`. Пункт (3) трогает
`compute_monthly_claim` — см. предупреждение в 20260719c §2.
