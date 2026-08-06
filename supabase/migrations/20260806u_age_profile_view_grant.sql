-- 20260806u — представление возрастного профиля читается людьми, а не только службой.
--
-- ЗАМЕР (фото владельца, карточка Coleman Levi): «permission denied for view
-- v_child_age_profile», Age group и Milk (oz) прочерками при живом ДР. Честный
-- отказ сработал правильно — дыра грантовая.
--
-- АРХЕОЛОГИЯ: представления НЕТ НИ В ОДНОЙ миграции репозитория — заведено вне
-- следа миграций, поэтому грант ему никто и не выдавал (только service_role).
-- Соседнее v_meal_grid, рождённое миграцией 20260716d, гранты получило. Это не
-- «право потерялось», это «право никогда не выдавали».
--
-- ШИРЕ ЗАКАЗА: у представления не стоял security_invoker — оно читало базовые
-- таблицы ПРАВАМИ ВЛАДЕЛЬЦА и обходило RLS. Грант без invoker открыл бы возраст
-- и молоко мимо всяких правил, поэтому идёт только вместе с ним.
alter view menumaker.v_child_age_profile set (security_invoker = true);
grant select on menumaker.v_child_age_profile to authenticated;

comment on view menumaker.v_child_age_profile is
  'Возраст/молоко по ДР на CURRENT_DATE. security_invoker=true: охват строк держит RLS ростера, а не права владельца.';
