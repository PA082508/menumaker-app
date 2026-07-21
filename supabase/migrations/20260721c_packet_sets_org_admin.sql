-- 20260721c_packet_sets_org_admin.sql — CAMPAIGN/SET BUILDER: завершённая модель прав
--
-- Применяется по live-DB протоколу (Nikolay GO 21.07). Пересмотр политик #1.
--
-- ⚠️ МЕНЯЕТ ЖИВОЕ ПОВЕДЕНИЕ #1: раньше ЛЮБОЙ член орг (в т.ч. директор) правил состав
--    base. ТЕПЕРЬ base = СТАНДАРТ СЕТИ, правит ТОЛЬКО хозяин. Осознанный реверс.
--
-- ЗАВЕРШЁННАЯ МОДЕЛЬ ПРАВ (packet_sets):
--   Директор → видит base + custom своего центра; СОЗДАЁТ+ПРАВИТ custom СВОЕГО центра.
--   Хозяин (admin/office_manager: владелец, Татьяна) → видит+правит base; создаёт+правит
--     custom ВСЕХ центров. (ФАКТ: 0 user_center_access → доступ только через has_org_role.)
--   DELETE — НИ У КОГО (модель: очистка/замена состава + архив custom через upd;
--     base неархивируем/неудаляем).
--
-- ── SWAP POINTS (дизайн-инвариант, Николай 21.07) ─────────────────────────────
--   «Кто правит base» и «кто владелец-скоуп» вынесены в ФУНКЦИИ, а не зашиты в текст
--   политик. Значение сегодня захардкожено в дефолт Play Academy (owner-only), НО
--   будущий орг-флаг (напр. org_settings.director_edits_base для коммерческого клиента)
--   подключается ПРАВКОЙ ТЕЛА ФУНКЦИИ can_manage_base — политики НЕ переписываются.
--   (Аналогичный swap-инвариант для «кто создаёт формы/запускает агент-разработчик» —
--    это library-as-entity/forms-agent, будущее, не в этой таблице.)

begin;

-- Владелец-скоуп: ПЕРЕИСПОЛЬЗУЕМ существующую menumaker.is_org_owner(p_org_id uuid) —
-- каноничная функция (admin через core.has_org_role + office_manager через user_roles).
-- НЕ переопределяем (param name p_org_id; она уже используется в других политиках).
-- Проверено 2026-07-21: is_org_owner(org) = true для Татьяны(office_manager)/владельца,
-- = false для директора.

-- SWAP POINT: кто правит BASE (стандарт сети). ДЕФОЛТ Play Academy = owner-only.
-- Будущий орг-флаг расширяет ТОЛЬКО это тело (напр. OR (director + org разрешил)).
create or replace function menumaker.can_manage_base(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select menumaker.is_org_owner(p_org)
$function$;
revoke execute on function menumaker.can_manage_base(uuid) from public, anon;
grant  execute on function menumaker.can_manage_base(uuid) to authenticated;

-- SELECT: base (орг-широко) + custom своего центра (директор) + любой custom (хозяин).
drop policy if exists sel on menumaker.packet_sets;
create policy sel on menumaker.packet_sets for select to authenticated
  using (
    center_id is null
    or center_id = any(menumaker.my_center_ids())
    or menumaker.is_org_owner(org_id)
  );

-- INSERT: custom своего центра (директор) ИЛИ любой custom (хозяин). base не создаётся.
drop policy if exists ins on menumaker.packet_sets;
create policy ins on menumaker.packet_sets for insert to authenticated
  with check (
    kind = 'custom' and (
      center_id = any(menumaker.my_center_ids())
      or menumaker.is_org_owner(org_id)
    )
  );

-- UPDATE:
--   base   → правит can_manage_base (SWAP POINT; сегодня = хозяин); остаётся active
--            (архив/конверсия base запрещены — витринный набор не пропадает).
--   custom → правит свой-центр (директор) ИЛИ хозяин; архив custom тоже здесь.
-- USING несёт can_manage_base, чтобы будущий флаг «директор правит base» открыл и USING
-- для base-строк без правки политики (сегодня can_manage_base=is_org_owner — эквивалентно).
drop policy if exists upd on menumaker.packet_sets;
create policy upd on menumaker.packet_sets for update to authenticated
  using (
    center_id = any(menumaker.my_center_ids())
    or menumaker.is_org_owner(org_id)
    or menumaker.can_manage_base(org_id)
  )
  with check (
    (kind = 'base' and center_id is null and status = 'active'
       and menumaker.can_manage_base(org_id))
    or (kind = 'custom' and (
          center_id = any(menumaker.my_center_ids())
          or menumaker.is_org_owner(org_id)
       ))
  );

-- DELETE: НИ У КОГО. Снимаем permissive-политику → RLS запрещает DELETE всем.
drop policy if exists del on menumaker.packet_sets;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками (фактические значения впишутся после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Политики: sel/ins/upd есть, del ОТСУТСТВУЕТ; хелперы есть.
-- R2. Татьяна (office_manager, 0 center_access) видит+правит+создаёт base и custom всех центров.
-- R3. Директор Pearl: только custom Pearl; base не правит; ridge-custom не видит.
-- R4. base неархивируем даже хозяином (with_check) → UPDATE 0.
-- R5. DELETE запрещён всем → DELETE 0; ins хозяином за чужой центр → успех, ins директором за чужой → 0.
