# EnrollPulse — product description

**Built on the NurturePulse platform · dual-purpose document · owner: Nikolay · 2026-07-25**

> **How to read this.** EnrollPulse serves two audiences with **two separate framings**. The
> **Regulatory framing** describes the compliance system as it is presented to an agency —
> **no AI is part of the regulatory record path.** The **Product / B2B framing** describes the
> commercial offering, where AI **assists** operators and every output is **human-approved**.
> Keep the two framings distinct; do not import product/AI language into regulatory materials.
> Single source of truth for the record mechanics:
> [`../esignature-system-description.md`](../esignature-system-description.md).

---

## A. Regulatory framing — compliance, no AI in the record path

EnrollPulse produces and keeps CACFP enrollment and income-eligibility records with integrity,
using **no AI in the regulatory record path**. What the agency sees:

- **Pixel-exact replicas.** The electronic forms are **faithful, byte-for-byte replicas** of
  the current official state forms (CACFP Enrollment, Income Eligibility Application, DCY
  series). What a parent fills and signs is the real form, printable on demand in the state
  layout.
- **Version control & history.** Every form edition is **versioned**; each signed record
  stores the **exact form version** it was signed against, so the record is reproducible.
- **Tamper-evident, sealed records.** At submission a **SHA-256 hash** binds the form data and
  signature; the record carries a **server-authoritative seal timestamp**; sealed records
  **cannot be edited or deleted**, and a correction is a **new linked record with a stated
  reason**. (Enrollment and the three dedicated parent forms are sealed today.)
- **Human review and approval.** A **director** reviews and countersigns; nothing is
  auto-decided. Meal counts are recorded against attendance (hard attendance gate is planned
  with the GatePulse rollout); claim data is assembled from recorded counts and statuses.
- **Human, not machine, authorship of the record.** The regulatory record is created by the
  parent and the director. No automated system drafts, alters, or approves a regulatory record.

**Status honesty (regulatory):** where a capability is not yet live it is labeled **Planned**
in the system description (form-side consent capture; hard attendance-anchored meal gate;
automated retention enforcement; period-effective claim rates). Regulatory materials state
these as Planned, never as in force. **Production status:** the electronic CACFP forms are in
**parallel-run only** — paper remains the official record until Office approval.

---

## B. Product / B2B framing — AI-assisted, human-approved

For child-care operators, EnrollPulse is the enrollment layer of the NurturePulse platform:
faster, error-checked family onboarding that still ends in a **human decision**.

- **Guided, error-reducing entry.** Date pickers, phone/address validation, required-field
  checks, and meal-time selections drawn from the center's real schedule — fewer bad forms,
  less re-work.
- **Signatures that hold up.** Parents and directors sign by drawing on the document — a real
  signature, or a mark — with its own date stamped at the moment of signing, sealed against
  later change. Typed names are not accepted on regulated forms: the licensing authority (Ohio
  DCY) requires an official electronic signature, "not just the parent typing their name in."
- **Reusable signature sample — Planned, jurisdiction-gated.** Adopting one signature and
  re-applying it with a tap on later documents is **built but switched off**, and off is the
  default everywhere. Whether it may ever be enabled is decided per **jurisdiction × document
  type** — federal ESIGN/UETA are near-uniform, so the variation comes from licensing agencies
  and the requirements of specific blanks, and a center's own fee agreement may differ from a
  government form **in the same state**. Not available today; not enabled for any Ohio center.
- **From home, pre-scoped.** Parents complete forms from home via a QR code or link
  pre-scoped to their child's center.
- **AI-assisted, human-approved.** AI **assists** operators — for example, drafting and
  organizing onboarding materials and surfacing what needs attention — but **a human always
  reviews and approves**. AI never files or approves a compliance record on its own.
- **Forms agent — Planned.** A managed **forms agent** that parses an official blank into a
  draft replica and diffs editions is **planned**: it would **draft** for a human (the General
  Director) to **vet and approve**, and would **never auto-publish**. Not yet available.

**Boundary:** AI-assist language belongs to this Product/B2B framing only. It is **not** part
of the Regulatory framing above and is never applied to the regulatory record path.

---

## One-line positioning

*EnrollPulse — faithful electronic CACFP enrollment on the NurturePulse platform: pixel-exact
replicas, versioned and tamper-evident, human-reviewed. AI assists the operator; a human
always approves.*
