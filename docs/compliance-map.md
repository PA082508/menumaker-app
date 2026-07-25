# Compliance map

Read-only mapping of external regulatory requirements → where the platform reflects them →
status. Rows are **provision → reflection → status**. Owner: Nikolay. Forward-only; a wrong
row is fixed by a new row, never a silent rewrite.

Status legend: ✅ Built · 🟡 Partial · 🟣 Planned · ⚪ Gap · ⛔ Out of platform (external system).

---

## Source: OAC 5180:2-17 — Step Up To Quality (SUTQ)

**Added 2026-07-25.** SUTQ = Ohio's Bronze / Silver / Gold quality rating system for early care
& education, administered by the **Department of Children & Youth (DCY)** — **outside the Office
of Nutrition's jurisdiction**, so these forms need **no ODEW/Nutrition approval** and can ship on
the normal ladder. **PFCC** (Publicly Funded Child Care) requires a rating; the **tier affects
the reimbursement rate** → direct revenue impact.

**Rule structure** (numbering moved JFS `5101:2-17` → DCY `5180:2-17`):
- **5180:2-17-01 (+ Appendix A)** — the actual program **standards** (curriculum, assessment,
  administrator & staff qualifications). *The per-tier documentation list lives in Appendix A;
  its full text was not machine-fetchable here — rows below are grounded in DCY/SST guidance and
  flagged where exact Appendix-A wording must be **verified against live OAC** before build.*
- **5180:2-17-03** — the **rating process**: registration → desk review → on-site verification →
  Bronze/Silver/Gold award.

**Grounded facts (verified via search):** curriculum must be research-based and aligned to the
**ELDS + Science of Reading at all tiers**; **formal child assessment across all 8 ELDS domains,
twice a year, at Silver & Gold**; SUTQ PD certification needs **≥20 hours Ohio Approved training
each biennium**. Sources at the bottom.

### SUTQ document / standard inventory → hybrid-canon class → platform status

| # | SUTQ item | Domain | Tier | Hybrid class | Platform reflection | Status | Tie |
|---|-----------|--------|------|--------------|---------------------|--------|-----|
| 1 | Rating **registration / application** | Process | all | internal process (external portal) | submitted in the Ohio Professional Registry / OCLQS, not the platform | ⛔ Out of platform | track readiness only |
| 2 | **Curriculum aligned to ELDS + Science of Reading** | Learning & Dev | all | informational (curriculum) + internal (alignment record) | none | 🟣 Planned | **CurriculumPulse** |
| 3 | **Formal child assessment**, 8 ELDS domains, **2×/yr** | Learning & Dev | Silver/Gold | internal process (assessment records + schedule) | none | ⚪ Gap | **CurriculumPulse** |
| 4 | **Lesson / activity plans** (reflect curriculum + assessment) | Learning & Dev | Silver/Gold | internal process (Lead-authored) | teacher-portal plan (Lead-only lesson plans) — not built | 🟣 Planned | teacher-portal / **CurriculumPulse** |
| 5 | **ELDS screening & referral** records | Learning & Dev | Silver/Gold | internal process | none | ⚪ Gap | **CurriculumPulse** |
| 6 | **Staff Career Pathways** levels (OPR) | Staff Qual & PD | all | internal (tracked in OPR) + reflection | staff records (position/role) — partial | 🟡 Partial | — |
| 7 | **Individual professional-development plan** (staff-signed) | Staff Qual & PD | all | **fillable + signature → HTML-kit** | staff-JD acknowledgments ledger (policy_documents) — partial | 🟡 Partial | [[menumaker-staff-jd-acknowledgments]] |
| 8 | **PD hours: ≥20h Ohio Approved / biennium** | Staff Qual & PD | all | internal process (hours tracking) | none | ⚪ Gap | — |
| 9 | **Family engagement** plan + activities + conferences | Family & Community | all | **fillable + signature (conference/ack) → HTML-kit** + internal logging | Parents Book ack (handbook) — partial | 🟡 Partial | [[menumaker-parents-book-pair]] |
| 10 | **Program self-assessment / CQIP** (continuous quality improvement plan) | Admin & Leadership | all | internal process (+ sign-off fillable) | none | ⚪ Gap | — |
| 11 | **Administrative & leadership policies** (staff handbook, evaluation, business practices) | Admin & Leadership | all | informational (PDF) + fillable acks | policy_documents / Doc Hub — partial | 🟡 Partial | — |
| 12 | **Staff/child ratio, group size, capacity** | Admin / Health & Safety | all | internal process | Capacity & Ratio (`ratio_actual`, license fields) | ✅ Built | [[menumaker-roster-capacity]] |
| 13 | **Attendance** records | Admin / licensing overlap | all | internal process | SafePass / attendance module — pilot | 🟡 Partial | [[menumaker-attendance-module]] |
| 14 | SUTQ standards / ELDS / Science-of-Reading / OAC rule **reference texts** | reference | all | informational → **PDF library** | Doc Hub library | 🟣 Planned | add to library |

### provision → reflection → status (compliance rows)

| Provision (OAC 5180:2-17) | Platform reflection | Status |
|---------------------------|---------------------|--------|
| 5180:2-17-01 App A — research-based curriculum aligned to ELDS + SOR (all tiers) | none yet → CurriculumPulse | 🟣 Planned |
| 5180:2-17-01 App A — formal child assessment, 8 ELDS domains, 2×/yr (Silver/Gold) | none yet → CurriculumPulse | ⚪ Gap |
| 5180:2-17-01 App A — administrator & staff qualifications / Career Pathways | staff records + JD-ack ledger | 🟡 Partial |
| 5180:2-17-01 App A — ≥20h Ohio Approved PD / biennium | none yet | ⚪ Gap |
| 5180:2-17-01 App A — family & community partnerships | Parents Book ack | 🟡 Partial |
| 5180:2-17-01 App A — administrative & leadership practices / self-assessment | policy_documents (partial); CQIP none | 🟡 Partial / ⚪ Gap |
| 5180:2-17-01 App A — staff/child ratio & capacity | Capacity & Ratio | ✅ Built |
| 5180:2-17-03 — registration → desk review → on-site → rating | external OPR/OCLQS portal | ⛔ Out of platform |

> **Verify-before-build flag:** the exact per-tier document list, named forms, and appendix
> lettering in **5180:2-17-01 Appendix A** must be read from the live OAC before any SUTQ form is
> built. Rows above are the guidance-level shape, not a substitute for the appendix text.

### Priority recommendation

1. **CurriculumPulse (P1)** — items 2/3/4/5. The single biggest **Silver/Gold** gap, ties four
   standards, and is **rate-affecting** (tier → PFCC reimbursement). Highest leverage. Includes
   the ELDS-aligned assessment cadence (2×/yr) and curriculum-alignment record.
2. **Staff PD & Career Pathways (P2)** — items 6/7/8. Extend the existing staff-JD ledger to a
   **fillable, signed individual PD plan** (HTML-kit) + **20h/biennium hours tracking** + OPR
   Career-Pathways level. Reuses signature-adoption + the acknowledgments ledger.
3. **Family engagement (P3)** — item 9. Extend Parents Book to a family-engagement plan +
   **conference/ack forms** (HTML-kit).
4. **Self-assessment / CQIP (P4)** — item 10. Admin-domain workflow + signed sign-off.
5. **Reference library (P5)** — item 14. Drop SUTQ standards / ELDS / SOR / OAC PDFs into the Doc
   Hub library (informational, cheap, immediate).
- **Already covered:** ratio/capacity (✅), attendance (🟡 via SafePass pilot).
- **Out of scope:** rating registration (⛔ external OPR portal) — the platform only tracks
  readiness, never files the rating.

**Jurisdiction note:** DCY, not Office of Nutrition → these ship on the normal ladder with **no
Nutrition-approval gate** (unlike the CACFP enrollment/IEA forms).

### Sources
- [DCY — Step Up To Quality](https://childrenandyouth.ohio.gov/for-providers/step-up-to-quality/step-up-to-quality)
- [DCY — SUTQ Guidance & Implementation](https://childrenandyouth.ohio.gov/for-providers/step-up-to-quality/guidance-implementation)
- [OAC 5101:2-17-03 (rating process; now 5180:2-17-03) — LII](https://www.law.cornell.edu/regulations/ohio/Ohio-Admin-Code-5101-2-17-03)
- [Ohio Admin Code chapter 2-17 index — Justia](https://regulations.justia.com/states/ohio/title-5101-2/chapter-5101-2-17)
- [DCY — Publicly Funded Child Care (PFCC)](https://childrenandyouth.ohio.gov/for-providers/resources/pfcc)
