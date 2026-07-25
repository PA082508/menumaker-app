// dateOnly.ts — the ONLY correct way to display a DATE-ONLY column (birthday, approved_date,
// signed_date, etc.).
//
// NEVER use `new Date('YYYY-MM-DD').toLocaleDateString()` on a date-only value: JS parses a
// bare date string as UTC midnight, then toLocaleDateString renders it in the browser's local
// timezone — in any negative-offset zone (e.g. America/New_York, UTC−4/−5) that lands on the
// PREVIOUS day (2024-04-03 → "4/2/2024"). Slice the ISO string instead; no Date, no timezone.
// Display only — storage is never touched.
export function fmtDateOnly(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return m && day ? `${Number(m)}/${Number(day)}/${y}` : String(d)
}
