-- 20260718c — PREPARE, НЕ ПРИМЕНЁН. Ждёт «размораживай точечно» Николая.
-- Точечная разморозка дедупа: ОДНА пара. Полный «чисти ростер» остаётся заморожен.
--
-- ЕДИНСТВЕННЫЙ настоящий дубль ребёнка во всём ростере (все 3 центра, 18.07):
--   Yabborova Sofiya · Play Academy Pearl · др. 2022-09-24 · обе строки is_active
-- Остальные 15 «пар» из детектора — сотрудники Highland, это не дубли детей,
-- они разбираются в 20260718b.
--
-- ПРИВЯЗКИ ИЗМЕРЕНЫ, склейка тривиальна — переносить НЕЧЕГО:
--   keeper 18312be2 · Blue Room · meals 3 · marks 23 · docs 0 · IE 0 · guardian 0 · submissions 0
--   дубль  0a3e36ab · без группы · meals 0 · marks 0  · docs 0 · IE 0 · guardian 0 · submissions 0
-- У дубля ноль ссылок из всех таблиц с roster_id/child_id, поэтому шага «перенос
-- ссылок» из паттерна скелетон-дедупа здесь нет. Обе строки созданы 09.07 с
-- разницей 4 часа, обе date_in=2026-06-15.
--
-- Дубль ГАСИТСЯ, не удаляется — id может быть в чьём-то экспорте/логе.
-- checkmark export ✅ — 23 отметки keeper'а не трогаются, дубль их не имел.
--
-- READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (ожидаемо):
--   select id, is_active, deactivation_reason from menumaker.roster
--    where child_name ilike 'Yabborova%';
--     → 18312be2 · t · null      (keeper жив)
--     → 0a3e36ab · f · 'duplicate of 18312be2… (20260718c)'
--   Пикер Pearl: Yabborova Sofiya встречается РОВНО ОДИН раз.
--   После следующего refresh_action_items(<org>) ключ duplicates: 16 → 15.

begin;

update menumaker.roster set
  is_active           = false,
  deactivated_at      = now(),
  deactivation_reason = 'duplicate of 18312be2-372f-485f-b36e-cb398bcdfeb0 (20260718c)',
  updated_at          = now()
where id = '0a3e36ab-43c4-428a-ae31-be482273fa50';

-- Страховка: keeper обязан остаться живым и остаться единственным живым.
do $$
declare n int;
begin
  select count(*) into n from menumaker.roster
   where menumaker.norm_name(coalesce(child_name, last_name||' '||first_name)) = 'yabborova sofiya'
     and is_active;
  if n <> 1 then
    raise exception 'ожидалась 1 живая строка Yabborova, получено %, откат', n;
  end if;
end $$;

commit;
