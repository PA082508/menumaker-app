---
title: Children — Full Guide
module: children-guide
roles: [director, office_manager, admin, owner]
audience: director
order: 5
icon: 👶
updated: 2026-07-22
---

# Children — Full Guide

The **Children** page is your roster and the four things you do around it. Along the top
sit four buttons — **➕ Add Child**, **📥 Enrollment**, **🗂 Packet Sets**, **⇪ Import**.
This guide covers all four.

**Two roles are called out throughout:**

- **[Director]** — a center director. You run your center's roster, packets and enrollment.
- **[GD]** — the **General Director (Owner)**, the organization-level role (at Play Academy,
  Tatiana). You can do everything a director can, plus a few org-wide things — editing the
  base "network standard", deciding which forms directors may use, and **all income**.

Both roles see the Children page. A few actions, and every income detail, are **[GD]** only —
the system enforces this, so you never have to remember it.

> 📷 _Screenshot: the Children page with the four buttons (Add Child · Enrollment · Packet Sets · Import) above the roster._

### At a glance

| Button | What it's for | [Director] | [GD] |
|---|---|---|---|
| ➕ Add Child | Send a family their enrollment packet (link / QR) | ✅ | ✅ |
| 📥 Enrollment | Review and approve what families send back | ✅ (no income) | ✅ (incl. income) |
| 🗂 Packet Sets | Build and share the packets themselves | own custom sets | base + all centers |
| ⇪ Import | Bulk-load a roster from a CSV | ✅ | ✅ |

---

## 1. Add Child — send a family their packet · [Director] [GD]

**➕ Add Child** opens a small window titled *"Add Child — enrollment packet,"* scoped to your
current center. It doesn't create a child record — it hands the family the forms to fill.

> 📷 _Screenshot: the Add Child modal — the 2×2 set grid at top, form list below, "Open packet / Copy link / QR" row at the bottom._

**Pick a packet set (2×2):**

| Set | Use it for |
|---|---|
| **Starter** *(default)* | A brand-new family — filled anonymously, on-site or on their phone |
| **Toddler / Preschool** | A returning child — addressed |
| **Infants** | A returning child — addressed |
| **School-Age** | A returning child — addressed |

- **The forms in a set are fixed by the set** — there are no checkboxes to tick a subset. A
  director combines *ready* sets; the composition and order are decided in Packet Sets (§3).
- Each set gives you three ways to share the **whole packet**: **Open packet ↗**, **Copy link**,
  and a **QR** (scan or screenshot). The link is permanent and carries your center
  (`?center=…`), so **families never have to pick a center**.
- Each form in the list also has its **own mini-QR** — for handing out a single form. A scan
  always opens the current version of that form. Forms meant to be printed show **🖨 Print**
  instead; forms not built yet show a greyed **"coming soon"** row.
- **Returning family?** Use search (it includes archived children) to find them and send an
  **addressed** packet — same mechanism; it arrives for them under *Resume Family*.

---

## 2. Enrollment — review what comes back · [Director] [GD]

**📥 Enrollment** opens your inbox: a list of **submission cards**, one per form a family
submitted, newest first, scoped to your center (or org-wide in Organization view).

> 📷 _Screenshot: the Enrollment inbox — tab row across the top, a submission card with its status light and Review button._

**Tabs:**

- **Needs a person** — pending submissions waiting for you to act.
- **Awaiting director signature** — appears only when something needs your countersignature. **[Director]**
- **Filed automatically** — forms the system already filed; no action needed.
- **All** — everything.

A **child-name search** narrows the list. Each card shows a status light — **🟢 Ready ·
🟡 Warnings · 🔴 Incomplete · ⚪ Unvalidated** — a source tag **🌐 Online / 📷 Paper**, and
flags like **NEW**, **✓ Filed automatically**, **📎 Scan**, **⚠️ OCR failed**.

**Reviewing (open a card → Review):**

- You see the submission **side by side** with the current record. A scanned form shows the
  photo, with any low-confidence reading marked **🔍 verify**.
- Fix a parent's typo inline and **Save edits** — this corrects the submission (with a log);
  it does **not** touch the roster.
- **Sign / countersign** where required, then **Approve** (Approve writes the roster/record and
  offers a 10-second **Undo**). **Reject** needs a reason.
- A **"Registration fee received"** checkbox appears on the Start Form and Parent Consent.

**Your countersignatures · [Director]:** two documents come to you to sign —
**DCY 01234 (Child Enrollment & Health)** and the **Start Form**. Your saved signature applies
with one tap (or you draw it once). A signature is never written twice.

### Income — who sees what

- **[Director]:** you never handle income. Income applications (IEA / income waiver) **don't
  appear in your inbox** — the system routes them to the General Director. Wherever a child's
  income status shows on the family's record, you see only a content-free chip —
  **💲 Income determination — on file** — with **no amounts and no Free/Reduced/Paid, ever**.
  This is enforced by the system, not left to you to remember.

- **[GD]:** income is yours. Open the income submission — the **F/R/P category is pre-filled**
  from the application (you can override Free / Reduced / Paid). **Apply your saved signature**
  (optional — the determination is recorded under *your name*; the signature image is not the
  authority). **Approve.**
  **The 12-month term runs from the household's _signature date_ — not the day you approve**
  (it ends on the last day of that month, one year on). If the paper was signed more than a
  month ago, an amber note shows how much of the year has already elapsed and lets you adjust
  the expiry — that note is informational, it never blocks Approve.

> 📷 _Screenshot: [GD] IEA review — F/R/P selector, "Apply my signature", the signature-date term note._

#### Entering a paper IEA · [GD]

1. Open the online IEA form and **retype the household's answers from the paper.**
2. In the *date signed* field, enter the **signature date written on the paper — _not_ today's
   date.** This sets the 12-month term. Leaving it as today makes the term wrong (too long).
3. **Submit** — it lands in your inbox only. Open it and **Approve**; the expiry computes from
   the signature date (adjust it if the "signed over a month ago" note appears).
4. **Keep the signed paper on file** — the online entry is just its transcription.

---

## 3. Packet Sets — build & share the packets · [Director] [GD]

**🗂 Packet Sets** is where the packets themselves are built. A *set* is a named list of forms
with a permanent QR.

> 📷 _Screenshot: the Packet Sets builder — set list on the left (Base + your center), composition editor and Add-from-library on the right._

- **What you see:** the **Base "network standard"** sets (Admission / Infants / Toddler-Preschool
  / School-Age) plus your center's **custom** sets.
- **[Director]:** Base sets are **view-only** for you — you build and edit your **own custom**
  sets. **[GD]:** you edit the base composition (the network standard) and every center's custom
  sets. Base sets can never be archived.
- **＋ New set** — creates a custom set for your center (in Organization view, **[GD]** picks the
  center). It starts empty.
- **Rename / Archive** — custom sets only. Nothing is ever hard-deleted; an archived set steps
  aside and **its QR still works**. Base sets show no rename/archive control.
- **Add from library** — the whole forms library, with a **section filter and search**. A form
  that isn't built yet is greyed **"not published"** and can't be added. A form the office has
  **closed** to directors simply isn't listed (the default is *open*). A form already in a set
  is never pulled out — closing only stops it being newly added.
- **Permanent QR** — each set has a stationary QR. **Editing a set never changes its QR** — the
  same printed code always serves whatever is currently saved.

**Deciding which forms directors may use · [GD]:** you control which library forms a director
can put into their own sets. The **open / closed** switch (**👁 / 🚫**) is on each form's card in
**Documents → Library** — **General-Director-only**. The default is **open**; you close the few
you want to hold back. A closed form disappears from a director's *Add from library* (it is not
greyed — greying means "not built"). Your base sets are unaffected: a closed form still lives in
them and still reaches families through those packets.

---

## 4. Import — bring in a roster · [Director] [GD]

**⇪ Import** bulk-loads children from a **CSV** (a Brightwheel *"School Roster"* export is the
expected source). It moves through four steps, with a **History** tab alongside.

> 📷 _Screenshot: Import — the Map-columns step (CSV column → destination field, required fields marked *)._

1. **Upload** — drop a `.csv` (or click to browse). **The first row must be the column headers.**
2. **Map columns** — each CSV column maps to a destination field (child, medical, household).
   Required fields are marked **\***; unwanted columns can be **"— skip —"**. You can **save the
   mapping as a template** and reuse it next time. *Preview* stays disabled until every required
   field is mapped (a yellow note names what's missing).
3. **Preview** — the first rows rendered through your mapping, so you can sanity-check before
   committing.
4. **Import → Result** — shows **loaded** vs **skipped**, with a review table of every skipped
   row and why.

- **De-duplication is automatic:** re-importing the same file **updates** existing children,
  households and guardians rather than doubling them. Rows **missing a name are skipped**; two
  children with the same **name + birthdate** are flagged for you to check.
- **History** lists past imports — date, file, counts, and per-row errors.
- **After import**, linking children into a classroom roster is a **separate step**.
- There's **no sample file to download** — any headers work; you map them in step 2.

---

## If something looks wrong

- **A form shows "no link" or "coming soon"** — it isn't built yet; it can't be shared until it is.
- **A family can't open a link** — make sure a center is selected; links carry `?center=…`, and an
  Organization-view link has no center on it.
- **A form is missing from *Add from library*** — either the office has **closed** it (**[GD]**:
  Documents → Library), or it isn't built yet (greyed **"not published"**).
- **Import's *Preview* is greyed out** — a required column isn't mapped; the yellow warning names it.

## What the system never does

- It **never** shows a director income amounts or Free/Reduced/Paid — only *"on file."*
- It **never** changes a set's QR when you edit the set.
- It **never** hard-deletes a set — archive only.
- It **never** writes a signature twice.
