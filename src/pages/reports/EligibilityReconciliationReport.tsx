// Eligibility Reconciliation — director-facing worksheet for reconciling each
// active F/R child's roster.frp against a real, current-cycle IEA determination
// on file (income_eligibility for the current fiscal year, e.g. FY2026-27).
//
// Purpose: the fiscal import defaulted many children to 'F' without a signed
// IEA. This surfaces every F/R child and whether a current-cycle determination
// exists, so a director (e.g. Carmen) can check each against the paper IEAs and
// close the gap via the IEA Review modal. Printable / shareable as a clean sheet.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { parseIeaFiscalYear } from '@/lib/enrollmentApprove'

const S = () => supabase.schema('menumaker')

const FRP_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  F: { bg: '#f0fff4', color: '#0f4c35', border: '#bbf7d0' },
  R: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  P: { bg: '#f4f4f5', color: '#6b7280', border: '#e0e0e0' },
}
const FRP_LABEL: Record<string, string> = { F: 'Free', R: 'Reduced', P: 'Paid' }

type Row = {
  roster_id: string
  name: string
  classroom: string
  frp: string
  onFile: boolean
  determinedAt: string | null
  determinedBy: string | null
  eligibility: string | null
  frpExpires: string | null
}

export default function EligibilityReconciliationReport() {
  const { currentCenter } = useOrg()
  const centerId = currentCenter?.id ?? ''
  const [fiscalYear, setFiscalYear] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyStale, setOnlyStale] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  // Current-cycle fiscal year = the registry's current IEA edition (never date
  // math). Falls back to null → the report explains it can't resolve the cycle.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/enroll-registry.json', { cache: 'no-cache' })
        const j = await r.json()
        const iea = j?.forms?.iea
        const url = iea?.versions?.[iea?.current] ?? iea?.fallbackUrl
        if (!cancelled) setFiscalYear(parseIeaFiscalYear(url))
      } catch { if (!cancelled) setFiscalYear(null) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!centerId || fiscalYear === null) { if (fiscalYear === null) setLoading(false); return }
    setLoading(true)
    ;(async () => {
      // Active F/R roster children in real (non-staff) classrooms.
      const [{ data: roster }, { data: cls }, { data: ie }] = await Promise.all([
        S().from('roster')
          .select('id,child_name,first_name,last_name,frp,frp_expires,classroom_id,is_active,date_out')
          .eq('center_id', centerId).eq('is_active', true).in('frp', ['F', 'R']),
        S().from('classrooms').select('id,name,is_roster').eq('center_id', centerId),
        S().from('income_eligibility')
          .select('roster_id,eligibility,frp_expires,determined_at,determined_by_name,fiscal_year')
          .eq('center_id', centerId).eq('fiscal_year', fiscalYear),
      ])
      const clsMap = new Map((cls ?? []).map((c: any) => [c.id, c]))
      const ieByRoster = new Map<string, any>()
      for (const r of ie ?? []) {
        // Keep the most recent determination if somehow more than one exists.
        const prev = ieByRoster.get((r as any).roster_id)
        if (!prev || String((r as any).determined_at ?? '') > String(prev.determined_at ?? '')) {
          ieByRoster.set((r as any).roster_id, r)
        }
      }
      const out: Row[] = []
      for (const r of (roster ?? []) as any[]) {
        const c = clsMap.get(r.classroom_id)
        if (c && c.is_roster === false) continue           // exclude staff pseudo-classes
        if (r.date_out && String(r.date_out).slice(0, 10) < today) continue  // departed
        const hit = ieByRoster.get(r.id)
        out.push({
          roster_id: r.id,
          name: r.child_name || `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim(),
          classroom: c?.name ?? '—',
          frp: String(r.frp ?? '').trim().toUpperCase().slice(0, 1),
          onFile: !!hit,
          determinedAt: hit?.determined_at ? String(hit.determined_at).slice(0, 10) : null,
          determinedBy: hit?.determined_by_name ?? null,
          eligibility: hit?.eligibility ?? null,
          frpExpires: r.frp_expires ? String(r.frp_expires).slice(0, 10) : null,
        })
      }
      out.sort((a, b) =>
        Number(a.onFile) - Number(b.onFile) || a.classroom.localeCompare(b.classroom) || a.name.localeCompare(b.name))
      setRows(out)
      setLoading(false)
    })()
  }, [centerId, fiscalYear, today])

  const staleCount = useMemo(() => rows.filter(r => !r.onFile).length, [rows])
  const shown = onlyStale ? rows.filter(r => !r.onFile) : rows

  function printSheet() {
    const w = window.open('', '_blank', 'width=900,height=1100')
    if (!w) return
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]!))
    const body = shown.map((r, i) => `
      <tr class="${r.onFile ? '' : 'stale'}">
        <td>${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.classroom)}</td>
        <td>${esc(FRP_LABEL[r.frp] ?? r.frp)}</td>
        <td>${r.onFile ? '✓ Yes' : '✗ No'}</td>
        <td>${esc(r.determinedAt ?? '')}</td>
        <td>${esc(r.determinedBy ?? '')}</td>
        <td class="sig">&nbsp;</td>
      </tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Eligibility Reconciliation — ${esc(currentCenter?.name)} — ${esc(fiscalYear)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#555;font-size:12px;margin-bottom:14px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th,td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}
        th{background:#f0f0f0} tr.stale td{background:#fff8e1}
        td.sig{min-width:120px} .legend{margin-top:12px;font-size:11px;color:#666}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Eligibility Reconciliation Worksheet</h1>
      <div class="sub">${esc(currentCenter?.name)} · Fiscal year <b>${esc(fiscalYear ?? '—')}</b> · Generated ${esc(today)} · ${shown.length} ${onlyStale ? 'unreconciled' : 'F/R'} children</div>
      <table><thead><tr>
        <th>#</th><th>Child</th><th>Classroom</th><th>Current status</th>
        <th>IEA ${esc(fiscalYear ?? '')} on file?</th><th>Determination date</th><th>Set by</th><th>Verified (initials / date)</th>
      </tr></thead><tbody>${body}</tbody></table>
      <div class="legend">Highlighted rows have no current-cycle IEA on file — reconcile against the paper IEA and record the determination in the app (IEA Review → Approve).</div>
      </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  if (!centerId) return <div style={{ padding: 32, color: '#6b7280' }}>Select a center to view its eligibility reconciliation.</div>

  return (
    <div style={{ padding: '28px 26px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>
        REPORTS
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0a3320', margin: 0, fontFamily: "'DM Serif Display', serif" }}>
        Eligibility Reconciliation
      </h1>
      <p style={{ margin: '6px 0 18px', color: '#6b7280', fontSize: 14 }}>
        {currentCenter?.name} · Fiscal year <strong>{fiscalYear ?? '—'}</strong> · every active Free/Reduced child and whether a current-cycle IEA determination is on file.
      </p>

      {fiscalYear === null && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '10px 12px', color: '#856404', fontSize: 13, marginBottom: 16 }}>
          ⚠️ Could not resolve the current IEA fiscal year from the form registry — showing no on-file matches. Check <code>/enroll-registry.json</code>.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ background: staleCount ? '#fff3cd' : '#f0fff4', border: `1px solid ${staleCount ? '#ffc107' : '#bbf7d0'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: staleCount ? '#856404' : '#0f4c35', fontWeight: 600 }}>
          {staleCount ? `🟡 ${staleCount} F/R child${staleCount === 1 ? '' : 'ren'} without a current IEA on file` : '✓ All F/R children have a current IEA on file'}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
          <input type="checkbox" checked={onlyStale} onChange={e => setOnlyStale(e.target.checked)} />
          Show only unreconciled
        </label>
        <button onClick={printSheet} disabled={!shown.length} style={{
          marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: '#0f4c35', color: '#fff', border: 'none', cursor: shown.length ? 'pointer' : 'default',
          opacity: shown.length ? 1 : 0.5, fontFamily: 'inherit',
        }}>
          🖨 Print / Share
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#6b7280', padding: 24 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #eef2f7', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#374151' }}>
                {['#', 'Child', 'Classroom', 'Current status', `IEA ${fiscalYear ?? ''} on file?`, 'Determination date', 'Set by'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #eef2f7', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const s = FRP_STYLE[r.frp] ?? FRP_STYLE.P
                return (
                  <tr key={r.roster_id} style={{ background: r.onFile ? '#fff' : '#fffdf5' }}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600, color: '#0a3320' }}>{r.name}</td>
                    <td style={td}>{r.classroom}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                        {FRP_LABEL[r.frp] ?? r.frp}
                      </span>
                    </td>
                    <td style={td}>
                      {r.onFile
                        ? <span style={{ color: '#0f4c35', fontWeight: 600 }}>✓ Yes{r.eligibility ? ` (${FRP_LABEL[r.eligibility] ?? r.eligibility})` : ''}</span>
                        : <span style={{ color: '#92400e', fontWeight: 700, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, padding: '1px 7px' }}>✗ No IEA on file</span>}
                    </td>
                    <td style={td}>{r.determinedAt ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={td}>{r.determinedBy ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  </tr>
                )
              })}
              {!shown.length && (
                <tr><td colSpan={7} style={{ ...td, color: '#6b7280', textAlign: 'center', padding: 20 }}>
                  {onlyStale ? 'No unreconciled F/R children — all have a current IEA on file.' : 'No active Free/Reduced children.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' }
