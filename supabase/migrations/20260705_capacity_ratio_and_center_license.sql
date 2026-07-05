-- Capacity & Ratio rework (2026-07-05)
-- classrooms: actual children-per-teacher ratio. NULL = use the Ohio maximum for
-- the room's age_group. A set value must be <= Ohio max (stricter only; enforced
-- in the UI). Keeps capacity_internal (Seats / plan) separate from ratio.
alter table menumaker.classrooms
  add column if not exists ratio_actual integer;

-- centers: DCY license totals live at the CENTER level (not per room). DCY caps
-- the max children under 3 and the max children 3+. NULL = not entered.
-- NOTE: legacy license_capacity (total) / license_capacity_under2 (under-2) already
-- exist on centers (edited in Center Info) with a DIFFERENT split — reconcile later.
alter table menumaker.centers
  add column if not exists license_under3_max integer,
  add column if not exists license_3plus_max integer;
