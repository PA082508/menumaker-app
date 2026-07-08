-- ADD CHILD 2.0 — admission audit log (П.0, Nikolay 2026-07-08).
--
-- The search-first "Add Child" router, on finding a returning/inactive/stub
-- child, offers "Reactivate & admit": the director sets an admission date, we
-- clear date_out / set is_active, AND record who/when + a snapshot of the
-- document checklist that justified the admission. That snapshot is the LEGAL
-- basis-of-admission evidence for review — mandatory (Nikolay).
--
-- No dedicated audit table exists; the house pattern is an append-only JSONB
-- log (mirror of income_eligibility.determination_log). One column on roster,
-- appended client-side via the admitChild() helper under the same RLS the rest
-- of enrollmentApprove.ts roster writes use — no new RPC.
--
-- Entry shape: { at, by, by_name, from_state:{is_active,date_out}, attested,
--                checklist_snapshot:[{slug,title,status,onFileDate,validUntil}] }
--
-- Additive & backward-compatible: default '[]' so existing rows and any code
-- that ignores the column are unaffected.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-08.

alter table menumaker.roster
  add column if not exists admission_log jsonb not null default '[]'::jsonb;
