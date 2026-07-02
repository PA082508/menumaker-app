---
title: Import Children
module: children-import
order: 5
roles: [director, office_manager, admin]
# video: <url>   # (Stage 2) short walkthrough
---

# Import Children

Bulk-load or refresh the roster from a **Brightwheel** export. Open it from
People → Import Children (`/children/import`).

## The Brightwheel template

- Export your school roster from Brightwheel as CSV.
- Brightwheel lists names **First Last**; the importer stores `first_name` and
  `last_name` in their own columns and sets the denormalized
  `child_name = "Last First"`. Name **order is normalized on import** — the database
  always holds the structured fields correctly.
- Map the columns as prompted, then preview before committing.

## Idempotent — safe to re-run

The import is **idempotent**: running it again with an updated file does not create
duplicates.

- Existing children are matched and updated in place; only genuinely new children
  are inserted.
- Re-importing the same file changes nothing.
- This makes it safe to re-run whenever Brightwheel changes (new enrollments,
  corrections) — you always get the current roster without cleanup.

## Sources & fiscal rows

Imported roster rows are tagged by **source** so operational, food-import, and
fiscal/departed rows can be told apart and cleaned up in one query. Fiscal /
income-eligibility snapshots are imported separately and keyed uniquely per child
and fiscal year. See `docs/import-alpha-pearl-plan.md` for the full data rules.
