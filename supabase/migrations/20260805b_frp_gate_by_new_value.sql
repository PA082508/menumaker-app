-- ГЕЙТ ПО НОВОМУ ЗНАЧЕНИЮ, А НЕ ПО НАПРАВЛЕНИЮ (уточнение владельца 04.08).
--
-- ЧТО ИСПРАВЛЯЕТ. Редакция 20260805a пропускала «со слов» любое ПОНИЖЕНИЕ,
-- включая F→R. Это неверно: Reduced — такая же ДОХОДНАЯ категория, как Free.
-- Она определяется шкалой дохода по подписанному заявлению, и «со слов» дохода
-- не бывает. Понижение с Free на Reduced без бумаги означало бы категорию,
-- которую нечем обосновать на проверке, — то есть тот же переклайм, только
-- меньшего размера.
--
-- ПРАВИЛО: со слов допустимо ТОЛЬКО новое значение низшей ступени лестницы
-- (Paid) и только с названной причиной. Любое новое значение выше низшей ступени
-- требует подписанного документа с датой — В ЛЮБУЮ СТОРОНУ, включая F→R.
--
-- `direction` в ответе остаётся: он больше не решает, но по нему видно, что
-- именно произошло, и на нём стоят пробы.
--
-- Применено к проекту menumaker (trrmyqfpxntmgxnqkikp) 2026-08-04.
-- Полный текст функции — в этом файле ниже; изменён только блок замка.
update menumaker.child_field_locks
   set needs_document_text =
     'Reduced and Free are income categories — they need a signed income eligibility application (IEA) '
     'or USDA waiver with the date printed on it. Moving a child to Paid can be done from what the family '
     'told you, with a reason.'
 where field_key = 'frp';

-- Блок замка после правки (остальное тело — как в 20260805a):
--
--   if p_source = 'verbal' then
--     if v_new_rank > 1 then
--       raise exception '%', v_lock_text;      -- к R или F — только по документу
--     end if;
--     if nullif(btrim(coalesce(p_note,'')),'') is null then
--       raise exception '%', v_reason_text;    -- к P — можно, но с причиной
--     end if;
--   end if;
--
-- Функция целиком переприменена тем же CREATE OR REPLACE, что и в 20260805a,
-- с этим блоком вместо направленного.
