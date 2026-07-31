# Compliance map

Read-only mapping of external regulatory requirements → where the platform reflects them →
status. Rows are **provision → reflection → status**. Owner: Nikolay. Forward-only; a wrong
row is fixed by a new row, never a silent rewrite.

Status legend: ✅ Built · 🟡 Partial · 🟣 Planned · ⚪ Gap · ⛔ Out of platform (external system).

---

## Source: DCY — electronic signatures on child-care records (guidance received 2026-07-27)

**Added 2026-07-27.** Verbal/written guidance from DCY to Nikolay, quoted verbatim:
*"Electronic signatures are allowed … official electronic signature or physical signature
on-line. It can't just be the parent typing their name in."*

**Verdict, one line: an e-signature is acceptable only if it is a real signature made online —
a typed name is not one.** Our platform offered BOTH (draw or type) on the parent slot of every
signing kit from 2026-07-24; as of 2026-07-27 the typed option is removed from every government
form and from the two internal forms whose signature can be re-applied to a government form.

### provision → reflection → status

| Provision | Reflection | Status |
|-----------|-----------|--------|
| Signature must be an official electronic signature, not a typed name | Parent slot on DCY 01234 (v8), CACFP Enrollment (v11), IEA FY2026-27 (v8), USDA Waiver (v5) = **draw only**; typed rail, script faces and renderer deleted from the edition | ✅ Built |
| Same, at the source of a re-applied signature | Parent Consent (v4) and Parent Handbook Receipt (v2) — the two forms that MINT the saved sample adopted by the government forms — also draw-only | ✅ Built |
| Centre-side signature (program administrator / sponsor) | Never typed-capable; drawn on the form or countersigned in-app | ✅ Built |
| Documented consent to sign electronically | Parent Consent for Electronic Signatures, signed + sealed as its own record | ✅ Built |
| Signature bound to an attestation | Signature block locked until required fields complete; attestation = the official form's own certification text, verbatim | ✅ Built |
| Signature bound to a date | Date beside a signature is a STAMP set at the moment of signing, read-only, cleared with the signature, bound 1:1 | ✅ Built |
| Trusted time + submitting device | Server `sealed_at`, `created_at`, `submit_ip`, `submit_user_agent` — taken by the RPC, never from the client | ✅ Built |
| Tamper-evidence / non-repudiation | SHA-256 `content_hash` over form data ⨁ signature snapshot; seal trigger blocks edits and deletion for **all** roles incl. service_role; a correction is a new row (`supersedes_id` + reason) | ✅ Built |
| Retrievable copy of what was signed | Snapshot at Approve: official pages to a private bucket + `content_sha` tied to the record's hash; view/print come from the snapshot | ✅ Built |
| Same protection on records signed before 2026-07-23 | Sealing is forward-only — 74 of 90 records unsealed; backfill is a separate decision | 🟡 Partial |
| Form edition stamped on each record | `form_version` written on the embedded path only; public storefront path does not send it yet (0 rows) — edition established by registry + deploy history | 🟡 Partial |
| Consent flag on the record | `esign_consent_at` column + RPC parameter exist; forms do not emit the flag yet (0 rows) | 🟡 Partial |
| Staff/public submission path sealed | `submit_public_form` not yet mirrored to the sealed pattern | ⚪ Gap |
| Internal (non-agency) documents may still be typed | Child Release Authorization, Transition into the Program, Staff Consent — typed rail retained pending counsel's view | 🟡 Partial |

**One-page answer for DCY and counsel:** [`docs/compliance/e-signature.md`](compliance/e-signature.md).
**Live record as of 2026-07-27:** zero typed signatures on any government form; the five typed
signatures on file are all on the internal e-signature consent form, all before 2026-07-24.

---

## Source: OAC 5180:2-12 — licensing: nap-time ratio (read 2026-07-26)

**Added 2026-07-26, read via browser path from codes.ohio.gov (primary source, not memory) —
same method as the enacted SUTQ Appendix A.**

**Verdict, one line: the nap-time ratio relief is REAL and conditional — the staff/child ratio
may be DOUBLED for no more than two hours during nap, only if every child in the group is on a
cot or mat, only if the group contains no infants, and only while there are still enough staff
IN THE BUILDING to meet the normal ratio for that group.**

| Item | Fact |
|---|---|
| Rule | **5180:2-12-20** — *Sleeping and napping requirements for a licensed child care center*, **effective July 1, 2026** |
| Provision | **(A)(7)**, verbatim: *"Ratio may be doubled for no more than two hours during nap time, and shall only be doubled if all of the children in the group are on cots or on mats, if the group does not include any infants and if there are enough child care staff members in the building to meet staff/child ratio pursuant to rule 5180:2-12-18 of the Administrative Code for the group."* |
| Conditions | ≤ **2 hours** · **all** children on cots/mats · **no infants** in the group · building-level staffing still meets 5180:2-12-18 for that group |
| Supervision, same rule | rest areas **"lighted to allow for visual supervision of all children at all times"** (A)(3); **"a clear path to each resting child"** (A)(5) |
| Base ratios | **5180:2-12-18** — *Group size and ratios*, effective **October 29, 2021**; the table itself lives in **appendix A to that rule** (must be re-read before use, like SUTQ Appendix A) |
| Second-adult floor | 5180:2-12-18: *"There shall be at least one other employee or child care staff member at the center if there are seven or more children in the building."* No "within call / same floor" wording found in the rule text |

**Platform status:** 🟡 Partial — the nap exception is **not modelled** anywhere. Capacity &
Ratio computes `ratio_actual` against the ordinary ratio only, so a legally-staffed nap hour
would read as understaffed if the module ever alerts on it.

**Consequence already true of GatePulse (no build required):** a room legitimately held by ONE
adult during nap is normal, not an anomaly — one checked-in teacher = one name tile, and the
tile mechanics already survive it. The system must never treat a single tile as a defect.

**Not yet written into the guides** — the operational note ("lunch cover during nap without a
floater") goes into the teacher/director guides only on a separate word.

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

---

## Срок хранения записей CACFP — из нормы (внесено 2026-07-31)

**Норма:** 7 CFR 226.10(d), «Program payment procedures».
**Источник:** [eCFR, 7 CFR 226.10](https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-A/part-226/subpart-C/section-226.10) — прочитано 31.07.2026.

**Дословно:**

> All records to support the claim shall be retained for a period of three years after the date
> of submission of the final claim for the fiscal year to which they pertain, except that if audit
> findings have not been resolved, the records shall be retained beyond the end of the three year
> period as long as may be required for the resolution of the issues raised by the audit. All
> accounts and records pertaining to the Program shall be made available, upon request, to
> representatives of the State agency, of the Department, and of the U.S. Government Accountability
> Office for audit or review, at a reasonable time and place.

**Дата вступления и история правок** (примечание к разделу):
47 FR 36527, **20.08.1982** — исходная редакция; далее правки 49 FR 18988 (04.05.1984) · 50 FR 26975
(01.07.1985) · 53 FR 52590 (28.12.1988) · 55 FR 1378 (14.01.1990) · 62 FR 23618 (01.05.1997) ·
69 FR 53543 (01.09.2004) · 70 FR 43261 (27.07.2005) · 71 FR 39519 (13.07.2006) · 72 FR 41607
(31.07.2007) · 75 FR 16327 (01.04.2010) · 76 FR 22798 (25.04.2011) · 76 FR 34571 (13.06.2011) ·
81 FR 66492 (28.09.2016) · **88 FR 57855, 23.08.2023 — последняя**.

### Что из этого следует для нас — три вещи, и ни одна не «три года от даты листа»

1. **Отсчёт идёт НЕ от даты документа, а от даты подачи ПОСЛЕДНЕГО клейма за фискальный год.**
   Лист недели 29.06.2026 хранится не до июня 2029, а три года от подачи финального клейма за
   FY2026 — то есть срок у всех документов года **общий и сдвигается вместе с подачей**.
2. **Аудит продлевает срок без верхней границы.** «Три года» — минимум, а не правило: при
   неразрешённых замечаниях хранение длится столько, сколько нужно для их разрешения. Значит
   автоматическое удаление по таймеру строить **нельзя** — оно уничтожит документ, который обязаны
   предъявить.
3. **Обязанность не только хранить, но и ПРЕДЪЯВИТЬ** «upon request… at a reasonable time and
   place». Это прямое основание требования владельца «отчёт и его бумага достаются одним
   движением»: хранение без быстрой выдачи нормы не исполняет.

⚠️ **Мы сегодня не можем назвать дату начала отсчёта:** `monthly_claims` пуста, факт подачи ни
одного месяца не записан. Срок хранения **вычислить не из чего** — ровно тот же пробел, что у
нижней границы период-эффективного правила и у заморозки поданного месяца. Все три закрываются
одной записью: **подача месяца сохраняет снимок**.

---

## Source: Ohio DEW — бюллетень «CACFP Policy Updates» (30.07.2026 12:37 EDT)

**Источник:** https://content.govdelivery.com/accounts/OHED/bulletins/422ce3f
**Категория:** нормативные документы по финансированию.
**PDF политик:** CRRS → Applications → Download Forms (в самом бюллетене файлов нет).

### 🔴 ОТВЕТ НА ВОПРОС «КАКИЕ ФОРМЫ МЕНЯЮТСЯ И ЕСТЬ ЛИ ОНИ У НАС»

**Бюллетень НЕ НАЗЫВАЕТ НИ ОДНОЙ НОВОЙ ФОРМЫ.** Он отправляет за политиками и шаблонами в
CRRS → Applications → Download Forms.

```
✅ РОДИТЕЛЬСКИЕ И КАДРОВЫЕ ФОРМЫ НЕ МЕНЯЮТСЯ — весь кит не затронут (32 записи реестра)
🔴 ЗАТРОНУТ СПОНСОРСКИЙ УРОВЕНЬ — документы к загрузке в CRRS до 15.10
```

Документы к загрузке (спонсорский уровень, три центра):
лицензии садов ×3 · лицензии пищевого сервиса ×3 · акты инспекций ×3 · management plan ·
бюджет · совет директоров · site application по каждому центру · чек-лист · сведения об
организации и адрес.

### Четыре политики бюллетеня

| | Политика | Что говорит | Нас касается |
|---|---|---|---|
| 1 | **Changes in Ownership** | уведомление + договор при смене владения | при событии |
| 2 | **Changes to CRRS Application** | ⏰ **ежегодное обновление и ресертификация до 15 октября**: организация, адрес, детали программы, management plan, **бюджет**, совет директоров, site application по каждой площадке, чек-лист; загрузить лицензии садов, лицензии пищевого сервиса, акты инспекций | **ДА — веха 15.10** |
| 3 | **Shifts and Licensing Capacity** | приёмы только для **различных непересекающихся** групп в пределах ёмкости; смены **нельзя** использовать для растягивания времени приёма или для опоздавших | **ДА — см. замер ниже** |
| 4 | **Site Capacity for Unlicensed Sites** | свыше 150 без лицензии — письменное одобрение Департамента | нет (все площадки лицензированы) |

### ⏰ ДЕДЛАЙН 15 ОКТЯБРЯ — с источником и с расхождением

```
СРОК:      15 октября · ежегодное обновление и ресертификация заявки CRRS
ИСТОЧНИК:  бюллетень DEW 30.07.2026 + политика «Annual CRRS Application Updates Policy»
СТАТУС:    подтверждается у EPS
ПРЕЖНЕЕ ЗНАЧЕНИЕ: 15 НОЯБРЯ — со слов владельца, 18 лет практики
```

⚠️ **Расхождение фиксируется явно и не затирается:** срок сдвинулся на месяц вперёд.
Обнаружено случайно, при работе о другом — правило, которое из этого выросло, записано в
стандартах: **«ПРИВЫЧКА НЕ ЕСТЬ КАЛЕНДАРЬ»**.

**Цена пропуска — не бумажная.** Невыполнение годовых требований в срок влияет на продолжение
участия в CACFP, **включая подачу месячных заявок на возмещение**: остановка денег по трём
центрам. Поэтому 15.10 идёт **отдельной вехой**, а не строкой в очереди, и ложится на окно
боевого старта 1 октября.

### Замер под политику №3 «Shifts and Licensing Capacity» (чтение кода и базы, 31.07)

**Понятия смены у нас НЕТ ВОВСЕ.**

| Вопрос | Ответ | Где смотрел |
|---|---|---|
| Есть ли сущность смены/сессии | **нет** — ни таблицы, ни поля на классе, ни времени приёма | схема `menumaker` |
| Что такое C4 `Number of Shifts` | **ручное поле формы**, ни на что не влияет | `SiteClaimReport.tsx:407` |
| Что кладёт в него расчёт клейма | **константу 1** | `compute_monthly_claim`, `20260730b:170` |
| Записано ли где-то фактическое значение | **нет**: `monthly_claims` **пуста** — ни один месяц не подан через систему | замер 31.07 |

🔴 **Может ли один ребёнок попасть в две «группы» одного дня — ДА, и это уже происходит.**
Это наше задвоение **вида Б**: ребёнок ест в новой комнате, а старая продолжает отмечать;
замер 30–31.07 — 97 клеток и $228 за июль, 110 из 139 задвоенных клеток Ridge внутри **одной**
комнаты (расщепление по имени) и остальные между комнатами. Политика запрещает ровно эту
картину, когда ею растягивают ёмкость или время приёма. **Родство прямое:** правило
«ребёнок + дата + приём больше одного раза» из
[спеки проверки задвоения](specs/2026-07-31-duplicate-mark-check.md) — это и есть контроль
под политику №3, только со стороны данных.

⚠️ **Сопутствующая находка о ёмкости.** `compute_monthly_claim` берёт `license_capacity` из
`center_licenses` (`license_type='child_care' and is_current`) — такая строка есть **только у
Pearl**. Для Ridge и Highland Heights заявка получает `license_capacity = null`, при том что
`centers.license_capacity` для них заполнена (215 и 106). Два хранилища ёмкости, и клеймовая
функция читает то, которое пусто у двух центров из трёх.

### Комплект документов к 15.10 — что реально лежит в системе

Замер и чек-лист недостающего — в
[спеке реестра регуляторных сроков](specs/2026-07-31-regulatory-deadlines-registry.md),
раздел «Замер комплекта к 15 октября». Коротко: **три текущих лицензии с файлами из девяти
ожидаемых**, у Highland Heights **нет ни одной строки**, актов инспекций в системе **нет
ни одного**, `menumaker.documents` **пуста**.

---

## Source: 7 CFR 226 — кому положен возмещаемый приём в детском компоненте (сверено 2026-07-31)

**Способ проверки:** дословные цитаты, снятые 31.07.2026 с Cornell LII (`law.cornell.edu/cfr/text/7/226.2`,
`.../226.17`). eCFR в этот день отдавал редирект на страницу разблокировки и процитирован не был.

### provision → reflection → status

| Норма | Дословно | Как отражено у нас | Статус |
|---|---|---|---|
| **§226.2 «Children»** | *«Persons age 12 and under; Persons age 15 and under who are children of migrant workers; Persons with disabilities as defined in this section; For emergency shelters, persons age 18 and under; and For at-risk afterschool care centers, persons age 18 and under at the start of the school year.»* | возраст выводится из `birthday`; **порога «12 и младше» в счёте НЕТ** | ⚪ **Gap** |
| **§226.2 «Enrolled child»** | *«A child whose parent or guardian has submitted to an institution a signed document which indicates that the child is enrolled for child care.»* | зачисление = строка ростера + подписанная форма; проверки «есть ли подпись» счёт не делает | 🟡 Partial |
| **§226.17(b)(3)** | *«Reimbursement must not be claimed for more than two meals and one snack or one meal and two snacks provided daily to each child.»* | **это и есть правило кружка**: `compute_monthly_claim` снимает завтрак при ланче и ужине, PM при AM, вечерний при AM/PM | ✅ Built (31.07) |
| **§226.17(b)(9)** | *«Each child care center must maintain daily records of time of service meal counts by type (breakfast, lunch, supper, and snacks) served to enrolled children, **and to adults performing labor necessary to the food service**.»* | псевдоклассы «Staff Room»/«Staff» (`is_roster=false`) — раздельный учёт есть; но **10 взрослых имеют отметки в ДЕТСКИХ комнатах**, и счёт их не отделяет | 🔴 **Gap, claim-facing** |

### Что следует ПРЯМО, и где граница доказанного

**Доказано текстом:** возмещение считается «to each **child**», а «child» — 12 лет и младше
(до 18 в at-risk/emergency); приёмы взрослых, работающих на пищевом сервисе, ведутся
**ОТДЕЛЬНОЙ записью** по (b)(9). Отсюда: **взрослый приём в детском компоненте не является
заявляемым**, иначе раздельный учёт (b)(9) не имел бы смысла.

⚠️ **НЕ доказано цитатой и потому не утверждается как норма:** формулировка «питание
взрослого персонала — допустимый ОПЕРАЦИОННЫЙ расход». В тексте §226.17 её нет; она живёт в
инструкциях FNS и в стоимостных правилах (§226.15 / 2 CFR 200), которые на 31.07 **не
сверены**. Понадобится опереться на неё в деньгах — сверять отдельно и датировать.

**Цена вопроса замерена:** июль 2026, Highland Heights — **221 возмещаемый приём десяти
взрослых, $779.14**, все по ставкам **Free**. Разбор — в
[плане 31.07c](plans/2026-07-31c-frp-carrier-and-claim-surfaces.md), раздел 20.

---

## Source: 7 CFR 226 — счёт приёмов ВО ВРЕМЯ ПОДАЧИ (сверено 2026-07-31)

**Способ проверки:** дословные цитаты с Cornell LII (`law.cornell.edu/cfr/text/7/226.15`,
`.../226.17`), сняты 31.07.2026. eCFR отдавал редирект и не цитировался.

| Норма | Дословно | Как отражено у нас | Статус |
|---|---|---|---|
| **§226.15(e)(4)** | *«Daily records indicating the number of participants in attendance and the daily meal counts … served to family day care home participants, or **the time of service meal counts**, by type (breakfast, lunch, supper, and snacks), **served to center participants**.»* | поварской экран пишет через `sync_meal_marks` с `marked_at` = время тапа на устройстве → журнал `meal_count_marks` | 🟡 **Partial** |
| **§226.17(b)(9)** | *«Each child care center must maintain **daily records of time of service meal counts** by type … served to enrolled children, and to adults performing labor necessary to the food service.»* | тот же журнал; отдельный учёт взрослых — псевдоклассы `is_roster=false` | 🟡 Partial |

### Почему Partial, а не Built — два измеренных разрыва

1. 🔴 **Директорский экран пишет клетки МИМО журнала** (`MealCountDirectorPage.tsx:236-247`
   — прямой `update`/`upsert` в `meal_week_records`). Отметка, сделанная там, **не несёт
   времени подачи вовсе**. За недели 20.07 и 27.07 у Ridge в журнале **ноль строк** при живой
   сетке — то есть по этому центру требование «time of service» **сегодня не исполняется и не
   измеряется**.
2. **Своевременность замерена и низка:** неделя 20–24.07, Highland + Pearl, 1 795 отметок —
   **38 % во время подачи**, 10 % наперёд, 34 % позже в тот же день, **17 % на другой день**
   (макс. опоздание 31 день). Разбор: [план 31.07d](plans/2026-07-31d-pos-timeliness-measure.md).

⚠️ **Границы цитат.** Норма требует счёта во время подачи и ежедневной записи. Она **не**
называет допустимого опоздания в минутах и **не** содержит слов «отметка задним числом
запрещена» или «неотмеченный вовремя приём не возмещается». Наш порог «конец окна + 30 минут» —
**рабочее правило центра**, а не требование регулятора, и в документах для персонала подаётся
именно так.
