// Date-text-input normalization — platform-standards §6.
//
// For date fields entered as TEXT (not native <input type="date">). Accepts a
// 2-digit year and expands it, and accepts /, -, . or no separators. Apply on BLUR;
// on invalid input, soft-highlight the field and keep the value (don't erase).
//
// Century window: year 00–49 → 20xx, 50–99 → 19xx.
// Examples: "7/2/26" → 07/02/2026 · "070226" → 07/02/2026 · "7-2-2026" → 07/02/2026.

export interface NormalizedDate {
  ok: boolean       // true only for a real calendar date (13/45 → false; 2/29/26 → false)
  display: string   // MM/DD/YYYY (padded) when ok; otherwise the trimmed input echoed back
  iso: string       // YYYY-MM-DD when ok (for storage); '' otherwise
}

const pad = (n: number) => String(n).padStart(2, '0')

export function normalizeDateInput(raw: string): NormalizedDate {
  const s = (raw ?? '').trim()
  if (!s) return { ok: false, display: '', iso: '' }

  let mm = '', dd = '', yy = ''
  const parts = s.split(/[/\-.]/).filter(Boolean)
  if (parts.length === 3) {
    [mm, dd, yy] = parts
  } else if (/^\d{6}$/.test(s)) {          // MMDDYY
    mm = s.slice(0, 2); dd = s.slice(2, 4); yy = s.slice(4, 6)
  } else if (/^\d{8}$/.test(s)) {          // MMDDYYYY
    mm = s.slice(0, 2); dd = s.slice(2, 4); yy = s.slice(4, 8)
  } else {
    return { ok: false, display: s, iso: '' }
  }

  if (!/^\d{1,2}$/.test(mm) || !/^\d{1,2}$/.test(dd) || !/^\d{1,4}$/.test(yy))
    return { ok: false, display: s, iso: '' }
  if (yy.length === 3) return { ok: false, display: s, iso: '' }   // ambiguous 3-digit year

  const M = parseInt(mm, 10)
  const D = parseInt(dd, 10)
  let Y = parseInt(yy, 10)
  if (yy.length <= 2) Y = Y <= 49 ? 2000 + Y : 1900 + Y   // century window

  if (M < 1 || M > 12 || D < 1 || D > 31) return { ok: false, display: s, iso: '' }
  // Real-calendar check (rejects 2/29 on non-leap years, 4/31, etc.)
  const dt = new Date(Y, M - 1, D)
  if (dt.getFullYear() !== Y || dt.getMonth() !== M - 1 || dt.getDate() !== D)
    return { ok: false, display: s, iso: '' }

  return { ok: true, display: `${pad(M)}/${pad(D)}/${Y}`, iso: `${Y}-${pad(M)}-${pad(D)}` }
}

/** Convert a stored ISO date (YYYY-MM-DD) to the MM/DD/YYYY display form, or '' if absent. */
export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso)
}
