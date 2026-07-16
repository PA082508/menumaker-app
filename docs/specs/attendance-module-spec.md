# ATTENDANCE ПО КЛАССАМ — спека

> **«Учитель видит свой класс, ставит отметки и фото — всё остальное камень.»**
> — формула Николая

**Статус:** решения Николая от 2026-07-16 влиты. Кода нет. Миграция — prepare + go.

## Решено (2026-07-16)

| Вопрос | Решение |
|---|---|
| Отметка = кто? | **дверь + PIN-учитель.** Дверь даёт центр, PIN даёт человека. **Механика уже написана и применена** — `safepass_confirm_handoff` (§3.1). Детали: [identity-teacher-spec.md](identity-teacher-spec.md) |
| Приём/выдача | **существующая механика SafePass, ничего нового.** in = confirm сессии `drop_off`, out = confirm `pick_up` — одна и та же RPC (§3.1) |
| Строка attendance | **производная** handoff-события, хранит `in_session_id`/`out_session_id` (§3.3). Не независимый ввод |
| Ручная отметка | фоллбэк для прихода вне SafePass, `source='manual'`, **тоже под PIN** |
| Печать | те же времена, что экран — бумага и экран из одного источника (§3.4) |
| Несколько входов за день | **ДА** — модель хранит **множественные пары** in/out. Сетка: первый in / последний out, все события — по тапу. Печать: первый in / последний out (соответствует бланку) |
| Правки | **APPEND-ONLY.** Коррекция — новой записью с причиной; старая не переписывается («signed record is never rewritten»). Экран показывает действующую |
| Человек без `staff`-строки | **отмечать не может** (PIN только у staff). Фоллбэк — директор/офис под своим PIN |
| `deny_teacher` | **принцип сохраняется**, не снимается. ALL-deny → write-deny + scoped read, и **только в момент появления реальной роли** |
| Schedule Hours | **печать не ждёт**: первая версия выходит с **пустой** колонкой Hours под ручное заполнение. Колонки расписания в roster + правка в Child Settings + разовый импорт из Google Sheets владельца + нормализация из старт-формы — отдельным треком |
| «Attendance Scan» 13.07 | **снят из зависимостей** (спека не создавалась — сессия сброшена). Переиздание после MVP Attendance |
| `PrintMealCountForm.ts` | **мёртвым кодом не пользоваться** — подтверждено |

---

## 0. Предпосылки заказа, которые не подтвердились

Проверено по живой БД и полному дереву 2026-07-16. Строить на них нельзя — поэтому
они здесь, до состава.

### 0.1. Роли `teacher` не существует

```
core.memberships.role    →  cook 3 · director 3 · office_manager 1 · admin 1
menumaker.user_roles     →  cook 4 · director 4 · accountant 3 · admin 2 · office_manager 1
```
Ни одной teacher-строки. Учительская дверь `/portal/teacher/<slug>` логинится **общим
сервис-аккаунтом роли `cook`** ([PortalPage.tsx:30](../../src/pages/portal/PortalPage.tsx#L30) — `teacher: ['cook']`), а в
провижининге Teacher прямо зарезервирован и выключен ([MealCountAccessSettings.tsx:8](../../src/components/settings/MealCountAccessSettings.tsx#L8)).

### 0.2. ⚠️ Ловушка: реальная роль `teacher` убьёт Attendance в день своего появления

На `menumaker.roster` и `menumaker.guardian` висит **RESTRICTIVE**-политика `deny_teacher`:

```sql
NOT core.has_org_role(org_id, ARRAY['teacher'])
```

RESTRICTIVE значит AND со всем остальным. Как только появится membership с
`role='teacher'`, этот пользователь теряет **весь** доступ к roster — включая чтение —
и Attendance для него умирает мгновенно. Платформа сегодня явно **запрещает** учителю
ростер. Заказ «teacher write в скоупе своего центра» этой политике прямо противоречит.

**✅ Решено:** принцип `deny_teacher` **сохраняется**. Attendance MVP живёт под `cook`
(как Meal Count). Когда появится реальная роль `teacher`, политика **уточняется той же
миграцией**: ALL-deny → **write-deny + scoped read** (чтение своего центра — техническая
необходимость экрана). Запись в `roster` учителю остаётся запрещена, кроме ровно одной
колонки `photo_url`; `guardian` — полный запрет без исключений. Граница целиком — в
[identity-teacher-spec.md](identity-teacher-spec.md) §3.

**`deny_teacher` на `attendance_records` НЕ вешать** — иначе роль убьёт модуль, ради
которого её вводят.

### 0.3. «Свой класс» не реализован, и «кто отметил» не является человеком

«Модель Meal Count teacher» — это **не** RLS-конструкция. Это center-lock **по URL**:
коммит `d6f4f58` сам себя описывает как *"UI-only"*. Класс учитель выбирает сам из
выпадашки, запомненной в localStorage ([SafePassTeacherPage.tsx:204](../../src/pages/safepass/SafePassTeacherPage.tsx#L204)).

Из этого — самое важное для Attendance:

> Логины дверей — **общие пер-центровые сервис-аккаунты с захардкоженными паролями**
> ([PortalPage.tsx:24-28](../../src/pages/portal/PortalPage.tsx#L24)). Значит `teacher_id`, который пишется в
> `safepass_sessions` ([SafePassTeacherPage.tsx:311](../../src/pages/safepass/SafePassTeacherPage.tsx#L311)), — это id сервис-аккаунта
> центра, **не человека**.

Пункт (e) заказа требует хранить «кто отметил». На уровне логина ответа нет:
«отметил Ridge cook» — это не подпись, это название двери.

**✅ Решено: `отметка = дверь + PIN-учитель`.** Дверь даёт **центр** (URL-lock,
сервис-аккаунт), PIN даёт **человека** (`staff.id`). Механика уже применена и
переиспользуется, а не изобретается: `safepass_devices.pin_hash` / `staff.pin_hash`,
`sha256(center_id || ':' || pin)`. В `attendance_records` пишутся **оба**:
`marked_by_device` и `marked_by_staff` — не «или».

Это же — первый шаг реальной роли учителя. См. [identity-teacher-spec.md](identity-teacher-spec.md).

### 0.4. Спеки 13.07 «Attendance Scan» в репозитории нет

Проверено: `docs/specs/` содержит два файла (Enrollment Approval Loop, renewal-contour);
единственное упоминание attendance в `docs/*.md` — попутная фраза в
`document-library-structure-final.md:32`; в git-истории недели 11–17.07 — Meal Count
door split и E-Forms docs. Бакета `attendance` нет, таблицы нет, UI нет.

**✅ Разрешено:** спека не создавалась — сессия была сброшена. Канал бумажных сканов
**снят из зависимостей** Attendance. Переиздание — после MVP Attendance, отдельным
заходом. Дополнять было нечего, и теперь это зафиксировано, а не висит.

### 0.5. Что реально пригодно как прототип

- **`src/utils/PrintMealCountForm.ts`** — самая близкая готовая вещь: печатная недельная
  CACFP-форма с сеткой и порядком «младшие последними» (`ORDER BY birthday ASC`).
  **Но это мёртвый код**: ноль вызовов во всём дереве, и он читает сырой `roster`,
  который [MealCountPage.tsx:9-11](../../src/pages/meal-count/MealCountPage.tsx#L9) прямо называет пустым под cook/director RLS.
  Референс дизайна — не рабочий код.
- **`SkeletonReconciliationReport.printSheet`** ([:88-113](../../src/pages/reports/SkeletonReconciliationReport.tsx#L88)) — рабочий
  паттерн «paper on demand»: `window.open` → `document.write` → `print()`, с
  обязательным `esc()`-экранированием и пустой колонкой под роспись.
- **`safepass_sessions`** — реальный стор событий: `action_type` (`drop_off|pick_up|transfer`),
  `status` (`waiting→confirmed`), и **`teacher_confirmed_at` = авторитетное время**.
  Присутствие выводится «последнее confirmed побеждает» ([CenterRosterPage.tsx:284-313](../../src/pages/children/CenterRosterPage.tsx#L284)).
  `safepass_classroom_log` **не существует** — под него не строить.

---

## 1. Канон шаблона

Канон = форма владельца **«Weekly Attendance Report»** (проверена органами без
замечаний). **DCY 01208 — референс соответствия, не шаблон.**

**Шапка:** `Weekly Attendance Report` · месяц/год · `Teacher(s):` · имя комнаты.
**Сетка:** `#` · `Child's Name` · `DOB` · Mon–Fri × (`in` | `out`) с числами дат · `Schedule Hours`.

Дни недели — стандартно **Mon Tue Wed Thu Fri**. В образце опечатки (`Wen`, `The`) —
**структуру сохраняем, орфографию правим**.

---

## 2. Печать = точная реплика для ручного заполнения

Паттерн 2-reports, «paper on demand». Предзаполнены `#` / имена / `DOB` /
`Schedule Hours`; **`in`/`out` пустые**.

Строить по `SkeletonReconciliationReport.printSheet`, а не по `PrintMealCountForm.ts`
(мёртвый + читает сырой roster). Обязательны: `esc()` на всех строках из БД и строка
происхождения (центр · дата генерации · число строк).

### 2.1. Schedule Hours — печать НЕ ждёт

Факт остаётся: в `menumaker.roster` из релевантных колонок есть **только `birthday`** —
ни часов, ни расписания, ни дней. Источника нет.

**✅ Решено: это больше не блокер.** Первая версия бланка выходит с **пустой колонкой
Hours** под ручное заполнение — кабинет получает бумагу на этой неделе. Заполнение
колонки данными — отдельный трек, четыре шага:

1. **Колонки расписания в `roster`** (миграция, prepare + go).
2. **Редактирование в Child Settings** — по эталону Staff (`.select()` + красный баннер на 0 строк).
3. **Разовый импорт из Google Sheets владельца** — файл пришлёт Николай. Разовый, не синхронизация.
4. **Нормализация из старт-формы** для новых детей — когда форма флипнется ([[menumaker-start-form]]); её данные сейчас живут в `form_data` сабмита.

Порядок важен: печать с пустой колонкой не создаёт долга — она честно повторяет
образец, который и заполнялся рукой. Данные приходят позже и просто перестают требовать руки.

---

## 3. Экран iPad (App учителя)

Та же сетка + **колонка с аватаркой между `#` и `Child's Name`**.

- **тап по аватарке** → камера-шит Части 1 (внести/поменять фото ребёнка), `facing="environment"`;
- **аватар учителя в шапке** рядом с именем в `Teacher(s):` → тот же шит, `facing="user"`, единый `staff.photo_url`;
- **тап по ячейке `in`/`out`** → время;
- **приём/выдача — существующая механика SafePass** (§3.1), ничего нового не изобретаем;
- **ручная отметка — фоллбэк** для прихода вне SafePass (§3.3).

**Печатная шапка остаётся текстовой** (реплика образца) — аватар только на экране.

---

### 3.1. Приём = существующая механика SafePass (изучено, не пересказано)

**Хорошая новость: то, что заказано, уже написано и применено.**
`menumaker.safepass_confirm_handoff(p_token, p_session_id, p_pin_hash, p_occurred_at)` —
SECURITY DEFINER RPC (`20260706_safepass_device_kiosk.sql`) — делает ровно модель
«дверь + PIN-учитель», и делает её лучше, чем предполагала §0.3:

```
1. p_token          → safepass_devices (token_hash = sha256(token), is_active, not revoked)
                      → даёт center_id + classroom_id            ← ДВЕРЬ
2. p_pin_hash       → staff where center_id = device.center_id and is_active
                      → даёт v_staff.id                          ← ЧЕЛОВЕК
                      → не найден → raise 'invalid PIN'
3. p_session_id     → сессия обязана быть в classroom этого устройства
                      → иначе raise 'session not in this room'   ← КОМНАТА
4. update safepass_sessions set
     status='confirmed',
     teacher_confirmed_at = p_occurred_at,                       ← ВРЕМЯ
     teacher_id   = v_staff.id::text,                            ← РЕАЛЬНЫЙ staff.id
     teacher_name = <имя>,
     offline_created   = coalesce(offline_created, p_occurred_at < now()-'5s'),
     offline_synced_at = <now() если офлайн>                     ← ОФЛАЙН
5. идемпотентность: уже confirmed → {ok:true, already:true}, без перезаписи времени
```

Итого RPC уже несёт **все** реквизиты provenance, которые нужны attendance: время,
устройство, комнату, человека по PIN и признак офлайн-ввода. **`teacher_id` здесь —
настоящий `staff.id`, а не сервис-аккаунт.**

**«Парной выдачи» как отдельной функции нет — и не нужно.** `safepass_confirm_handoff`
не смотрит на `action_type`: она подтверждает любую сессию. Значит:

| attendance | = подтверждение сессии с |
|---|---|
| **in** | `action_type = 'drop_off'` → её `teacher_confirmed_at` |
| **out** | `action_type = 'pick_up'` → её `teacher_confirmed_at` |

Одна функция, два смысла, разделённые типом события. Это и есть «парная выдача».

### 3.2. ⚠️ Два факта, которые решают судьбу производной модели

**(1) Живой путь приёма — НЕ этот RPC.** Сегодня учитель принимает через
[SafePassTeacherPage.tsx:309-312](../../src/pages/safepass/SafePassTeacherPage.tsx#L309) — прямой
`.update()` на `safepass_sessions`, **без PIN**, и пишет `teacher_id = user?.id`, то есть
**id сервис-аккаунта двери**. Маршрута `/safepass/kiosk` в `App.tsx` нет — kiosk-путь
построен и применён в БД, но не подключён.

> Следствие: колонка `teacher_id text` может содержать **два разных пространства id** —
> `staff.id` (из RPC) и `auth.users.id` (из живой страницы). Для регулируемой записи это
> яд: «кто принял» перестаёт быть отвечаемым вопросом задним числом. **Attendance обязан
> ходить только через RPC-путь**, а живой прямой `.update()` — закрыть, иначе provenance
> отравлен с первой строки.

**(2) SafePass сегодня пуст.** Замер 2026-07-16:

```
safepass_devices  зарегистрировано: 0
staff с pin_hash:                   0
safepass_sessions строк:            0
```

Механика есть, данных нет. Производная модель (§3.3) архитектурно верна, но **на сегодня
100% отметок были бы `source=manual`** — производить не из чего. Пилот Wickliffe по
родительскому письму объявлен обязательным с 15.07, а сессий ноль. **Вопрос Николаю
(§5.4):** пилот не стартовал, или стартовал мимо системы?

### 3.3. `attendance_records` — производная, не независимый ввод

Строка attendance **не является самостоятельным вводом**. Она — производная
handoff-события и хранит ссылку на него:

```sql
  in_session_id   uuid references menumaker.safepass_sessions(id),  -- provenance для in
  out_session_id  uuid references menumaker.safepass_sessions(id),  -- provenance для out
```

Через `session_id` восстанавливается всё: кто принял (`teacher_id`), когда
(`teacher_confirmed_at`), какое устройство (через `safepass_devices` по комнате),
офлайн или нет (`offline_created`). **Дублировать эти поля в attendance не нужно и
вредно** — два источника одной правды разойдутся.

**Ручная отметка (тап по ячейке)** — фоллбэк для прихода вне SafePass:
`source='manual'`, `in_session_id`/`out_session_id` = NULL, **и тоже под PIN** —
подпись обязательна одинаково для обоих путей.

⚠️ **Типовая мина:** `safepass_sessions.child_id` — **`text`**, а `roster.id` — `uuid`.
Связка attendance↔session требует явного каста, и «text-id, который иногда не uuid» —
классический источник тихого промаха матчинга. Зафиксировать при миграции.

### 3.4. Печать и экран — из одного источника

Бланк печатает **те же времена**, что показывает экран: `teacher_confirmed_at`
подтверждённых сессий через `attendance_records`. Бумага не пересчитывает — она читает.
Отсюда же следует, что печать «за прошлую неделю» всегда воспроизводима: времена лежат
в записи, а не выводятся из состояния на момент печати.

**Доступ** = модель Meal Count teacher: center-lock по URL + выбор класса.
С поправкой §0.2–0.3 — это `cook`, и «свой класс» сегодня = самовыбор, а не право.

---

## 4. Данные

### 4.1. Единое фото (требование, не побочное свойство)

Аватарка в Attendance пишет в **единый `roster.photo_url`** — тот же, что Children,
ростер, SafePass. **Копий фото не существует по построению**: путь детерминирован
(`child/<roster_id>/avatar.webp`, [avatars.ts:56](../../src/lib/avatars.ts#L56)), запись — `upsert:true`. Новое фото
физически перезаписывает старое. Это уже так — Attendance ничего не добавляет, а
только переиспользует.

⚠️ Запись фото учителем упрётся в Storage-RLS, пока не применена
`20260716b_avatars_teacher_center_write.sql` (prepare, ждёт go). Без неё камера честно
покажет красный баннер «Photo not saved».

### 4.2. `attendance_records` — предлагаемая форма

```sql
create table menumaker.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  center_id    uuid not null,
  classroom_id uuid not null,
  child_id     uuid not null,              -- → menumaker.roster(id)
  on_date      date not null,
  time_in      timestamptz,
  time_out     timestamptz,
  -- ── Решения 2026-07-16 переписали форму таблицы ──
  -- (1) множественные пары in/out за день → НЕТ unique(child_id, on_date);
  -- (2) append-only → строка НИКОГДА не UPDATE-ится; коррекция = новая строка.
  kind         text not null,              -- check (kind in ('in','out'))
  occurred_at  timestamptz not null,       -- время события (из handoff или ручное)
  source       text not null,              -- check (source in ('safepass','manual'))
  -- PROVENANCE: строка — ПРОИЗВОДНАЯ handoff-события, не независимый ввод (§3.3).
  session_id   uuid references menumaker.safepass_sessions(id),  -- NULL при source='manual'
  -- PIN-подпись. Обязательна ОДИНАКОВО для обоих source (решение: без PIN не отмечаем).
  marked_by_staff uuid not null,           -- staff.id, разрешённый PIN-ом → ЧЕЛОВЕК
  marked_at    timestamptz not null default now(),
  -- APPEND-ONLY коррекция: не переписываем — надстраиваем.
  supersedes_id uuid references menumaker.attendance_records(id),
  void_reason   text,                      -- обязателен, когда supersedes_id is not null
  check (supersedes_id is null or void_reason is not null)
);
-- Действующая запись = та, которую никто не отменил.
create view menumaker.v_attendance_current as
  select a.* from menumaker.attendance_records a
   where not exists (select 1 from menumaker.attendance_records b
                      where b.supersedes_id = a.id);
```

**Форма изменилась под три решения, и каждое видно в схеме:**

- **Множественные пары** → строка теперь = **одно событие** (`kind` + `occurred_at`), а не
  день. Пары `in`/`out` собираются на чтении, а не хранятся склеенными. `unique(child_id,
  on_date)` **убран**: он прямо запрещал бы то, что решено разрешить.
- **Append-only** → **UPDATE запрещён на уровне прав**, не только на уровне уважения:
  `grant select, insert on attendance_records` — **без `update`, без `delete`**. Коррекция —
  новая строка с `supersedes_id` + `void_reason`. Экран и печать читают
  `v_attendance_current`. Это тот же принцип, что «a signed record is never rewritten»
  (`platform-standards.md`) и `determination_log`.
- **Без PIN не отмечаем** → `marked_by_staff` **`not null`**. Фоллбэк для человека без
  `staff`-строки — директор/офис под своим PIN, то есть подпись всё равно есть.

Полей «кто принял / когда / устройство» здесь **намеренно нет** — они лежат в
handoff-событии; дублировать значит завести второй источник той же правды.

> ⚠️ **Сетка и печать расходятся с моделью намеренно, и это надо помнить при чтении.**
> Хранится всё; **сетка** показывает первый `in` / последний `out` (все события — по тапу);
> **печать** — первый `in` / последний `out`, потому что так устроен бланк владельца.
> То есть бумага **сжимает** день до одной пары. Это осознанная потеря на бумаге, а не в
> записи: полный след остаётся в БД и восстановим. Если ребёнка уводили и приводили,
> бланк этого не покажет — **и инспектору это надо уметь объяснить по экрану.**

Открыто: `unique (child_id, on_date)` предполагает **один вход-выход в день**. Образец
владельца тоже даёт одну пару `in|out` на день. Но `safepass_sessions` допускает
несколько `drop_off`/`pick_up` (и `transfer`). Если ребёнка забрали и привели снова —
что печатаем? §5.

**Правки — append-only или UPDATE?** Посещаемость — регулируемая запись. Правка
учителем поверх SafePass-времени должна оставлять след (кто, когда, что было).
Прецедент в платформе есть — `determination_log` ([enrollmentApprove.ts:257](../../src/lib/enrollmentApprove.ts#L257)). §5.

RLS: `org_isolation` + `module_*` по образцу roster. **`deny_teacher` сюда НЕ вешать** —
иначе §0.2 повторится на новой таблице.

### 4.3. TAP не имитируем

**Явно и в спеке, и в UI.** TAP — государственная система и **параллельная
обязанность** для PFCC-детей. Наш Attendance её не заменяет, не экспортирует в неё и
не притворяется ею. На экране Attendance — строка о том, что для PFCC-детей отметка в
TAP остаётся обязательной. Никакой автоматики в сторону TAP.

### 4.4. Связь вперёд

Billing / PFCC-часы считаются из `attendance_records`. Не в первой волне — но схема
(`time_in`/`time_out` как `timestamptz`, а не текст) выбрана так, чтобы часы считались
без обратной миграции.

### 4.5. Бумажные сканы

Заказ: спека 13.07 «Attendance Scan» (`attendance/{center}/{week}`) остаётся каналом
бумажных сканов, дополняется. **См. §0.4 — этого канала в коде нет.** Если решение в
силе, его надо построить, а не «дополнить». Прототип — бакет `enrollment-scans`
(`20260704_enrollment_scans_bucket.sql`).

---

## 5. Оценка

| Блок | Объём | Риск | Блокеры |
|---|---|---|---|
| **Печатная форма (реплика, Hours пустая)** | M | низкий | **нет — идёт первой** |
| `attendance_records` + RLS | S | средний | prepare+go; семантика правок |
| PIN-подписант | **S** | низкий | ✅ RPC уже применена — нужен UI + `staff.pin_hash` (сейчас 0) |
| Подключить kiosk-путь / закрыть прямой `.update()` | M | **высокий** | §3.2(1) — иначе provenance отравлен |
| Экран iPad: сетка + in/out | **L** | средний | — |
| Производная из handoff | S | средний | §3.2(2) — **сегодня производить не из чего** |
| Колонка аватарок + шапка учителя | S | низкий | ✅ снят — `20260716b` применена |
| Колонки расписания + импорт Hours | M | низкий | файл Google Sheets от Николая |
| ~~Канал бумажных сканов~~ | — | — | ✅ снят из зависимостей |

**Критический путь:** `attendance_records` + PIN → экран → префилл.
**Печать независима и идёт первой** — Schedule Hours больше её не держит.

**Нарезка:**
- **Волна 1:** печатная форма (реплика, Hours пустая). **Бумага кабинету на этой неделе.**
- **Волна 2:** `attendance_records` + PIN-подписант + экран iPad (сетка in/out, ручная отметка, аватарки).
- **Волна 3:** префилл из SafePass.
- **Волна 4:** колонки расписания + импорт Hours; затем Billing/PFCC-часы.

## Вопросы Николаю

§5 закрыт целиком — решения ушли в шапку и в схему §4.2. Осталось одно, и оно
пришло из пилота:

1. **`transfer`.** Решения покрыли `drop_off`→in и `pick_up`→out, но `safepass_sessions.action_type` имеет **три** значения. Перевод ребёнка в другую комнату — это `out` из старой + `in` в новую, одно событие смены `classroom_id`, или для attendance он невидим? Спрашиваю сейчас, потому что `kind text check (kind in ('in','out'))` — это CHECK, и третий смысл потом добавляется миграцией, а не кодом.

**Судьба Волны 3 — в [safepass-pilot-inventory.md](safepass-pilot-inventory.md).** Производить из handoff сегодня не из чего
(0 устройств / 0 PIN / 0 сессий), и путь родителя не замыкается на комнату. Пилот
20.07 — это и есть ответ на вопрос «будет ли вход у производной модели».
