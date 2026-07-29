# Memo to counsel — running list

Questions and wordings that need a lawyer's eye before they become permanent. One item per
topic, newest on top. An item leaves this list only by an answer recorded here — not by silence.

**Owner:** Nikolay. Nothing here is legal advice; it is a list of things we should not decide
alone.

---

## 0. ⛔ BLOCKING — the fee agreement is a one-way contract *(added 2026-07-27)*

**Status: this section BLOCKS the payment-rules wording.** Until counsel answers, the sentences
about when payment is due, the late fee and non-proration are **frozen** — we do not rewrite,
soften or re-order them, and we do not add an "on-time payment" accent. Work on that text is
paused by the owner's word. Everything else in the fee agreement continues.

**Why the pause.** Our Fee Agreement (four variants: standard, infant, school-age, and the
caretaker/provider voucher version) is signed by the parent and countersigned by the center's
administrator. Read as a contract, its obligations run **one way**: the parent promises to pay,
on a schedule, with a late fee and no proration. What the center owes in return is **not written
down anywhere in the document** — no hours of care, no notice before a rate change, no
termination procedure, nothing about the registration fee if care never begins.

**What we ask counsel:**

1. **Does the one-way flow weaken enforceability?** The parent signs a payment obligation; the
   center countersigns but promises nothing in the same instrument. Does that affect whether the
   payment terms — the weekly due date, the $5.00/day late fee, the no-proration clause — are
   enforceable in Ohio, and does the countersignature change the answer?
2. **If it does, what should be written in?** Our candidates, for you to correct and complete:
   provision of care and the hours it covers · notice before a change of rates · how either side
   ends the arrangement · what happens to the registration fee (non-refundable today) if the
   child never starts · what happens if the center closes, temporarily or for good.
3. **Does Ohio licensing require specific disclosures in a parent contract?** We are looking for
   anything that must appear in the agreement itself rather than in the handbook — and whether
   any of it must be signed separately.
4. **Do our two hardest clauses survive as written?** (a) a late fee of **$5.00 per day**, with
   no cap and no grace period stated; (b) **"Tuition fees are not subject to pro-ration for
   illness, holidays, or emergency closure of the center. Payment is due even if your child is
   not here for the week."** Both are carried verbatim from the paper agreement families already
   sign. Are they enforceable in Ohio for licensed child care, and does the answer differ for
   families paying with a publicly funded voucher, where a county agency is also involved?

**Scope note, so nothing is over-read from this pause.** The current release (edition v2) does
**not** introduce any new obligation: it reproduces the text of the Word original that families
sign today, plus one corrected typo ("by Wednesday **from** the following week" → "**of the
preceding week**", the same prepayment either way). The legal position is not made worse by
shipping it. The pause is about **future wording**, not about the release.

---

## 1. Electronic signatures on child-care and CACFP records — *added 2026-07-27*

**Trigger.** Ohio DCY: *"Electronic signatures are allowed … official electronic signature or
physical signature on-line. It can't just be the parent typing their name in."*

**What we did without waiting.** Removed the typed-name option from every government form
(DCY 01234 v8, CACFP Enrollment v11, IEA FY2026-27 v8, USDA Waiver v5) and from the two internal
forms whose signature can be re-applied to a government form (Parent Consent v4, Parent Handbook
Receipt v2). The parent now draws, always.

**Full description of how a signature is made and held:**
[`docs/compliance/e-signature.md`](e-signature.md) — one page, written to be shown as-is.

**Second thing we did without waiting (2026-07-27).** The reusable *signature sample* — draw
once on the consent form, re-apply with one tap on later forms — is **conserved**: the mint,
the "Use my signature" button and the "Remember this as my signature" checkbox no longer exist
on any surface, and any sample left on a device is erased. Until counsel answers question 1,
**every signature in the system is a fresh live stroke made on that document, carrying its own
date**, on both sides. The mechanic is locked behind a flag, not deleted; the conditions for
ever turning it back on are written in
[`docs/specs/2026-07-27-signature-sample-unconservation.md`](../specs/2026-07-27-signature-sample-unconservation.md)
and it also needs Nikolay's word.

**What we ask counsel to confirm:**

1. That a **drawn** signature made online — under the form's own printed attestation, with a
   signing-moment date stamp, a server timestamp, the submitting device's IP and user-agent, and
   a SHA-256 seal that blocks any later edit or deletion — satisfies *"official electronic
   signature"* for Ohio DCY licensing records and for CACFP records.
2. Whether the standing **Parent Consent for Electronic Signatures** should be re-executed
   annually or per program year, and whether its current wording ("your electronic signature will
   be considered your legal signature … you may request a paper copy at any time") is sufficient.
3. Whether the remaining internal documents may keep a typed option (Child Release Authorization,
   Transition into the Program, Staff Consent for Electronic Signatures) or should also be
   restricted to drawn signatures.
3a. **A signer who cannot write their name — the mark ("X").** Our forms accept a drawn mark as
   readily as a signature, and Ohio DCY's own wording is about not *typing* a name rather than
   about penmanship. **Priority: this one is about the forms we are using today.** Please confirm
   that a drawn mark, made on the document under the same attestation, date stamp and seal as any
   other signature, is a valid signature for licensing and CACFP records — and tell us whether it
   needs anything the others do not: a witness, the signer's printed name beside it, or a note in
   the record that the signature is a mark. If it does, we will add exactly that and nothing more.
3b. **Reusable signature sample — Planned / multi-state, not for Ohio.** For the commercial
   version of the product only: **on which TYPES of documents** is a reusable signature sample
   acceptable — a center's own agreements versus a government blank — and **what lifetime** may
   such a sample have before the signer must draw again? Assume the mechanics we would build:
   drawn only, adopted by its owner under the consent text, re-applied by a deliberate tap per
   document, each application recorded as an adoption with its own date, device and actor, inside
   the owner's authenticated session. The capability exists in the code and is **switched off**,
   with off as the default everywhere and Ohio / Play Academy fixed at off regardless — we are
   asking where it could ever be turned on, not for permission to turn it on here.
4. How to characterise a **seal applied later** to the 74 records signed before 2026-07-23: it
   evidences integrity from the date of sealing, not before it. Should those records be sealed by
   backfill, left as they are, or re-executed?
5. Whether the centre's **countersignature** (added after the parent's record is sealed, recorded
   with signer identity, role, method and timestamp alongside the untouched parent snapshot) needs
   any additional formality.

---

## 2. Photographs of authorized adults — consent wording — *carried over from platform-standards*

The identification-photo consent wording currently reads: *for visual identification by staff
within the center's management system* — deliberately broad enough to cover both the door handoff
and internal screens. Parents are notified through the release form; the person photographed
consents at their own registration. The item appears in the Parent Handbook.

**To confirm:** that this wording covers the actual use, that it clearly does **not** authorise
publication (website, social media, marketing — which requires separate explicit consent), and
that the stated storage discipline (private bucket, path-not-URL, short-lived signed links for
staff only, deletion on revoke, no automated face recognition of any kind) is adequately described
to the people who sign it. Source: `docs/platform-standards.md` (photo section).
