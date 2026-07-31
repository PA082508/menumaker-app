# Document Library — final structure

Status: **LOCKED 2026-07-09 (Nikolay).** Build is **queued — after the Staff flip**,
per the queue. This doc is the target the Doc-Hub reorg builds to; nothing is
reorganized yet. Supersedes the current flat `DOCS` + category layout in
[`DocumentHubPage`](../src/pages/instructions/DocumentHubPage.tsx).

Shape = **4 sections + 1 campaign panel** (the panel is a working tab that overlays
sections 1–2, not a fifth section).

## Section 1 — Ohio DCY

The state childcare-licensing packet.
- **Enrollment packet:** DCY 01234 (v5), DCY 01236, DCY 01217, DCY 01305 + attachments.
- **Step Up To Quality (SUTQ)** — a **subgroup** under this section.

Registry: the `dcy_*` records in [`enroll-registry.json`](../public/enroll-registry.json)
(01234/01236/01217/01305). 01234 is the trigger form; 01236/01217 are physician-signed
conditionals.

## Section 2 — CACFP (participation forms)

The food-program forms families/officials fill.
- CACFP Enrollment **v9**, IEA **v6**, USDA Waiver, Fluid Milk Substitution,
  Special Diet, Infant Meals Preference.

Registry: `enroll`, `iea`, `usda_waiver`, `fluid_milk`, `special_diet`, `infant_meals`.

## Section 3 — Claim results (generated exports, NOT blank forms)

A **separate section** for the outputs that feed a monthly claim — generated, not fillable:
- Meal counts / attendance (**the checkmarks**), menu, purchases/receipts, F/R/P registry.
- A **"month claim-packet"** button that assembles them for the period.

Ties to the **claim-bridge invariant** (checkmark export must keep working — protected
till Oct 1). This section is the human-facing surface of that export.

## Section 4 — Our documents

Play Academy's own documents.
- **`Parent_ESign_Consent_v1`** — "Parent Consent for Electronic Signatures".
  **Verbatim body + ack line in the Appendix below** (typo already fixed). Fields:
  **Parent/Guardian Name · Electronic Signature · Date · Child(ren)'s Name(s)**
  (autofilled from the packet). Signature format = **both drawn and typed** (like the
  staff side). Signing this is the **signature-adoption capture point** (see below).
- Start-form / Admissions, Fee Agreement.
- **Staff Enrollment + role JDs + BYOD** — the **in-app** signing surface
  (`StaffJdOnboarding` + `AckSignModal`, PRs #4/#3/#5; `staff_agreement_signatures`
  staging → `safepass_agreements` ledger at Approve→staff).
- Instructions, QR cards.

### Signature adoption (parent side)

`Parent_ESign_Consent_v1` is the **first document** of the Child-enrollment scenario.
Signing it **captures the parent's adopted signature** (drawn or typed) once; every
later form in the packet then offers **"Tap to sign"** with that adopted signature
instead of re-drawing. Mirrors the `signature_method='adopted'` hook on the staff
side. Context/why: e-signatures are **already in use on field-trip forms (~2 weeks)** —
this consent legitimizes the existing practice.

## Campaign panel — "New Period 2026-27"

**Not a section — a working campaign tab that overlays sections 1–2.**
- Per-child **awaiting** statuses.
- Personal **packet generator** + **prefill-tokens** (see
  [`prefill-engine-spec.md`](./prefill-engine-spec.md)).
- **Batches**; tracking **sent / filled / approved**.
- Operates on the documents of sections 1–2 (the fillable enrollment + CACFP forms).

## Package scenarios (generator input)

A **scenario** is a **named preset of a document set** — the input the campaign
panel's personal-packet generator expands into per-child links. Data-driven: the
scenario registry grows by adding rows, not code.

- **a) Child enrollment** — `Parent_ESign_Consent_v1` **first** (adopts the parent
  signature → "Tap to sign" downstream), then the full set (Ohio DCY packet + CACFP
  Enrollment v9 + IEA v6 + attachments). Modes:
  - **full packet** — everything;
  - **single form** — pick ONE form to update (e.g. re-sign one doc);
  - **truncated** — a named subset (example: **renewal = CACFP + IEA**).
- **b) Employee** — Staff Enrollment + the **first-day sign-set** (role JD + BYOD),
  i.e. `signSetForRole(role)` from the staff-JD registry.

**Candidate scenarios** (add as data): "New Period" wave, "Schedule change",
"Special Diet" / off-form-meal GUARD, Drop-In.

**Wiring:** `scenario + mode → purpose` on the generated `form_links`; drives the
per-child **awaiting** statuses and the **batches** in the campaign panel. A batch is
built from a scenario; a child's status is per (child × scenario).

## Document card (every listed doc)

Shows: **version**, **live/dark** state, **QR**, **personal link**.
(live/dark = registry `current` points at a built file vs `versions:{…:'PENDING'}`.)

## Build order

**After the Staff flip**, per the queue. When it starts: reorganize `DocumentHubPage`
into the 4 sections (driven by the registry, not a hand-kept flat list), add the
Claim-results section (wire to the existing exports), and add the campaign tab
(reads `pa_*` awaiting flags + the prefill/token engine).

---

## Appendix — `Parent_ESign_Consent_v1` (verbatim)

Source of truth until the library build seeds it into the registry. Body is the
**signable text only**; the ack line + fields are rendered by the modal/kit (not stored
in the body), same pattern as the JD acks. Signature format = drawn **or** typed
(adopted-capture). Typo already corrected ("for the past couple of weeks").

**Title:** Parent Consent for Electronic Signatures

**Body:**

> Dear Parents/Guardians,
>
> At Play Academy, Inc., we are committed to making our enrollment and paperwork process as convenient and efficient as possible for our families. To simplify document completion, we will be transitioning to the use of electronic signatures (e-signatures) in some parent forms, like we have been doing with field trips forms for the past couple of weeks.
>
> Electronically signed parent forms, including enrollment documents and the CACFP Income Eligibility Application, are acceptable. Electronic signatures carry the same intent and authorization as handwritten signatures for these forms.
>
> By signing below, you acknowledge and agree that:
> - You consent to receiving and completing applicable parent forms electronically.
> - You understand that your electronic signature will be considered your legal signature on documents provided by Play Academy, Inc.
> - You may request a paper copy of any document at any time if you prefer to complete forms by hand.
>
> If you have any questions regarding this process, please contact our office. We appreciate your cooperation as we continue to improve our services for our families.
>
> Thank you for your continued trust and support.
>
> Sincerely,
> Play Academy, Inc.

**Ack line** (rendered by the modal, not in body):

> I, [Name], give my consent for Play Academy, Inc. to provide enrollment and other required parent forms electronically and to accept my electronic signature on those documents.

**Fields:** Parent/Guardian Name · Electronic Signature (adopted capture: drawn/typed) · Date · Child(ren)'s Name(s) (autofill from packet).

---

## СТОП ПО ТАКСОНОМИИ — решение владельца 31.07.2026

**Разделы библиотеки НЕ проектируются сейчас.** Слова владельца: «мы навалили в одну кучу много
чего, разгребать думал после окончания работы над этими тремя». Нормативные документы просто лежат
в библиотеке; деление на «абонементный отдел и читальный зал» — **после трёх программ**.

```
❌ не проектировать структуру разделов
❌ не заводить категории
❌ не писать спеку на таксономию
```

### Единственное, что делаем сейчас — и оно бесплатное

**Документ, попадая в библиотеку, несёт МЕТКИ: тип · назначение · источник · дата.**

**Почему именно это, а не «потом разберёмся».** Метка, проставленная при поступлении, стоит ноль —
её знает тот, кто кладёт. Восстановить её через год по стопке файлов стоит отдельной работы, и по
части документов она уже не восстановится. Поэтому будущая раскладка по полкам становится
**ПРЕДСТАВЛЕНИЕМ над теми же записями**, а не переносом данных: полка = запрос по меткам, и заведение
новой полки не трогает ни один документ.

Это то же самое окно, что было названо по `center_id` у трёх детских форм: **дорога форма хранения,
а не функция**. Пока библиотека пуста или мала, метка бесплатна; в день, когда в ней тысяча
документов, она стоит ровно столько, сколько документов.

**Отложено до окончания трёх программ** (записано, чтобы не всплыло как забытое): раздел
нормативных документов по финансированию · двусторонняя связь «ставка ↔ документ, который её
установил» · печать/выгрузка раздела как доказательной поверхности · рабочее место агента дозора.
Всё это — представления и связи **над теми же помеченными записями**, поэтому откладываются без
цены.

---

## Поступления в библиотеку — с метками (журнал, ведётся с 31.07.2026)

Владелец просил положить новый документ **в категорию «нормативные документы по
финансированию»**. Кладём его именно туда — но **меткой, а не разделом**: раздел под этим
самым именем стоит отложенным решением владельца того же дня (стоп по таксономии выше), и
метка даёт ту же полку бесплатно, как только полка появится.

| Документ | тип | назначение | источник | дата |
|---|---|---|---|---|
| Ohio DEW · бюллетень «CACFP Policy Updates» | нормативный документ (бюллетень + 4 политики) | **финансирование / участие в CACFP** | https://content.govdelivery.com/accounts/OHED/bulletins/422ce3f · PDF: CRRS → Applications → Download Forms | опубликован **30.07.2026 12:37 EDT**, внесён 31.07.2026 |

**Что этот документ меняет в самой библиотеке: ничего.** Он не называет ни одной новой формы;
32 записи реестра (родительские и кадровые) **не затронуты**. Затронут спонсорский уровень —
комплект к загрузке в CRRS до 15.10, разбор в
[compliance-map](compliance-map.md#source-ohio-dew--бюллетень-cacfp-policy-updates-30072026-1237-edt)
и в [спеке реестра сроков](specs/2026-07-31-regulatory-deadlines-registry.md).
