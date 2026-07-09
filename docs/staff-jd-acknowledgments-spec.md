# Staff JD Acknowledgments — spec

Status: **FOUNDATION SHIPPED 2026-07-09.** DOC 1/2/3 seeded **active** in
`policy_documents` (migration `20260709_staff_jd_policy_documents.sql`, applied +
verified); sign-set registry `src/lib/staffJdRegistry.ts` (+test, 9/9). UI layer is
the next increment. All build-blocking decisions below are **RESOLVED**.

## Resolved decisions (2026-07-09 full re-send)

- **SURFACE = IN-APP.** Generalize the BYOD `SignModal` into a role-driven JD ack that
  reads the body from `policy_documents` active version. Sign-set (role JD + §6 BYOD)
  assigned at **Approve→staff**; the `safepass_agreements` ledger row is written there
  too (follow-up, ships with the Approve→staff flow). `Staff_Enrollment_v1` (§1–§5)
  stays Nikolay's — goes to smoke/flip **without** §6.
- **DOC 3 Teacher = VERSION B** (childcare-adapted). Seeded.
- **DOC 2 tail:** paper had only Name/Date; the e-version gets the standard pattern
  tail — **Name print (from §1) + Signature + Date**. New edition, upgrade approved.
- **Acknowledgment line + fields are NOT in `policy_documents.body`** — `SignModal`/the
  pattern renders them. Per-doc ack lines live in `staffJdRegistry.ts` (`ackLine`).
- **Border rule «≤»** (unrelated to JD, batched by Nikolay) — part of the **v9 form-kit
  gate** (Pages repo `pa082508.github.io`, not the backlog): arrival exactly at a meal's
  intake-window end auto-checks that meal. Blocks Nikolay's v9 smoke until pushed.

## Decision (settled)

Each staff role acknowledges **its own** Job Description — a **separate document per
role, 1:1**. The earlier "does floater get both?" question is **CLOSED: each role gets
exactly one**. JDs for cook/driver/office/director are added as records **as texts
arrive from Nikolay** — the structure must allow adding them **without touching the
form-kit** (the shared JS kit).

## §2 role → JD document (registry)

| §2 role           | policy key (`policy_documents.key`) | version | text status              |
|-------------------|-------------------------------------|---------|--------------------------|
| teacher assistant | `Staff_JD_TeacherAssistant`         | `v1`    | ✅ verbatim (DOC 1)      |
| floater           | `Staff_Floater_Takeover`            | `v1`    | ✅ verbatim (DOC 2)      |
| teacher           | `Staff_JD_Teacher`                  | `v1`    | ✅ version B (childcare) |
| cook              | `Staff_JD_Cook`                     | —       | ⏳ awaiting text          |
| driver            | `Staff_JD_Driver`                   | —       | ⏳ awaiting text          |
| office            | `Staff_JD_Office`                   | —       | ⏳ awaiting text          |
| director          | `Staff_JD_Director`                 | —       | ⏳ awaiting text          |

`key` + `_` + `version` reconstitutes Nikolay's identifiers (`Staff_JD_Teacher_v1`, …).

## Storage & versioning

- **`policy_documents (org_id, key, version, title, body, status)`** = source of truth
  for the verbatim JD text, versioned; two-step lifecycle draft → announced → active.
  Bodies are the **signable text — never reword**. Seeded **active** by
  `supabase/migrations/20260709_staff_jd_policy_documents.sql` (applied + verified 2026-07-09).
  Code-side sign-set map: `src/lib/staffJdRegistry.ts` (role → policyKey/version/ackLine/fields).
- **`safepass_agreements (person_type=<role>, policy_code=<key>, document_version)`** =
  the signature ledger; `safepass_has_signed` / `safepass_sign` gate on the **active**
  version (re-sign required on version bump), exactly like the parent addendum.

## Two signing surfaces (one registry)

At onboarding the person is **not yet in the system** (no staff record, no login), so:

1. **Onboarding = form-pack acknowledgment** (form-kit pattern): read-only text from
   `policy_documents` active version → confirm → Name (print, autofilled from §1 staff
   form) → Signature → Date. The `safepass_agreements` row is written **at
   Approve→staff** (when a `person` exists).
2. **Later re-signs on a new version = in-app `safepass_sign`**, same as the parent
   addendum flow.

**In-app precedent:** the BYOD "Sign Online" flow — `SignModal` in
[`DocumentHubPage.tsx`](../src/pages/instructions/DocumentHubPage.tsx) (§1 intake →
read-only agreement → signature pad → done, writes `byod_signatures`) — is the same
acknowledgment shape. Caveat: its agreement text is **hardcoded in JSX**, whereas JD
acks must read the body from `policy_documents`. Generalizing `SignModal` to a
role-driven, registry-backed JD ack is the natural in-app path.

## Packet placement

`§2 role → render that role's JD acknowledgment inside the staff-pack, after §6
Smartphone (BYOD)`. Build order: **§6 + JD docs → готовность → Nikolay's Staff smoke →
Staff "go" → flip.**

## Next increment — UI layer (in-app)

1. **Generalize `SignModal`** (extract the stepper + signature pad into a reusable
   component) so it's document-driven: title + read-only body from `fetchActiveJdBody()`
   + per-doc `ackLine` + fields (Name from §1 / Signature / Date). BYOD keeps its own
   `byod_signatures` write; JD acks use the staff sign-set. **Do not regress BYOD.**
2. **Onboarding capture store** — the person isn't in the system yet, so the drawn
   signature + Name + role + policy_code + version land in a **staging** store (BYOD's
   `byod_signatures` is the BYOD-specific precedent; JD needs a generic sibling). The
   `safepass_agreements` ledger row is written later, at **Approve→staff**.
3. **Document Hub** — render each role's JD ack card from `signSetForRole()` + an
   **"N documents to sign"** indicator.
4. **Ledger hook** — at Approve→staff, write one `safepass_agreements` row per signed
   doc (person_type=role, policy_code=key, document_version=version). Ships with the
   Approve→staff flow (which does not exist in-repo yet).

## Notes / minor

- **Key casing** — keys keep Nikolay's `Staff_JD_*` casing (existing policy keys are
  snake_case `safepass_addendum`/`byod`); harmless (case-sensitive match; form + ledger
  use the same string). Flag if snake_case is later preferred.
- **DOC 3 ack line** — version B carried no printed acknowledgment line; a standard one
  is used in `staffJdRegistry.ts`. Confirm wording with Nikolay.
- cook/driver/office/director — add a `policy_documents` record + a `STAFF_JD_BY_ROLE`
  entry when text arrives; no form-kit/SignModal change.
