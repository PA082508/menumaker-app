---
length: 90s target (75s floor)
set: Play Academy Ridge (4aed7d5a-00d0-4a4c-ac99-311046ad2027, slug `ridge`)
source: docs/instructions/director-eforms-guide.md
status: PLAN ONLY — nothing shot, nothing written to the live DB
title: Shot-list — E-Forms for Directors
updated: 2026-07-15
video: 5th in the series, shot FIRST
---

# Shot-list — "E-Forms for Directors" (90s)

Voice: Piper, `en_US-amy-medium` (sample: `~/Downloads/eforms-vo/01-VOICE-SAMPLE-amy.wav`).
Series voice is Nikolay's call — two alternates rendered alongside it.

Screen 1280×800, cursor visible, no browser chrome. Callouts appear as the click
lands, not before. Subtitles are the VO verbatim — one line per shot, ≤11 words.

---

## Before the camera rolls — ZZSMOKE pre-flight (do NOT skip)

Per `platform-standards.md` → *Smoke rows are tagged and swept*: the write goes through
the **real channel** (public RPC + anon key), never an elevated SQL insert.

**Prove the delete before the insert.** In order:

1. Insert one row you fully control via `submit_public_form(p_center_slug => 'ridge', …)`
   with `p_data.smoke_tag = 'ZZSMOKE'`.
2. Delete by tag. Read back **three** numbers: `smoke_tag='ZZSMOKE'` count = **0**, table
   total = **72**, `max(created_at)` = **2026-07-15T20:19:44.757334+00:00** (today's
   baseline — re-measure on the day; if the total moved, a real family submitted and the
   baseline is not yours).
3. Only then smoke for real and start filming.

**Baseline at time of writing:** `enrollment_submissions` total **72** · pending **4**
(Ridge **2**, Alpha 1, Pearl 1) · ZZSMOKE rows **0**.

**Cleanup is wider than the tag.** Approve does not write one table — it writes three
(`src/lib/enrollmentApprove.ts`):

| Table | Written by | Cleanup handle |
|---|---|---|
| `enrollment_submissions` | submit + approve (status) | `form_data->>'smoke_tag' = 'ZZSMOKE'` |
| `roster` | approve inserts the child | **no `form_data` → the tag cannot reach it.** Capture `roster.id` at approve and delete by id |
| `income_eligibility` | approve, if the packet carries an IEA | Keep the IEA **out** of the demo packet and this table stays untouched |

`enrollmentApprove` returns an `undo` closure that reverts each write — prefer it over
hand-written deletes, then verify with the three read-backs above.

**Demo child gets a human name** — the Inbox is on camera and "ZZSMOKE Parent" reads as
test garbage to a director. Proposed: **Emma Carter**, parent **Sarah Carter**. The tag
lives in `form_data` and never renders.

---

## ⚠️ Open decision before shots 09–10 — real families are on this screen

Ridge's Inbox today holds **2 pending real submissions with real child names**, created
today; the Ridge roster holds **138 active real children**. Any wide shot of
**Children → Enrollment** or the roster puts real children's names on camera. This is not
solvable by cropping alone — the red badge itself reads "4".

Options (your call — I have not picked one):

- **A. Tight crop + post-blur.** Film full screen, crop to our row, blur any neighbour.
  Cheapest; relies on the editor catching every frame.
- **B. Film on a center with an empty inbox.** Only `kitchen` has 0 pending — but it is
  not a real daycare and its name on screen confuses the audience.
- **C. Depersonalised demo center.** Cleanest on camera, but it is a build (center-lock +
  org-branding-from-settings) and this is the Admission-Packet depersonalization work.
- **D. Shoot 01–08 now, hold 09–10** until A/B/C is decided. Keeps the shoot moving.

Shots 01–08 carry **no** PII risk: they show our own ZZSMOKE demo child only.

---

## The shot-list

| # | Time | Screen | Click / action | Callout | Subtitle (VO verbatim) |
|---|---|---|---|---|---|
| 01 | 0:00–0:07 | Children → Add Child, packet open, QR visible | none — hold | — | "Families fill out your forms on their own phone, and sign with a finger." |
| 02 | 0:07–0:13 | Add Child, set selector | Click **Starter** | ↳ "Each set opens with its required forms already ticked" | "Pick the set that matches the child. Starter begins a new enrollment." |
| 03 | 0:13–0:21 | Packet, three share controls | Hover **Open packet ↗** → click | ↳ "Open packet — see exactly what the family sees" | "Open the packet to check it first. Copy the link, or show the QR." |
| 04 | 0:21–0:28 | Storefront page, center header (Ridge name/address/phone) | none — hold on header | ↳ "The link always carries your center" | "The link always carries your center — never another center's." |
| 05 | 0:28–0:38 | Back to packet, master tick | Click **☑ Full packet** ON, then OFF | ↳ "Tap again → back to required. Never empty." | "One tick sends every form. Tap it again and you are back to the required ones." |
| 06 | 0:38–0:46 | Form list, per-form QR | Untick all but **Income Eligibility**, click its small QR | ↳ "Each form has its own QR" | "Owe us just one form? Leave it ticked — the parent sees only that." |
| 07 | 0:46–0:56 | **Phone frame** — parent checklist (ZZSMOKE: Emma Carter) | Scroll the card list | ↳ "Fill & sign · Keep for records · Director provides" | "The family sees a simple checklist. One card per form." |
| 08 | 0:56–1:10 | **Phone** — Consent, finger signature → next form | Sign Consent, open next form, tap **✍️ Use my signature** | ↳ "Sign once — every later form reuses it" | "They sign the Consent once. Every later form stamps the same signature in one tap." |
| 09 | 1:10–1:22 | Children → Enrollment (**see PII decision above**) | Open the ZZSMOKE submission → **Approve** | ↳ "The red number is what's waiting for you" | "The signed form lands in your inbox. Check it, approve it, and the child is on your roster." |
| 10 | 1:22–1:30 | Staff → Enrollment (empty state or tight crop) | Hold | ↳ "Staff have their own door" | "Staff submissions never mix with families. They have their own door." |

**Cut if long (75s floor):** shot 06 first, then shot 04. Never cut 08 — "sign once" is
the feature directors do not believe until they see it.

---

## After the shoot — sweep

1. `undo` the approve (or delete `roster.id` captured at approve).
2. Delete `enrollment_submissions` by `smoke_tag='ZZSMOKE'`.
3. Read back all three: ZZSMOKE = **0**, total back to **72**, `max(created_at)` back to
   the pre-shoot value. Paste the numbers into the report — the sweep is not done until
   the baseline is proven untouched.
