-- Versioned, immutable published snapshots of the official monthly menu form.
-- Distinct from monthly_menus (one mutable row per month = plan/approval state).
-- Re-publishing the same month inserts a NEW version; old versions are kept.
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-02.
create table menumaker.published_menus (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default core.current_org() references core.organizations(id),
  program      text not null default 'child' check (program in ('child','infant')),
  center_id    uuid not null references menumaker.centers(id),
  cycle_id     uuid references menumaker.menu_cycles(id),
  year         int  not null,
  month        int  not null check (month between 1 and 12),
  version      int  not null,
  -- resolved data the OfficialMenu component renders:
  -- { centerName, cycleStart, totalWeeks, lookup, holidayByDate }
  snapshot     jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  unique (program, center_id, year, month, version)
);

create index published_menus_lookup_idx
  on menumaker.published_menus (program, center_id, year, month, version desc);

alter table menumaker.published_menus enable row level security;

-- Match the conventions on monthly_menus / holidays.
create policy org_isolation on menumaker.published_menus
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

create policy module_cacfp_active on menumaker.published_menus
  for all using (core.org_has_module('cacfp', org_id)) with check (core.org_has_module('cacfp', org_id));

create policy manage_published_menus on menumaker.published_menus
  for all using (menumaker.get_user_role() = any (array['director','office_manager']))
  with check (menumaker.get_user_role() = any (array['director','office_manager']));

-- Broad read (parent / website facing), same as read_monthly_menus.
create policy read_published_menus on menumaker.published_menus
  for select using (true);
