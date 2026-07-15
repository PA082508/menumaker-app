# Package: Staff write-rights + Child/Staff photos

One package, **one `go`**. Nothing here is applied or deployed until Nikolay says go.
Branch: `feat/staff-grants-and-photos`. No merge, no migration run, no deploy yet.

---

## PART A — write grants (fixes the silent staff-save)

Migration: [`supabase/migrations/20260715_staff_write_grants.sql`](../supabase/migrations/20260715_staff_write_grants.sql)

### GRANT markup — why each

| Table | Grant | Why | Not granted |
|---|---|---|---|
| `menumaker.staff` | `select, update` | StaffSettingsPage `save()` issues **UPDATE** only. This is the owner's bug: the UPDATE hit 0 rows. | **no insert** (Add Staff = onboarding packet → `enrollment_submissions`, never a client insert) · **no delete** (UI has no staff-delete) |
| `menumaker.staff_schedules` | `select, insert, update` | Same `save()` **upserts** the weekly schedule (insert first save, update on re-save via `onConflict staff_id,day_of_week,effective_from`). | **no delete** (UI never deletes schedule rows) |

### Pre-flight (run read-only FIRST — see the two checks at the top of the SQL)
1. `pg_class.relrowsecurity` must be **true** for both tables. A grant on a non-RLS
   table would expose every center's staff to any signed-in user. If RLS is off → STOP.
2. `pg_policies` for staff/staff_schedules must show a **director/org-scoped write
   policy**. If a correct policy exists → grants are the whole fix. If **no** write
   policy exists → the silent-0-row cause is the POLICY, not the grant; add it in this
   same migration before applying (paste the current policy dump to me and I'll write it).

### Write-surface audit — the wider SELECT-only family
Rule: a table the UI writes to directly needs the matching grant; reference /
append-only / service-written tables do **not**.

| Table | UI does | Verdict |
|---|---|---|
| `staff` | update | **GRANT (this pkg)** |
| `staff_schedules` | upsert | **GRANT (this pkg)** |
| `roster` | update ×10, insert, delete | already writable (children edits work) — leave |
| `classrooms`, `products`, `vendors`, `purchasers`, `income_eligibility`, `child_medical`, `holidays`, `meal_schedule`, `inventory`, `stock_movements`, `receipts`, `policy_documents`, `internal_messages`, `push_subscriptions`, `published_menus`, `purchase_checklist`, `enrollment_submissions`, `staff_training_records`, `staff_agreement_signatures`, `safepass_transport_runs`, `monthly_claims`, `meal_count_settings`, `meal_week_attachments` | insert/update/upsert from UI | working today — **out of scope**, no change |
| `meal_count_marks` | (claim-critical) | **DO NOT TOUCH** without a separate decision — [[menumaker-claim-bridge-invariant]] |

Only `staff` + `staff_schedules` are granted here. Everything else is either already
working or explicitly deferred.

---

## PART B — child/staff photos

Migration: [`supabase/migrations/20260715b_avatars.sql`](../supabase/migrations/20260715b_avatars.sql)
- `roster.photo_url text`, `staff.photo_url text` (stores the Storage **path**, not a URL)
- private bucket `avatars` (`public=false`) — objects only via signed URL
- Storage RLS on `storage.objects`: read = any authenticated (single-org; signed URL +
  ~1h TTL is the boundary), write = director/office_manager/admin

Code (branch only — do **not** deploy before the migration runs; a `select photo_url`
against a missing column errors):
- `src/lib/avatars.ts` — signed-URL cache, client resize→512px webp, upload
- `src/components/Avatar.tsx` — display (signed URL → photo, else initials fallback)
- `src/components/AvatarUpload.tsx` — settings widget (upload now, persist path on Save)
- Upload wired: `StaffSettingsPage`, `ChildSettingsPage`
- Display wired: `CenterRosterPage` (child + staff), `SafePassTeacherPage` (roster list),
  `MealCountPage` + `MealCountDirectorPage` (interactive card view only — the **print
  `<td>` grid is untouched** so the CACFP sheet and checkmark export are unaffected)

---

## Rollout order (on `go`)
1. Apply **Part A** grants (after the two pre-flight checks pass).
2. Apply **Part B** migration (columns + bucket + storage policies).
3. Merge the branch → deploy the code.
4. Read-back (below). Only then a CHANGELOG line + `✅` on the bridge.

## Read-back scenario (attach to the report)
1. **Save works:** open a Ridge employee → flip status / change class → Save →
   log out → log back in → the new value is there, **no red banner**. Confirm with
   `select is_active, class_primary from menumaker.staff where id='<id>'`.
2. **Photo works:** upload a staff photo → it appears in the roster and SafePass;
   every employee without a photo still shows initials, unchanged.
