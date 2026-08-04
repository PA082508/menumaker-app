---
title: Director Desktop
module: director-desktop
order: 2
roles: [director, office_manager, admin]
icon: 🧑‍💼
updated: 2026-08-04
---

# Director Desktop

A center director works **inside the existing MenuMaker app** — there is no separate
director portal. When a director signs in, the app shapes itself to their role:
a focused sidebar, a role home page, and their own center pre-selected.

## What a director sees

The sidebar for the **director** role is limited to the sections they own:

- **Dashboard** → the **Director Home** (below).
- **Menu** — Menu Planner **and** the Published (Current) menu.
- **People** — **Children**, **Enrollment Inbox**, **Staff**.
- **Documents** — Upload and Instructions.

Budget, org-wide admin, and cross-center tools are **not** shown. Admins and office
managers still see the full sidebar — this narrowing applies only to the director
role, so nothing changes for other users.

> This is a curated set matched to the current spec. If directors need Meal Count or
> Reports day-to-day, those sections can be added to the director sidebar in one line
> (`DIRECTOR_SECTION_IDS` / `DIRECTOR_PATHS` in `AppLayout`).

## Director Home

The director's landing page (`/dashboard` for the role, also `/director-home`) is a
grid of large tiles — Children, Enrollment Inbox, Staff, Menu Planner, Published
Menu, Documents. The **Enrollment Inbox** tile carries a live count of pending forms,
and when anything is waiting a green strip at the top reads *"N enrollment forms
awaiting your review → Open Inbox."* One glance tells a director what needs them.

## Meal windows need your immediate attention

**This is the one alert on your screen that cannot wait until you finish what you
are doing.** Everything else on Director Home keeps until the end of the day. This
one has a shelf life of minutes, because the food is on the tables *right now*.

### What you will see

A red strip at the very top of Director Home:

> 🍽️ **Meal window needs you now**
> Green Room · AM Snack · window opened 09:30 — no marks 15 minutes in.
> Food is on the tables now. An unmarked meal is money that cannot be claimed back later.

It appears **without you refreshing the page** (the page re-checks every 45 seconds),
and it also lands in **Messages**, so a closed tab never loses it.

### What already happened before you saw it

The room got two chances of its own before you were told:

| Minute | What happens in the classroom |
|---|---|
| 0 | The tablet plays the meal song — *"Wash your hands and eat"* — and switches itself to that meal. |
| +10 | Nothing marked yet → a **bugle** sounds on the class tablet, and the banner starts pulsing. |
| +15 | Still nothing → **you** get this alert. |
| −10 to close | A softer reminder song — *"Ten more minutes left."* |
| close | **Silence.** The window closes without a sound; the unmarked window drops into the red end-of-day list. |

So by the time it reaches you, the room has heard the song, heard the bugle, and
still has zero marks. Something is actually wrong there: a tablet that is asleep or
off Wi-Fi, a substitute who has never marked a meal, or a room so busy nobody has a
free hand.

### What to do — two minutes of walking

1. **Walk to the room.** Do not phone, do not message back — a phone call needs a free
   hand in a room that already has none.
2. **Look at the tablet.** Asleep, off, showing another class, or showing a "marks
   waiting" badge? That is your answer.
3. **Mark what is on the tables** — from the class tablet or your own screen
   (Meal Count → the class → that meal). Marking is never blocked, not at +15, not at
   close, not tomorrow.
4. Only then find out why nobody marked.

**Why this is worth interrupting yourself for.** An unclaimed meal is not a paperwork
slip — it is money that does not come back. The claim is filed once a month against
what was recorded at the point of service; a meal that was served, eaten and never
marked is unrecoverable by any later correction. **Two minutes of walking protect a
month's claim.**

> If the strip says **"⚠️ sound muted since HH:MM — the room did not hear the alert"**,
> the class tablet is in quiet-hour mode. The room heard *nothing* — no song, no
> bugle. Do not read their silence as "they heard it and ignored it": go, and while
> you are there, check whether the mute is still needed.

### The mute switch (quiet hour)

Every tablet has one — `🔊 Звук включён` / `🔇 Беззвучно с HH:MM` in the header of the
Meal Count screen and the SafePass teacher screen. One tap silences **every** sound
on that device (meal song, bugle, drop, spoken receipts) so nap time is not broken.

What the mute switch does **not** silence, on purpose:

- the **pulsing banner** on the class tablet — it is visible, and visible wakes nobody;
- **this alert to you** at +15 — it is not a sound, it is money.

Muting is recorded on the device with the time it started, and the fact of it is
written into the alert you receive, so silence is never invisible.

### iPad has no vibration — and never will

A common question: *"can the tablet buzz instead of ringing during nap?"* **No.** iPads
have no vibration motor at all — not a software limit we can lift, and not something
a future release will add. iOS also gives web pages no vibration API even on iPhone,
so no browser-based app can buzz on an Apple device. The answer stays the same on
every iPad model.

What replaces it: the **pulsing banner** (silent, always on, unaffected by mute) and,
15 minutes in, this alert on your screen.

## Creating director accounts

Directors sign in with their **own email + password** (Supabase Auth), the same login
everyone else uses. There are two ways to stand up an account; both end with a
`user_roles` row of `role = 'director'` and a center assignment.

**Option A — Invite by email (recommended).** In the Supabase dashboard →
Authentication → Users → **Invite user**, enter the director's work email. They
receive a set-your-password link and choose their own password. No password travels
over chat.

**Option B — Create with a temporary password.** Create the user with a password you
set, then hand it over and have them change it on first sign-in. Simpler, but the
first password passes through you.

Either way, two things must be wired after the auth user exists (done together with
Nikolay, per plan):

1. **Role** — insert `menumaker.user_roles (user_id, role='director')`.
2. **Center** — assign the director to their one center so `accessible_centers`
   returns it (they're pinned to that center; `currentCenter` is set automatically
   and every center-scoped page filters to it).

> A newly SQL-inserted `auth.users` row can't sign in until it also has an
> `auth.identities` row with `provider='email'` — the invite flow handles this for
> you; a raw SQL insert does not. Prefer the invite flow.

The three centers and their directors:

| Center | Location | Director |
|--------|----------|----------|
| Ridge | Wickliffe | Sonia Texidor |
| Alpha | Highland Heights | Theresa Rolf |
| Pearl | Parma Heights | Carmen Santiago |
