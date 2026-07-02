-- Versioned policy documents (SafePass addendum, BYOD, etc.) — the source of truth
-- for the versions that acknowledgment tables (e.g. safepass_agreements.document_version)
-- bind to. Two-step lifecycle per docs/instructions/policies-handbook.md:
-- draft -> announced (notice given) -> active (enforced); superseded versions kept.
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-02.
create table menumaker.policy_documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default core.current_org() references core.organizations(id),
  key           text not null,                 -- e.g. 'safepass_addendum', 'byod'
  version       text not null,                 -- e.g. '1.0'
  title         text not null,
  body          text,                          -- policy text (markdown/html); may be filled later
  status        text not null default 'draft'
                  check (status in ('draft','announced','active','retired')),
  effective_date date,
  announced_at  timestamptz,                   -- two-step: step 1 (notice given)
  activated_at  timestamptz,                   -- two-step: step 2 (enforced)
  supersedes    uuid references menumaker.policy_documents(id),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (org_id, key, version)
);

create index policy_documents_lookup_idx
  on menumaker.policy_documents (org_id, key, status, version);

alter table menumaker.policy_documents enable row level security;

create policy org_isolation on menumaker.policy_documents
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

create policy manage_policies on menumaker.policy_documents
  for all using (menumaker.get_user_role() = any (array['director','office_manager']))
  with check (menumaker.get_user_role() = any (array['director','office_manager']));

create policy read_policies on menumaker.policy_documents
  for select using (true);

-- First record: SafePass addendum v1.0 (binds safepass_agreements.document_version = '1.0').
-- Body is a placeholder pending the authoritative addendum text.
insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'safepass_addendum', '1.0',
  'SafePass Parent/Teacher Addendum',
  '[Authoritative addendum text pending.]',
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;
