---
title: Director Desktop
module: director-desktop
order: 2
roles: [director, office_manager, admin]
icon: 🧑‍💼
updated: 2026-07-04
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
