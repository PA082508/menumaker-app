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

**Name search (center roster).** The roster toolbar groups the **search box** and
**➕ Add Child** together on the right (Cards **and** List). Type any part of a name
and the list filters instantly (client-side, no reload). Matching is case- and
accent-insensitive and works in either order — *"Kendzierski Colton"*, *"colton"*,
and *"kendz"* all find the same child.

Search **always spans active *and* inactive** children (placeholder: *"Search active
& inactive children…"*). Inactive matches appear **dimmed with a red `INACTIVE`
badge**, so a departed child is easy to find and reopen without cluttering the normal
view. While searching, the **class filter is ignored** (the search spans every class
in the center) and is dimmed; the **"N listed"** count reflects the matches. **Esc**
clears the search; **CSV/Print** export the filtered result.

The normal (no-search) roster shows **active children only** — there is no separate
Active/Inactive tab.

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

## Add / Deactivate / Reactivate a child

Three everyday roster actions. All three keep the **same roster row** — reactivation
never creates a duplicate.

### 1. Add a child

Press **➕ Add Child** (top-right of the roster). Fill first/last name, birthday,
classroom, Date In and meal status (FRP) → **Add Child**. The new card flashes and
scrolls into view; its room auto-opens. If it lands outside the current search/class
filter, a toast confirms which classroom it went to.

> Children added here start with the **minimum** fields. The rest of the record
> (health, emergency, documents) is filled later — often automatically when the
> family's **paper enrollment form is scanned in** (Enrollment Inbox), which the
> duplicate detector matches back onto this same child.

### 2. Deactivate a child (when they leave)

**Deactivate** them so they stop being counted in **meal count and every report** —
do this instead of just typing an End date.

- **From the profile:** open the child → **END DATE (Deactivate)** on the Profile
  tab, or the **Deactivate** button on the record. Confirm; the End date is set (to
  today if left blank) and the child is made inactive.
- **From search:** type the child's name, then use the **⏻ Deactivate** action on
  their search-result card (it jumps to the same END DATE field).
- Normal roster cards intentionally show only **🚨 Emergency** and **⚙️ Settings** —
  there is no Deactivate button on them, so no child is ever deactivated by accident.

A deactivated child disappears from the normal roster and from meal count / reports
immediately, and shows a red **INACTIVE** badge in search results.

> **Why this matters (CACFP):** meal count and claim reports include every child
> that is *active*. An End date alone does **not** remove a departed child from the
> count — only Deactivate does. Leaving a departed child active risks claiming
> meals for a child who is gone.

### 3. Reactivate a child (when they come back)

Search their name (search spans inactive children) → **↩ Reactivate** on the dimmed
search-result card. A dialog asks for a **new start date**:

- The new start date **must be after** the recorded End date (the field guards this).
- On confirm, the row's **End date is cleared**, **is_active** flips back on, and
  **Date In** is set to the new start date — the child counts again from that day.

Because it is the **same row**, all their history, documents and settings are intact.

## When a child leaves one center for another

**Play Academy does not transfer children between centers.** A child **leaves** one center and
**enrolls** at the other, exactly as any child starting somewhere new. There is no "move" button
and there will not be one — a placement is not a row that gets dragged across, it is an
enrollment at a licensed site.

### The center they are leaving

**Deactivate the child and enter their last day** — the same dialog that asks for the date on
the withdrawal record. This is the center's own record of when they stopped attending; it does
**not** need a parent's signature.

### The center they are joining

**Enroll the child in the system on their first day.** Until you do, they do not appear on that
center's meal count sheet, and the meals they eat that day are not recorded. The parent signs
the enrollment forms in the morning, so there is nothing to wait for — enroll them straight away.

The parent signs the **enrollment forms on the first day**, the same as for any new child, and
the paper goes into **this center's** folder.

This is not paperwork for its own sake. **DCY 01234 must be held at the center it would be picked
up from in an evacuation**, so the receiving center needs its own signed copy — a copy sitting in
the other center's filing cabinet is not available when it is needed.

### Changing a classroom asks for a document

If you change a child's classroom, the system will refuse and ask for a signed document.
**This is the software working as intended, not a fault.** A child's placement decides claim
boundaries and room ratios, so it changes only from a signed form — and the record is then dated
with **the date printed on that form**, not the day you typed it.

### Meal counts stay where the meals were served

Meals already recorded stay with the center that served them. They are **not** moved with the
child, and nothing needs to be done about them.

### While the forms are still being signed

The first day may run on paper. That is normal — the electronic record catches up afterwards,
from the signed form and its own date. Nothing is lost by the delay.

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
