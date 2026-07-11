-- Meal-count OFFLINE queue — point-of-service audit log + sync RPC (PWA Ф2).
--
-- Boevaya potrebnost: a center loses WiFi for a whole day and teachers still
-- must mark meal counts. Marks are queued on-device (IndexedDB via localForage,
-- src/lib/mealMarkQueue.ts) and drained when connectivity returns.
--
-- CACFP requires the POINT-OF-SERVICE time — when the meal was actually served
-- on the device — NOT the (possibly hours-later) sync time. The weekly grid
-- menumaker.meal_week_records is a WIDE table (one smallint cell per day×slot,
-- e.g. mon_b) with only a row-level updated_at, so it has nowhere to record a
-- per-mark timestamp. This migration adds an append-only audit log that keeps
-- BOTH marked_at (device POS time) and synced_at (server receive time), keyed
-- by the client-generated queue uuid so a re-sync can never create duplicates.
--
-- The grid remains the claim/display aggregate; the log is the POS evidence.
--
-- sync_meal_marks(jsonb) is the single writer the drain calls. SECURITY INVOKER
-- (default): it runs as the caller so the SAME org-isolation / cacfp-module RLS
-- that already guards meal_week_records applies to both the grid merge and the
-- log insert — no privilege escalation, no re-implemented auth. The grid merge
-- touches ONLY the one cell + updated_at on conflict, so it never clobbers a
-- director-approved status or another device's cells.
--
-- Idempotency guarantees (offline re-sync safety):
--   • grid row  → UNIQUE (classroom_id, child_name, monday_date), upsert merge
--   • audit row → PRIMARY KEY (id = queue uuid), ON CONFLICT DO NOTHING
--
-- LIVE-DB PROTOCOL (Nikolay): prepare only. Apply by hand + read-back, like
-- 20260710b. NOT applied by Claude via MCP.

-- ── 1. Append-only point-of-service audit log ─────────────────────────────────
create table if not exists menumaker.meal_count_marks (
  id           uuid        primary key,                    -- client queue uuid
  center_id    uuid        not null,
  classroom_id uuid        not null,
  roster_id    uuid,
  child_name   text        not null,                       -- identity/join key
  monday_date  date        not null,
  day          text        not null,                       -- 'mon'..'fri'
  slot         text        not null,                       -- breakfast|am_snack|lunch|supper
  col          text        not null,                       -- physical grid column, e.g. 'mon_b'
  value        smallint    not null,                       -- 0 | 1 (final state at POS)
  marked_at    timestamptz not null,                       -- DEVICE point-of-service time
  synced_at    timestamptz not null default now(),         -- server receive time
  source       text        not null default 'app_offline',
  device_id    text,
  org_id       uuid        default core.current_org(),
  created_at   timestamptz not null default now()
);

create index if not exists meal_count_marks_class_week_idx
  on menumaker.meal_count_marks (classroom_id, monday_date);
create index if not exists meal_count_marks_roster_idx
  on menumaker.meal_count_marks (roster_id);

-- ── 2. RLS — mirror meal_week_records exactly (org isolation + cacfp module) ───
alter table menumaker.meal_count_marks enable row level security;

drop policy if exists org_isolation        on menumaker.meal_count_marks;
drop policy if exists module_cacfp_active   on menumaker.meal_count_marks;
drop policy if exists auth_manage           on menumaker.meal_count_marks;

create policy org_isolation on menumaker.meal_count_marks
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));
create policy module_cacfp_active on menumaker.meal_count_marks
  for all using (core.org_has_module('cacfp', org_id)) with check (core.org_has_module('cacfp', org_id));

-- Append-only for the app: teachers/cooks SELECT + INSERT; no UPDATE/DELETE.
grant select, insert on menumaker.meal_count_marks to authenticated;
grant select on menumaker.meal_count_marks to anon;

-- ── 3. sync_meal_marks — the single drain writer (grid merge + audit append) ──
create or replace function menumaker.sync_meal_marks(_marks jsonb)
returns void
language plpgsql
security invoker
set search_path = menumaker, public
as $$
declare
  m jsonb;
  _col text;
  _allowed_cols constant text[] := array[
    'mon_b','mon_as','mon_l','mon_ps','mon_su','mon_es',
    'tue_b','tue_as','tue_l','tue_ps','tue_su','tue_es',
    'wed_b','wed_as','wed_l','wed_ps','wed_su','wed_es',
    'thu_b','thu_as','thu_l','thu_ps','thu_su','thu_es',
    'fri_b','fri_as','fri_l','fri_ps','fri_su','fri_es'
  ];
begin
  for m in select * from jsonb_array_elements(_marks)
  loop
    _col := m->>'col';
    -- Whitelist the column name — it is interpolated into dynamic SQL below.
    if _col is null or not (_col = any(_allowed_cols)) then
      raise exception 'sync_meal_marks: invalid column %', _col;
    end if;

    -- (a) Merge the one cell into the weekly grid. INSERT establishes row
    --     identity; ON CONFLICT updates ONLY this cell + updated_at, so status,
    --     director_initials and sibling cells are never touched.
    execute format(
      'insert into menumaker.meal_week_records
         (center_id, classroom, classroom_id, roster_id, child_name, monday_date, %1$I, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7, now())
       on conflict (classroom_id, child_name, monday_date)
       do update set %1$I = excluded.%1$I, updated_at = now()',
      _col
    )
    using
      (m->>'center_id')::uuid,
      m->>'classroom',
      (m->>'classroom_id')::uuid,
      nullif(m->>'roster_id','')::uuid,
      m->>'child_name',
      (m->>'monday_date')::date,
      (m->>'value')::smallint;

    -- (b) Append the point-of-service audit record. Idempotent by queue uuid.
    insert into menumaker.meal_count_marks
      (id, center_id, classroom_id, roster_id, child_name, monday_date,
       day, slot, col, value, marked_at, source, device_id)
    values
      ((m->>'id')::uuid, (m->>'center_id')::uuid, (m->>'classroom_id')::uuid,
       nullif(m->>'roster_id','')::uuid, m->>'child_name', (m->>'monday_date')::date,
       m->>'day', m->>'slot', _col, (m->>'value')::smallint,
       (m->>'marked_at')::timestamptz, coalesce(m->>'source','app_offline'), m->>'device_id')
    on conflict (id) do nothing;
  end loop;
end;
$$;

grant execute on function menumaker.sync_meal_marks(jsonb) to authenticated;

-- ── VERIFY (run after apply) ──────────────────────────────────────────────────
-- select to_regclass('menumaker.meal_count_marks');                 -- table exists
-- select proname, prosecdef from pg_proc where proname='sync_meal_marks';  -- f = invoker
-- \d menumaker.meal_count_marks
