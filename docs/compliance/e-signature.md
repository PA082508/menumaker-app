# Electronic signatures — how a signature on our forms is made and held

**Audience:** Ohio DCY licensing / ODEW Office of Nutrition reviewers, and our counsel.
**Owner:** Nikolay · **Status:** current as of **2026-07-27** · **Forward-only** — this page is
corrected by a new version, never by a silent rewrite.

**The question this answers.** DCY: *"Electronic signatures are allowed … official electronic
signature or physical signature on-line. It can't just be the parent typing their name in."*

**The answer in one line.** On every government form in this system the parent **draws** their
signature — finger, stylus or mouse — directly on the official form page; a typed name is not
accepted, and as of edition **2026-07-27** the option to type one does not exist in the software.
Each signature is bound to an attestation, a signing-moment date stamp, a server timestamp, the
submitting device's network context, and a SHA-256 seal that makes the signed record
tamper-evident and undeletable.

---

## 1. What the parent does

| Step | What happens | Why it satisfies the requirement |
|---|---|---|
| **Consent on file first** | The family signs a separate **Parent Consent for Electronic Signatures**: *"your electronic signature will be considered your legal signature … you may request a paper copy at any time."* | Informed, documented consent to sign electronically — its own signed, sealed record. |
| **The official form, not a re-typed copy** | Government forms are rendered as the **official state/federal page** (150 dpi scan of the issued form) with input fields seated over it. Print is indistinguishable from the paper original. | The parent signs the actual form, under the form's own printed certification. |
| **Attestation before signature** | The signature block is **locked** until every required field is complete. The attestation is the form's own text — e.g. IEA: *"I certify that all information on this form is true and correct and that all income is reported."* We do not paraphrase it. | The signature is applied to a completed form, beneath the authority's own words. |
| **Drawn signature** | Tapping the signature block opens a large signing pad. The parent draws; the stroke is captured, scaled to fit and clipped into the form's signature box. **There is no "type your name" option.** | A handwritten mark made online — not a typed name. |
| **Date is a stamp, not a field** | The date beside a signature is set **at the moment of signing**, is read-only, and is cleared if the signature is erased. It is bound 1:1 to its own stroke. | No back-dating; the date cannot drift from the act of signing. |

## 2. What the system records, per signature

Recorded by the database function that receives the submission
(`menumaker.submit_enrollment_form`, `SECURITY DEFINER`). Items marked **server** are taken by
the server from the request; the client cannot set or alter them.

| Recorded | Value |
|---|---|
| `form_data` | Every field as filled, plus `signature_method` (now always `drawn` on the forms below) |
| `sealed_signatures` | **Immutable snapshot** of the signature image(s) exactly as submitted |
| `content_hash` | **server** — SHA-256 over canonical `form_data` ⨁ canonical `sealed_signatures` |
| `sealed_at` | **server** — database clock at the moment the record was sealed |
| `created_at` | **server** — insert time |
| `signature_date` | The date stamped on the form at signing (the human-visible date) |
| `submit_ip`, `submit_user_agent` | **server** — network address and device/browser of the submitting device, read from the request headers |
| `source` | `online` · `paper_entry` · `manual_entry` — how the record entered the system |
| `signatures.countersign_meta` | For the centre's countersignature: who (authenticated user id), name, role, method, timestamp |

## 3. Why the record cannot be altered afterwards

* A database trigger **seals** every record that carries a `content_hash`. On a sealed record,
  any attempt to change `form_data`, the signature snapshot, the hash, the version, the server
  timestamps, the network context, the signature date, the form type or the centre **fails with
  an error**, and **deletion is refused outright**.
* This applies to **every** database role — including the application's own service role. The
  application cannot bypass it.
* A correction is therefore never an edit: it is a **new record** that points at the one it
  supersedes and must carry a written reason. The original stays exactly as signed.
* Approval is **additive**: the reviewer's decision, the child link and the centre's
  countersignature are added alongside; the parent's sealed snapshot is never touched.
* The hash is reproducible: re-computing SHA-256 over the stored form data and signature snapshot
  must reproduce `content_hash`. Any alteration in storage would show up as a mismatch.

## 4. The frozen picture of the approved form

When the centre approves a form, the system renders the **official page** from the sealed record
and stores it as image pages in a **private** bucket, with a row recording:

* `content_sha` — SHA-256 of the stored pages,
* `submission_content_hash` — the seal of the record it was made from (the two are tied together),
* the replica edition, page count, who approved, and when.

Only a service-role function writes these; the form type, centre and record hash are taken from
the record itself, never from the browser. Later viewing and printing come **from this snapshot**,
not from a fresh render — what is shown a year later is what was approved.

## 5. Where a typed name still exists — and where it does not

As of **2026-07-27** the typed-signature option is removed from:

| Form | Edition | Signer |
|---|---|---|
| DCY 01234 — Child Enrollment & Health | **v8** | parent |
| CACFP Enrollment | **v11** | parent |
| Income Eligibility Application FY2026-27 | **v8** | adult household member |
| USDA Income Eligibility Waiver | **v5** | parent |
| Parent Consent for Electronic Signatures | **v4** | parent |
| Parent Handbook Receipt | **v2** | parent (both signature blocks) |

The last two are not government forms; they are included because their signature could be
**re-applied with one tap** to a government form (a saved-signature convenience). Removing the
typed option there closes that path at its source.

The centre-side signature blocks on the government forms — the program administrator's
acknowledgment on DCY 01234 and the sponsor certification on the IEA — have **never** offered a
typed option; they are drawn.

**Still typed-capable (internal documents only, not submitted to any agency):** Child Release
Authorization, Transition into the Program, Staff Consent for Electronic Signatures. See §7.

## 5a. What the seal proves — and what it does not

**The seal proves that the DATA of a record has not changed since it was signed. It does not
prove WHICH TEXT was on the signer's screen.** Those are two different claims, and only the
first one is currently evidenced. Until 2026-07-27 the gap was theoretical, because every
edition of a form said the same thing as the paper it replaced. That day the editions first
diverged in content — one corrected typo and a section of authorized departures from the Word
original — so the second gap became real: two records signed a week apart can now carry the
same form type and different words, and nothing in the record says which words.

What closes it is `form_version` on every signed record (§6) — the edition the signer actually
had open, recorded at the moment of signing. It cannot be reconstructed afterwards, for the same
reason a seal cannot: evidence is either captured when it happens or it is not evidence.

## 6. Honest state of the record (what a reviewer would find today)

* **90 electronic submissions** on file. **16** carry the tamper-evident seal — sealing was
  introduced 2026-07-23 and applies **forward only**; the 74 earlier records are unsealed until a
  separate, decided backfill. **7** carry the server seal timestamp (introduced 2026-07-25).
* **Zero typed signatures exist on any government form.** Five typed signatures exist in total,
  all on the internal *Parent Consent for Electronic Signatures*, all before 2026-07-24. The eight
  government-form submissions received since the typed option shipped were all drawn.
* **Form edition** is not yet written onto each record from the public form path (only from the
  embedded path). Until that is wired, the edition in force at a given date is established by the
  form registry and its deploy history, both under version control.
* **The consent flag** on the record (`esign_consent_at`) is not yet emitted by the forms; the
  consent itself is on file as its own signed submission.
* The staff/public submission path (`submit_public_form`) is not yet sealed; the parent path is.

None of these gaps affect the answer to DCY's question: the parent's mark is drawn, not typed.

## 7. What we ask counsel to confirm

1. That a **drawn** signature captured online, under the form's own attestation, with a
   signing-moment date stamp, a server timestamp, device/network context, and a tamper-evident
   SHA-256 seal, satisfies *"official electronic signature … not just typing their name"*
   for Ohio DCY licensing records and for CACFP records.
2. Whether the **standing consent** form (§1) should be re-executed annually, or per program year.
3. Whether the internal documents listed in §5 may keep a typed option, or should also be
   restricted to drawn signatures for consistency.
4. Whether the unsealed pre-2026-07-23 records (§6) should be sealed by backfill, and what the
   correct characterisation of a backfilled seal is (a seal applied later is evidence of
   *integrity from that date*, not of integrity before it).

---

*Related: `docs/esignature-system-description.md` (full system description as given to ODEW) ·
`docs/esignature-letter-system-reconciliation.md` (letter claims vs. system, line by line) ·
`docs/compliance-map.md` (regulatory provision → where the platform reflects it).*
