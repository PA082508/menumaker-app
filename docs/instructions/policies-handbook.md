---
title: Policies & Rollout Handbook
module: policies
order: 9
roles: [director, office_manager, admin]
# video: <url>   # (Stage 2) short walkthrough
---

# Policies & Rollout Handbook

How policies are introduced, versioned, and how a new feature is turned on. This is
the process side of the platform — the counterpart to the technical
[Definition of Done](/instructions) (code + instructions ship together).

## Two-step policy introduction

A policy never becomes binding the moment it's written. It goes through **two
steps**, so staff always have notice before anything is enforced:

1. **Introduce (announce).** The policy is published in a *draft/announced* state
   and made visible to the people it affects (Document Hub, portal, or email). Staff
   can read it; nothing is enforced yet.
2. **Activate (acknowledge).** Once the notice period has passed, the policy is
   activated. Affected staff **acknowledge / sign** it, and only acknowledged people
   are bound. Enforcement (e.g. a feature that requires the signed agreement) keys
   off the acknowledgement, not the publish date.

The BYOD Device Use Agreement is the model: announced first, then signed online, and
the stipend/enforcement begins only after director countersignature.

## Versioning

- Every policy is **versioned**. Editing a live policy creates a **new version**;
  prior versions are kept (never overwritten) for audit history.
- **Acknowledgements bind to a specific version.** When a policy changes materially,
  a **re-acknowledgement** is required — a signature on v1 does not satisfy v2.
- A feature that depends on a policy checks *"has this person acknowledged the
  current version?"*, so a new version can require re-signing before the feature
  works again.

> **Task F (in progress).** `menumaker.policy_documents` now holds versioned policy
> text (key + version + title + body + two-step `status` draft→announced→active,
> superseded versions kept). First record: **`safepass_addendum` v1.0** (active),
> which corresponds to `safepass_agreements.document_version = '1.0'` — the version
> a parent/teacher signs. **Signatures bind to code+version**: `safepass_agreements`
> now has `policy_code` + a composite FK `(org_id, policy_code, document_version) →
> policy_documents(org_id, key, version)`, so a signature can only reference a real
> policy code+version (a version bump forces re-signing). Still to wire: SafePass
> access **requiring** the current active version's signature, and admin UI to
> author / announce / activate policies.

## Feature-activation checklist

Before a new feature is switched on for a center, confirm:

- [ ] **Code merged** and passing (`type-check`, `build`).
- [ ] **Instructions written** — a section in `docs/instructions/` ships in the same
      commit ([Definition of Done](/instructions)).
- [ ] **Roles set** — who can see/use it; the Instructions section lists the roles.
- [ ] **Policy in place** (if the feature enforces one) — announced, versioned, and
      acknowledgement flow ready.
- [ ] **Permissions/nav** — the feature appears only where it should; access is
      gated correctly.
- [ ] **Data ready** — any required setup (e.g. holidays, roster, cycle anchor)
      exists for the center.
- [ ] **Rollback known** — how to turn it back off if needed.
