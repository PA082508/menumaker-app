-- 20260726a_safepass_org_owner_scope.sql — SafePass staff-RPC: центр-скоуп + роль General Director
--
-- РЕШЕНИЕ (Николай, 2026-07-26, «GO B»): права General Director'а привязаны к РОЛИ
--   `menumaker.is_org_owner()`, а НЕ к per-center строкам в core.user_center_access.
--   Поэтому все три staff-RPC SafePass расширяются до
--       center_id = any(menumaker.my_center_ids())  OR  menumaker.is_org_owner(org_id)
--   Побочка «GD видит ✓Pickup-родителей всех центров орга» ПРИНЯТА явно; скоуп по активному
--   центру (p_center из OrgContext) — отдельным решением позже, не в этой миграции.
-- forward-only: 20260724a НЕ редактируется; здесь новая миграция поверх (CREATE OR REPLACE).
--
-- ── НАХОДКА, из которой миграция (разведка 2026-07-26, read-only):
--   На /safepass/issue (активный центр Ridge) список пуст — «No pickup-authorized parents for
--   this center yet», — при том что выдача one-time кода по тому же номеру НАХОДИТ строку
--   («Nikolay (Test) · 1 child», код 085335).
--   Причина: `safepass_pickup_candidates` гейтит по `center_id = any(my_center_ids())`, а
--   `my_center_ids()` читает ТОЛЬКО core.user_center_access — у playacademyusa@gmail.com там
--   0 строк (он org-admin: core.memberships.role='admin' орг 3a9a290e…) ⇒ массив '{}' ⇒ все
--   23 активные Ridge-строки отсечены. `safepass_issue_login_code` центр не фильтрует вообще
--   (`where phone = p_phone and is_active`) ⇒ ту же строку видит. Отсюда расхождение.
--   Тот же гейт ломал и кнопки: mark_person_registered / revoke_parent_trust вернули бы
--   'not_authorized' даже если бы строка отрисовалась ⇒ чиним гейт, а не отображение.
--
-- ── ЧТО НЕ МЕНЯЕТСЯ (границы правки):
--   • Права director/cook — как были: у них есть свои user_center_access строки, ветка
--     is_org_owner() для них ложна, скоуп прежний.
--   • anon-функции (activate_device / resume_session / verify_login_code) не тронуты.
--   • safepass_issue_login_code не тронут — его отсутствие центр-скоупа разбирается
--     отдельно (доклад 2026-07-26), фикс по отдельному слову.
--   • tp.is_active, can_pickup (Family) — не тронуты.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) ✓Pickup-список staff. Тело 20260724a + ветка is_org_owner(tp.org_id).
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_pickup_candidates()
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_rows jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;
  select coalesce(jsonb_agg(r order by r->>'person_name'), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'phone', tp.phone,
      'person_name', max(tp.person_name),
      'child_count', count(distinct tp.child_id),
      'phone_verified', bool_or(tp.phone_verified),
      'registered', bool_or(tp.registered_at is not null)
    ) as r
    from menumaker.safepass_trusted_persons tp
    where tp.is_active and tp.phone is not null
      and (tp.center_id = any(menumaker.my_center_ids())
           or menumaker.is_org_owner(tp.org_id))       -- ← GD: право от РОЛИ, не от строки центра
      and (tp.access_from  is null or tp.access_from  <= current_date)
      and (tp.access_until is null or tp.access_until >= current_date)
    group by tp.phone
  ) s;
  return jsonb_build_object('ok', true, 'candidates', v_rows);
end $fn$;
revoke execute on function menumaker.safepass_pickup_candidates() from public, anon;
grant  execute on function menumaker.safepass_pickup_candidates() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) STAFF: тап «Register» — тот же расширенный скоуп.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_mark_person_registered(p_phone text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_n int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;
  update menumaker.safepass_trusted_persons tp
     set registered_at = now(), registered_by = auth.uid()
   where tp.phone = p_phone and tp.is_active
     and (tp.center_id = any(menumaker.my_center_ids())
          or menumaker.is_org_owner(tp.org_id));
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_authorized'); end if;
  return jsonb_build_object('ok', true, 'rows', v_n);
end $fn$;
revoke execute on function menumaker.safepass_mark_person_registered(text) from public, anon;
grant  execute on function menumaker.safepass_mark_person_registered(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) B-6 KICK: тот же расширенный скоуп во ВСЕХ ТРЁХ местах (гард, tp-update, sessions-update).
--     Семантика 20260724a сохранена: гасим e-доступ (phone_verified/registered_at/сессии),
--     tp.is_active и can_pickup НЕ трогаем.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_revoke_parent_trust(p_phone text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_n int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;

  if not exists (
    select 1 from menumaker.safepass_trusted_persons tp
     where tp.phone = p_phone
       and (tp.center_id = any(menumaker.my_center_ids())
            or menumaker.is_org_owner(tp.org_id))
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  update menumaker.safepass_trusted_persons tp
     set phone_verified = false, phone_verified_at = null,
         registered_at = null, registered_by = null
   where tp.phone = p_phone
     and (tp.center_id = any(menumaker.my_center_ids())
          or menumaker.is_org_owner(tp.org_id));

  update menumaker.safepass_parent_sessions ps set is_active = false
   where ps.phone = p_phone and ps.is_active
     and exists (select 1 from menumaker.safepass_trusted_persons tp
                  where tp.phone = ps.phone
                    and (tp.center_id = any(menumaker.my_center_ids())
                         or menumaker.is_org_owner(tp.org_id)));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'sessions_killed', v_n);
end $fn$;
revoke execute on function menumaker.safepass_revoke_parent_trust(text) from public, anon;
grant  execute on function menumaker.safepass_revoke_parent_trust(text) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- READ-BACK (выполняется сразу после apply)
-- R1. Три функции пересозданы и все три несут is_org_owner: proname → true.
-- R2. Скоуп-предикат под ролью GD (auth.uid() симулируется через set local request.jwt.claims):
--     кандидатов = 23 активные Ridge-строки → 21 телефон, среди них 'Nikolay (Test)'.
-- R3. Гранты не разъехались: mark/pickup_candidates/revoke = authenticated only, anon отрезан.
-- R4. director/cook Ridge — скоуп прежний (их видимость не расширена и не сужена).
-- ═══════════════════════════════════════════════════════════════════════════════
