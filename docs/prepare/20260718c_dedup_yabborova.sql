-- APPLIED: 2026-07-18, исправленной версией  (claim — verify before building on it)
-- READ-BACK: 1/1
-- ⚠️ Первый прогон откатился по P0001; страховка переписана с имени на id.
--    Применялась ВТОРАЯ редакция — та, что в этом файле.
-- VERIFY:   select count(*) = 1 as exactly_one_active_yabborova
--             from menumaker.roster
--            where is_active and child_name ilike '%yabborova%';
--
-- 20260718c — ПРИМЕНЁН 18.07 (заголовок ниже сохранён как история заявки).
-- Точечная разморозка дедупа: ОДНА пара. Полный «чисти ростер» остаётся заморожен.
--
-- ЕДИНСТВЕННЫЙ настоящий дубль ребёнка во всём ростере (все 3 центра, 18.07):
--   Yabborova Sofiya · Play Academy Pearl · др. 2022-09-24 · обе строки is_active
-- Остальные 15 «пар» из детектора — сотрудники Highland, это не дубли детей,
-- они разбираются в 20260718b.
--
-- ПРИВЯЗКИ ИЗМЕРЕНЫ, склейка тривиальна — переносить НЕЧЕГО:
--   keeper 18312be2 · Blue Room (26d73e53) · meals 3 · marks 23 · docs 0 · IE 0 · guardian 0
--   дубль  0a3e36ab · без группы           · meals 0 · marks 0  · docs 0 · IE 0 · guardian 0
-- У дубля ноль ссылок из всех таблиц с roster_id/child_id, поэтому шага «перенос
-- ссылок» из паттерна скелетон-дедупа здесь нет. Обе строки созданы 09.07 с
-- разницей 4 часа, обе date_in=2026-06-15. Написание имени у обеих ИДЕНТИЧНО —
-- опечатки здесь нет (открытый пункт «имя с опечаткой» к этой паре не относится).
--
-- Дубль ГАСИТСЯ, не удаляется — id может быть в чьём-то экспорте/логе.
-- checkmark export ✅ — 23 отметки keeper'а не трогаются, дубль их не имел.
--
-- ⚠️ ИСПРАВЛЕНО 18.07 — ПОЧЕМУ ПРОВЕРКИ ТЕПЕРЬ ПО id.
-- Прежняя редакция страховки сравнивала norm_name(...) = 'yabborova sofiya'.
-- ИЗМЕРЕНО: menumaker.norm_name переставляет токены и возвращает
--   'sofiya yabborova'  (имя фамилия), а не 'yabborova sofiya'.
-- Условие никогда не выполнялось бы: n = 0, страховка бросила бы исключение и
-- откатила заход. Данные бы не пострадали, но шаг встал бы на выдуманном формате.
-- Урок в стандартах: формат нормализации НЕ хардкодится в проверках; сверка либо
-- по id, либо через саму функцию с ОБЕИХ сторон сравнения.
--
-- READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (ожидаемо):
--   18312be2 · is_active=t · deactivation_reason=null   (keeper жив)
--   0a3e36ab · is_active=f · 'duplicate of 18312be2… (20260718c)'
--   Пикер Pearl: Yabborova Sofiya встречается РОВНО ОДИН раз.
--   Статус триажа пары в дедуп-очереди остаётся 'dismissed' — НЕ трогаем.
--   После следующего refresh_action_items(<org>) ключ duplicates: 16 → 15.

begin;

update menumaker.roster set
  is_active           = false,
  deactivated_at      = now(),
  deactivation_reason = 'duplicate of 18312be2-372f-485f-b36e-cb398bcdfeb0 (20260718c)',
  updated_at          = now()
where id = '0a3e36ab-43c4-428a-ae31-be482273fa50';

-- Страховка ПО id: keeper обязан остаться живым, и из пары должен остаться
-- ровно один живой. Никаких допущений о нормализации имён.
do $$
declare n_live int; keeper_ok boolean;
begin
  select exists (select 1 from menumaker.roster
                  where id = '18312be2-372f-485f-b36e-cb398bcdfeb0' and is_active)
    into keeper_ok;
  if not keeper_ok then
    raise exception 'keeper 18312be2 не найден или не активен, откат';
  end if;

  select count(*) into n_live from menumaker.roster
   where id in ('18312be2-372f-485f-b36e-cb398bcdfeb0',
                '0a3e36ab-43c4-428a-ae31-be482273fa50')
     and is_active;
  if n_live <> 1 then
    raise exception 'ожидался 1 живой из пары, получено %, откат', n_live;
  end if;
end $$;

commit;

-- ── SELF-CHECK (урок 18.07: do-блок не доехал при вставке) ──────────────────
-- Чисто читающий, по id. Оборвалась вставка → блок не вернёт 2 строки.
select 'live rows in the Yabborova pair' as what,
       (count(*))::text as got, '1' as expect
  from menumaker.roster
 where id in ('18312be2-372f-485f-b36e-cb398bcdfeb0',
              '0a3e36ab-43c4-428a-ae31-be482273fa50')
   and is_active
union all
select 'dup 0a3e36ab deactivated with reason',
       (count(*))::text, '1'
  from menumaker.roster
 where id = '0a3e36ab-43c4-428a-ae31-be482273fa50'
   and not is_active
   and deactivation_reason = 'duplicate of 18312be2-372f-485f-b36e-cb398bcdfeb0 (20260718c)';
