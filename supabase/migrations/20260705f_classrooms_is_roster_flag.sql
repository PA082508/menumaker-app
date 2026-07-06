-- Pseudo-classes like "Staff" / "Staff Room" hold adult employees (mis-filed as
-- children on import), which inflates the child roster: TOTAL capacity, listed
-- count, Fill%, and any CACFP meal/claim math derived from the roster.
--
-- Add an is_roster flag so these classes (and their records) can be excluded
-- from the children roster everywhere, WITHOUT deleting anything. Records inside
-- are left untouched — a possible later migration to a staff table is a separate
-- decision. Default true so every real classroom keeps counting.

alter table menumaker.classrooms
  add column if not exists is_roster boolean not null default true;

comment on column menumaker.classrooms.is_roster is
  'When false, this is a non-child pseudo-class (e.g. Staff) — excluded from the child roster, TOTAL/Fill%, and CACFP roster counts. Records are not deleted.';

-- Flag the existing Staff pseudo-classes across all centers (Pearl "Staff",
-- Alpha "Staff Room", Ridge "Staff"/"Staff Room").
update menumaker.classrooms
set is_roster = false
where name ilike '%staff%';
