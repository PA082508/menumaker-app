---
title: Menu Planner
module: menu
order: 3
roles: [director, cook, teacher, admin]
# video: <url>   # (Stage 2) short walkthrough — YouTube embed or org-files mp4
---

# Menu Planner

The Menu Planner is the org-wide plan of what children eat, laid out as a grid of
**days × meals** for each week of the menu cycle. Open it from **Planning → Menu
Planner** (`/menu`).

## Reading the grid

- Columns are the five weekdays (**Mon–Fri**); rows are the four meals
  **Breakfast · AM Snack · Lunch · Supper**.
- Each cell lists the dishes planned for that meal on that day. A **coloured dot**
  and **bold green text** mark a dish that is linked to a Recipe; plain-text items
  show without a dot.
- Each meal has its own colour and a thick, contrasting border so the four meals
  read apart at a glance. Dish names are sized for legibility on screen and on a
  wall print.
- The **Week 1 / Week 2 …** buttons switch between the weeks of the cycle. The
  **legend** and the **summary bar** at the bottom count items and days per meal.

## Cycle start (Week 1 Monday)

The **"Cycle starts (Week 1 Mon)"** date at the top right anchors the rotation to
the real calendar. Set it to the Monday that Week 1 begins. Everything that maps
weeks to dates — the little `M/D` under each day header, and the Official Print
form below — depends on this anchor. The rotation then **continues across months**:
if the cycle is four weeks long, a new month can begin on any of Week 1–4.

## Holidays & short days

Closures come from the shared **holidays** table (per center) and surface here for
planning awareness:

- **Holiday** (`type = holiday`) → the day column is greyed and marked **CLOSED**;
  no meals are expected.
- **Short day** (`type = short_day`) → the day header shows **CLOSES HH:MM**, and
  meal slots that start at or after the close time are shown as **after-close**.

The **"Upcoming closures"** strip lists the next holidays and short days so you can
plan menus around them.

## Official Print (monthly CACFP menu form)

The **📄 Official Menu (Month)** button (next to *Print Week*) opens the official,
parent- and report-ready menu form for a whole month, styled as the standard CACFP
weekly menu.

- **Route:** `/menu/print-official/:center/:year/:month`.
- **Per center.** The form prints for one center — holidays and short days are taken
  from **that center's** closures. From the planner, the button uses your currently
  selected center (Organization view falls back to the first center).
- **A month = 4–6 weekly pages.** Weeks are anchored to the cycle *Week 1 Monday*
  and the **Week 1–4 rotation continues across months** (e.g. July may open on
  Week 4). Days that belong to a neighbouring month still show their own date
  numbers (e.g. `29 30 | 1 2 3`); the reporting month is named in the header.
- **CACFP layout.** Each meal shows the required components (Milk, Meat &
  Alternates, Grain, Vegetable, Fruit, Extras, Notes) across the three age groups
  (1–2, 3–5, 6–12). Dishes drop into their component rows automatically from the
  plan. **Whole-grain** items are flagged **WG**.
- **Three report touches:**
  1. a green ribbon across the top — **Center · Month · Date 1 to `<last>`**;
  2. a **red month name** printed over the day where the month changes;
  3. a **full-height red column** reading **HOLIDAY: `<name>`** on any holiday —
     no dishes are printed for that day.
- **Output.** Click **🖨 Print / Save PDF** and choose *Save as PDF* in the print
  dialog. The page is laid out for **US Letter, landscape**, one week per page.

> **Publishing to parents / website (planned).** The saved PDF/HTML copy will be
> stored in **`published_menus`** (the same home used for the Head Start published
> artifacts) so a month's menu can be shared with parents or embedded on the site.
> Today the form is generated on demand and saved via the browser's *Save as PDF*.
