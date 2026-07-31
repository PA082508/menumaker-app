// ============================================================
// ReimbursementPreview.tsx — route /reimbursement-preview
//
// Estimated CACFP reimbursement BEFORE submitting to the state portal.
// For each accessible center we call the existing RPC
//   menumaker.compute_monthly_claim(p_center_id, p_month)
// and read meals_by_category[slot] = { free, reduced, paid, total }.
//
// RATES COME FROM menumaker.cacfp_rates AND ARE NEVER HARDCODED HERE. Resolution is
// the same period-effective rule the RPC itself uses:
//   effective_date = max(effective_date <= first day of the claim month)
// so June keeps computing on last year's rates while July computes on this year's.
//
// 2026-07-30: this page used to carry its own constants 1.70 / 3.22 / 0.96. Those are
// the DAY CARE HOME Tier I rates for the CURRENT year — the wrong PROGRAM TYPE, not a
// stale year. A center claim page must never carry day-care-home money. The one source
// of truth is the table; that is the whole point of the table.
//
// Tabs: "All Centers" (consolidated = summed meals) + one tab per center.
// Print / Export PDF via window.print() (print CSS isolates the report card).
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// ─── Rates: read per claim month from menumaker.cacfp_rates ───────────────────
type RateSet = { f: number; r: number; p: number }
type RateBook = { rates: Record<string, RateSet>; cil: number; effectiveDate: string | null }
const NO_RATE: RateSet = { f: 0, r: 0, p: 0 }
const EMPTY_BOOK: RateBook = { rates: {}, cil: 0, effectiveDate: null }

// slot keys exactly as they arrive from the RPC and as they are stored in cacfp_rates
const SLOTS: { key: string; label: string }[] = [
  { key: 'breakfast',     label: 'Breakfast' },
  { key: 'am_snack',      label: 'AM Snack' },
  { key: 'lunch',         label: 'Lunch' },
  { key: 'pm_snack',      label: 'PM Snack' },
  { key: 'supper',        label: 'Supper' },
  { key: 'evening_snack', label: 'Evening Snack' },
]

// Cash-in-lieu of USDA Foods is paid per LUNCH and per SUPPER only. cil_calc in the RPC
// reads the single row (slot='lunch', category='cil') and multiplies lunch+supper by it —
// mirrored here so the two totals below are comparable.
const CIL_SLOTS = new Set(['lunch', 'supper'])

// ─── Types for the slice of the RPC payload we read ────────────────────────────
type MealCat = { free: number; reduced: number; paid: number; total: number }
type ClaimResult = {
  meals_by_category?: Record<string, MealCat>
  reimbursement?: { total?: number; meal_reimbursement?: number; cil_reimbursement?: number }
}

type SlotRow = {
  key: string; label: string; rate: RateSet
  served: number; free: number; reduced: number; paid: number; subtotal: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const monthValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function emptyCat(): MealCat { return { free: 0, reduced: 0, paid: 0, total: 0 } }

// Merge several meals_by_category maps (for the consolidated view)
function mergeMeals(results: ClaimResult[]): Record<string, MealCat> {
  const out: Record<string, MealCat> = {}
  for (const s of SLOTS) out[s.key] = emptyCat()
  for (const r of results) {
    const mbc = r?.meals_by_category ?? {}
    for (const s of SLOTS) {
      const m = mbc[s.key]
      if (!m) continue
      out[s.key].free    += m.free    || 0
      out[s.key].reduced += m.reduced || 0
      out[s.key].paid    += m.paid    || 0
      out[s.key].total   += m.total   || 0
    }
  }
  return out
}

function buildRows(mbc: Record<string, MealCat> | undefined, book: RateBook): SlotRow[] {
  return SLOTS.map(s => {
    const m = mbc?.[s.key] ?? emptyCat()
    const rate = book.rates[s.key] ?? NO_RATE
    const subtotal = (m.free || 0) * rate.f + (m.reduced || 0) * rate.r + (m.paid || 0) * rate.p
    return { key: s.key, label: s.label, rate, served: m.total || 0, free: m.free || 0, reduced: m.reduced || 0, paid: m.paid || 0, subtotal }
  })
}

/** Period-effective rate book for a claim month: the newest effective_date on or before
 *  it, exactly as compute_monthly_claim resolves it. Throws with words if nothing is on
 *  file — a preview showing $0 because the rates were never entered would read as "no
 *  money earned", which is the class of silent lie we keep paying for. */
async function loadRateBook(p_month: string): Promise<RateBook> {
  const { data, error } = await supabase.schema('menumaker')
    .from('cacfp_rates').select('effective_date,slot,category,rate')
    .lte('effective_date', p_month)
  if (error) throw new Error(`CACFP rates could not be read — ${error.message}`)
  const rows = (data ?? []) as { effective_date: string; slot: string; category: string; rate: number | string }[]
  if (rows.length === 0)
    throw new Error(`No CACFP rates are on file effective on or before ${p_month}. Enter the year's rates before previewing.`)

  const eff = rows.reduce((mx, r) => (r.effective_date > mx ? r.effective_date : mx), rows[0].effective_date)
  const current = rows.filter(r => r.effective_date === eff)

  const rates: Record<string, RateSet> = {}
  for (const r of current) {
    if (r.category === 'cil') continue
    const s = rates[r.slot] ?? { ...NO_RATE }
    if (r.category === 'free') s.f = Number(r.rate)
    else if (r.category === 'reduced') s.r = Number(r.rate)
    else if (r.category === 'paid') s.p = Number(r.rate)
    rates[r.slot] = s
  }
  const cil = Number(current.find(r => r.slot === 'lunch' && r.category === 'cil')?.rate ?? 0)
  return { rates, cil, effectiveDate: eff }
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page:    { padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' },
  title:   { fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 },
  sub:     { fontSize: 12, color: '#888', marginBottom: 18 },
  card:    { background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', overflow: 'hidden' },
  table:   { width: '100%', borderCollapse: 'collapse' },
  th:      { textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', background: '#fafaf8', borderBottom: '1px solid #eee' },
  thL:     { textAlign: 'left' },
  td:      { textAlign: 'right', fontSize: 13, color: '#23332a', padding: '10px 14px', borderBottom: '1px solid #f4f4f2' },
  tdL:     { textAlign: 'left', fontWeight: 600 },
  rate:    { fontSize: 12, color: '#aaa' },
  totalTd: { textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#0a3320', padding: '12px 14px', background: '#f4fdf7', borderTop: '2px solid #0f4c35' },
}

export default function ReimbursementPreview() {
  const { centers, currentCenter } = useOrg()
  // Kitchen is a production hub, not a claim site — exclude it from the preview.
  const KITCHEN_CENTER_ID = 'ec46ac9f-f2e3-42e7-922c-0de8a87a1a14'
  const list = (centers.length > 0 ? centers : currentCenter ? [currentCenter] : [])
    .filter(c => c.id !== KITCHEN_CENTER_ID)

  const [month, setMonth]     = useState<string>(monthValue(new Date()))
  const [tab, setTab]         = useState<string>('all')  // 'all' or a center id
  const [results, setResults] = useState<Record<string, ClaimResult | null>>({})
  const [book, setBook]       = useState<RateBook>(EMPTY_BOOK)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    if (list.length === 0) return
    setLoading(true)
    setError('')
    const p_month = `${month}-01`
    try {
      const rateBook = await loadRateBook(p_month)
      const entries = await Promise.all(list.map(async c => {
        const { data, error: e } = await supabase.schema('menumaker')
          .rpc('compute_monthly_claim', { p_center_id: c.id, p_month }) as any
        if (e) throw new Error(`${c.name}: ${e.message}`)
        return [c.id, (data as ClaimResult) ?? null] as const
      }))
      setBook(rateBook)
      setResults(Object.fromEntries(entries))
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setBook(EMPTY_BOOK)
      setResults({})
    } finally {
      setLoading(false)
    }
  }, [month, list.map(c => c.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // rows for the active tab
  const mbc = tab === 'all'
    ? mergeMeals(list.map(c => results[c.id]).filter(Boolean) as ClaimResult[])
    : results[tab]?.meals_by_category
  const rows = buildRows(mbc, book).filter(r => r.served > 0)

  const totals = rows.reduce(
    (a, r) => ({ served: a.served + r.served, free: a.free + r.free, reduced: a.reduced + r.reduced, paid: a.paid + r.paid, subtotal: a.subtotal + r.subtotal }),
    { served: 0, free: 0, reduced: 0, paid: 0, subtotal: 0 },
  )

  // Cash-in-lieu of USDA Foods — per lunch and per supper, at the same period-effective rate.
  const cilMeals  = rows.filter(r => CIL_SLOTS.has(r.key)).reduce((n, r) => n + r.served, 0)
  const cilAmount = cilMeals * book.cil
  const estimated = totals.subtotal + cilAmount

  // RPC's own reimbursement.total for the active tab. Now that both sides read the SAME
  // table, the two must agree; a gap is a finding, not a footnote.
  const rpcTotal = tab === 'all'
    ? list.reduce((sum, c) => sum + (results[c.id]?.reimbursement?.total ?? 0), 0)
    : (results[tab]?.reimbursement?.total ?? 0)
  const gap = Math.abs(estimated - rpcTotal)

  const activeName = tab === 'all' ? 'All Centers (Consolidated)' : (list.find(c => c.id === tab)?.name ?? 'Center')
  const monthLabel = new Date(month + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      {/* Print isolation — hide everything except the report when printing */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #reimb-print, #reimb-print * { visibility: visible !important; }
        #reimb-print { position: absolute; left: 0; top: 0; width: 100%; }
        .reimb-noprint { display: none !important; }
      }`}</style>

      {/* Header / controls */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={S.title}>Reimbursement Preview</div>
          <div style={S.sub}>Estimated CACFP reimbursement — review before submitting to the state portal</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="reimb-noprint">
          <input
            type="month" value={month} onChange={e => setMonth(e.target.value)}
            style={{ padding: '7px 11px', borderRadius: 8, border: '1.5px solid #d0d0d0', fontSize: 13, fontFamily: 'inherit', color: '#0a3320', background: '#fff', outline: 'none', cursor: 'pointer' }}
          />
          <button onClick={() => window.print()} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#0f4c35',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            🖨️ Print / Export PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 5, borderRadius: 10, border: '1px solid #e0e0e0', width: 'fit-content', marginBottom: 16, flexWrap: 'wrap' }} className="reimb-noprint">
        {[{ id: 'all', name: '🏢 All Centers' }, ...list.map(c => ({ id: c.id, name: c.name }))].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t.id ? '#0f4c35' : 'transparent',
            color: tab === t.id ? '#fff' : '#555',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400, transition: 'all 0.15s',
          }}>
            {t.name}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fdf0ef', color: '#c0392b', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          Failed to compute — {error}
        </div>
      )}

      {/* Printable report */}
      <div id="reimb-print">
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>{activeName}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{monthLabel} · estimated reimbursement</div>
        </div>

        <div style={S.card}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.thL }}>Meal Slot</th>
                <th style={S.th}>Served</th>
                <th style={S.th}>Free</th>
                <th style={S.th}>Reduced</th>
                <th style={S.th}>Paid</th>
                <th style={S.th}>Rate F</th>
                <th style={S.th}>Rate R</th>
                <th style={S.th}>Rate P</th>
                <th style={S.th}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 36 }}>Computing…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 36 }}>No reimbursable meals recorded for {monthLabel}.</td></tr>
              ) : rows.map(r => (
                <tr key={r.key}>
                  <td style={{ ...S.td, ...S.tdL }}>{r.label}</td>
                  <td style={S.td}>{r.served.toLocaleString('en-US')}</td>
                  <td style={S.td}>{r.free.toLocaleString('en-US')}</td>
                  <td style={S.td}>{r.reduced.toLocaleString('en-US')}</td>
                  <td style={S.td}>{r.paid.toLocaleString('en-US')}</td>
                  <td style={{ ...S.td, ...S.rate }}>{usd(r.rate.f)}</td>
                  <td style={{ ...S.td, ...S.rate }}>{usd(r.rate.r)}</td>
                  <td style={{ ...S.td, ...S.rate }}>{usd(r.rate.p)}</td>
                  <td style={{ ...S.td, fontWeight: 600, color: '#0a3320' }}>{usd(r.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...S.totalTd, textAlign: 'left' }}>Total</td>
                  <td style={S.totalTd}>{totals.served.toLocaleString('en-US')}</td>
                  <td style={S.totalTd}>{totals.free.toLocaleString('en-US')}</td>
                  <td style={S.totalTd}>{totals.reduced.toLocaleString('en-US')}</td>
                  <td style={S.totalTd}>{totals.paid.toLocaleString('en-US')}</td>
                  <td style={S.totalTd}></td>
                  <td style={S.totalTd}></td>
                  <td style={S.totalTd}></td>
                  <td style={{ ...S.totalTd, fontSize: 15 }}>{usd(totals.subtotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Totals — Estimated (rate × counts) vs RPC Total (reimbursement.total) */}
        {rows.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220, padding: '14px 18px', borderRadius: 12, background: '#f4fdf7', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>meals {usd(totals.subtotal)} + cash-in-lieu {usd(cilAmount)}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#0f4c35', fontFamily: "'DM Serif Display', serif" }}>{usd(estimated)}</div>
            </div>
            <div style={{ minWidth: 220, padding: '14px 18px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RPC Total</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>compute_monthly_claim</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#1e40af', fontFamily: "'DM Serif Display', serif" }}>{usd(rpcTotal)}</div>
            </div>
          </div>
        )}

        {rows.length > 0 && gap > 0.01 && (
          <div style={{ marginTop: 12, background: '#fdf6ec', border: '1px solid #f0d9b5', color: '#8a5a12',
                        padding: '10px 14px', borderRadius: 10, fontSize: 12.5, maxWidth: 720 }}>
            ⚠️ Estimated and RPC Total differ by {usd(gap)}. Both now read the same rate table, so they
            are expected to match — investigate before submitting.
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#aab4ad', maxWidth: 720, lineHeight: 1.5 }}>
          <strong style={{ color: '#0f4c35' }}>Estimated</strong> = recorded meal counts × the federal
          rates on file in <code>menumaker.cacfp_rates</code>
          {book.effectiveDate ? <> effective <strong>{book.effectiveDate}</strong></> : null}, plus
          cash-in-lieu of USDA Foods at {usd(book.cil)} per lunch and supper ({cilMeals.toLocaleString('en-US')} meals).
          Rates are resolved for the claim month, not for today, so an earlier month keeps computing on
          the rates that were in force then.
          {' '}<strong style={{ color: '#1e40af' }}>RPC Total</strong> is
          <code> reimbursement.total</code> from <code>compute_monthly_claim</code>, which reads the same
          table. Both are estimates — the state portal determines the final figure.
        </div>
      </div>
    </div>
  )
}
