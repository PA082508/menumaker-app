-- ДИРЕКТОРСКИЙ БЕЙДЖ СЧИТАЕТ ТОЛЬКО ТО, ЧТО ДИРЕКТОР МОЖЕТ ОТКРЫТЬ И ЗАКРЫТЬ.
-- Применено по слову GO 2026-08-05.
--
-- ЗАМЕР 05.08 (Wickliffe, роль director): бейдж показывал 11, и три из них —
-- строки IEA (две вовсе без имени). Открыть их директор не может: политика
-- `income_org_only` прячет `iea`/`usda_waiver` от всех, кроме орг-уровня
-- (канон IEA-маршрутизации — доход виден только Генеральному директору).
--
-- Счётчик обходил эту политику, потому что он SECURITY DEFINER. Получалось
-- число, которое нельзя обнулить ничем: работа есть, а работы не видно. Это
-- ровно то, что запрещает стандарт «красный счётчик обязан быть обнуляемым».
--
-- ОРГ-УРОВНЮ IEA-СЧЁТ ОСТАЁТСЯ: Татьяна эти строки и видит, и разбирает —
-- у неё они не «невидимая работа», а её собственная. Признак тот же, которым
-- решает политика, — `menumaker.is_org_owner()`; двух разных ответов на вопрос
-- «кому видно доход» в системе быть не должно.
create or replace function menumaker.enrollment_action_counts(p_org uuid, p_center uuid)
returns jsonb
language sql
stable security definer
set search_path to 'menumaker', 'core', 'public'
as $function$
  select jsonb_build_object(
    'children', count(*) filter (
      where es.status='pending' and es.submission_type<>'staff'
        and (es.submission_type = any(menumaker.renewal_countersign_types()) or es.child_id is null)
        -- Доходные формы считаются только тому, кто их видит.
        and (es.submission_type <> all (array['iea','usda_waiver'])
             or menumaker.is_org_owner(es.org_id))),
    'staff', count(*) filter (
      where es.status='pending' and es.submission_type='staff')
  )
  from menumaker.enrollment_submissions es
  join menumaker.centers c on c.id = es.center_id
  where es.org_id=p_org and es.center_id=p_center
    and not coalesce(c.is_demo, false)                    -- демо-центр: не работа директора
    and es.record_origin is distinct from 'rehearsal';    -- и не репетиция, где бы она ни лежала
$function$;

comment on function menumaker.enrollment_action_counts(uuid, uuid) is
  'Счётчик работы для бейджа. Доходные формы (iea/usda_waiver) считаются только орг-уровню: директор их не видит и обнулить не может.';
