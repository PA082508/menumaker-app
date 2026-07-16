---
length: 90s target (75s floor)
set: Play Academy Ridge (4aed7d5a-00d0-4a4c-ac99-311046ad2027, slug `ridge`)
source: docs/instructions/director-eforms-guide.md
status: PLAN ONLY — decisions locked 2026-07-15; nothing shot, nothing written to the live DB
title: Shot-list — E-Forms for Directors
updated: 2026-07-15
video: 5th in the series, shot FIRST
---

# Shot-list — "E-Forms for Directors" (90s)

**Voice (series, decided):** Piper `en_US-amy-medium`.
Sample: `~/Downloads/eforms-vo/01-VOICE-SAMPLE-amy.wav`. This is the voice for the whole
series, not just this video — lessac and ryan were auditioned and dropped.

> Piper has no working official build on macOS arm64. Render through
> `scratchpad/synth.py` (brew espeak-ng + the voice's own ONNX). See the
> `piper-tts-macos-broken` note before re-rendering any VO.

Screen 1280×800, cursor visible, no browser chrome. Callouts appear as the click
lands, not before. Subtitles are the VO verbatim — one line per shot, ≤11 words.

---

## Before the camera rolls — ZZSMOKE pre-flight (do NOT skip)

Per `platform-standards.md` → *Smoke rows are tagged and swept*: the write goes through
the **real channel** (public RPC + anon key), never an elevated SQL insert.

**Prove the delete before the insert.** In order:

1. Insert one row you fully control via `submit_public_form(p_center_slug => 'ridge', …)`
   with `p_data.smoke_tag = 'ZZSMOKE'`.
2. Delete it. Read back **three** numbers: `smoke_tag='ZZSMOKE'` count = **0**, table
   total = **72**, `max(created_at)` = **2026-07-15T20:19:44.757334+00:00** (baseline as of
   2026-07-15 — re-measure on the day; if the total moved, a real family submitted and the
   baseline is not yours).
3. Only then smoke for real and start filming.

**Baseline at time of writing:** `enrollment_submissions` total **72** · pending **4**
(Ridge **2**, Alpha 1, Pearl 1) · ZZSMOKE rows **0**.

**Demo child gets a human name** — the Inbox is on camera and "ZZSMOKE Parent" reads as
test garbage to a director. **Emma Carter**, parent **Sarah Carter**. The tag lives in
`form_data` and never renders.

---

## Cleanup — decided

**The undo closure is the mechanism, not delete-by-tag.** `enrollmentApprove.ts` returns an
`undo` for every write it makes and reverts each one (deletes the inserted row, restores
prior column values, returns the submission to its earlier state). Delete-by-tag as the
*only* mechanism is **rejected** — the tag lives in `form_data`, and `roster` has no
`form_data`, so the tag physically cannot reach the child that approve inserts.

**The demo packet carries no IEA.** That keeps `income_eligibility` out of the blast radius
entirely — not "cleaned up afterwards", but never written. This is why shot 06 no longer
uses the Income Eligibility Application as its example form (see the shot).

What approve touches, and how each is reverted:

| Table | Written by | Reverted by |
|---|---|---|
| `enrollment_submissions` | submit + approve (status) | `undo` restores prior status; ZZSMOKE tag still identifies the row |
| `roster` | approve inserts the child | `undo` deletes the inserted row (tag cannot reach it) |
| `income_eligibility` | approve, only with an IEA in the packet | **not written — no IEA in the demo packet** |

ZZSMOKE read-backs stay as the proof, unchanged: **tag = 0**, **total**, **max(created_at)**.

---

## Shots 09–10 — tight frame, no blur (decided)

No real child's name appears in the video. Not blurred — **not filmed**.

- **Inbox (09):** close-up on the ZZSMOKE submission card only. The wide list, which holds
  real pending submissions, is never in frame.
- **Roster (10-b):** reach the child through **search "Emma Carter"** — the filtered result
  is the demo child alone.
- **Numeric badges are fine.** The red "4" can stay in frame; a count is not a name.

**If a tight frame will not compose on either shot:** shoot **01–08**, hold 09–10, and
report. Do not improvise a wide shot and fix it later.

---

## The shot-list

| # | Time | Screen | Click / action | Callout | Subtitle (VO verbatim) |
|---|---|---|---|---|---|
| 01 | 0:00–0:07 | Children → Add Child, packet open, QR visible | none — hold | — | "Families fill out your forms on their own phone, and sign with a finger." |
| 02 | 0:07–0:13 | Add Child, set selector | Click **Starter** | ↳ "Each set opens with its required forms already ticked" | "Pick the set that matches the child. Starter begins a new enrollment." |
| 03 | 0:13–0:21 | Packet, three share controls | Hover **Open packet ↗** → click | ↳ "Open packet — see exactly what the family sees" | "Open the packet to check it first. Copy the link, or show the QR." |
| 04 | 0:21–0:28 | Storefront header (Ridge name/address/phone) | none — hold on header | ↳ "The link always carries your center" | "The link always carries your center — never another center's." |
| 05 | 0:28–0:38 | Back to packet, master tick | Click **☑ Full packet** ON, then OFF | ↳ "Tap again → back to required. Never empty." | "One tick sends every form. Tap it again and you are back to the required ones." |
| 06 | 0:38–0:46 | Form list, per-form QR | Hover the small QR next to **Registration Start Form** → tap to enlarge. **Do not untick anything** | ↳ "Each form has its own QR — opens just that form" | "Owe us just one form? Its own QR opens only that one." |
| 07 | 0:46–0:56 | **Phone frame** — parent checklist (Emma Carter) | Scroll the card list | ↳ "Fill & sign · Keep for records · Director provides" | "The family sees a simple checklist. One card per form." |
| 08 | 0:56–1:10 | **Phone** — Consent, finger signature → next form | Sign Consent, open next form, tap **✍️ Use my signature** | ↳ "Sign once — every later form reuses it" | "They sign the Consent once. Every later form stamps the same signature in one tap." |
| 09 | 1:10–1:22 | Children → Enrollment — **close-up on the ZZSMOKE card only** | Open the ZZSMOKE submission → **Approve** | ↳ "The red number is what's waiting for you" | "The signed form lands in your inbox. Check it, approve it, and the child is on your roster." |
| 10 | 1:22–1:30 | **(a)** Roster via search "Emma Carter" → **(b)** Staff → Enrollment | Type "Emma Carter" in roster search; hold | ↳ "Staff have their own door" | "Staff submissions never mix with families. They have their own door." |

**Shot 06 changed by the cleanup decision.** The guide's example is "a family only owes you
the Income Eligibility Application", but the demo packet carries no IEA, and unticking the
set down to one form would leave the packet composed for shots 07–08. So 06 demonstrates
the per-form QR **without changing the packet** — the packet stays Starter (Consent, Start
Form, Medical Statement) all the way through the parent path. Same feature, no IEA, no
recomposition mid-video.

**Cut if long (75s floor):** shot 06 first, then shot 04. Never cut 08 — "sign once" is
the feature directors do not believe until they see it.

---

## After the shoot — sweep

1. Call the `undo` returned by the approve. It reverts each write: the roster child is
   deleted, the submission returns to its prior status.
2. Delete the ZZSMOKE `enrollment_submissions` row by tag.
3. Read back all three: ZZSMOKE = **0**, total back to **72**, `max(created_at)` back to
   the pre-shoot value. Paste the numbers into the report — the sweep is not done until
   the baseline is proven untouched.
4. `income_eligibility` needs no sweep: with no IEA in the packet it is never written.
   Assert it anyway — a zero you measured beats a zero you assumed.
