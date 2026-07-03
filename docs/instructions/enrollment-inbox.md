---
title: Enrollment Inbox
module: enrollment-inbox
order: 12
roles: [director, office_manager, admin]
video: null
icon: 📥
updated: 2026-07-03
---

# Enrollment Inbox

The Enrollment Inbox is where parent-submitted enrollment packets land for director review. Parents fill the CACFP Enrollment and Income Eligibility (IEA) forms in the packet; each submission arrives here as **pending** and **nothing is written to the roster until you Approve it**.

**Open:** People → Enrollment Inbox (`/enrollment-inbox`). Directors, office managers, and admins only.

## The list

Each pending submission shows the child (or **NEW** for a first-time applicant), form type, date submitted, source (🌐 Online or 📷 Paper), and a validation badge:

- 🟢 **Ready** — all required fields present, no problems.
- 🟡 **Warnings** — format issues only (e.g. an odd phone/ZIP). You can approve with a confirmation.
- 🔴 **Incomplete** — a required field is missing. Approve is blocked until it's fixed.
- ⚪ **Unvalidated** — no rule set for this form type yet (still listed, just not graded).

Click a row to expand the list of what's missing or flagged. The Inbox is scoped to your **active center**; in Organization view it shows every center, with a center column.

## Review (diff-view)

Click **Review** to open a submission side-by-side:

- **Left — Submitted:** what the parent entered.
- **Right — Current record:** the child's existing roster values (blank for a new applicant).
- Changed fields are highlighted.

Fix parent typos directly in the left column and click **Save edits** — the correction is written to the submission (with an edit log) and the validation badge recalculates. This does **not** touch the roster.

## Approve

Approve is the single "send to the database" action. **Version 1 writes to the roster only** (guardians and income records come in a later phase).

### CACFP Enrollment
- The child's name is split into first/last (last word = last name) and stored canonically as "Last First" — check the split in the diff and fix it before approving if needed.
- Writes birthday and mailing address.
- Set **Date In** (enrollment start date) in the action panel if you know it — it's optional and can be added later on the child's Profile tab.
- **New applicants** run a duplicate check against the roster (name + date of birth). If a likely match is found, choose **Update <that child>** or **Create a new child**. With no match, Approve creates a new roster child.

### Income Eligibility (IEA)
- The FRP status (Free / Reduced / Paid) comes from the **Sponsor Section checkboxes** — the center's official certification. Sets the child's FRP and FRP-expiration.
- Applies to **every child on the form that matches a roster child**. Children with no roster match are listed as skipped — enroll them via a CACFP Enrollment form first, then approve the IEA again.

### Before you approve
- Approve is blocked on 🔴; 🟡 asks for a confirmation.
- Tick **Paper form signed & filed** to record that the wet-signed paper form is on file.

## Reject

Click **Reject**, enter a reason, and confirm. The reason is kept for follow-up. The submission leaves the pending list.

## Undo

Approve and Reject take effect immediately, with an **"Approved · Undo"** toast for 10 seconds. Undo fully reverses the action — it removes a newly created child (or restores the previous values on an updated one) and puts the submission back to pending. After 10 seconds the change is final.

## Notes

- Nothing is written to the roster until Approve — reviewing and editing are always safe.
- A submission can be edited and re-reviewed any number of times while pending.
