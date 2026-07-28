-- 20260728e_milk_substitutions_org_isolation.sql
-- ✅ ПРИМЕНЕНО 2026-07-28 по слову (миграция 20260728e). Читка обратно — в конце файла.
--
-- ── ЧТО ЭТО: ДЕФЕКТ, А НЕ ВЫБОР
-- Три публичные детские формы — сёстры по происхождению (все три пишет
-- submit_public_form) и по содержанию (ребёнок + его питание/медицинская нужда).
-- Две из них изолированы по организации, третья — нет. Различие не описано нигде
-- и ни на что не опирается: это пропущенная строка, а не решение.
--
-- Замер 28.07 (pg_policy.polpermissive, не pg_policies без флага):
--
--   special_diet_forms        auth_manage PERMISSIVE USING(true)
--                             org_isolation      RESTRICTIVE  is_org_member(org_id)
--                             module_cacfp_active RESTRICTIVE org_has_module('cacfp', org_id)
--   infant_meal_preferences   то же самое
--   milk_substitutions        auth_manage PERMISSIVE USING(true)   ← и БОЛЬШЕ НИЧЕГО
--
-- Permissive складываются по ИЛИ, restrictive — по И. `auth_manage USING(true)`
-- пропускает любого залогиненного; удерживают ТОЛЬКО restrictive-политики.
-- У milk_substitutions их ноль → любой аутентифицированный пользователь видит
-- ВСЕ строки таблицы, включая чужие организации. Экран есть:
-- FormSubmissionsPage (маршрут `submissions`) читает таблицу без единого .eq().
--
-- ── ЧТО ЭТОТ ФАЙЛ ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ
-- ДЕЛАЕТ: восстанавливает паритет с двумя сёстрами — те же две restrictive-политики.
-- НЕ ДЕЛАЕТ: разграничение ПО ЦЕНТРУ. Его нельзя сделать здесь — в таблице нет
--   center_id и нет связи с ростером. Это проектная работа, её место — заход 1,
--   который как раз строит связь ребёнка (см. renewal/manual-entry спеки).
-- Иначе говоря: этот файл закрывает мульти-тенантную мину, а не вопрос
-- «видит ли директор Ridge детей Pearl». Второй остаётся открытым сознательно.
-- ============================================================================


-- §0 ПРЕДПОЛЁТ — ничего не пишет. Снять ДО применения, приложить к go.
select c.relname as tbl, pol.polname, pol.polpermissive as permissive,
       pg_get_expr(pol.polqual, pol.polrelid) as using_expr
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='menumaker'
  and c.relname in ('special_diet_forms','milk_substitutions','infant_meal_preferences')
order by c.relname, pol.polname;
-- ОЖИДАНИЕ на 28.07: 7 строк; у milk_substitutions ровно ОДНА (auth_manage, permissive t).
--
-- ⚑ ЗАМЕРЕНО 28.07 ДО ПРИМЕНЕНИЯ: все три таблицы ПУСТЫ (0 / 0 / 0 строк, org_id
--   нигде не null). Значит: (1) НИ ОДНА детская запись через эту дыру не была
--   видна — дыра в правиле, не утечка данных; (2) применение безрисково: скрывать
--   нечего, ломать нечего; (3) окно то же, что у типизированного ребра — пока
--   пусто, всё бесплатно, и оно закроется тихо, как только форму начнут подавать.

-- §0б Сколько строк затронуто и чьи они — чтобы применение не оказалось слепым.
select count(*) as rows_total,
       count(distinct org_id) as orgs,
       count(*) filter (where org_id is null) as rows_without_org
from menumaker.milk_substitutions;
-- ⚠ Если rows_without_org > 0 — ОСТАНОВИТЬСЯ: после включения org_isolation такие
--   строки станут невидимы всем, и это надо решить ДО, а не обнаружить ПОСЛЕ.


-- §1 ПРИМЕНЕНИЕ — по слову.
alter table menumaker.milk_substitutions enable row level security;   -- уже включён; идемпотентно

create policy org_isolation on menumaker.milk_substitutions
  as restrictive for all to authenticated
  using (core.is_org_member(org_id))
  with check (core.is_org_member(org_id));

create policy module_cacfp_active on menumaker.milk_substitutions
  as restrictive for all to authenticated
  using (core.org_has_module('cacfp', org_id))
  with check (core.org_has_module('cacfp', org_id));


-- §2 ЧИТКА ОБРАТНО — три таблицы обязаны стать одинаковыми.
select c.relname as tbl,
       count(*) filter (where pol.polpermissive) as permissive_policies,
       count(*) filter (where not pol.polpermissive) as restrictive_policies,
       string_agg(pol.polname, ', ' order by pol.polname) as policies
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='menumaker'
  and c.relname in ('special_diet_forms','milk_substitutions','infant_meal_preferences')
group by c.relname order by c.relname;
-- ОЖИДАНИЕ: у всех трёх — permissive 1, restrictive 2, одинаковый список имён.

-- §3 КОНТРОЛЬ: строки никуда не делись (RLS не удаляет, но проверить дёшево).
select count(*) from menumaker.milk_substitutions;
-- ОЖИДАНИЕ: столько же, сколько в §0б.

-- §4 ЖИВАЯ ПРОВЕРКА — после применения открыть FormSubmissionsPage под директором
-- и убедиться, что вкладка «Fluid Milk» показывает строки СВОЕЙ организации и
-- не пустеет. Пустая вкладка = org_id где-то null (см. предупреждение в §0б).

-- ============================================================================
-- ПРИМЕНЕНО 2026-07-28. Читка обратно:
--   три таблицы стали ОДИНАКОВЫМИ — permissive 1, restrictive 2,
--   политики: auth_manage, module_cacfp_active, org_isolation.
--   milk_substitutions: rows 0, RLS enabled = true.
--
-- ЖИВАЯ ПРОВЕРКА (§4) — исполнена НА УРОВНЕ БАЗЫ, под ролью директора
--   (set local role authenticated + jwt.claims sub=1567bda4…):
--   is_org_member = true · org_has_module('cacfp') = true · видимых строк 0/0/0,
--   ошибки нет. То есть политика ВЫЧИСЛИМА, а не просто числится.
--
-- ⚠ ЧЕСТНО ОБ ОГРАНИЧЕНИИ ЭТОЙ ПРОВЕРКИ: таблицы пусты, поэтому вкладка
--   «Fluid Milk» будет пустой при ЛЮБОМ исходе — ни правильное разграничение,
--   ни сломанное по ней не отличить. Что проверка подтверждает: страница
--   грузится без ошибки и предикаты вычисляются. Что она НЕ подтверждает:
--   что фильтр отсекает чужое — этого нельзя показать, пока нечего отсекать.
--   Настоящая проверка возможна с первой поданной формой.
-- ============================================================================
