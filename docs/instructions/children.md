---
title: Children
module: children
order: 4
roles: [director, office_manager, admin]
# video: <url>   # (Stage 2) short walkthrough
---

# Children

The Children area is the roster of enrolled children and each child's full record.
Names are always shown **Last First** (CACFP canonical) regardless of how they were
imported.

## Smart List

The **Children** page (People → Children) is a searchable, filterable Smart List of
the roster:

- **Search** by name; **filter** by center/classroom and status.
- Sorted **alphabetically** (last name, first name) for enrollment contexts.
- Each row opens that child's **Settings** record.

**Name search (center roster).** The roster toolbar (Cards **and** List) has a
**Search name…** box: type any part of a name and the list filters instantly
(client-side, no reload). Matching is case- and accent-insensitive and works in
either order — *"Kendzierski Colton"*, *"colton"*, and *"kendz"* all find the same
child. While searching, the **class filter is ignored** (the search spans every
class in the center) and is dimmed; the **"N listed"** count reflects the matches.
**Esc** clears the search; **CSV/Print** export the filtered result.

## Child Settings — tabs, ★ and badges

Open a child to edit their full record. Fields are driven by a central **field
registry** (one source of truth), grouped into tabs (Enrollment, Health, Emergency,
Documents, …):

- **★ starred fields** are required for that child to be considered complete.
- **Tab badges** show completeness — a tab flags how many required fields are still
  missing, so you can see at a glance what's outstanding.
- Conditional fields appear only when relevant (e.g. `evacuation_notes` shows under
  Health when applicable).

## Entering dates

Date fields (Birthday, Date In, …) use your device's **date picker**, so the year
is always complete. Where a date is ever typed as **text**, the app accepts a
**2-digit year** and fills the century for you on the way out of the field —
`7/2/26` becomes `07/02/2026` (years `00–49` → 2000s, `50–99` → 1900s), and `/`,
`-`, or no separators all work. An impossible date (e.g. `2/29` in a non-leap year)
is gently highlighted and left for you to fix — your typing is never erased.
*(Engineering rule: platform-standards §6.)*

## Deactivating & reactivating a child

When a child leaves, **deactivate** them so they stop being counted in **meal count
and every report** — do this instead of just typing an End date.

- Open the child → the **Deactivate** button (bottom-left of the record). Confirm;
  you may add an optional **reason** (withdrew, moved, aged out…). This sets the
  child inactive and, if it isn't already filled, stamps **End date = today**.
- A deactivated child disappears from the normal (Active) roster and from meal
  count / reports immediately. The record shows a red **INACTIVE** badge.
- To find or restore them, switch the roster toolbar to the **Inactive** tab. Each
  card has **↩ Reactivate** (or open the child and press **Reactivate**), which
  clears the End date and makes them countable again.

> **Why this matters (CACFP):** meal count and claim reports include every child
> that is *active*. An End date alone does **not** remove a departed child from the
> count — only Deactivate does. Leaving a departed child active risks claiming
> meals for a child who is gone.

## Emergency

The **Emergency** tab holds the information needed in an incident — emergency
contacts, authorized pickup persons, medical/allergy notes, and evacuation notes.
Keep these current; several are ★ required.

## Documents

The **Documents** tab stores each child's files (enrollment forms, income
eligibility, medical/immunization records). Upload, view, and track which required
documents are on file.

## Export

Use **Export** to download the roster (or a filtered subset) for reporting — e.g.
CACFP or licensing. Exports respect the current center/classroom filter.

> Names export and display as **Last First**; the stored `child_name` remains the
> join key into records tables — only the label order changes.
