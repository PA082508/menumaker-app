# Play Academy — Electronic Signature & Enrollment Record System Description
*(built on the NurturePulse platform)*

**Status:** working description · **Rebuilt in-repo:** 2026-07-25 (authored from verified
system facts; supersedes the earlier out-of-repo draft) · **Owner:** Nikolay

> **Purpose.** Plain, honest description of how Play Academy captures parent enrollment
> forms and signatures electronically, and how each record is made tamper-evident. Written
> to support correspondence with the state agency (ODEW) about signature integrity. Every
> claim below reflects what the system **actually does today**; capabilities not yet live are
> marked **Planned** with a target, never described as if in force.
>
> Companion: [`esignature-letter-system-reconciliation.md`](./esignature-letter-system-reconciliation.md)
> — the four points where the sent letter runs ahead of the system, and their closure.

---

## §1. Scope

Play Academy centers collect CACFP/enrollment packet forms from parents. This document
covers the **electronic** path: a parent opens a center link, fills the official form,
signs it on-screen, and the submission is recorded as a pending, sealed record for a
director to review and approve. Paper and manual (no-scan) intake paths are noted where
they differ.

## §2. Architecture

- **The form** is a byte-for-byte replica of the official government form, hosted as a
  static page and pinned to an exact **version** via a versioned registry
  (`enroll-registry.json`). Adding a version never moves existing links unless `current` is
  bumped; a link may pin its own version. The app hosts a thin loader (`embed.js`) and the
  registry — it does not render the form.
- **The record** lands in `menumaker.enrollment_submissions` via a single
  `SECURITY DEFINER` database function, `submit_enrollment_form`. Anonymous form submitters
  have **no direct table access** — they can only call this function, which always writes a
  `status='pending'` row with no child match; matching/approval happens later in the
  director Inbox.
- **Isolation.** Row-level security scopes every submission to its organization and center;
  the Inbox is staff-only (director / office manager / admin).

## §3. Signature capture

The parent signs in the form's real signature slot (the official "Parent/Guardian" field),
three interchangeable ways: **draw** (finger/stylus, fit-to-slot), **type** an autograph
(choice of script faces), or **apply a previously saved signature** with one tap. The
form records which method was used. A director later **countersigns in-app** in the
official "Program Administrator/Designee" slot; that countersignature is additive and does
not alter the parent's sealed record.

**Date next to a signature is a stamp, not a field.** It is written the moment the
signature (or an initials set) is made, is read-only, is never pre-filled or back-datable,
and clears if the signature is cleared. Data dates (birthday, first day, effective dates)
are ordinary fields and are unaffected.

## §4. Signer identity — *honest scope*

The system establishes the **claimed** identity of the signer; it is **not** a
government-ID verification service. Concretely, a submission is bound to:

- the **identity the parent asserts** on the form (name and family details they enter);
- a **link/token + date-of-birth** context that scopes the submission to the intended
  family/child where that flow applies; and
- a **center-lock**: the function rejects any submission whose center does not belong to
  the asserting organization, so a record cannot be cross-filed to another center or org.

This is comparable to routine e-form intake: it authenticates the *channel and scope* and
freezes *what was signed and when it was sealed*, but it does **not** prove the signer's
legal identity against a government identity document. That limitation is stated plainly
rather than implied away.

**Meal-eligibility (F/R/P) at enrollment is advisory today.** The system derives and
displays a meal profile against the active roster to guide staff; it does **not** hard-gate
enrollment on attendance-anchored eligibility. A hard, attendance-anchored gate is
**Planned** and launches with the **GatePulse** rollout. Until then the record and any
description must read *"advisory today; hard gate planned with GatePulse rollout."*

## §5. Record integrity & tamper-evidence — *Implemented (2026-07-23)*

At submission the function computes a **SHA-256 content hash** over the canonical form data
combined with an immutable snapshot of the signature (`content_hash` over
`form_data ⨁ sealed_signatures`). A database **seal trigger** then makes the record
tamper-evident for **every** application role:

- once `content_hash` is set, the frozen fields — form data, the signature snapshot, the
  hash itself, form version, submission context (IP/user-agent), consent timestamp,
  **`sealed_at`**, the signature date, submission type, and org/center — **cannot be
  changed**;
- a sealed record **cannot be deleted**;
- a correction is a **new forward record** that references the prior one
  (`supersedes_id` + a required `correction_reason`) — the original is never rewritten.

The director's working countersignature column stays mutable (that is how Approve adds the
countersignature), which is why sealing does not break review/approval.

## §6. Server-side capture — *Implemented*

The following are set by the **server**, from the request context — the form/browser cannot
supply or forge them: the submitter's **IP address** and **user-agent** (from request
headers), the **content hash**, and the **server seal timestamp** (`sealed_at`). The form
only provides the answers, the signature, and the version it was pinned to.

## §7. Timestamps — *honest distinction*

Two timestamps sit side by side, and the difference is named on purpose:

| Field | Set by | Meaning |
|-------|--------|---------|
| `signature_date` | **client** (the form) | the date the parent entered/stamped at signing — **sealed against change** once the record is sealed, but it is a client-entered value |
| `sealed_at` | **server** (`now()` in the function) | the **server-authoritative moment of sealing** — the trusted timestamp the record actually carries; frozen by the seal trigger |

(`created_at` remains the row-insertion timestamp; `sealed_at` is the signature-sealing
moment and equals `created_at` at insert but is semantically distinct and frozen.)
`sealed_at` was added and applied to production on **2026-07-25**.

## §8. Form versioning — *Implemented for new submissions*

Each electronic submission records the **exact form version** it was signed against
(`form_version`), pinned from the registry. **Populated from 2026-07-25** for new
submissions (older records predate the field and carry none). Manual (no-scan) office
entries are honestly marked `manual_entry` — they are not a published registry edition.

## §9. E-signature consent — *Planned (target 2026-09-15)*

The record has a dedicated **consent-captured timestamp** (`esign_consent_at`), and the
platform write-path is wired to record it. The parent-facing **consent checkbox on the
form** (which emits the consent signal) is a scheduled storefront change. Current status,
stated exactly: **"platform-side capture wired; form-side emission scheduled."** Until both
halves ship, consent remains **Planned** and real parent submissions carry no consent
timestamp.

## §10. Retention — *documented operational practice*

Enrollment records are retained per program requirements as a **documented operational
practice** today; **automated enforcement** of retention/disposition schedules is
**Planned**, not yet in force.

---

## Status summary

| Capability | Status |
|-----------|--------|
| Tamper-evidence (hash + seal + no-delete + forward-only correction) | **Implemented** — prod 2026-07-23 |
| Server-set context (IP/UA/hash) | **Implemented** |
| Server seal timestamp (`sealed_at`) | **Implemented** — prod 2026-07-25 |
| Form version on record (`form_version`) | **Implemented for new submissions** (from 2026-07-25) |
| Signer identity (claimed + token/DOB + center-lock) | **Implemented** — *not* government-ID verification |
| E-signature consent capture | **Planned** — platform-side wired; form-side emission by 2026-09-15 |
| Meal-eligibility hard gate | **Planned** — advisory today; hard gate with GatePulse rollout |
| Retention automated enforcement | **Planned** — documented operational practice today |
