-- Deactivate child — audit columns.
--
-- The app now has an explicit Deactivate action (ChildSettingsPage): sets
-- roster.is_active=false (+ date_out if unset) so departed children stop being
-- countable in meal count and reports (all of which filter is_active=true).
-- Previously the office flipped is_active via raw SQL with no audit trail.
--
-- These nullable columns capture who/why/when for the optional reason and a
-- reactivation-safe timestamp. No backfill here.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-03.
alter table menumaker.roster
  add column if not exists deactivated_at     timestamptz,
  add column if not exists deactivation_reason text;
