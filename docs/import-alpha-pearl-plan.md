# Import Plan — Alpha + Pearl children & guardians

**Status:** PLAN ONLY (no DB changes). **Goal / DoD:** `without_contacts` for the active roster: **202 → 0** (Alpha 125 + Pearl 73 + Ridge tails 4).

> Context: `child` / `guardian` / `child_guardian` currently contain **Ridge only** (125/125 linked, 121 with contacts). Alpha (125) and Pearl (73) were never imported — that's the entire gap. Name/DOB matching yields 0 because those children simply don't exist in `child` yet.

---

## 1. How Ridge was loaded (evidence from the DB)

Ridge came in through the existing generic import pipeline — **not** a one-off script:

| Piece | What it is |
|---|---|
| UI | `src/pages/children/ChildrenImportPage.tsx` (route `/children/import`) — CSV upload + column mapping, calls the RPC below |
| RPC | `menumaker.import_children_run(p_org_id, p_rows jsonb, p_mapping jsonb, p_template_id, p_filename)` — `SECURITY DEFINER`, upserts household/child/child_medical/guardian/child_guardian |
| RPC | `menumaker.link_roster(p_org_id, p_center_id)` — sets `roster.child_id` (and `meal_week_records.roster_id`) by **normalized-name** match |
| Template | `import_templates` id `d17fa1ea-4e37-476e-a8b5-052c7faace34` — name **“Brightwheel”**, target `children` |
| Run log | `import_runs`: `School-Roster-2026-06-21_..._UTC.csv` → **loaded 149** (after one failed 0/149 attempt). Source = a **Brightwheel “School Roster” CSV export**. |
| Helpers | `try_parse_date`, `norm_phone`, `norm_name`; catalog `import_target_fields` (valid `field_key → dest_table`) |

**Conclusion:** the reproducible process is **Brightwheel School-Roster CSV → ChildrenImportPage (Brightwheel template) → `import_children_run` → `link_roster`**. Alpha and Pearl just need their own Brightwheel exports run through the same path.

---

## 2. What `import_children_run` actually writes (per CSV row)

1. **Skip guard:** needs `child.first_name` + `child.last_name`, else row skipped + `action_item` "missing name".
2. **`household`** upsert on `(org_id, match_key)`; `match_key` = lower/trim of `household_key` cols (default `street_1|street_2|zip`).
3. **`child`** upsert on `(org_id, brightwheel_id)`: first/last, `birthdate` (`try_parse_date`), gender/ethnicity/race, enrollment_status, homeroom/room_1/meal_type, enrollment/graduation dates, notes, plus **`extra` jsonb** = every unmapped, non-guardian column. ⚠️ **No `center_id`** — `child` has no center column; center is implied by `homeroom` and later by the roster link.
4. **`child_medical`** upsert on `(child_id)` if any of allergies/medications/doctor_name/doctor_phone present.
5. **`guardian`** per guardian-group per index: match existing by `email` **or** (`first+last` + normalized phone ∈ {mobile,phone_1,phone_2}); else insert. Fields: first/last/email/mobile_phone/phone_1/phone_2 + `match_key`. ⚠️ **No `address`** (address lives on `household`, not `guardian`).
6. **`child_guardian`** insert on conflict `(child_id, guardian_id, role)` do nothing, setting **only** `org_id, child_id, guardian_id, role, relationship, ordinal(=index)`.
7. Dedup detector: children with same name+birthdate → `action_item`.

### ⚠️ DCY-model gap (must address at import time)
Step 6 does **NOT** set `is_emergency_contact`, `emergency_contact_order`, or `can_pickup`. So a raw import produces the **legacy** model (exactly why Ridge needed our `role→flags` backfill). To satisfy “новые записи сразу по DCY-модели”, do **one** of:

- **(preferred) Patch the `child_guardian` INSERT** inside `import_children_run` to also write:
  ```sql
  is_emergency_contact   = (v_role = 'emergency'),
  emergency_contact_order = case when v_role = 'emergency' then gi else null end,
  can_pickup             = (v_role in ('pickup','parent'))   -- explicit permission, not the default-true
  ```
  Make imports DCY-native going forward. (This is a function edit — belongs to the execution phase, not this doc.)
- **or (fallback) post-import backfill** — rerun the same statement we used for Ridge, scoped to the new rows:
  ```sql
  update menumaker.child_guardian
  set is_emergency_contact = (role='emergency'),
      emergency_contact_order = case when role='emergency' then ordinal else null end;
  ```

`role` stays as the historical duplicate either way.

---

## 3. Field mapping (source → tables) — the live Brightwheel template

`p_mapping` shape: `{ scalar: {src_col: "dest.field"}, guardians: [{prefix, role, count, cols}], household_key: [...] }`.

### 3.1 `scalar` → `child` / `child_medical` / `household`
| Source column | → dest |
|---|---|
| first_name, last_name, birthdate, brightwheel_id, student_id | `child.*` |
| gender, ethnicity, race, enrollment_status, homeroom, room_1, meal_type | `child.*` |
| enrollment_date, desired_start_date, graduation_date, expected_birth_date, notes | `child.*` |
| allergies, medications, doctor_name, doctor_phone | `child_medical.*` |
| street_1, street_2, city, state, zip, country, family_income, subsidy, subsidy_details | `household.*` |

`child_key = brightwheel_id` · `household_key = [street_1, street_2, zip]`

### 3.2 `guardians` groups (columns read as `{prefix}{i}_{col}`)
| Group prefix | role | count | cols read |
|---|---|---|---|
| `parent_` | **parent** | 4 | first_name, last_name, email, mobile_phone, phone_1, phone_2 |
| `family_` | **family** | 4 | first_name, last_name, email, mobile_phone, phone_1, phone_2 |
| `approved_pickup_` | **pickup** | 4 | first_name, last_name, email, mobile_phone, phone_1, phone_2 |
| `emergency_contact_` | **emergency** | 3 | first_name, last_name, **phone→phone_1**, relationship |

Notes that match the live data: only the **emergency** group carries `relationship` (that's why parents show null relationship, grandmother shows "Grandmother"). `ordinal` = the guardian index `i` within its group.

### 3.3 `child_guardian` under the DCY model (target end-state per row)
| Column | Value at import |
|---|---|
| child_id | upserted `child.id` |
| guardian_id | matched/inserted `guardian.id` |
| role | group role (parent/family/pickup/emergency) — historical |
| relationship | source (emergency group) |
| ordinal | index within group |
| **is_emergency_contact** | `role = 'emergency'` |
| **emergency_contact_order** | `ordinal` when emergency, else null |
| **can_pickup** | `role in ('pickup','parent')` (explicit) |

---

## 4. Roster linking (`roster.child_id`)

Run **`select menumaker.link_roster('3a9a290e-…'::uuid, '<center_id>'::uuid)`** once per center **after** import. It:
- (b) sets `roster.child_id = child.id` where `roster.child_id is null` and `norm_name(child.first||' '||child.last) = norm_name(roster.child_name)`, scoped to the center when `p_center_id` is passed;
- (a) also links `meal_week_records.roster_id` by name;
- (c) flags meal-count kids without a roster match as `action_items`.

**Center IDs:** Alpha `099c404b-e6d3-4543-9d9a-1fb11a2ee62d` · Pearl `881ef4ce-1a27-4d3b-aa60-59d2a307bf2b` · Ridge `4aed7d5a-00d0-4a4c-ac99-311046ad2027`.

⚠️ `link_roster` matches by **name only, no DOB**. Risks + handling:
- **Always pass `p_center_id`** (per-center) so a name collision across centers can't mislink.
- **Same name within one center** → non-deterministic link. Before trusting the auto-link, list duplicates and resolve manually:
  ```sql
  select center_id, lower(first_name||' '||last_name) nm, count(*)
  from menumaker.child group by 1,2 having count(*) > 1;   -- (child side)
  select center_id, norm_name(child_name) nm, count(*)
  from menumaker.roster where is_active group by 1,2 having count(*) > 1;  -- (roster side)
  ```
  Ambiguous names → hand them to Nikolay as a list; link those `roster.child_id` explicitly by `brightwheel_id`/DOB.
- Rows still `child_id is null` after linking = names that differ between Brightwheel and roster (nicknames, spelling) → manual list.

---

## 5. Source of Alpha/Pearl data — OPEN QUESTION (Nikolay to confirm)

The pipeline is **CSV-in**. To stay source-agnostic, use an **intermediate staging layout = the Brightwheel column names** already mapped by the template. Then each real source only needs a thin adapter into that layout:

| Candidate source | Adapter work |
|---|---|
| **Brightwheel export** (same as Ridge) | none — export each school’s “School Roster” CSV, upload as-is. **Lowest effort; reuses the existing template verbatim.** |
| **Google Sheets** | export CSV, rename headers to the Brightwheel staging columns (or build a new `import_templates` mapping for the Sheet’s headers). |
| **`enrollment_submissions`** (online DCY forms) | transform rows → staging CSV; note it only covers families who submitted online (partial coverage). |

**Canonical staging columns** (superset the adapter must produce): `brightwheel_id, first_name, last_name, birthdate, gender, homeroom, room_1, meal_type, enrollment_status, street_1, street_2, city, state, zip, country, allergies, medications, doctor_name, doctor_phone, parent_{1..4}_{first_name,last_name,email,mobile_phone,phone_1,phone_2}, family_{1..4}_{…}, approved_pickup_{1..4}_{…}, emergency_contact_{1..3}_{first_name,last_name,phone,relationship}`.

> If the source has **no `brightwheel_id`**, the `child` upsert key changes (currently `on conflict (org_id, brightwheel_id)`). Options: synthesize a stable key (e.g. `student_id` or `name|dob` hash) or extend the upsert — a function change to flag before running a non-Brightwheel source.

---

## 6. End-to-end runbook (execution phase — not run here)

1. **Backup** STABLE snapshot (before any write).
2. (If DCY-native imports desired) **patch** `import_children_run` `child_guardian` INSERT per §2 gap.
3. **Alpha:** obtain Brightwheel School-Roster CSV → `/children/import` → template “Brightwheel” → run. Verify `import_runs.loaded` = expected, `skipped` = 0 (fix name-less rows).
4. `select menumaker.link_roster(org, alpha_center_id);`
5. **Pearl:** repeat 3–4 with Pearl’s export + `pearl_center_id`.
6. (If fallback path) run the `role→flags` backfill.
7. Resolve `action_items` (missing name, bad DOB, duplicates, roster no-match).
8. Re-run the verification query (§7) until `without_contacts = 0`.

---

## 7. Verification (DoD gate)

```sql
select
  ce.name as center,
  count(*) filter (where r.is_active) as active,
  count(*) filter (where r.is_active and exists
    (select 1 from menumaker.child_guardian cg where cg.child_id = r.child_id)) as with_contacts,
  count(*) filter (where r.is_active and not exists
    (select 1 from menumaker.child_guardian cg where cg.child_id = r.child_id)) as without_contacts
from menumaker.roster r join menumaker.centers ce on ce.id = r.center_id
group by ce.name order by active desc;
```
**Target:** every center `without_contacts = 0`; org total `without_contacts = 0`.

Emergency-model sanity after import:
```sql
select count(*) filter (where role='emergency') as role_emerg,
       count(*) filter (where is_emergency_contact) as flagged_emerg,
       count(*) filter (where is_emergency_contact and emergency_contact_order is null) as flagged_missing_order
from menumaker.child_guardian;   -- role_emerg == flagged_emerg, flagged_missing_order == 0
```

---

## 8. Risks / watch-list
- **DCY gap** (§2) — without the patch/backfill, EmergencyPopup sorting (`emergency_contact_order`) won’t populate for new rows.
- **`link_roster` name-only match** — enforce per-center; resolve same-name collisions manually.
- **Non-Brightwheel source without `brightwheel_id`** — upsert key needs a decision before running.
- **`guardian.address`** never populated by import (address on `household`) — Family/Emergency “Address” shows household address only if the UI reads it from `household`; today it reads `guardian.address` (will be blank). Note for UI, not import.
- **Coverage cap** — `enrollment_submissions` as a source covers only online submitters; Brightwheel export is the complete set.
