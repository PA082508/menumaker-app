---
title: Weekly Attendance Report
module: attendance
order: 7
roles: [director, office_manager, admin]
icon: 🖨️
# video: <url>   # shot-list: docs/videos/attendance-blank-shotlist.md
---

# Weekly Attendance Report

Print the week's attendance sheet for a classroom. The numbers, names, dates of birth
and scheduled hours are filled in for you; **Mon–Fri in/out stay empty** — the room
writes those by hand, the way it always has.

This is the same sheet your centers already use, printed from your own roster instead
of retyped. **DCY 01208 is the compliance reference, not the template** — the sheet is a
replica of the form that passed inspection unremarked.

## Print a sheet

**Reports → Attendance Blank.**

1. Pick the **classroom**.
2. Pick the **week** — any date; it snaps to that week's Monday.
3. Press **🖨 Print blank**. A print window opens with the sheet ready.

Children are listed **oldest first** — the same order as every other printed CACFP form,
and the same order as your sample sheet.

## What fills itself, and what doesn't

| Column | Comes from |
|---|---|
| # · Child's Name · DOB | the roster — active children of that classroom |
| **Schedule Hours** | the child's schedule (Children → the child → **Enrollment**) |
| Mon–Fri **in / out** | nobody — the room writes these by hand |
| Teacher(s) | staff assigned to that room; blank if none, so the room can write it |

## If a child's Hours cell prints empty

That child has no schedule on file. The page tells you how many before you print:
*"3 of 10 children have no schedule on file."*

**Fix it once and it stays fixed:** Children → open the child → **Enrollment** tab →
*Attendance schedule* → tick the days, set arrival and departure → **Save schedule**.
The next sheet prints it.

Every change is dated and records who made it. **Sheets you already printed do not
change** — a printed sheet keeps the schedule it was printed with, which is what makes it
evidence.

## Good to know

- **Weekday spelling.** The original sheet has *Wen* and *The*; the printed one says Tue
  and Thu. The structure is the canon — the typos are not.
- **The sheet is a snapshot.** Print it Monday and the week's roster is fixed on paper. A
  child admitted Wednesday is not on it — write them in, or print a fresh sheet.
- **Nothing is recorded by printing.** This page only reads. Attendance itself is still
  the paper sheet until the tablet screen ships.

## Coming next (not built yet)

The tablet screen — the same grid, tapped in the room instead of written, with SafePass
drop-off and pick-up times filled in automatically and the teacher confirming them. Until
then this printed sheet **is** the attendance record. See
`docs/specs/attendance-module-spec.md`.
