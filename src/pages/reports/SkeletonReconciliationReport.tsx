// Skeleton Reconciliation — worksheet for the fiscal-import stub roster records
// (source='masterlist_fiscal', null DOB, each carrying an income_eligibility row).
// Read-only for now: it categorizes every skeleton (mergeable → has an exact-name
// keeper in the same center; orphan → none) and proposes the keeper, so a director
// can review before any merge/promote/retire. Writes are intentionally NOT wired
// yet — they mutate roster + income_eligibility on records that may back prior-FY
// claims. See docs/skeleton-reconciliation-table-spec.md.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { fuzzyMatch, nameForms } from '@/lib/childSearch'

const S = () => supabase.schema('menumaker')
const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const FRP_LABEL: Record<string, string> = { F: 'Free', R: 'Reduced', P: 'Paid' }

type Keeper = { id: string; name: string; nn: string }
type Row = {
  id: string
  name: string
  active: boolean
  eligibility: string | null
  keeper: Keeper | null      // keeper in same center (mergeable)
  similar: boolean           // keeper found via fuzzy name match (typo variant)
}

export default function SkeletonReconciliationReport() {
  const { currentCenter } = useOrg()
  const centerId = currentCenter?.id ?? ''
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'mergeable' | 'orphan' | 'all'>('all')
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!centerId) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const [{ data: skel }, { data: keepers }, { data: ie }] = await Promise.all([
        S().from('roster').select('id,child_name,is_active')
          .eq('center_id', centerId).eq('source', 'masterlist_fiscal'),
        S().from('roster').select('id,child_name').eq('center_id', centerId).is('source', null),
        S().from('income_eligibility').select('roster_id,eligibility').eq('center_id', centerId),
      ])
      const ieByRoster = new Map((ie ?? []).map((r: any) => [r.roster_id, r.eligibility]))
      const keeperList: Keeper[] = []
      const keeperByName = new Map<string, Keeper>()
      for (const k of (keepers ?? []) as any[]) {
        const nn = norm(k.child_name)
        const kp: Keeper = { id: k.id, name: k.child_name, nn }
        keeperList.push(kp)
        if (!keeperByName.has(nn)) keeperByName.set(nn, kp)
      }
      // Exact-name keeper first; else a fuzzy 'similar' keeper so typo stubs
      // (Rakhmanov ↔ Rackmanov) stop landing in orphan. Fuzzy is bounded and
      // both name tokens must be close, so false positives are rare.
      const findKeeper = (name: string): { keeper: Keeper; similar: boolean } | null => {
        const exact = keeperByName.get(norm(name))
        if (exact) return { keeper: exact, similar: false }
        const fz = keeperList.find(k => fuzzyMatch(nameForms(null, null, k.name), name))
        return fz ? { keeper: fz, similar: true } : null
      }
      const out: Row[] = ((skel ?? []) as any[]).map(s => {
        const fk = findKeeper(s.child_name)
        return {
          id: s.id,
          name: s.child_name,
          active: s.is_active !== false,
          eligibility: ieByRoster.get(s.id) ?? null,
          keeper: fk?.keeper ?? null,
          similar: fk?.similar ?? false,
        }
      })
      // Mergeable first; exact keeper above fuzzy 'similar'; then by name.
      out.sort((a, b) =>
        (Number(!!b.keeper) - Number(!!a.keeper))
        || (Number(a.similar) - Number(b.similar))
        || a.name.localeCompare(b.name))
      setRows(out)
      setLoading(false)
    })()
  }, [centerId])

  const mergeable = useMemo(() => rows.filter(r => r.keeper), [rows])
  const orphan = useMemo(() => rows.filter(r => !r.keeper), [rows])
  const shown = filter === 'mergeable' ? mergeable : filter === 'orphan' ? orphan : rows

  function printSheet() {
    const w = window.open('', '_blank', 'width=980,height=1100')
    if (!w) return
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]!))
    const body = shown.map((r, i) => `
      <tr class="${r.keeper ? '' : 'orphan'}">
        <td>${i + 1}</td><td>${esc(r.name)}</td>
        <td>${esc(FRP_LABEL[r.eligibility ?? ''] ?? r.eligibility ?? '')}</td>
        <td>${r.active ? 'active' : 'inactive'}</td>
        <td>${r.keeper ? 'Merge → ' + esc(r.keeper.name) + (r.similar ? ' (similar)' : '') : 'No keeper match — review'}</td>
        <td class="sig">&nbsp;</td>
      </tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Skeleton Reconciliation — ${esc(currentCenter?.name)}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;margin:26px}h1{font-size:17px;margin:0 0 2px}
      .sub{color:#555;font-size:12px;margin-bottom:12px}table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#f0f0f0}tr.orphan td{background:#fff8e1}
      td.sig{min-width:130px}.legend{margin-top:10px;font-size:11px;color:#666}@media print{button{display:none}}</style></head><body>
      <h1>Skeleton Reconciliation Worksheet</h1>
      <div class="sub">${esc(currentCenter?.name)} · generated ${esc(today)} · ${shown.length} rows · ${mergeable.length} mergeable / ${orphan.length} orphan</div>
      <table><thead><tr><th>#</th><th>Skeleton child</th><th>Stub eligibility</th><th>State</th><th>Proposed action</th><th>Decision (initials / date)</th></tr></thead>
      <tbody>${body}</tbody></table>
      <div class="legend">Highlighted = orphan (no exact keeper match). Do NOT retire blindly — a stub's income_eligibility may back a prior-FY claim. Reconcile via the app once merge/retire actions ship.</div>
      </body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  if (!centerId) return <div style={{ padding: 32, color: '#6b7280' }}>Select a center to view its skeleton reconciliation.</div>

  return (
    <div style={{ padding: '28px 26px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>REPORTS</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0a3320', margin: 0, fontFamily: "'DM Serif Display', serif" }}>Skeleton Reconciliation</h1>
      <p style={{ margin: '6px 0 16px', color: '#6b7280', fontSize: 14 }}>
        {currentCenter?.name} · fiscal-import stub records (no birthday, carrying an eligibility row) and their proposed keeper. Review worksheet — merge/retire actions are not wired yet.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {([['all', `All ${rows.length}`], ['mergeable', `Mergeable ${mergeable.length}`], ['orphan', `Orphan ${orphan.length}`]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: '6px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
            background: filter === k ? '#0f4c35' : '#f3f4f6', color: filter === k ? '#fff' : '#374151', fontWeight: filter === k ? 600 : 400,
          }}>{lbl}</button>
        ))}
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#856404' }}>
          ⚠️ Orphan stubs may back prior-FY claims — do not retire blindly.
        </div>
        <button onClick={printSheet} disabled={!shown.length} style={{
          marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: '#0f4c35', color: '#fff', border: 'none', cursor: shown.length ? 'pointer' : 'default', opacity: shown.length ? 1 : 0.5, fontFamily: 'inherit',
        }}>🖨 Print / Share</button>
      </div>

      {loading ? <div style={{ color: '#6b7280', padding: 24 }}>Loading…</div> : (
        <div style={{ overflowX: 'auto', border: '1px solid #eef2f7', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#374151' }}>
                {['#', 'Skeleton child', 'Stub eligibility', 'State', 'Proposed action'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #eef2f7', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} style={{ background: r.keeper ? '#fff' : '#fffdf5' }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600, color: '#0a3320' }}>{r.name}</td>
                  <td style={td}>{r.eligibility ? (FRP_LABEL[r.eligibility] ?? r.eligibility) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={td}><span style={{ fontSize: 11, color: r.active ? '#0f4c35' : '#6b7280' }}>{r.active ? 'active' : 'inactive'}</span></td>
                  <td style={td}>
                    {r.keeper
                      ? <span style={{ color: '#0f4c35' }}>Merge → <strong>{r.keeper.name}</strong>{r.similar && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 7px', borderRadius: 20 }}>similar</span>}</span>
                      : <span style={{ color: '#92400e', fontWeight: 600, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, padding: '1px 7px' }}>No keeper — review</span>}
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={5} style={{ ...td, color: '#6b7280', textAlign: 'center', padding: 20 }}>No skeleton records for this center.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' }
