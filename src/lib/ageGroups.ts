// ageGroups.ts — authoritative CACFP age brackets for a roster child, computed
// from a birthday. The single source of truth for these brackets is the meal-grid
// view (supabase/migrations/20260716d_v_meal_grid_photo_url.sql): when a child
// has a birthday the view DERIVES age_group_food / age_group_milk / oz / milk
// from it, falling back to the stored column only when no birthday is on file.
//
// So a roster child inserted WITHOUT these fields would still render correctly in
// the meal grid (the view computes them). We seed them anyway on Approve-create so
// the stored row is self-describing (search, exports, and any consumer that reads
// the raw column — not the view — see the right bracket immediately).
//
// Bracket math (matches the view): age in whole months from today, using the
// month-difference formula the reviewer sees on screen —
//   months = (todayYear - birthYear) * 12 + (todayMonth - birthMonth)
// This is a calendar-month difference (day-of-month is not considered), the same
// coarse bucket the enrollment review flow uses. The view uses Postgres age(),
// which additionally truncates by day; for bracket EDGES this can differ by at
// most the birth-month, and the view (computed live) always wins at read time —
// this seed is only the fallback. Kept deliberately simple per the review spec.

export type MealFields = {
  age_group_food: string
  age_group_milk: string
  rate_oz: string        // stored as TEXT to match roster.rate_oz
  milk_kind: string | null
}

/** Whole months from `birthday` to today, calendar-month difference. */
export function monthsOld(birthday: string | Date): number {
  let by: number, bm: number   // birth year, birth month (1-based)
  if (birthday instanceof Date) {
    by = birthday.getFullYear()
    bm = birthday.getMonth() + 1
  } else {
    // 'YYYY-MM-DD…' — parse the components directly so a UTC-midnight string is
    // never shifted a day (and thus a month) by the local timezone.
    const m = String(birthday).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return NaN
    by = Number(m[1]); bm = Number(m[2])
  }
  const now = new Date()
  const yy = now.getFullYear()
  const ym = now.getMonth() + 1
  return (yy - by) * 12 + (ym - bm)
}

/** Derive the CACFP meal fields for a child of this birthday.
 *  Brackets are the authoritative ones from v_meal_grid (20260716d). */
export function deriveMealFields(birthday: string | Date): MealFields {
  const mo = monthsOld(birthday)

  // Food component age group (v_meal_grid age_group_food).
  const age_group_food =
    mo < 6  ? 'birth_5m' :
    mo < 12 ? '6_11m'    :
    mo < 24 ? '1y'       :
    mo < 36 ? '2y'       :
    mo < 72 ? '3_5y'     : '6_12y'

  // Milk age group (v_meal_grid age_group_milk).
  const age_group_milk =
    mo < 12 ? 'infant' :
    mo < 24 ? '1y'     :
    mo < 36 ? '2y'     :
    mo < 72 ? '3_5y'   : '6_12y'

  // Milk serving size in oz (v_meal_grid `oz`), stored as TEXT in roster.rate_oz.
  const rate_oz =
    mo < 12 ? '0' :
    mo < 36 ? '4' :
    mo < 72 ? '6' : '8'

  // Milk kind CODE stored in roster.milk_kind. Under 12m = infant (formula/BM →
  // null, the meal grid renders "Formula"); 12–23m = whole ('red'); else 1% ('1pct').
  const milk_kind: string | null =
    mo < 12 ? null  :
    mo < 24 ? 'red' : '1pct'

  return { age_group_food, age_group_milk, rate_oz, milk_kind }
}
