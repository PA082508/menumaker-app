# ATTENDANCE ПО КЛАССАМ — спека

**Статус:** на утверждение Николаю. Кода нет. Дата: 2026-07-16.
**Выход:** спека + оценка. Код — по утверждению. Миграция — prepare + go.

---

## 0. Четыре предпосылки заказа, которые не подтвердились

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

**Решение нужно до кода:** либо Attendance живёт под `cook` (как Meal Count сейчас),
либо `deny_teacher` сужается/уходит той же миграцией, что вводит роль.

### 0.3. «Свой класс» не реализован, и «кто отметил» не является человеком

«Модель Meal Count teacher» — это **не** RLS-конструкция. Это center-lock **по URL**:
коммит `d6f4f58` сам себя описывает как *"UI-only"*. Класс учитель выбирает сам из
выпадашки, запомненной в localStorage ([SafePassTeacherPage.tsx:204](../../src/pages/safepass/SafePassTeacherPage.tsx#L204)).

Из этого — самое важное для Attendance:

> Логины дверей — **общие пер-центровые сервис-аккаунты с захардкоженными паролями**
> ([PortalPage.tsx:24-28](../../src/pages/portal/PortalPage.tsx#L24)). Значит `teacher_id`, который пишется в
> `safepass_sessions` ([SafePassTeacherPage.tsx:311](../../src/pages/safepass/SafePassTeacherPage.tsx#L311)), — это id сервис-аккаунта
> центра, **не человека**.

Пункт (e) заказа требует хранить «кто отметил». **Сегодня этот вопрос не имеет ответа
на уровне логина.** Посещаемость — регулируемая запись; «отметил Ridge cook» — это не
подпись, это название двери. Варианты в §5.

### 0.4. Спеки 13.07 «Attendance Scan» в репозитории нет

Проверено: `docs/specs/` содержит два файла (Enrollment Approval Loop, renewal-contour);
единственное упоминание attendance в `docs/*.md` — попутная фраза в
`document-library-structure-final.md:32`; в git-истории недели 11–17.07 — Meal Count
door split и E-Forms docs. Бакета `attendance` нет, таблицы нет, UI нет.

Заказ говорит «дополняется, не заменяется» — **дополнять нечего**: канал бумажных
сканов не существует в коде. Либо спека вне VCS (тогда нужен файл), либо ссылка
ошибочна. **Вопрос Николаю (§5).**

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

> ⚠️ **`Schedule Hours` брать неоткуда.** В `menumaker.roster` из релевантных колонок
> есть **только `birthday`** — ни часов, ни расписания, ни дней. Заказ говорит
> «расписание из старт-формы/ростера»: в ростере его нет, а старт-форма ещё не
> флипнута ([[menumaker-start-form]]) и её данные живут в `form_data` сабмита.
> **Это блокер печати** — колонка либо печатается пустой, либо нужен источник. §5.

---

## 3. Экран iPad (App учителя)

Та же сетка + **колонка с аватаркой между `#` и `Child's Name`**.

- **тап по аватарке** → камера-шит Части 1 (внести/поменять фото ребёнка), `facing="environment"`;
- **аватар учителя в шапке** рядом с именем в `Teacher(s):` → тот же шит, `facing="user"`, единый `staff.photo_url`;
- **тап по ячейке `in`/`out`** → время;
- **SafePass префиллит** из `safepass_sessions.teacher_confirmed_at` (`drop_off`→in, `pick_up`→out, последнее confirmed побеждает), **учитель подтверждает/правит**;
- **ручная отметка — фоллбэк**.

**Печатная шапка остаётся текстовой** (реплика образца) — аватар только на экране.

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
  source       text not null,              -- check (source in ('safepass','manual'))
  marked_by    uuid,                       -- см. §0.3 — сегодня это НЕ человек
  marked_at    timestamptz not null default now(),
  unique (child_id, on_date)               -- одна строка на ребёнка в день
);
```

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
| Печатная форма (реплика образца) | M | низкий | **источник Schedule Hours** |
| `attendance_records` + RLS | S | средний | prepare+go; семантика правок |
| Экран iPad: сетка + in/out | **L** | средний | — |
| Префилл из SafePass | M | средний | семантика нескольких входов/выходов |
| Колонка аватарок + шапка учителя | S | низкий | Storage-миграция 20260716b (go) |
| «Кто отметил» → реальный человек | **L** | **высокий** | §0.3 — нет персональных логинов |
| Канал бумажных сканов | M | низкий | спеки 13.07 нет |

**Критический путь:** `attendance_records` → экран → префилл. Печать независима и может
идти первой, **если решён Schedule Hours** — она же даёт кабинету бумагу уже на этой неделе.

**Нарезка:**
- **Волна 1:** печатная форма (реплика) + `attendance_records`. Даёт бумагу и стор.
- **Волна 2:** экран iPad с сеткой in/out + ручная отметка + аватарки.
- **Волна 3:** префилл из SafePass; затем Billing/PFCC-часы.

## Вопросы Николаю

1. **Schedule Hours — откуда?** Пустая колонка в печати на первой волне, или нужен источник (новая колонка в roster / из старт-формы)? **Блокер печати.**
2. **`deny_teacher`** (§0.2): Attendance живёт под `cook` (как Meal Count), или вводим роль `teacher` и сужаем политику той же миграцией?
3. **«Кто отметил»** (§0.3): при общих сервис-аккаунтах это дверь, а не человек. Варианты: (а) принять как есть и писать центр; (б) PIN учителя — механика уже есть в `safepass_devices` (`pin_hash`, [[safepass-device-kiosk]]); (в) персональные логины (дорого). Для регулируемой записи рекомендую (б).
4. **Спека 13.07 «Attendance Scan»** — где она? В репозитории её нет (§0.4).
5. **Несколько входов/выходов за день** — печатаем первый in и последний out, или несколько строк?
6. **Правки** — append-only лог или UPDATE поверх?
