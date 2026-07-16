-- 20260717b_prefill_schedule.sql — расписание в prefill-whitelist (заказ §5a)
--
-- ⚠️ PREPARED — NOT APPLIED. Awaiting Nikolay's go.
--
-- DRY RUN 2026-07-16 — выполнено на ЖИВОЙ базе в транзакции и откачено:
--   WITH schedule (Zya Ware):
--     {child_id, center_id, child_name:'Zya Ware', child_first_name, child_last_name,
--      child_dob:'2023-11-20', schedule_days:'Mon,Tue,Wed,Thu,Fri',
--      schedule_in:'07:45', schedule_out:'16:45'}
--   WITHOUT schedule (Aubrey Phillippone):
--     тот же набор БЕЗ ключей schedule_* — strip_nulls убрал их целиком,
--     а не отдал пустые строки. ✅ Именно этого и добивались.
--   FRP отсутствует в обоих. Старые ключи на месте.
--   Откат проверен: sched_days_label — нет; get_prefill — исходное тело;
--   prefill_tokens — 0 строк (minted-токены тоже откатились).
--
-- ЗАМЕЧЕНО ПОПУТНО (НЕ дефект этой миграции): у обоих детей нет parent_name /
-- parent_email / parent_phone / address — у них нет связки child_guardian. Это
-- существующее состояние (guardians = Phase 2/4), а не следствие правки. Для формы
-- питания это значит, что контакты родителя сегодня НЕ предзаполняются у части детей.
--
-- ЧТО И ЗАЧЕМ
-- ───────────
-- `get_prefill` сама несёт TODO ровно под это:
--     "VERIFY + EXTEND at apply time: schedule / meals whitelist. The child→classroom
--      →meal_schedule chain (roster.classroom_id? meal_count_settings.active_slots?)
--      is not confirmed here — add the `schedule`/`meals` keys once the join is
--      verified. Sensitive numbers (SSN/DL/work-auth, FRP/eligibility) stay EXCLUDED."
--
-- Джойн теперь ПОДТВЕРЖДЁН и оказался проще, чем предполагал TODO: после 20260716c
-- расписание лежит ПРЯМО на roster (sched_days / sched_in / sched_out). Цепочка
-- child→classroom→meal_schedule для расписания не нужна вообще.
--
-- ⚠️ ПРИЁМЫ ПИЩИ НЕ СЧИТАЕМ И НЕ ОТДАЁМ. Заказ: «приёмы пищи считаются от часов ×
--    слоты центра — механика кита, не дублировать». Поэтому ключа `meals` здесь НЕТ:
--    отдаём часы, кит считает приёмы. Вторая реализация того же расчёта разошлась бы
--    с первой — вопрос только когда.
--
-- ⚠️ FRP / eligibility ОСТАЮТСЯ ИСКЛЮЧЁННЫМИ. Это claim-доказательство под
--    claim-мостом; в предзаполняемую родителем форму оно не едет ни при каких условиях.
--
-- ФОРМАТ. Плоские ключи в стиле существующих (child_dob, parent_email):
--    schedule_days  = 'Mon,Tue,Wed,Thu,Fri'  (только включённые дни, в порядке недели)
--    schedule_in    = '07:30'                 (24ч, как хранится)
--    schedule_out   = '17:30'
-- jsonb_strip_nulls уже стоит в функции: у ребёнка без расписания этих ключей просто
-- не будет — форма не получит пустую строку и не покажет «Mon–Fri» там, где ничего нет.
--
-- ТЕЛО ВЗЯТО ИЗ ЖИВОЙ БАЗЫ 2026-07-16 (pg_get_functiondef), а не из копии в репозитории.
-- Функция короткая, поэтому включена целиком — в отличие от refresh_action_items
-- (200 строк), где копия протухла бы между prepare и go.

begin;

-- Помощник: маска дней → 'Mon,Tue,...'. Отдельно, чтобы то же представление
-- переиспользовал консистенс-чек формы питания и не разошёлся с prefill.
create or replace function menumaker.sched_days_label(p_mask smallint)
returns text
language sql immutable set search_path to ''
as $function$
  select nullif(array_to_string(array_remove(array[
    case when p_mask &  1 > 0 then 'Mon' end,
    case when p_mask &  2 > 0 then 'Tue' end,
    case when p_mask &  4 > 0 then 'Wed' end,
    case when p_mask &  8 > 0 then 'Thu' end,
    case when p_mask & 16 > 0 then 'Fri' end
  ], null), ','), '')
$function$;
grant execute on function menumaker.sched_days_label(smallint) to authenticated;

create or replace function menumaker.get_prefill(p_token text)
returns jsonb
language plpgsql security definer set search_path to 'menumaker', 'public', 'core'
as $function$
declare
  v_tok  menumaker.prefill_tokens%rowtype;
  v_out  jsonb;
begin
  select * into v_tok
    from menumaker.prefill_tokens
   where token = p_token
     and expires_at > now();
  if not found then
    return null;                                  -- unknown / expired
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
           'child_id',   r.id,
           'center_id',  v_tok.center_id,
           'child_name', coalesce(nullif(trim(r.child_name), ''),
                                  nullif(trim(concat_ws(' ', r.first_name, r.last_name)), '')),
           'child_first_name', r.first_name,
           'child_last_name',  r.last_name,
           'child_dob',  r.birthday,
           -- Primary guardian contact (lowest emergency_contact_order).
           'parent_name',  nullif(trim(concat_ws(' ', g.first_name, g.last_name)), ''),
           'parent_email', g.email,
           'parent_phone', coalesce(g.mobile_phone, g.phone_1),
           'address',      g.address,
           -- ── ADDED 20260717b: attendance schedule (20260716c). ───────────────
           -- Hours only. The kit derives meals from hours × the centre's slots —
           -- deriving them here too would give us two answers to one question.
           'schedule_days', menumaker.sched_days_label(r.sched_days),
           'schedule_in',   to_char(r.sched_in,  'HH24:MI'),
           'schedule_out',  to_char(r.sched_out, 'HH24:MI')
           -- FRP / eligibility deliberately NOT here — claim evidence, claim-bridge.
         ))
    into v_out
    from menumaker.roster r
    left join lateral (
      select gd.*
        from menumaker.child_guardian cg
        join menumaker.guardian gd on gd.id = cg.guardian_id
       where cg.child_id = r.id
       order by cg.emergency_contact_order asc nulls last
       limit 1
    ) g on true
   where r.id = v_tok.child_id;

  return v_out;
end $function$;

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ ──────────────────────────────────────────────
-- 1. Ключи появились и старые НЕ пропали (пропажа ключа = сломанный prefill формы):
--      select menumaker.get_prefill(menumaker.mint_prefill_token(
--        (select id from menumaker.roster where child_name='Zya Ware' and is_active),
--        (select center_id from menumaker.roster where child_name='Zya Ware' and is_active),
--        (select org_id from menumaker.roster where child_name='Zya Ware' and is_active)));
--    Ожидаем: child_id · center_id · child_name · child_first_name · child_last_name
--             · child_dob · parent_* · address · schedule_days='Mon,Tue,Wed,Thu,Fri'
--             · schedule_in='07:45' · schedule_out='16:45'
--    ⚠️ mint_prefill_token делает upsert по child_id и ПЕРЕВЫПУСКАЕТ токен — если
--       этому ребёнку уже выдавали prefill-ссылку, она перестанет работать. Для
--       read-back берите ребёнка, которому ссылку не выдавали, либо сначала
--       select token from prefill_tokens и используйте существующий.
-- 2. Ребёнок БЕЗ расписания → ключей schedule_* нет вовсе (strip_nulls), а не пустые строки.
-- 3. FRP в выдаче отсутствует.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Восстановить get_prefill из pg_get_functiondef, снятого до применения
--   (тело без блока ADDED 20260717b), и:
--   drop function if exists menumaker.sched_days_label(smallint);
