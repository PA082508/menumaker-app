# GatePulse — for directors

> **Rule #1 of this center: the safety of the child. Everything below exists for that rule
> alone.** It is also how you settle an argument about any of it: ask whether the change serves
> rule #1. Convenience, speed and habit are real arguments — right up to the line where they
> cost you the truth of who took a child and who handed them over.

**What you own: who has access, which tablets, and whether the record matches reality.**

---

## 1. Give a parent access — Issue

**SafePass → Register a parent's phone.** The list shows every pickup-authorized adult of your
center, with their number and how many children they have. Tap **Register** once, while the
person is in front of you — physical presence at your desk *is* the authorization; the tap
records who did it and when. *[built today]*

- **Revoke** kills app access on every device that person used and un-registers the number. They
  stay on the pickup list — this is the e-access lever, not the "may collect the child" lever.
  That one lives on the enrollment form / Family. *[built today]*
- **Non-parent pickup, or no smartphone:** the collapsed **one-time code** at the bottom. 6
  digits, 15 minutes, one use, read out loud — never sent by text. *[built today]*
- The org-level General Director sees this list for every center; a center director sees their
  own. *[built today]*

## 2. Tablets — Devices

**Settings → SafePass → Devices.** Every classroom tablet in one table: label, room, last seen,
status. *[ships with teacher release]*

- **Register new device** produces a one-time link/QR you open on the tablet once. The tablet
  then boots itself into its room; the raw token is never shown again and never lives in the
  address bar.
- **Revoke** kills a lost or retired tablet immediately; **Re-label** renames it.
- A tablet that hasn't been seen for a day is worth a look — it is usually a dead charger, not a
  dead feature.

## 3. The log, and the flags in it

**Where to look:** the room's own record is **SafePass → Teacher view → Today's Log** (pick the
room at the top of the screen) *[live]*; the whole-center log with the flags below — filterable
by room, day and flag — is **Settings → SafePass → Log** *[ships with teacher release]*.

Every handoff carries who confirmed it, at what minute, and **how** they were identified:

| Flag | Meaning |
|---|---|
| **tile** | Normal: a checked-in teacher tapped their own name. |
| **pin_fallback** | Nobody was checked in — confirmed with a staff PIN. Worth asking why. |
| **pin_strict** | Your center runs PIN-on-every-handoff. |

*[ships with teacher release]*

**Strict mode** is an org option (default **off**): when on, a PIN is required on every handoff
in addition to the name tile. Turning it off never deletes the PIN path — it stays as the
emergency route. *[ships with teacher release]*

## 4. Onboarding a family — the order that works

1. The child is on the roster and in a classroom.
2. The enrollment form lists the authorized adults **with their own phone numbers** — **one key per
   ADULT**: two adults never share a number, and one adult's number covers **all of their children**
   (they switch child on screen).
3. At the desk: **Register** each adult's number (§1).
4. Hand them the parent one-pager; watch them do **Add to Home Screen** once. That single step is
   what makes the next 200 pickups two taps.
5. Test one Drop Off together, and wait for the green ✅ with them.

## 5. The principle: the program reflects reality

**A teacher moved to another room is entered the same day — not at the end of the week.**

The record of who released a child is only as true as the room assignments behind it. GatePulse
therefore watches for the gap and tells you rather than hoping:

- **Smart reminder:** when a teacher checks into a room that isn't their assigned one — and
  especially when it repeats several days running — you get a named banner: *"Jane Miller has
  worked Red for 3 days but is assigned to Blue."* The banner is **actionable**: a **Reassign**
  button right inside it. *[ships with teacher release]*
- **One-gesture move:** change a teacher's classroom from the Staff page without leaving it.
  *[ships with teacher release]*

Reminders belong in the one Action Center with every other urgent task, not in a separate inbox.

## 7. Lunch breaks during nap time — what the rule actually allows

Ohio permits the staff/child ratio to be **doubled during nap**, which is what makes lunch cover
without a floater lawful. **OAC 5180:2-12-20(A)(7)**, effective 2026-07-01, verbatim: *"Ratio may
be doubled for no more than two hours during nap time, and shall only be doubled if all of the
children in the group are on cots or on mats, if the group does not include any infants and if
there are enough child care staff members in the building to meet staff/child ratio pursuant to
rule 5180:2-12-18 of the Administrative Code for the group."*

Read it as four conditions, all required: **children on cots/mats · two hours maximum · no
infants in the group · building-level staffing still meets the ordinary ratio.** Related floor,
from 5180:2-12-18: *"There shall be at least one other employee or child care staff member at the
center if there are seven or more children in the building."* Note that doubling the **ratio** is
not permission for one adult to hold a group of any size — a 1:12 room becomes 1:24, not 1:∞.

The same rule keeps the rest area **lighted for visual supervision at all times** and requires a
**clear path to each resting child**.

**In the app:** the teacher going on break checks out, the one returning checks in, so the tiles
match the room. A single tile during nap is expected. **The platform does not model the nap
exception yet** — Capacity & Ratio computes against the ordinary ratio only, so do not expect it
to know that a legally-staffed nap hour is legal. *[ships with teacher release]*

## 6. Your pocket

Every corrective gesture here is built **mobile-first for your iPhone** — reassign a teacher,
register a parent, revoke a tablet, read the log and its flags, act on a banner. You are on the
floor, not at a desk; the phone is where these decisions actually happen.
*[ships with teacher release]*
