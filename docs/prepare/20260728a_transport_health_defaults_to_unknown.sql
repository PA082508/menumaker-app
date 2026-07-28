-- 20260728a_transport_health_defaults_to_unknown.sql
-- PREPARE — НЕ ПРИМЕНЕНО. Ждёт отдельного go Николая.
--
-- ── ЗАЧЕМ
-- menumaker.roster.emergency_transport_auth = true у ВСЕХ 623 строк (0 false, 0 null).
-- Это не собранный ответ, а COLUMN DEFAULT true, сработавший на INSERT.
-- Поле означает РОДИТЕЛЬСКУЮ АВТОРИЗАЦИЮ на экстренную перевозку: система сегодня
-- отвечает «да» на вопрос, который никому не задавали.
-- has_health_condition = false у 621, true у 2 — тот же DEFAULT false.
--
-- Подтверждение механизма (information_schema.columns):
--   emergency_transport_auth  column_default = true
--   has_health_condition      column_default = false
--
-- ── КАК ОТЛИЧИТЬ СОБРАННОЕ ОТ ДЕФОЛТНОГО
-- Истории изменений в системе нет (0 триггеров на roster). Единственный след —
-- одобренный dcy_01234, привязанный к строке ростера (enrollment_submissions.child_id
-- = roster.id), несущий trans_yes/trans_no и health_y/health_n.
-- Таких детей ДВОЕ из 623:
--
--   7c3af8ad… Rodriguez- Texidor Izabella  форма 15.07: trans_no=Yes  → авторизации НЕТ
--                                          карточка сейчас: true  ← ПРОТИВОРЕЧИТ ПОДПИСАННОМУ
--                                          форма: health_n=Yes → состояния НЕТ
--                                          карточка сейчас: true  ← тоже расходится (см. §2б)
--   6eb9b893… Leilani Cunningham           форма 23.07: trans_yes=Yes → авторизация ЕСТЬ
--                                          карточка: true  ← совпало случайно
--                                          форма: health_n=Yes → карточка false ✓
--
-- Для остальных 621 следа НЕТ ВООБЩЕ → значение доказуемо дефолтное.
--
-- ── ЕСЛИ ОТЛИЧИТЬ НЕЛЬЗЯ
-- emergency_transport_auth: отличать не от чего. Значения false нет НИ У КОГО —
--   значит ни один директор никогда его не менял. Доказательство от противного:
--   ответь кто-нибудь «нет», в базе была бы хоть одна false.
-- has_health_condition: 621 false могли включать руками подтверждённое «нет» —
--   такой случай следа не оставляет. Правило: ПРИ НЕВОЗМОЖНОСТИ ОТЛИЧИТЬ — «неизвестно».
--   Асимметрия риска: потерянное подтверждённое «нет» стоит одного переспроса;
--   сохранённое выдуманное «нет» ПРЯЧЕТ состояние здоровья ребёнка.
--   Две строки с true НЕ ТРОГАЕМ — это не дефолт, значит кто-то их ставил руками.
--
-- ── БЕЗОПАСНОСТЬ NULL (проверено)
-- Читателей нет: 0 функций / view / политик БД упоминают эти колонки; в приложении
-- они уже объявлены `boolean | null` (ChildSettingsPage.tsx:38,40).
-- displayValue(boolean) даёт '' на null. isFieldActive: !!null = false → секция
-- «DCY 01236 — Condition» остаётся скрытой ровно как при false.
--
-- ── ЧТО ЭТО СДЕЛАЕТ С КРАСНЫМ БЕЙДЖЕМ
-- Оба поля required → бейдж ВЫРАСТЕТ примерно на 632 единицы среди 318 активных
-- (318 transport + ~316 health). Это НАМЕРЕННО: красное станет правдой.
-- Порядок важен — делать ДО пересчёта бейджа, иначе фикция спрячется за
-- исключением из счёта и никогда не всплывёт.
-- Состояние по канону — 1 (не 3): бумажный DCY 01234 лежит в папке центра,
-- у директора есть действие уже сегодня (ввести руками в карточке), а после
-- порта заход-1 форма заполнит поле сама.
--
-- ── НЕ УДАЛЕНИЕ
-- Ни одна строка не удаляется. Выдуманное значение становится честным «неизвестно».
-- Канон «чистка данных = обновление, не удаление» соблюдён.
-- ============================================================================


-- §0 ПРЕДПОЛЁТ — ничего не пишет. Снять ДО применения, приложить к go.
select
  count(*)                                                as roster_all,
  count(*) filter (where emergency_transport_auth is true)  as eta_true,
  count(*) filter (where emergency_transport_auth is false) as eta_false,
  count(*) filter (where emergency_transport_auth is null)  as eta_null,
  count(*) filter (where has_health_condition is true)      as hhc_true,
  count(*) filter (where has_health_condition is false)     as hhc_false,
  count(*) filter (where has_health_condition is null)      as hhc_null
from menumaker.roster;
-- ОЖИДАНИЕ на 28.07: 623 | 623 | 0 | 0 | 2 | 621 | 0


-- §1 СЛЕД — двое детей с одобренным dcy_01234. Пересчитать перед применением:
--     если строк стало больше двух, §2 нужно переписать под новый список.
select r.id, r.child_name,
       r.emergency_transport_auth as card_eta, r.has_health_condition as card_hhc,
       es.form_data->>'trans_yes' as f_trans_yes, es.form_data->>'trans_no' as f_trans_no,
       es.form_data->>'health_y'  as f_health_y, es.form_data->>'health_n'  as f_health_n,
       es.signature_date
from menumaker.enrollment_submissions es
join menumaker.roster r on r.id = es.child_id
where es.submission_type = 'dcy_01234' and es.status = 'approved'
order by es.signature_date;


-- §2 ПРИМЕНЕНИЕ — по слову. Три шага, в этом порядке.

-- §2а  Все без следа → «неизвестно».
--      Транспорт: обнуляем ВСЕХ, кроме двоих со следом.
update menumaker.roster r
   set emergency_transport_auth = null
 where not exists (
   select 1 from menumaker.enrollment_submissions es
    where es.child_id = r.id and es.submission_type = 'dcy_01234' and es.status = 'approved'
      and coalesce(es.form_data->>'trans_yes','') || coalesce(es.form_data->>'trans_no','') <> ''
 );

--      Здоровье: обнуляем только ДЕФОЛТНОЕ false и только без следа.
--      true не трогаем (не дефолт → кто-то ставил руками).
update menumaker.roster r
   set has_health_condition = null
 where r.has_health_condition is false
   and not exists (
   select 1 from menumaker.enrollment_submissions es
    where es.child_id = r.id and es.submission_type = 'dcy_01234' and es.status = 'approved'
      and coalesce(es.form_data->>'health_y','') || coalesce(es.form_data->>'health_n','') <> ''
 );

-- §2б  Двое со следом → значение ИЗ ПОДПИСАННОЙ ФОРМЫ.
--      Izabella: форма говорит НЕТ авторизации — карточка сейчас утверждает обратное.
update menumaker.roster
   set emergency_transport_auth = false
 where id = '7c3af8ad-f421-4767-b701-59ec08296c8c';
--      Leilani: форма говорит ДА — значение не меняется, но теперь оно обосновано.
update menumaker.roster
   set emergency_transport_auth = true
 where id = '6eb9b893-b0ed-4405-8475-c2465e1786be';

-- §2в  ⚠ НЕ АВТОМАТИЗИРУЕТСЯ — РЕШЕНИЕ ДИРЕКТОРА.
--      У Izabella карточка говорит has_health_condition = true, а подписанная
--      форма от 15.07 говорит health_n = Yes (состояния нет). Истории нет →
--      НЕЛЬЗЯ установить, что позже: правка директора по более свежему знанию
--      или ошибка. Форму НЕ применяем поверх, значение НЕ трогаем.
--      Действие: показать директору обе версии и дать решить. Ровно этот случай
--      заход 1 и закрывает — журнал с документной датой ответил бы за секунду.
select id, child_name, has_health_condition
from menumaker.roster where id = '7c3af8ad-f421-4767-b701-59ec08296c8c';


-- §3 ЧИТКА ОБРАТНО — после применения.
select
  count(*)                                                as roster_all,
  count(*) filter (where emergency_transport_auth is true)  as eta_true,
  count(*) filter (where emergency_transport_auth is false) as eta_false,
  count(*) filter (where emergency_transport_auth is null)  as eta_null,
  count(*) filter (where has_health_condition is true)      as hhc_true,
  count(*) filter (where has_health_condition is false)     as hhc_false,
  count(*) filter (where has_health_condition is null)      as hhc_null
from menumaker.roster;
-- ОЖИДАНИЕ: 623 | 1 (Leilani) | 1 (Izabella) | 621 | 2 | 1 (Leilani) | 620


-- §4 ХВОСТ — отдельным словом, НЕ этим заходом.
-- COLUMN DEFAULT снят НЕ БУДЕТ этим файлом: снятие дефолта — изменение схемы,
-- и каждый следующий INSERT без явного значения начнёт класть null. Это ПРАВИЛЬНО,
-- но ломает пути, которые сегодня молча полагаются на дефолт. Проверить и снять
-- отдельно, вместе с портом dcy_01234 (заход 1), иначе через месяц вернётся
-- та же фикция на новых детях:
--   alter table menumaker.roster alter column emergency_transport_auth drop default;
--   alter table menumaker.roster alter column has_health_condition     drop default;
