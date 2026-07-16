---
length: 60s target (45s floor)
set: Play Academy Ridge (4aed7d5a-00d0-4a4c-ac99-311046ad2027, slug `ridge`)
source: docs/instructions/attendance.md
status: PLAN ONLY — nothing shot. Two blockers below need Nikolay's word before filming.
title: Shot-list — Weekly Attendance Report (the printable)
updated: 2026-07-19
video: series — shoot after E-Forms (#5)
---

# Shot-list — "Weekly Attendance Report" (60s)

**Voice:** Piper `en_US-amy-medium` — the series voice, decided 2026-07-15. Not re-opened.
Render through `scratchpad/synth.py` (brew espeak-ng + the voice's own ONNX); see the
`piper-tts-macos-broken` note before re-rendering any VO.

Screen 1280×800, cursor visible, no browser chrome. Callouts appear **as the click lands**,
not before. Subtitles are the VO verbatim — one line per shot, ≤11 words.

---

## ⚠️ This video's hard problem — read before planning the shoot

The E-Forms video could keep real children out of frame with a tight shot. **This one
cannot: the artifact IS a list of real children.** Name, date of birth and hours, ten rows
at a time, and the whole point of the shot is the filled sheet.

The rule does not bend — *no real child's name appears in the video; not blurred, **not
filmed***. So there are only two honest ways to shoot it:

**(A) A demo classroom — recommended.** Create `ZZ Demo Room` at Ridge with 5 demo children
carrying human names (Emma Carter, Noah Brooks, Ava Lindqvist, Liam Ortega, Mia Whitfield),
DOBs spread across a year so *oldest first* is visible, and schedules on 4 of the 5 — the
fifth prints an empty Hours cell, which is shot 05.

> **The classroom is the tag.** `roster` has no `form_data`, so a ZZSMOKE tag physically
> cannot reach a child — the same fact that forced the E-Forms video onto the `undo`
> closure. Here the container does the work: everything demo lives in one classroom, and
> cleanup is *delete the children of that classroom, then the classroom*. Nothing else can
> be caught by that delete, because nothing else is in the room.
>
> **This writes to the live DB → Nikolay's go, per the live-DB protocol.** Prepared, not
> applied: `supabase/migrations/20260720_demo_room_for_video.sql` (write it on the word).

**(B) No sheet on camera** — film only the picker and the print dialog. Cheaper, and it
shows nothing: the sheet is the product. **Not recommended.**

**Blocker 2 — I cannot shoot this.** The page needs a director login; I hold only the
per-centre cook service account, whose nav has no Reports (`/children` redirects to Meal
Count). Either a login for filming, or someone with one records against this list.

## Pre-flight

**Nothing to sweep from the app itself — this page only reads.** No submissions, no
tokens, no claim rows: `AttendanceBlankReport` issues two `select`s and opens a print
window. The E-Forms ZZSMOKE ritual does not apply here.

The only live-DB footprint is the demo classroom from (A). Prove its delete before its
insert, in that order, and read back three numbers after cleanup:
`roster` rows in `ZZ Demo Room` = **0** · `classrooms` named `ZZ Demo Room` = **0** ·
`roster` active total = **332** (baseline 2026-07-19 — re-measure on the day; if it moved,
a real child was admitted and the baseline is not yours).

---

## The shot-list

| # | Time | Screen | Click / action | Callout | Subtitle (VO verbatim) |
|---|---|---|---|---|---|
| 01 | 0:00–0:06 | Reports → **Attendance Blank**, ZZ Demo Room loaded | none — hold on the table | — | "Your weekly attendance sheet, printed from your own roster." |
| 02 | 0:06–0:14 | Filter bar | Click **Classroom** → pick *ZZ Demo Room*; click **Week starting** → pick a mid-week date | ↳ "Any date snaps to that week's Monday" | "Pick the room and the week. Any day snaps to Monday." |
| 03 | 0:14–0:22 | Table, Hours column | Hover down the **Hours** column | ↳ "Hours come from each child's schedule" | "Names, dates of birth and hours are already filled in." |
| 04 | 0:22–0:30 | Table, in/out cells | Hover across the empty **Mon–Fri** cells | ↳ "In and out stay empty — the room writes them" | "In and out stay blank. The room writes those by hand." |
| 05 | 0:30–0:40 | Yellow banner + the child with no schedule | Hold on the banner, then **Children → Mia Whitfield → Enrollment → Attendance schedule**: tick Mon–Fri, set 8:00 / 17:00, **Save schedule** | ↳ "Fix it once — every later sheet prints it" | "One child has no schedule. Set it once, and it prints from then on." |
| 06 | 0:40–0:50 | Back to Attendance Blank | Click **🖨 Print blank** → the print window opens with the sheet | ↳ "Oldest first — same as your sample sheet" | "Press print. Oldest first, exactly like the sheet you use." |
| 07 | 0:50–1:00 | The printed sheet, full frame | Hold; slow pan across the Mon–Fri grid | ↳ "A printed sheet keeps the schedule it was printed with" | "Print it Monday. What you printed never changes underneath you." |

**Cut if long (45s floor):** shot 02 first, then shot 04.
**Never cut 05** — "one child has no schedule, fix it once" is the shot that turns a
printout into a habit. Without it the video shows a report; with it, it shows a system.

**Do not shoot** the wide roster, the classroom dropdown expanded (it lists real room
names — acceptable), or any other classroom's table. If the demo room will not compose in
frame on shot 01 or 07, **shoot 02–06, hold 01 and 07, and report.** Do not improvise a
wide shot of a real classroom and fix it later.

---

## After the shoot — sweep

1. `delete from menumaker.roster where classroom_id = <ZZ Demo Room>;`
2. `delete from menumaker.classrooms where id = <ZZ Demo Room>;`
3. Read back the three numbers above. **0 · 0 · 332.**

No `undo` closure is involved — nothing was approved, nothing was claimed. The demo
children were inserted directly for the camera and deleted by their container.

## What this video deliberately does not promise

The tablet screen. It does not exist (`attendance_records`, the PIN signature and the
SafePass prefill are wave 2 — `docs/specs/attendance-module-spec.md`). The VO says *"the
room writes those by hand"* and means it. **Nothing here hints at a screen that is not
shipped** — a director who buys a tablet after this video was mis-sold.
