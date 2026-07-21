-- 20260721_packet_sets.sql — CAMPAIGN/SET BUILDER, ШАГ #1 (ядро, БЕЗ подписи/prefill)
--
-- ✅ APPLIED 2026-07-21 на живой базе руками CC по live-DB протоколу (Nikolay GO).
--    Read-back вердиктом колонками — в хвосте файла (фактические значения ниже).
--    Всё DDL идемпотентно (IF NOT EXISTS / CREATE OR REPLACE).
--
-- ЧТО ЭТО. «Набор» (packet set) как САМОСТОЯТЕЛЬНАЯ сущность в БД: id = стационарный
-- QR, состав = form_keys[] (ключи РЕЕСТРА, не URL — формы и их издания остаются в
-- enroll-registry, в БД переезжает ТОЛЬКО состав набора). Развилка решена: отдельная
-- таблица packet_sets, НЕ расширение campaigns (renewal-контур + инвариант красной
-- цифры не смешиваем — решение Николая 21.07).
--
-- ПОЛИТИКА base|custom (уточнена Николаем 21.07):
--   • base = защита ТОЛЬКО от УДАЛЕНИЯ и АРХИВА (витрина не должна остаться без
--     инфант/тадлер-прескул/школьники — их QR напечатаны).
--   • РЕДАКТИРОВАТЬ состав base директор ОБЯЗАН сам (гос-органы сменили формы —
--     замена без разработчика). UPDATE(form_keys/name) на base РАЗРЕШЁН.
--   • DELETE/ARCHIVE — только custom своего центра. base неудаляем и неархивируем.
--   • INSERT — свои custom без потолка.
--   • Q2 (кто правил base) — Николай: НЕ важно. Аудит-триггер/updated_by НЕ строим.
--     updated_at оставлена технической колонкой (default now(), без триггера).
--   • Q1 — Николай: ОДИН объединённый toddler_preschool (базовых ТРИ, не четыре).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. center-scope хелпер. Уже определён в 20260716b/17c/18 (SECURITY DEFINER —
--    прямой подзапрос к core.user_center_access из политики падает permission-
--    denied у роли authenticated). Пересоздаём ИДЕНТИЧНО (тело сверено с 20260718:76).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function menumaker.my_center_ids()
returns uuid[] language sql stable security definer set search_path to '' as $function$
  select coalesce(array_agg(uca.center_id), '{}'::uuid[])
    from core.user_center_access uca
   where uca.user_id = auth.uid() and uca.is_active
$function$;
revoke execute on function menumaker.my_center_ids() from public, anon;
grant  execute on function menumaker.my_center_ids() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Таблица
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists menumaker.packet_sets (
  id          uuid primary key default gen_random_uuid(),   -- стационарный QR = этот id
  org_id      uuid not null,
  center_id   uuid,                              -- null = базовый, орг-широко
  name        text not null,
  slug        text,                              -- опц. читаемый ключ QR (уникален в орг)
  kind        text not null default 'custom' check (kind in ('base','custom')),
  form_keys   text[] not null default '{}',      -- ключи реестра; ПУСТО допустимо (school_age)
  status      text not null default 'active' check (status in ('active','archived')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(), -- техническая; без audit-триггера (Q2)
  -- Инвариант скоупа: base всегда орг-широкий, custom всегда привязан к центру.
  constraint packet_sets_kind_center_ck check (
    (kind = 'base'   and center_id is null) or
    (kind = 'custom' and center_id is not null)
  )
);

create index if not exists packet_sets_org_status_idx on menumaker.packet_sets (org_id, status);
-- Уникальность slug в пределах орг (null не конфликтует — у custom slug опционален).
create unique index if not exists packet_sets_org_slug_uq on menumaker.packet_sets (org_id, slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS. Org-boundary = restrictive (как в campaigns). Скоуп center — my_center_ids().
--    anon НЕ получает грантов вовсе (состав доступен только через резолвер-RPC
--    resolve_packet_set — SECURITY DEFINER, добавим шагом #2).
-- ─────────────────────────────────────────────────────────────────────────────
alter table menumaker.packet_sets enable row level security;

drop policy if exists org_isolation on menumaker.packet_sets;
create policy org_isolation on menumaker.packet_sets as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

-- SELECT: базовые (орг-широко) + custom своего центра.
drop policy if exists sel on menumaker.packet_sets;
create policy sel on menumaker.packet_sets for select to authenticated
  using (center_id is null or center_id = any(menumaker.my_center_ids()));

-- INSERT: только свои custom, без потолка. base через приложение не создаётся (сид ниже).
drop policy if exists ins on menumaker.packet_sets;
create policy ins on menumaker.packet_sets for insert to authenticated
  with check (kind = 'custom' and center_id = any(menumaker.my_center_ids()));

-- UPDATE: правит состав/имя base (орг-широко) И custom своего центра. НО base по
-- итогу правки обязан остаться base + орг-широким + active → это запрещает и архив
-- base (status→archived), и конверсию base→custom. Правка form_keys/name проходит.
drop policy if exists upd on menumaker.packet_sets;
create policy upd on menumaker.packet_sets for update to authenticated
  using (center_id is null or center_id = any(menumaker.my_center_ids()))
  with check (
    (kind = 'base'   and center_id is null and status = 'active')
    or
    (kind = 'custom' and center_id = any(menumaker.my_center_ids()))
  );

-- DELETE: только custom своего центра. base неудаляем.
drop policy if exists del on menumaker.packet_sets;
create policy del on menumaker.packet_sets for delete to authenticated
  using (kind = 'custom' and center_id = any(menumaker.my_center_ids()));

grant select, insert, update, delete on menumaker.packet_sets to authenticated;
-- НАМЕРЕННО без grant для anon: см. read-back (anon_select/anon_insert = false).

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Сид базовых наборов (kind='base', center_id=null, орг-широко) для КАЖДОЙ орг.
--    Q1 = ОДИН объединённый toddler_preschool. Поправка Николая 21.07: базовых
--    ЧЕТЫРЕ, первый — admission (стартовый, первый в витрине). form_keys 1-в-1 из
--    enroll-registry.json (эквивалентность в read-back R4 по трём непустым):
--      • admission        ← packets.admission          (20 форм)  — точная копия
--      • infant           ← packets.infant             (18 форм)  — точная копия
--      • toddler_preschool← packets.toddler_preschool  (16 форм)  — точная копия
--      • school_age       ← '{}' ПУСТО, active  — готового packet НЕТ; состав Николай
--                            соберёт редактором (шаг #4). НЕ выдумано.
--    Идемпотентно: on conflict (org_id, slug) do nothing.
-- ─────────────────────────────────────────────────────────────────────────────
insert into menumaker.packet_sets (org_id, center_id, name, slug, kind, form_keys, status)
select o.id, null, s.name, s.slug, 'base', s.keys, 'active'
from core.organizations o
cross join (values
  ('Admission (Starter)','admission',         ARRAY['parent_consent','dcy_01234','enroll','iea','usda_waiver','child_release_authorization','parent_responsibilities','center_parent_info','what_to_bring_infant','dcy_01305','building_for_the_future','transition_into_program','wic_information','dcy_01218','infant_meals','special_diet','fluid_milk','topical_product_consent','dcy_01217','dcy_01236']::text[]),
  ('Infants',            'infant',            ARRAY['parent_consent','dcy_01234','enroll','iea','usda_waiver','child_release_authorization','dcy_01218','infant_meals','what_to_bring_infant','special_diet','fluid_milk','dcy_01305','center_parent_information','building_for_the_future','wic_information','start_form','parents_book_ack','parents_book']::text[]),
  ('Toddler / Preschool','toddler_preschool', ARRAY['parent_consent','dcy_01234','enroll','iea','usda_waiver','child_release_authorization','transition_into_program','special_diet','fluid_milk','dcy_01305','center_parent_information','building_for_the_future','wic_information','start_form','parents_book_ack','parents_book']::text[]),
  ('School-Age',         'school_age',        ARRAY[]::text[])
) as s(name, slug, keys)
on conflict (org_id, slug) do nothing;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками (фактические значения впишутся после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. select relrowsecurity from pg_class where oid='menumaker.packet_sets'::regclass;  -- t
-- R2. select policyname,cmd,permissive from pg_policies
--       where schemaname='menumaker' and tablename='packet_sets' order by policyname;    -- 5 политик
-- R3. select name,slug,kind,status,center_id,cardinality(form_keys) n,form_keys
--       from menumaker.packet_sets where kind='base' order by slug;                      -- 3 строки на орг
-- R4. эквивалентность (infant=18, toddler_preschool=16) — match=true.
-- R5. select has_table_privilege('anon','menumaker.packet_sets','select'),
--            has_table_privilege('anon','menumaker.packet_sets','insert');               -- false,false
-- R6. инвариант скоупа: 0 нарушителей.
