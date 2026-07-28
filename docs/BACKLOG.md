# MenuMaker — Backlog

Tracked, not-yet-started work. Owner: Nikolay. Newest context at top of each item.

> **Enrollment source of truth:** [`docs/specs/Enrollment_Approval_Loop_Spec.md`](specs/Enrollment_Approval_Loop_Spec.md)
> (v2, approved 2026-07-03 — includes the SafePass-channel decision). Imported into the
> repo 2026-07-04 so the spec is version-controlled here, not only in `~/Downloads`.

## MAINTAINER — два ежедневных health-чека, заказаны 2026-07-28

Заказ владельца: **«встроено в префлайт» = напоминание, а не гард.** Скрипт репетиции печатает
две строки про `is_meal_site`, но забыть по-прежнему можно — именно так флаг и простоял поднятым
три дня (25→28.07). Проверка отдаётся [[menumaker-maintainer-agent]], у которого есть доступ.

**Чек 1 — демо-центр не должен быть meal site.** Ежедневно:

```sql
select name, is_demo, is_meal_site from menumaker.centers where is_demo;
```

`is_demo = true AND is_meal_site = true` **держится дольше суток** → поднять в отчёт красным.
Это не запрет: на время съёмки так и должно быть. Это таймер, которого сейчас нет.

**Чек 2 — незакоммиченный файл, меняющий боевой реестр**, поднимается **отдельной строкой**,
а не в общей гигиене рабочих деревьев. Основание: `public/enroll-registry.json` пролежал
незакоммиченным несколько дней, флипая `start_form` на несуществующую на Pages редакцию;
случайный `git add -A` в чужой задаче унёс бы его в релиз и уронил пакет №1 в 404.
Файлы этого класса: `public/enroll-registry.json`, `public/forms/**`, `docs/prepare/**`.

## 🔴 [ВЫСОКИЙ] Три детские формы видны шире, чем должны — RLS-замер 2026-07-28

Найдено при проверке гарда пробы; **вопрос разграничения, не гарда**, и он серьёзнее того,
ради чего нашёлся. Формы **детские** и **медицинские** (особая диета, замена молока, питание
младенцев). Заказан замер фактического доступа — вот он.

**Ни одна из трёх таблиц не имеет `center_id`.** Есть только `org_id` и имя ребёнка текстом
(`child_name` / `infant_name`). Связи с ростером нет — ни `child_id`, ни `roster_id`.

**Экран существует:** [`FormSubmissionsPage.tsx`](../src/pages/form-submissions/FormSubmissionsPage.tsx)
(маршрут `submissions`) читает все три таблицы и **не ставит ни одного `.eq()`** по орг-е или
центру — полагается целиком на RLS.

**Фактический доступ (по `pg_policy.polpermissive`, а не по виду списка политик):**

| Таблица | Политики | Что видит залогиненный пользователь |
|---|---|---|
| `special_diet_forms` | `auth_manage` **permissive** `USING(true)` + `org_isolation` **restrictive** + `module_cacfp_active` **restrictive** | **все строки своей организации** — директор Ridge видит детей Pearl и Highland |
| `infant_meal_preferences` | то же | **все строки своей организации** |
| `milk_substitutions` | **только** `auth_manage` **permissive** `USING(true)` — restrictive-политик НЕТ | **все строки таблицы, БЕЗ ограничения по организации** |

Ответ на заданный вопрос прямо: **ни джойна по ребёнку, ни разграничения по центру нет вовсе.**
Два первых — org-wide; третья — шире организации.

⚠️ Важная деталь метода: список политик выглядит одинаково, пока не посмотреть флаг
`polpermissive`. Permissive-политики объединяются по ИЛИ, restrictive — по И. `auth_manage`
permissive `true` пропускает всех, и удерживают только restrictive-политики; у
`milk_substitutions` их нет ни одной. Смотреть `pg_policies` без этого флага — значит
прочитать защиту, которой нет.

**Не тронуто.** Правка RLS на боевой базе — по слову, и до неё нужно решение: чинить
разграничением по центру (нужен `center_id` в трёх таблицах + связь с ростером) или сузить до
организации и признать центро-разграничение отдельной работой. Смежно закрывает и развилку
по гарду пробы ниже.

## ⚠ Публичные формы принимают помеченную пробу — три таблицы без центра (замер 2026-07-28)

Гард пробы (`trg_enr_sub_probe_center`, 20260728d) закрывает `enrollment_submissions` на уровне
строки: помеченная строка не входит ни через `submit_enrollment_form`, ни прямой вставкой —
проверено негативными тестами по обеим дверям.

**Но `submit_public_form` пишет НЕ в неё.** Замер: она вставляет в `special_diet_forms`,
`milk_substitutions`, `infant_meal_preferences` — три отдельные таблицы. Проверено вызовом в
откатываемом блоке: payload с `smoke_tag: 'ZZSMOKE'`, нацеленный на слаг Ridge, **был принят**
(строка создана и откачена).

Почему гард туда не переносится механически: **в этих таблицах нет `center_id` вовсе** — они
org-scoped (`v_org` из слага центра, дальше центр не сохраняется). Проверять «демо ли центр»
не по чему. При этом строки несут `sealed_at` + `content_hash`, то есть тем же порядком
неудаляемы.

Развилка на решение: (а) хранить `center_id` в этих трёх таблицах и повесить тот же
row-level гард; (б) гард по слагу внутри `submit_public_form` (слабее — это снова один вызывающий);
(в) признать, что репетиция эти формы не трогает, и закрыть только когда тронет. **Сегодня
репетиция шлёт только `dcy_01234`, то есть путь не используется — риск потенциальный, не живой.**

## Аллергии и лекарства не собирает НИ ОДНА форма — первый кандидат на следующую форму (2026-07-28)

**Приоритет: первый в очереди на постройку формы.** Кандидаты — `dcy_01236` (Care Plan) или
fillable-редакция `dcy_01305` (JFS Child Medical Statement).

Измерено поиском по всем 21 читаемой форме библиотеки: слов `allerg`, `medic`, `doctor`,
`physician` **нет ни в одной**. `dcy_01236` и `dcy_01217` в реестре стоят как
`versions: {"v1": "PENDING"}` — форм не существует; `dcy_01305` есть только PDF-сканом.

Что это значит на практике: **аллергии и лекарства попадают в базу только со слов.** Замок
это допускает сознательно (медицинское не запирается — аллергия, узнанная по телефону в 9 утра,
должна записываться в 9 утра, см. [спеку захода 1](specs/2026-07-28-manual-entry-provenance.md)),
но пробел должен быть **назван, а не подразумеваться**.

Заполнено сегодня (из 70 строк `child_medical` при 318 активных детях):
`doctor_name` 60 · `doctor_phone` 49 · `allergies` 18 · `medications` 10 · `parent_signed_at` **0**.
Все 8 полей секции «DCY 01236 — Condition» и `physician_signature_date` — **0**.

Карточка при этом размечена под `dcy_01236`: 8 полей вкладки Health ждут форму, которой нет.

## `milk_kind` заполнен словарём старого импорта — артефакт врёт (замер 2026-07-28)

**257 × `1pct` и 35 × `red`** у 318 активных детей. В `MILK_OPTIONS` карточки
(`src/lib/childFieldRegistry.ts`) таких значений **нет** — там `whole | 1% | skim | soy | none`.
Словарь приехал из старого кухонного импорта (Red / 1% молоко) и не был приведён к словарю
карточки.

Следствие: поле считается **заполненным** (в красный счётчик не попадает), но выбранного
значения нет ни в одном списке — `displayValue` печатает сырую строку. Директор видит
значение, которого не может выбрать.

Плюс: **ни одна форма `milk_kind` не собирает** (поиск по `milk` — пусто), то есть это
состояние 3 — из счётчика исключается, но остаётся видимым справочно.

Развилка на решение владельца: привести словарь импорта к словарю карточки (`1pct`→`1%`,
`red`→? — «red» в кухонной номенклатуре = цельное/whole, требует подтверждения) **или**
расширить `MILK_OPTIONS` до фактических значений. Первое — обновление данных, второе —
признание кухонного словаря каноном. **Не трогать до слова.**

## Вкладка Documents у ребёнка пишет мимо базы — это файлы, а не документы (замер 2026-07-28)

**До захода 2 всё, что загружено во вкладке Documents, — файлы, а не документы.** Пока это так,
их нельзя предъявлять как «документ на файле»: у них нет типа, срока действия, автора, хэша и
связи с ребёнком в базе.

Измерено: `ChildDocumentsTab.tsx:35–65` делает `storage.from('org-files').upload()` россыпью
файлов в папку и **не пишет ни одной строки в БД**. Ни `doc_type`, ни `valid_from/valid_until`,
ни `uploaded_by`, ни хэша, ни `roster_id`.

**Носитель уже существует и пуст:** `menumaker.documents` (19 колонок, ровно нужной формы —
`org_id, center_id, roster_id, doc_type, title, period_start/end, source, storage_path,
source_table, source_id, valid_from/until, status, notes, uploaded_by`) — **0 строк,
0 упоминаний в коде приложения**.

**И это не просто пустая таблица — это нерабочая комплаенс-поверхность.**
`menumaker.claim_packet_manifest` **уже читает** `documents`, и его читает живая страница
[`DocumentsPage.tsx:173`](../src/pages/documents/DocumentsPage.tsx). Замер по Ridge за июль 2026:
**28 типов из 28 — `present = false`, из них 20 обязательных.** Манифест клеймового пакета
сегодня показывает всё отсутствующим не потому, что документов нет, а потому что **писать
в таблицу некому**.

Смежное ограничение: словарь `document_types` (28 типов) сегодня **целиком центрового и
спонсорского уровня** (`level ∈ center|sponsor`) — детских типов в нём нет. Заходы 2 и 4
должны добавить детский уровень, иначе `documents.roster_id` останется незаполняемым.

Закрывается заходом 2 ручного ввода (см. [`DECISIONS.md`](DECISIONS.md) — провенанс).

## Child Release Authorization — согласие на публикацию через несуществующий канал (в очередь 2026-07-27)

**Форма ЖИВАЯ** (`child_release_authorization`, current v2, стоит в наборах) и просит родителей
согласиться на публикацию фото через **Smart Care**, которого больше нет. Это **медиа-согласие,
не оплата** — паузой по правилам оплаты не накрыто. **Не тронуто, ждёт слова владельца.**

Место: `Child_Release_Authorization_v2.html` — чекбокс `m_smartcare` (строка 124), список
сброса (211), ключ `media_consent.smart_care` в `collect()` (228).

**Измеренный факт по уже собранным согласиям:** в живой базе всего **две** записи этой формы,
**обе rejected тестовые** («RA SMOKE TEST cal» и «Test»), обе незапечатанные; `smart_care=true`
стоит только в тестовой. **Реальных родительских согласий с этим каналом в системе НЕТ.**
Бумажные согласия по docx-редакции — вне базы, лежат в папках центров; их состояние неизвестно.
**Ни один код в приложении `media_consent` не читает** (грeп по `src/`, `supabase/` — пусто),
поэтому исчезновение или переименование ключа сегодня ничего не ломает.

**Три исхода — оценка, не стройка:**

| Исход | Что меняется в форме | Что в записи | Уже собранные |
|---|---|---|---|
| **A. Убрать канал** | снять чекбокс + строку сброса + ключ в `collect()`; новое издание **v3**, флип `current`, история | `media_consent` = `{website, facebook, advertisement}`; читателей нет — не ломается | ничего не делать: реальных нет, а подписанное **не переписывается** (forward-only) |
| **B. Заменить на действующий** | переименовать канал; нужен **точный ярлык, который родитель видит**, и **определённая аудитория** канала | ключ `smart_care` → новый (напр. `parent_app`) | **ретроактивно не переносится**: галочка за Smart Care ≠ согласие на другой канал. Только вперёд |
| **C. Оставить до общего пересмотра** | ноль | ноль | ноль |

**Что я бы делал (рекомендация, решает владелец):** **A**. Это наименьший истинный ход: убирает
артефакт, который **лжёт родителю** — просит согласия на канал, которого нет, и собирает `true`,
по которому никто никогда не сможет действовать (тот же класс, что `zelle_phone` и «draw or
type» в продуктовом описании). **B** упирается в две вещи, которых пока не существует: как
канал называется для родителя и **кто его видит** — внутренняя раздача фото семье и публикация
в соцсети это разные согласия по объёму, а `platform-standards` требует на публикацию
**отдельного явного** согласия. **C** приемлем, но только с записью: общий пересмотр
медиа-согласия уже стоит в очереди — это **вопрос 2 в** [`docs/compliance/lawyer-memo.md`](compliance/lawyer-memo.md),
про формулировку фото-согласия; тогда этот пункт просто уезжает туда.

**Стоимость:** A — одно издание, полчаса, риск нулевой. B — то же плюс решение владельца о
названии и аудитории канала. C — ноль сейчас, но артефакт продолжает лгать.

---

## Доказуемость подписи — оценка 2026-07-27 (form_version · esign_consent_at · провод)

**Рамка (записана также в [`docs/compliance/e-signature.md`](compliance/e-signature.md) §5a):
печать TRAIL доказывает, что ДАННЫЕ записи не менялись после подписи. Она НЕ доказывает, КАКОЙ
ТЕКСТ был на экране у подписанта.** До 27.07 второй пробел был теоретическим — издания говорили
то же, что бумага. В этот день издания впервые разошлись по содержанию (опечатка №6 +
AUTHORIZED DEPARTURES), и пробел стал реальным.

**Измерено 27.07 на живой базе:** 90 записей · `form_version` — **0** · `esign_consent_at` — **0** ·
запечатано 16 (все без версии) · незапечатано 74 (все без версии) · `source='online'` — 26,
остальные 64 — `paper_entry` / `manual_entry`.

### 1. `form_version` — какое издание видел подписант

**Где сейчас:** колонка есть (`20260723_signature_trail`), **заморожена печатью**; RPC принимает
`p_form_version`; `embed.js` его шлёт. **Значение уже есть на странице** — `form-kit.js:69`
`var VERSION = CFG.version || ''`, каждая форма объявляет своё издание в `FORMKIT_CONFIG`.
**Не доезжает только на прямом пути:** payload `rpc({…})` (form-kit.js:709) его не кладёт → 0 строк.

**Что нужно:** одна строка в payload прямого пути + **kit-bust `?v=13 → 14` в 34 включениях** тем
же коммитом. Плюс отдельно — три формы мимо кита (см. §3).

**Тонкость, которую нельзя потерять:** слать надо **самообъявленную версию страницы**, а не
`current` из реестра. Реестр говорит, что актуально СЕЙЧАС; страница говорит, что было открыто у
подписанта. Для доказательства верна вторая: реестр мог перещёлкнуться после загрузки страницы.

**Бэкфилл — ПОДТВЕРЖДАЮ: невозможен как доказательство.** Три независимых причины:
1. **16 запечатанных** — `form_version` в замороженном списке триггера, UPDATE отбивается для
   ВСЕХ ролей, включая `service_role`. Обойти может только суперюзер, отключив триггер, — за
   границей допустимого и задокументировано.
2. **74 незапечатанных** — технически записать можно, но значение пришлось бы **вывести** из
   `created_at` против истории флипов, а не наблюдать. Вывод ненадёжен: время деплоя Pages ≠
   время коммита, а `?v=` бьёт кэш **кита, а не HTML формы** — родитель мог держать открытой
   старую страницу.
3. **64 из 90 записей не `online`** — `paper_entry`/`manual_entry`: издание, которое видел
   подписант, было **листом бумаги**. У цифровой записи никакого «издания формы» там нет и быть
   не может; осмысленно записывать **ревизию бумаги** (напр. `Rev. 7/2026`) — это другое поле и
   другой факт, вводимый тем, кто набирал.

Вывод: forward-only, ровно как сама печать. Записать это в описание системы, а не пытаться
восстановить.

### 2. `esign_consent_at` — момент согласия вести дело электронно

**Где сейчас:** колонка есть, заморожена печатью; RPC принимает `p_esign_consent boolean` и
ставит `now()` при вставке. **0 строк.** Разъяснение живёт только преамбулой консент-формы
(`Parent_ESign_Consent_v2` → нынешнее издание v4), отдельной отметки на записях нет. Само
согласие при этом **есть как подписанная запись** (`parent_consent`, 7 строк).

**Что фиксировать — трёх вещей, а не одной.** Колонка сегодня хранит только timestamp: она
отвечает «когда», но не «на что». Для доказуемости нужны:
- **момент** — серверный (уже так);
- **версия текста согласия** — форма уже эмитит `consent_version:'v4'` в своём `form_data`, но
  на записи другой формы этого нет. Без версии через год не сказать, под какой формулировкой
  расписался родитель — тот же второй пробел, что и в §1;
- **ссылка на саму запись согласия** (`id` сабмишена `parent_consent`) — чтобы «согласие было в
  силе» можно было проверить, а не принять на веру.

Последние два — **новая миграция** (две колонки), не переключатель.

**Одно согласие на пакет или на каждую форму — оценка: ОДНО, со ссылкой на каждой записи.**
Согласие даётся на **отношения**, а не на документ; переспрашивать на каждой форме — трение без
доказательного выигрыша. Но каждая подписанная запись обязана уметь показать, что согласие было
**в силе в тот момент**, — это и делает ссылка. Отзыв согласия = новая запись (forward-only), и
ссылка позволяет увидеть, что действовало на момент подписи, а что отозвано позже.

**Проводка ссылки:** консент-форма стоит **первой** в наборах (решение владельца), её `Ref`
существует в сессии до того, как заполняются остальные формы. Нести его в сессионном хранилище —
**указатель на документ, а не переиспользование подписи**; консервация образца этого не касается
и не должна быть перепутана с ним. Край: родитель заполняет с другого устройства/в другой день →
указателя нет → запись честно говорит «согласие не подтверждено на этой записи», директор
сверяет с записью согласия, которая всё равно лежит в базе. **Не подставлять `true` наугад.**

### 3. ПРОВОД — без него первые два пункта останутся пустыми колонками

| Путь | Что уже есть | Чего нет |
|---|---|---|
| **Прямой RPC** (витрина/QR, основной родительский путь) | `VERSION` на странице, RPC принимает оба ключа | payload не шлёт **ни одного** из двух |
| **embed** (`embed.js`) | `p_form_version` шлётся; `p_esign_consent: !!msg.esignConsent` проброшен | кит **никогда не ставит** `msg.esignConsent` → всегда `false`. Провод есть, кормить нечем |
| **`submit_public_form`** (special diet · fluid milk · infant meals) | **ПОПРАВКА к прежнему утверждению:** он НЕ «без печати». Функция сама считает `content_hash`, `sealed_at`, `submit_ip`, `submit_user_agent`; все три целевые таблицы (`special_diet_forms`, `milk_substitutions`, `infant_meal_preferences`) несут все 4 колонки следа, на `special_diet_forms` 2 триггера | **0 из 2**: `form_version` и `esign_consent_at` в этих таблицах нет вовсе, и сигнатура RPC их не принимает (`p_form, p_center_slug, p_data, p_idempotency_key`) |

**Порядок работ (рекомендация):** §3 провод → §1 `form_version` → §2 согласие. Первые два — по
одной строке в ките плюс kit-bust; третий требует решения по форме хранения и миграции.

**Стоимость честности:** пока провода нет, описание системы обязано говорить, что `form_version`
и `esign_consent_at` **не заполняются**, — оно так и говорит (`e-signature.md` §6).

---

## Signature trail §2 — form-side consent emission (due 2026-09-15)

**Platform half is DONE & applied (2026-07-25, commit `feat(signature-trail)`):** the RPC
`submit_enrollment_form` writes `esign_consent_at` from `p_esign_consent`, and `embed.js`
already passes `p_esign_consent: !!msg.esignConsent`. **Missing half:** the storefront
form-kit (external repo `pa082508.github.io`) must (a) render an e-signature **consent
checkbox** on the parent form and (b) **emit** `esignConsent: true` in its `save`
postMessage payload. Until then, `esign_consent_at` stays NULL for real parent submits and
the system description keeps consent as **Planned** — wording: *"platform-side capture
wired; form-side emission scheduled."* This is a coordinated **kit-bust**: any form-kit
change bumps `?v=<N>` in all includes in the same commit ([[kit-bust rule]]). Do **only by
Nikolay's word** (storefront repo release). Target: **2026-09-15**.

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

## [MED] Свести три хранилища лицензий в одно — ПОСЛЕ пилота

Решение Николая 18.07: не раньше 27.07, чтобы не трогать настройки в неделю
пилота.

**Что делать, по порядку:**

1. `Capacity & Ratio` (`SettingsPage.tsx`) → читает/пишет `center_licenses`
2. `Center Info` (`CenterInfoSettings.tsx`) → туда же
3. расширенный **20260719e**: снести обе пары в `centers` —
   `license_capacity`, `license_capacity_under2`, `license_total_max`,
   `license_under2_5_max`, а также устаревшие `fso_license_*`

**Ограничение, найденное 18.07 и стоившее ложной тревоги:**
`compute_monthly_claim` берёт ёмкость из `center_licenses` — снос пар клейм
**не роняет**. А вот `CenterInfoSettings.tsx` читает `centers.license_capacity`
напрямую: снести колонки, не переведя эту форму, значит сломать вторую страницу
настроек. Поэтому шаг 2 обязателен ДО шага 3, а не «когда-нибудь потом».

`centers.fso_license_expires` — тот самый дубль, по которому я объявил
действующую FSO-лицензию просроченной. Пока он жив, тревога повторится.

## 2-Д — Early / Late Care как настоящий контур (после 2-Т)

**Решение Николая 27.07: безопасность впереди денег** — транспорт (2-Т) идёт первым, деньги
(поздний забор) следом. До 2-Д обе вкладки честно помечены «Not in service yet» и ничего не
пишут (измерено: `setDutyChildren` — 0 вызовов, три кнопки отвечали тостом без записи, снято).

Состав захода 2-Д:
- **RPC duty-контура** — приём в ранний/поздний контур, перевод в класс, забор родителем,
  эскалация; носители готовы и пусты: `safepass_duty_sessions`, `safepass_late_escalations`.
- **Окна времени** — сегодня режимы Early/Late НЕ привязаны к часам вообще; окно определяет
  центр (граница — локальный день центра, `center_local_day_start`).
- **Расчёт ратио** — `safepass_ratio_events` (пуст) + вычисление; тот же модуль закрывает
  nap-исключение OAC 5180:2-12-20(A)(7), сегодня 🟡 Partial в `compliance-map.md`.
- **LATE PICKUP FEE от timestamp** — сегодня **не существует нигде** (единственные `fee`-колонки
  в базе относятся к зачислению). Считается от факта: минуты после закрытия × тариф центра.
- **50% бонус учителю** (июньское обещание базы) — половина собранного позднего сбора идёт
  учителю, который остался с ребёнком; носитель — `staff_bonus_history` (существует).

Не начинать раньше, чем закрыт 2-Т.

## ⚠️ Ловушка одноимённости: «Starter» в панели ≠ «Admission (Starter)» в Set Builder

**Продовый риск, не демо. Найдено 2026-07-27 при разборе третьего пустого дубля.**

Панель **➕ Add Child** читает **легаси-реестр** `enroll-registry.json → packets.*`, а Set Builder
правит **`packet_sets`** в БД. Это два разных хранилища с почти одинаковыми именами:

| Что видит директор | Откуда | Состав |
|---|---|---|
| плитка **«Starter»** в панели Add Child | легаси-реестр | `parent_consent · start_form · dcy_01305` — **DCY 01234 НЕТ** |
| набор **«Admission (Starter)»** в Set Builder | `packet_sets` (base) | `parent_consent · dcy_01234` |

**Чем это грозит:** директор живого центра выбирает «Starter», отдаёт семье ссылку — и семья
получает пакет **без обязательной DCY 01234**. Никто этого не заметит: обе плитки выглядят
законно, а имена почти совпадают.

Смежное: панель подхватывает из `packet_sets` **только** копии с `origin_id IS NOT NULL`
(«all centers»), поэтому **center-scoped custom-набор в панели не появится вообще** — Set Builder
и Add Child сегодня не разговаривают.

**Направление лечения (продолжение Set Builder-захода):** свести к ОДНОМУ источнику — панель
Add Child читает `packet_sets`, легаси-реестр выводится из употребления. **Как минимум до того** —
развести имена и дать в панели подсказку, что именно входит в набор.

**Заход ПОСЛЕ ролика и смоука 2-Т, по отдельному слову Николая.**

## Видео-серия: ролик №2 «ClaimPulse — income form to claim»

**После боевого старта 1 октября**, когда IEA выйдет из гейта «not placed into production use».
Убедительность для садиков — именно income-форма (CACFP/FRP): путь «родитель подаёт income →
директор определяет F/R/P → это попадает в заявку». **В ролике №1 форму дуги не меняем**
(дуга выверена под `dcy_01234`), а sweep обязан оставить `income_eligibility` нетронутой.
