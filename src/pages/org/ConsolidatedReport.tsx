// Consolidated CACFP Report — all centers combined for a selected month.
// One row per center + an org-wide totals row. Each row comes from
// menumaker.compute_monthly_claim(p_center_id, p_month). Export = window.print().
import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { format } from 'date-fns'

interface Row {
  id: string
  name: string
  ada: number
  breakfast: number
  am_snack: number
  lunch: number
  supper: number
  totalMeals: number
  reimbursement: number
}

const shortName = (n: string) => n.replace(/^Play Academy\s+/i, '').trim()
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const int = (v: number) => v.toLocaleString('en-US')
const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function ConsolidatedReport() {
  const { org, centers } = useOrg()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM')) // "2026-06"
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const monthDate = month + '-01'
  const monthLabel = format(new Date(monthDate + 'T12:00:00'), 'MMMM yyyy')

  useEffect(() => {
    if (!centers.length) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const out = await Promise.all(centers.map(async (c) => {
        const { data: claim } = await (supabase.schema('menumaker').rpc as any)(
          'compute_monthly_claim', { p_center_id: c.id, p_month: monthDate }
        )
        const m = claim?.meals ?? {}
        return {
          id: c.id,
          name: c.name,
          ada:           num(claim?.attendance?.ada),
          breakfast:     num(m.breakfast),
          am_snack:      num(m.am_snack),
          lunch:         num(m.lunch),
          supper:        num(m.supper),
          totalMeals:    num(m.total_reimbursable),
          reimbursement: num(claim?.reimbursement?.total),
        } as Row
      }))
      if (cancelled) return
      setRows(out)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [centers, monthDate])

  const totals = useMemo(() => rows.reduce((t, r) => ({
    ada: t.ada + r.ada, breakfast: t.breakfast + r.breakfast, am_snack: t.am_snack + r.am_snack,
    lunch: t.lunch + r.lunch, supper: t.supper + r.supper, totalMeals: t.totalMeals + r.totalMeals,
    reimbursement: t.reimbursement + r.reimbursement,
  }), { ada: 0, breakfast: 0, am_snack: 0, lunch: 0, supper: 0, totalMeals: 0, reimbursement: 0 }), [rows])

  const th: React.CSSProperties = { padding: '11px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7ee8b0', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: 14, color: '#1a1a1a', textAlign: 'right', borderTop: '1px solid #eee', whiteSpace: 'nowrap' }

  return (
    <div id="consolidated-report" style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <style>{`@media print{ aside{display:none!important} main{margin-left:0!important} .no-print{display:none!important} #consolidated-report{padding:0!important;max-width:none!important} } @page{size:landscape;margin:12mm}`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <Link to="/dashboard" className="no-print" style={{ fontSize: 12, color: '#1a6b4a', textDecoration: 'none' }}>← Organization</Link>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1a6b4a', fontWeight: 600, marginTop: 6 }}>
            📊 Consolidated CACFP Report
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', margin: '2px 0 0' }}>
            {org?.name ?? 'Organization'} · {monthLabel}
          </h1>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value || month)}
            style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', color: '#1a1a1a' }} />
          <Button variant="primary" onClick={() => window.print()}>🖨️ Export PDF</Button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0a3320' }}>
              <th style={{ ...th, textAlign: 'left' }}>Center</th>
              <th style={th}>ADA</th>
              <th style={th}>Breakfast</th>
              <th style={th}>AM Snack</th>
              <th style={th}>Lunch</th>
              <th style={th}>Supper</th>
              <th style={th}>Total Meals</th>
              <th style={th}>Reimbursement</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa' }}>No centers.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#0a3320' }}>🏫 {shortName(r.name)}</td>
                <td style={td}>{int(r.ada)}</td>
                <td style={td}>{int(r.breakfast)}</td>
                <td style={td}>{int(r.am_snack)}</td>
                <td style={td}>{int(r.lunch)}</td>
                <td style={td}>{int(r.supper)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{int(r.totalMeals)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{money(r.reimbursement)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f4f9f6' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0a3320', borderTop: '2px solid #0f4c35' }}>Organization total</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #0f4c35' }}>{int(totals.ada)}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #0f4c35' }}>{int(totals.breakfast)}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #0f4c35' }}>{int(totals.am_snack)}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #0f4c35' }}>{int(totals.lunch)}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #0f4c35' }}>{int(totals.supper)}</td>
                <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #0f4c35' }}>{int(totals.totalMeals)}</td>
                <td style={{ ...td, fontWeight: 700, color: '#0f4c35', borderTop: '2px solid #0f4c35' }}>{money(totals.reimbursement)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div style={{ fontSize: 11, color: '#aaa', marginTop: 12 }}>
        ADA = average daily attendance. Meal counts and reimbursement from CACFP monthly claim per center.
      </div>
    </div>
  )
}
