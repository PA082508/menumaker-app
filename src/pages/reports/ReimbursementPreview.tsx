// ============================================================
// ReimbursementPreview.tsx — route /reimbursement-preview
//
// Estimated CACFP reimbursement BEFORE submitting to the state portal.
// For each accessible center we call the existing RPC
//   menumaker.compute_monthly_claim(p_center_id, p_month)
// and read meals_by_category[slot] = { free, reduced, paid, total }.
// Subtotals use the hardcoded FY2025-2026 rates below (NOT the RPC's own
// reimbursement total) — this is an estimate/preview.
//
// Tabs: "All Centers" (consolidated = summed meals) + one tab per center.
// Print / Export PDF via window.print() (print CSS isolates the report card).
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// ─── Hardcoded rates (FY2025-2026) ─────────────────────────────────────────────
type RateSet = { f: number; r: number; p: number }
const RATES: Record<string, RateSet> = {
  breakfast: { f: 1.70, r: 1.40, p: 0.30 },
  lunch:     { f: 3.22, r: 2.82, p: 0.56 },
  snack:     { f: 0.96, r: 0.48, p: 0.07 },
  supper:    { f: 3.22, r: 2.82, p: 0.56 },
}

// slot key (from RPC) → display label + which rate set applies
const SLOTS: { key: string; label: string; rate: keyof typeof RATES }[] = [
  { key: 'breakfast',     label: 'Breakfast',     rate: 'breakfast' },
  { key: 'am_snack',      label: 'AM Snack',      rate: 'snack' },
  { key: 'lunch',         label: 'Lunch',         rate: 'lunch' },
  { key: 'pm_snack',      label: 'PM Snack',      rate: 'snack' },
  { key: 'supper',        label: 'Supper',        rate: 'supper' },
  { key: 'evening_snack', label: 'Evening Snack', rate: 'snack' },
]

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

function buildRows(mbc: Record<string, MealCat> | undefined): SlotRow[] {
  return SLOTS.map(s => {
    const m = mbc?.[s.key] ?? emptyCat()
    const rate = RATES[s.rate]
    const subtotal = (m.free || 0) * rate.f + (m.reduced || 0) * rate.r + (m.paid || 0) * rate.p
    return { key: s.key, label: s.label, rate, served: m.total || 0, free: m.free || 0, reduced: m.reduced || 0, paid: m.paid || 0, subtotal }
  })
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
  const list = centers.length > 0 ? centers : currentCenter ? [currentCenter] : []

  const [month, setMonth]     = useState<string>(monthValue(new Date()))
  const [tab, setTab]         = useState<string>('all')  // 'all' or a center id
  const [results, setResults] = useState<Record<string, ClaimResult | null>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    if (list.length === 0) return
    setLoading(true)
    setError('')
    const p_month = `${month}-01`
    try {
      const entries = await Promise.all(list.map(async c => {
        const { data, error: e } = await supabase.schema('menumaker')
          .rpc('compute_monthly_claim', { p_center_id: c.id, p_month }) as any
        if (e) throw new Error(`${c.name}: ${e.message}`)
        return [c.id, (data as ClaimResult) ?? null] as const
      }))
      setResults(Object.fromEntries(entries))
    } catch (e: any) {
      setError(e?.message ?? String(e))
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
  const rows = buildRows(mbc).filter(r => r.served > 0)

  const totals = rows.reduce(
    (a, r) => ({ served: a.served + r.served, free: a.free + r.free, reduced: a.reduced + r.reduced, paid: a.paid + r.paid, subtotal: a.subtotal + r.subtotal }),
    { served: 0, free: 0, reduced: 0, paid: 0, subtotal: 0 },
  )

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

        {/* Grand total callout */}
        {rows.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#888' }}>Estimated grand total</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#0f4c35', fontFamily: "'DM Serif Display', serif" }}>{usd(totals.subtotal)}</span>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#aab4ad', maxWidth: 720 }}>
          Estimate only — computed from recorded meal counts × FY2025-2026 federal rates
          (Breakfast {usd(RATES.breakfast.f)}/{usd(RATES.breakfast.r)}/{usd(RATES.breakfast.p)},
          Lunch &amp; Supper {usd(RATES.lunch.f)}/{usd(RATES.lunch.r)}/{usd(RATES.lunch.p)},
          Snack {usd(RATES.snack.f)}/{usd(RATES.snack.r)}/{usd(RATES.snack.p)}).
          Final reimbursement is determined by the state portal and may differ.
        </div>
      </div>
    </div>
  )
}
