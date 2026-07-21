---
title: IEA / income determination — org-level routing to the General Director
status: RATIFIED 2026-07-21 (Nikolay). Phase 1 = prepare, applied by hand. Ф2–Ф4 by phase, separate go.
role-canon: org-level = General Director (org-admin, is_org_owner()). At Play Academy this role is held by Tatiana.
---

# IEA / income determination → General Director only

## Model (ratified)

Income determination — the **IEA** (income eligibility application) and its mutually-exclusive
counterpart **USDA waiver** — is handled **only at the org level, by the General Director role**
(`menumaker.is_org_owner()` = admin / office_manager; at Play Academy = Tatiana). A center
**director** never reads its content.

- IEA + USDA waiver content, countersignature (`sponsor_sig`) and **Approve** → General Director's
  surface and DB write.
- The director's packet tree shows a **single content-free status chip** —
  **"Income determination — on file"** (received / filed) — with **no** `form_data` / `signatures`,
  and **without distinguishing IEA vs waiver**.

## Anti-inference (rationale + commercial privacy selling-point)

IEA and USDA waiver are a **mutually-exclusive pair** — exactly one is on file per household. So the
*presence of which one* is itself an income signal: a waiver on file ⇒ the family declined
free/reduced meals (full-pay); an IEA instead ⇒ they applied for benefits. **If the waiver were
visible to the director while the IEA is hidden, the director would infer the family's F/R/P status
from which of the pair is present.** That inference is exactly what routing IEA to the org level is
meant to prevent — so **both** go to the General Director, and the director's chip is **unified**
("income determination on file"), never IEA-vs-waiver.

**Commercial / selling-point (confidentiality):** a family's income and benefit status is visible
only to the General Director, never to center staff — and the product is *architecturally* unable to
leak it by inference, not merely by policy. Center directors still see packet completeness ("income
determination on file"), so nothing operational is lost.

## Current state (measured 2026-07-21)

- `enrollment_submissions` RLS: `auth_manage`(permissive) + restrictive `[module_cacfp · org_isolation
  · staff_only(director/office_manager/admin)]`, all `to authenticated`. → a director reads **all**
  submissions org-wide incl. IEA content (no center scope in RLS; app-level only).
- Two "director countersign" lists, inconsistent: DB `renewal_countersign_types()` =
  `[transition_into_program, dcy_01234, child_release_authorization]` (no IEA — drives the red number
  + inbox countersign tab); client `COUNTERSIGN_SLOT` = `{dcy_01234, iea→sponsor_sig, start_form}`
  (IEA present — drives the review-modal pad). Today IEA is not in the red number, but a director
  **can** open, read, countersign and approve an IEA.
- `submit_enrollment_form` = **SECURITY DEFINER** (parent submit bypasses RLS — unaffected by the new
  policy). Income rows today: **7 IEA** (6 rejected, 1 approved), **0 USDA waiver**.

## Phased plan (order: RLS → GD surface → chip → approve-split)

- **Ф1 (GO — prepare, applied by hand):** `supabase/migrations/20260721e_iea_org_only.sql` —
  (1) restrictive policy `income_org_only`: IEA + USDA waiver rows accessible only to
  `is_org_owner(org_id)`; (2) definer `income_determination_status()` → `{child_id, domain='income',
  status}` only, granted to authenticated, self-scoped (GD = org, director = own centers).
  Read-backs: policy shape · rows leaving director visibility (7 IEA / 0 waiver) · director sees 0
  income / GD sees 7 · parent submit (anon → `submit_enrollment_form`) still succeeds · status fn
  returns no content.
- **Ф2 — GD surface + routing:** org-level IEA/waiver inbox (filtered EnrollmentInboxPage for the
  GD, or dedicated), her `sponsor_sig` countersign + her Approve (Approve-split = the IEA Approve is
  the GD's own DB write).
- **Ф3 — status chip:** the director's family→child tree renders the unified "income determination —
  on file" chip from `income_determination_status()`. Status field, not a form row (never leaks).
- **Ф4 — approve-split + COUNTERSIGN_SLOT:** director packet Approve excludes IEA/waiver; remove IEA
  from client `COUNTERSIGN_SLOT` → `{dcy_01234, start_form}`; update every consumer.

## Out of scope (flagged)

- Two countersign lists drifted (DB vs client) + `child_release_authorization` has no client slot —
  future reconciliation, not this order.
