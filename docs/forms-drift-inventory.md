# Forms Drift Inventory (Stage 0) — <date unknown, generated read-only>

> **READ-ONLY report.** No form files, showcase pages, or the registry were modified in producing this inventory. All findings are from file listings, `cmp`/byte comparisons, and `grep` of `href`/version markers.

**Authoritative deployed repo:** `/Users/nikolaykutsenko/Downloads/pa082508.github.io/`
(GitHub Pages → `https://pa082508.github.io/`)
**Authoritative form dir:** `/Users/nikolaykutsenko/Downloads/pa082508.github.io/forms/1-data-sources/`
**App registry:** `/Users/nikolaykutsenko/Downloads/menumaker-app/public/enroll-registry.json`

---

## ⚠️ Two competing showcase pages (read first)

There are **two** `parent-forms.html` in the deployed repo, and they disagree:

| Path | Cards | Enroll / IEA / DCY cards? | Wired into site nav? |
|------|-------|---------------------------|----------------------|
| `pa082508.github.io/parent-forms.html` (repo root) | **6** | Yes — DCY_01234_v4, CACFP_Enrollment_v7, IEA_v5 | **No** — not linked from `index.html` |
| `pa082508.github.io/forms/1-data-sources/parent-forms.html` | **3** | No — only the 3 shared nutrition forms | **Yes** — `index.html` links `/forms/1-data-sources/parent-forms.html` |

- `index.html` (site landing) points to the **3-card** `1-data-sources` copy, so the live navigation currently **does not surface the CACFP Enrollment, Income Eligibility, or DCY forms at all**.
- The **6-card** root copy (the "full" enrollment packet showcase) is byte-identical to the loose `/Users/nikolaykutsenko/Downloads/parent-forms.html` (Jul 5) but is orphaned — nothing links to it.
- Section 1 below analyzes the **6-card root showcase** (the one that actually carries enrollment/IEA/DCY cards, per task intent). The 3-card `1-data-sources` copy is treated as authoritative for the shared-form cards only.

---

## 1. Showcase cards → drift table

Cards from `pa082508.github.io/parent-forms.html` (repo-root, 6-card). "Latest-in-repo" = newest version file of that family present in the authoritative dir. **Drift = card links an older-than-latest version, OR registry `current` ≠ latest-in-repo, OR href target missing.**

| # | Card title | href target | Target exists? | Latest-in-repo | Registry `current` | Drift? |
|---|-----------|-------------|:--------------:|----------------|--------------------|:------:|
| 1 | Child Enrollment & Health Information (DCY 01234) | `DCY_01234_v4.html` | ✅ yes | **v4** | — (not in registry) | **No** (links latest; but base `DCY_01234.html` also present — incomplete conversion, see §3) |
| 2 | CACFP Enrollment Form | `CACFP_Enrollment_v7.html` | ✅ yes | **v8** | v8 | **YES** — card links v7, repo has v8, registry says v8 |
| 3 | Income Eligibility Application — FY 2026-2027 | `IEA_FY2026-27_v5.html` | ✅ yes | **v5** | v5 | **No** |
| 4 | Special Diet Statement | `special-diet-form.html` | ✅ yes | single (unversioned) | — | **No** |
| 5 | Fluid Milk Substitution Request | `fluid-milk-substitution.html` | ✅ yes | single (unversioned) | — | **No** |
| 6 | Infant Meals Preference | `infant-meals-preference.html` | ✅ yes | single (unversioned) | — | **No** |

**Registry vs latest-in-repo:** `enroll.current = v8` == latest v8 ✅; `iea.current = v5` == latest v5 ✅. No registry-vs-repo drift.

**Net drift:** 1 card drifted — **CACFP Enrollment card points to v7 while both the repo (v8) and the registry (v8) are ahead.** The IEA and DCY cards are on the latest in-repo file.

---

## 2. Form families & versions present (authoritative dir)

Files in `pa082508.github.io/forms/1-data-sources/`. Newest last; gaps noted.

| Family | Version files present | Latest | Gaps / notes |
|--------|-----------------------|--------|--------------|
| **CACFP_Enrollment** | v1, v2, v3, v4, v6, v7, v8 | **v8** | ⚠️ **no v5** (v4 → v6 gap) |
| **IEA_FY2026-27** | full_v1, v3, v4, v5 | **v5** | ⚠️ **no v1/v2** as numbered files; `full_v1` is a separate variant; v2 absent |
| **DCY_01234** | (base) `DCY_01234.html`, `DCY_01234_v4.html` | **v4** | ⚠️ base + v4 only; **no v1/v2/v3** file in repo (base is the unversioned original) |
| **special-diet-form** | `special-diet-form.html` | (unversioned) | single file |
| **fluid-milk-substitution** | `fluid-milk-substitution.html` | (unversioned) | single file |
| **infant-meals-preference** | `infant-meals-preference.html` | (unversioned) | single file |
| **cacfp_form** (legacy) | `cacfp_form.html` | (unversioned) | ⚠️ legacy stray — see §3 |
| **parent-forms** (showcase) | `parent-forms.html` (3-card) | — | root copy is 6-card; see top note |

Non-HTML source assets present (not forms): `CACFP_Enrollment_form.png`, `DCY01234_page-1..4.png`.

---

## 3. Unwired form files

HTML form files in the authoritative dir that are **NOT** linked from either `parent-forms.html` **AND NOT** referenced by `enroll-registry.json`:

| File | Why unwired | Assessment |
|------|-------------|------------|
| `cacfp_form.html` | Legacy; superseded by `CACFP_Enrollment_v*` family | 🚩 **Legacy stray — safe-delete candidate** (not linked, not in registry, distinct from the versioned enrollment family) |
| `DCY_01234.html` (base) | Superseded by `DCY_01234_v4.html` (which the showcase links) | 🚩 **Incomplete conversion** — base coexists with v4; base is orphaned |
| `CACFP_Enrollment_v1..v4, v6` | Old versions; showcase links v7, registry pins v7/v8 | Historical versions, unwired (expected churn) |
| `IEA_FY2026-27_full_v1, v3, v4` | Old/variant; showcase + registry use v5 | Historical versions, unwired |

### DCY family — conversion status

- **Present as HTML:** `DCY_01234.html` (base) and `DCY_01234_v4.html`. Showcase links **v4**; registry does **not** reference DCY at all.
- **Incomplete conversion:** base `DCY_01234.html` was not removed after `_v4` shipped — both live in the dir.
- **Expected-but-missing DCY codes:** `DCY_01236`, `DCY_01217`, `DCY_01305` — **none exist as HTML** in the authoritative dir, and none are referenced by any `parent-forms.html` card or the registry. `grep` for `DCY[_-]?#####` across the dir returns **only `DCY01234`**. If these codes are expected per the forms-registry plan, they are **not yet converted/present**.

---

## 4. Copy divergence (authoritative vs siblings)

Byte-comparison (`cmp`) of the KEY families and shared forms against the sibling copies.

### Key enrollment families (CACFP_Enrollment latest, IEA latest, DCY_01234)

| Family / file | `forms/` | `forms-upload/` | `forms-deploy/` | loose `Downloads/` |
|---------------|:--------:|:---------------:|:---------------:|:------------------:|
| `CACFP_Enrollment_v8.html` | absent | absent | absent | **absent** (loose max = **v7**, behind repo) |
| `IEA_FY2026-27_v5.html` | absent | absent | absent | present, **IDENTICAL** |
| `DCY_01234_v4.html` | absent | absent | absent | present, **IDENTICAL** |

- **None of the three sibling `*-data-sources` dirs contain the CACFP Enrollment, IEA, or DCY families at all** — they hold only the 3 shared nutrition forms + `parent-forms.html`. They are stale/partial mirrors from mid-June.
- **Loose `Downloads/` is behind on CACFP Enrollment**: highest loose file is `CACFP_Enrollment_v7.html`; repo has **v8**. Loose IEA v5 and DCY v4 match the repo byte-for-byte.

### Shared nutrition forms & showcase

| File | `forms/` | `forms-upload/` | `forms-deploy/` | loose `Downloads/` |
|------|:--------:|:---------------:|:---------------:|:------------------:|
| `special-diet-form.html` | IDENTICAL | **DIFFERS** (20989 vs 21164 B, older) | IDENTICAL | absent |
| `fluid-milk-substitution.html` | IDENTICAL | **DIFFERS** (18747 vs 18922 B, older) | IDENTICAL | IDENTICAL |
| `infant-meals-preference.html` | IDENTICAL | **DIFFERS** (22509 vs 22684 B, older) | IDENTICAL | absent |
| `parent-forms.html` | IDENTICAL (3-card) | IDENTICAL (3-card) | IDENTICAL (3-card) | **DIFFERS** — loose = 6-card root version (IDENTICAL to repo-root copy) |

**Summary of divergence:**
- `forms/` and `forms-deploy/` shared forms are **in sync** with authoritative (3-card showcase + 3 nutrition forms).
- `forms-upload/` is **stale** — all three nutrition forms are older/smaller than authoritative.
- All sibling dirs are **missing the entire enrollment/IEA/DCY layer** — they predate it.
- Loose `Downloads/` holds the newest **6-card** showcase (matches repo root) and matching IEA v5 / DCY v4, but its CACFP Enrollment tops out at **v7** (no v8).

---

## Actionable drift summary

1. **CACFP Enrollment showcase card is 1 version behind** — root `parent-forms.html` links `CACFP_Enrollment_v7.html` while repo + registry are on **v8**. (Registry itself is correct.)
2. **Live nav hides enrollment/IEA/DCY** — `index.html` points to the 3-card `1-data-sources/parent-forms.html`; the 6-card packet showcase at repo root is orphaned.
3. **DCY conversion incomplete** — base `DCY_01234.html` orphaned alongside `_v4`; DCY codes `01236 / 01217 / 01305` not present anywhere.
4. **Legacy stray** — `cacfp_form.html` unwired and superseded.
5. **Sibling dirs are stale mirrors** — `forms/`, `forms-upload/`, `forms-deploy/` lack the enrollment layer; `forms-upload/` nutrition forms are outdated; loose `Downloads/` lacks CACFP Enrollment v8.
6. **Version gaps in repo** — CACFP_Enrollment missing v5; IEA missing numbered v1/v2.
