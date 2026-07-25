# Compliance map

Read-only mapping of external regulatory requirements → where the platform reflects them →
status. Rows are **provision → reflection → status**. Owner: Nikolay. Forward-only; a wrong
row is fixed by a new row, never a silent rewrite.

Status legend: ✅ Built · 🟡 Partial · 🟣 Planned · ⚪ Gap · ⛔ Out of platform (external system).

---

## Source: OAC 5180:2-17 — Step Up To Quality (SUTQ)

**Added 2026-07-25; deepened from the enacted Appendix A (2026-07-25).** SUTQ = Ohio's
Bronze / Silver / Gold quality rating system for early care & education, administered by the
**Department of Children & Youth (DCY)** — **outside the Office of Nutrition's jurisdiction**, so
these forms need **no ODEW/Nutrition approval** and ship on the normal ladder. **PFCC** requires a
rating; the **tier affects the reimbursement rate** → direct revenue impact.

**Rule structure** (numbering moved JFS `5101:2-17` → DCY `5180:2-17`):
- **5180:2-17-01 + Appendix A** — the program **standards** (this section is now grounded in the
  **enacted Appendix A, ACTION: Final, 06/24/2024**, read via browser path from codes.ohio.gov).
- **5180:2-17-03** — the **rating process**: registration → desk review → on-site verification →
  Bronze/Silver/Gold award.

**Standing rule:** *before building any SUTQ form, re-read the current Appendix A* (it is amended
periodically; this map reflects the 2024-06-24 enacted version). The **"verified list"** of
approved curricula and assessment tools is maintained by DCY and must be checked at build time.

### Appendix A standards → tiers → platform (center-based)

Standards carry DCY codes; each row shows Bronze → Silver → Gold progression, the onsite
**document** it produces, hybrid-canon class, platform reflection, status.

| Code | Standard | Bronze | Silver (adds) | Gold (adds) | Onsite document | Hybrid class | Platform | Status | Tie |
|------|----------|--------|---------------|-------------|-----------------|--------------|----------|--------|-----|
| **CA1–3** | Curriculum & Assessment | research-based curriculum aligned to **ELDS + Science of Reading** (school-age → Ohio K-12); activity/lesson plans for all instructional hours | **formal child assessment aligned to ELDS, 2×/yr**, results shared with families | intentional activities **from** assessment results; use results to adjust instruction | curriculum-alignment verification (from **verified list**); lesson plans; assessment tool + 2×/yr completion evidence | internal process + informational (curriculum) | — | 🟣 Planned | **CurriculumPulse** |
| **CS1–3** | Child Screening *(exempt: school-age; child w/ IEP/IFSP)* | comprehensive screening tool within **60 days** of enrollment + annually; results shared within 30 days | **refer** families with identified need within 60 days | **follow-up** within 30 days of referral | completed screening + share evidence; referral process; follow-up process | internal process | — | ⚪ Gap | **CurriculumPulse** |
| **SCI1–3** | Staff: Child/Adult Interactions | annual **self-assessment** per group of children | **OCOT** (Ohio Classroom Observation Tool) observed by DCY staff; self-assessment → focus + improvement goal | OCOT (observed by DCY) | self-assessment record (teacher/group/date/tool/goal/action steps/timeframe, annual) | internal process (+ sign-off) | — | ⚪ Gap | admin |
| **CI1–3** | Continuous Improvement | **Continuous Improvement Plan (CIP)** annually — 2 goals + 2 action steps | CIP adds ≥1 goal from **staff + family input** | CIP adds ≥1 goal re: **community partnerships** | CIP onsite; input-gathered evidence; community-partnership activity | internal process (+ signed sign-off) | — | ⚪ Gap | admin |
| **SE1–3** | Staff Education (quals) | admin meets licensing; **50% leads** CDA/CPL2 (or 1 AA/CPL3) | admin **AA/CPL3**; **25% leads** AA/CPL3 | admin AA/CPL3; **50% leads** AA/CPL3 | credential records (OPR / Ohio Professional Registry) | internal (tracked in OPR) + reflection | staff records (position/role) | 🟡 Partial | — |
| **PD1–3** | Professional Development | **10 h Ohio Approved / yr, ALL staff**; ≥2 topics of {Trauma, Dev. Milestones, Critical Conversations, Behavior/Classroom Mgmt, Family Engagement, Curriculum & Assessment, Science of Reading, Inclusion} | **12 h / yr** (admins/FCC), +2 h Professional's Choice | **15 h / yr** (admins/FCC), +5 h Professional's Choice | PD certificates + hours ledger; individual PD plan (staff-signed) | **fillable + signature → HTML-kit** (PD plan) + internal (hours) | staff-JD acks ledger | 🟡 Partial | [[menumaker-staff-jd-acknowledgments]] |
| **FCP1–3** | Family & Community Partnerships | **family-needs tool** within 30 days of enrollment + annually (≥3 areas: developmental/educational, health, resource e.g. food/utility) | **follow-up** on identified needs, referral within 30 days | **two annual** family educational events/workshops; referral follow-up within 30 days | needs-tool record; referral process; 2-events record; follow-up | **fillable + signature (conference/ack) → HTML-kit** + internal logging | Parents Book ack (handbook) | 🟡 Partial | [[menumaker-parents-book-pair]] |
| **Ratio (Gold)** | Staff/child ratio & group size — **Centers only** | — | — | **40% of classrooms** meet lower ratios/group sizes (infants 2:10 … school-age 1:17) | ratio/group-size records | internal process | Capacity & Ratio (`ratio_actual`, license fields) | ✅ Built | [[menumaker-roster-capacity]] |
| **Process** | Rating registration → desk review → on-site → award (5180:2-17-03) | — | — | — | registration in OPR/OCLQS | internal process (external portal) | — | ⛔ Out of platform | track readiness only |
| **Ref** | SUTQ standards / ELDS / Science of Reading / OAC texts | — | — | — | reference PDFs | informational → **PDF library** | Doc Hub library | 🟣 Planned | — |

Also relevant: **Attendance** (licensing overlap) → SafePass / attendance module → 🟡 Partial
(pilot) [[menumaker-attendance-module]]; **Administrative policies** (handbook, evaluation) →
policy_documents / Doc Hub → 🟡 Partial.

### provision → reflection → status

| Provision | Reflection | Status |
|-----------|-----------|--------|
| CA1–3 curriculum aligned ELDS+SOR + assessment 2×/yr (Silver/Gold) | none → CurriculumPulse | 🟣 Planned |
| CS1–3 screening + referral + follow-up | none → CurriculumPulse | ⚪ Gap |
| SCI1–3 self-assessment + OCOT | none | ⚪ Gap |
| CI1–3 Continuous Improvement Plan | none | ⚪ Gap |
| SE1–3 admin/lead degree/CPL levels (OPR) | staff records | 🟡 Partial |
| PD1–3 10/12/15 h Ohio Approved + 2 required topics | staff-JD ack ledger | 🟡 Partial |
| FCP1–3 family-needs tool + referrals + 2 annual events | Parents Book ack | 🟡 Partial |
| Gold ratio: 40% classrooms lower ratios (centers) | Capacity & Ratio | ✅ Built |
| 5180:2-17-03 registration → rating | external OPR/OCLQS portal | ⛔ Out of platform |

### Priority recommendation

1. **CurriculumPulse (P1)** — **CA1–3 + CS1–3** + assessment-driven lesson planning. Biggest
   **Silver/Gold** gap, ties curriculum + ELDS assessment (2×/yr) + screening/referral, and is
   **rate-affecting**. *P1 for Aug–autumn — starts after EnrollPulse (Step 3 + demo) + SafePass
   final close (Nikolay 2026-07-25).*
2. **Staff PD & quals (P2)** — **PD1–3 + SE1–3**. Extend the staff-JD ledger to a **fillable,
   signed individual PD plan** (HTML-kit) + **hours tracking (10/12/15 h/yr, 2 required topics)** +
   OPR credential/CPL level. Reuses signature-adoption + the acknowledgments ledger.
3. **Family engagement (P3)** — **FCP1–3**. Family-needs tool + referral tracking + the two
   annual family events; conference/ack forms (HTML-kit) off Parents Book.
4. **Admin / Continuous Improvement (P4)** — **SCI1–3 + CI1–3**. Annual self-assessment,
   OCOT-readiness, and a signed **Continuous Improvement Plan (CIP)** workflow.
5. **Reference library (P5)** — SUTQ standards / ELDS / SOR / OAC PDFs into the Doc Hub
   (informational, cheap, immediate).
- **Already covered:** Gold ratio 40% (✅ Capacity & Ratio can flag/track), attendance (🟡).
- **Out of scope:** rating registration (⛔ external OPR/OCLQS) — track readiness only.

**Jurisdiction note:** DCY, not Office of Nutrition → ships on the normal ladder with **no
Nutrition-approval gate** (unlike CACFP enrollment/IEA).

### Sources
- [OAC rule 5180:2-17-01 (codes.ohio.gov)](https://codes.ohio.gov/ohio-administrative-code/rule-5180:2-17-01)
- [Appendix A to 5180:2-17-01 — enacted 2024-06-24 (PDF, codes.ohio.gov)](https://codes.ohio.gov/assets/laws/administrative-code/pdfs/5180/2/17/5180$2-17-01_PH_FF_A_APP9_20240624_1438.pdf)
- [OAC 5101:2-17-03 rating process (LII)](https://www.law.cornell.edu/regulations/ohio/Ohio-Admin-Code-5101-2-17-03)
- [DCY — Step Up To Quality](https://childrenandyouth.ohio.gov/for-providers/step-up-to-quality/step-up-to-quality)
- [DCY — Publicly Funded Child Care (PFCC)](https://childrenandyouth.ohio.gov/for-providers/resources/pfcc)
