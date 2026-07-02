-- Distinguish app-captured signatures from paper ones the office enters by hand.
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-02.
alter table menumaker.safepass_agreements
  add column if not exists source text not null default 'app'
  check (source in ('app','paper'));
