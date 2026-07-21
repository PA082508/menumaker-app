-- 20260721e_iea_org_only.sql — IEA/income → General Director (org-admin) ONLY. Фаза 1.
--
-- ✅ APPLIED + VERIFIED 2026-07-21 (руками Николая через веб-редактор, блоки по одному).
--    Read-back вердикты (фактические): R1 income_org_only · restrictive · authenticated ·
--    gates_income=true. R2 iea approved×1 + rejected×6 = 7, usda_waiver 0. R3 директор
--    Pearl income=0 / noincome=67 · General Director (Татьяна) income=7. R4 anon
--    submit_enrollment_form(iea) = Success (definer обошёл RLS). R5 auth_exec=true /
--    anon_exec=false; статус-функция вернула только child_id/domain/status. Всё по ожиданию.
--
-- РОЛЬ-КАНОН (см. platform-standards.md «Roles: … General Director»): орг-уровень =
-- РОЛЬ General Director (org-admin, `menumaker.is_org_owner()` = admin/office_manager);
-- «в Play Academy эту роль занимает Татьяна». Право привязано к роли, не к персоне.
--
-- МОДЕЛЬ (ратифицирована 21.07): содержимое income-определения (iea + usda_waiver)
-- читают/пишут ТОЛЬКО General Director. Директор центра — НЕ читает содержимое; получает
-- ЕДИНЫЙ статус-чип «Income determination on file» (received/filed) БЕЗ содержимого и БЕЗ
-- различения iea/waiver.
--   АНТИ-ИНФЕРЕНС (обоснование + коммерческий селлинг-поинт конфиденциальности): iea и
--   usda_waiver — взаимоисключающая пара (ровно одна на файле). Если waiver виден
--   директору, а iea скрыт — директор ВЫВЕДЕТ F/R/P по тому, какая присутствует. Поэтому
--   обе уходят на орг-уровень, а чип ЕДИНЫЙ (не iea vs waiver) — иначе инференс возвращается.
--
-- БЕЗОПАСНОСТЬ ПУТИ РОДИТЕЛЯ (проверено 21.07): submit_enrollment_form = SECURITY DEFINER
-- → INSERT родителя идёт от владельца, RLS обходится; новая restrictive-политика `to
-- authenticated` его НЕ трогает (все 4 текущие политики тоже to authenticated).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- БЛОК 1. Restrictive-политика: income-строки (iea + usda_waiver) — только GD.
--   RESTRICTIVE → AND со всеми прочими. Не-income строки не затронуты. Директор (не
--   is_org_owner) теряет доступ к income-строкам; GD (office_manager/admin) сохраняет.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists income_org_only on menumaker.enrollment_submissions;
create policy income_org_only on menumaker.enrollment_submissions
  as restrictive for all to authenticated
  using (
    submission_type <> all (array['iea','usda_waiver'])
    or menumaker.is_org_owner(org_id)
  )
  with check (
    submission_type <> all (array['iea','usda_waiver'])
    or menumaker.is_org_owner(org_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- БЛОК 2. Definer-статус для директорского чипа. Возвращает ТОЛЬКО {child_id,
--   domain='income', status} — БЕЗ form_data/signatures. Один ряд на ребёнка (последняя
--   income-строка). Скоуп по вызывающему: GD — вся орг, директор — свои центры
--   (my_center_ids). ЕДИНЫЙ домен 'income' — не различает iea/waiver (анти-инференс).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function menumaker.income_determination_status()
returns table (child_id uuid, domain text, status text)
language sql stable security definer set search_path = ''
as $function$
  select distinct on (es.child_id)
         es.child_id, 'income'::text as domain, es.status
    from menumaker.enrollment_submissions es
   where es.submission_type = any (array['iea','usda_waiver'])
     and es.child_id is not null
     and ( menumaker.is_org_owner(es.org_id)
           or es.center_id = any (menumaker.my_center_ids()) )
   order by es.child_id, es.created_at desc
$function$;
revoke execute on function menumaker.income_determination_status() from public, anon;
grant  execute on function menumaker.income_determination_status() to authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Политика на месте (restrictive · to authenticated · несёт is_org_owner + обе income-типа):
--   select polname,
--          pol.polpermissive as permissive,
--          coalesce((select string_agg(r.rolname,',') from pg_roles r where r.oid=any(pol.polroles)),'PUBLIC') as roles,
--          (pg_get_expr(pol.polqual,pol.polrelid) ilike '%is_org_owner%'
--             and pg_get_expr(pol.polqual,pol.polrelid) ilike '%usda_waiver%') as gates_income
--     from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='menumaker' and c.relname='enrollment_submissions' and pol.polname='income_org_only';
--   -- ждём: permissive=false · roles=authenticated · gates_income=t
--
-- R2 (b). Сколько строк уходит из директорской видимости (снимок ДО/ПОСЛЕ — число не меняется):
--   select submission_type, status, count(*) from menumaker.enrollment_submissions
--    where submission_type = any(array['iea','usda_waiver']) group by 1,2 order by 1,2;
--   -- ожидаемо на 21.07: iea rejected×6, iea approved×1 (=7 iea), usda_waiver 0.
--
-- R3. Функционально (txn+rollback): директор Pearl НЕ видит income; GD (Татьяна) видит; не-income не тронут.
--   begin;
--   set local role authenticated; set local request.jwt.claims='{"sub":"c3c31e35-f4b0-4a5d-b342-6d932ae18fce"}';  -- Pearl director
--   select count(*) as dir_sees_income from menumaker.enrollment_submissions where submission_type=any(array['iea','usda_waiver']);   -- ждём 0
--   select count(*) as dir_sees_noincome from menumaker.enrollment_submissions where submission_type not in ('iea','usda_waiver');    -- >0 (без регресса)
--   reset role;
--   set local role authenticated; set local request.jwt.claims='{"sub":"1567bda4-93fb-44ca-9813-58b2502e588d"}';  -- General Director (Татьяна, office_manager)
--   select count(*) as gd_sees_income from menumaker.enrollment_submissions where submission_type=any(array['iea','usda_waiver']);    -- ждём 7
--   reset role; rollback;
--
-- R4 (a). Путь родителя НЕ сломан: anon вызывает submit_enrollment_form(iea) → успех (definer обходит RLS).
--   begin;
--   set local role anon; set local request.jwt.claims='{"role":"anon"}';
--   select menumaker.submit_enrollment_form(
--     '3a9a290e-7e49-491e-946b-ad86f2399910'::uuid,                                   -- p_org
--     (select id from menumaker.centers where slug='pearl'),                          -- p_center
--     'iea', '{"smoke":"income-policy-check"}'::jsonb, '{}'::jsonb, current_date,      -- type/data/sig/date
--     'embed', gen_random_uuid()) as inserted_id;                                     -- source/idem → ждём uuid (успех)
--   reset role; rollback;
--
-- R5. Статус-функция: директор получает {child_id,domain,status} БЕЗ содержимого; grant authenticated.
--   begin;
--   set local role authenticated; set local request.jwt.claims='{"sub":"c3c31e35-f4b0-4a5d-b342-6d932ae18fce"}';
--   select * from menumaker.income_determination_status() limit 5;   -- только child_id/domain/status, без form_data/signatures
--   select has_function_privilege('authenticated','menumaker.income_determination_status()','execute') as auth_exec,  -- t
--          has_function_privilege('anon','menumaker.income_determination_status()','execute') as anon_exec;           -- f
--   reset role; rollback;
