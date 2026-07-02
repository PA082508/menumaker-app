// ============================================================
// ChildExportPanel.tsx — per-child Custom Export (B.3).
// Pick any registry fields (+ contacts) via checkboxes → Export CSV or Print.
// Select-all (global) and per-group select. Values come from the SAME registry
// formatter used by the inline display, so exports never drift from the UI.
// ============================================================

import { useMemo, useState } from 'react'
import {
  FIELDS, TABS, fieldsForTab, isFieldActive, displayValue,
  type RecordCtx, type FieldDef, type TabKey,
} from '@/lib/childFieldRegistry'

type Guardian = {
  id: string; first_name: string | null; last_name: string | null
  email: string | null; mobile_phone: string | null; phone_1: string | null
  role?: string; relationship?: string
}

// The registry tabs that carry scalar fields (Family/SafePass/Billing/Documents excluded).
const FIELD_TABS: TabKey[] = ['profile', 'enrollment', 'health', 'cacfp']

const guardianName = (g: Guardian) => [g.first_name, g.last_name].filter(Boolean).join(' ').trim() || 'Contact'
const guardianLine = (g: Guardian) =>
  [guardianName(g), g.relationship || g.role, g.mobile_phone || g.phone_1, g.email].filter(Boolean).join(' · ')

const csvCell = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s

export default function ChildExportPanel({
  childName, child, medical, view, guardians, classrooms, onClose,
}: {
  childName: string
  child: Record<string, any>
  medical: Record<string, any> | null
  view: Record<string, any> | null
  guardians: Guardian[]
  classrooms: { id: string; name: string }[]
  onClose: () => void
}) {
  const ctx: RecordCtx = { roster: child, medical, view }
  const classroomLabel = (id: string) => classrooms.find(c => c.id === id)?.name ?? id

  // Build the selectable model: one group per field-tab, plus a Contacts group.
  const groups = useMemo(() => {
    const g: { key: string; label: string; rows: { key: string; label: string; value: string }[] }[] = []
    for (const t of FIELD_TABS) {
      const def = TABS.find(x => x.key === t)!
      const rows = fieldsForTab(t)
        .filter((f: FieldDef) => isFieldActive(f, ctx))
        .map(f => ({ key: f.key, label: f.label, value: displayValue(f, ctx, { classroomLabel }) }))
      if (rows.length) g.push({ key: t, label: `${def.icon} ${def.label}`, rows })
    }
    if (guardians.length) {
      g.push({
        key: 'contacts', label: '👨‍👩‍👧 Contacts',
        rows: guardians.map(gu => ({ key: `guardian:${gu.id}`, label: guardianName(gu), value: guardianLine(gu) })),
      })
    }
    return g
  }, [child, medical, view, guardians]) // eslint-disable-line react-hooks/exhaustive-deps

  const allKeys = useMemo(() => groups.flatMap(g => g.rows.map(r => r.key)), [groups])
  // default: select every field that has a value
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(groups.flatMap(g => g.rows.filter(r => r.value).map(r => r.key))))

  const toggle = (k: string) => setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleGroup = (keys: string[], on: boolean) =>
    setSelected(s => { const n = new Set(s); keys.forEach(k => on ? n.add(k) : n.delete(k)); return n })
  const allOn = selected.size === allKeys.length && allKeys.length > 0

  // Flatten selected rows in group/registry order for output.
  const selectedRows = () =>
    groups.flatMap(g => g.rows.filter(r => selected.has(r.key)).map(r => ({ group: g.label, ...r })))

  const exportCsv = () => {
    const rows = selectedRows()
    const lines = [['Section', 'Field', 'Value'].join(',')]
    for (const r of rows) lines.push([csvCell(r.group.replace(/^[^\w]+/, '').trim()), csvCell(r.label), csvCell(r.value)].join(','))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${childName.replace(/[^\w]+/g, '_')}_export.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const printDoc = () => {
    const rows = selectedRows()
    let lastGroup = ''
    const body = rows.map(r => {
      const head = r.group !== lastGroup ? (lastGroup = r.group, `<tr><td colspan="2" class="grp">${r.group}</td></tr>`) : ''
      return `${head}<tr><th>${r.label}</th><td>${(r.value || '—').replace(/</g, '&lt;')}</td></tr>`
    }).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${childName}</title><style>
      body{font-family:'DM Sans',system-ui,sans-serif;color:#1a2e1a;padding:32px;max-width:720px;margin:0 auto}
      h1{color:#0f4c35;font-size:22px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:7px 10px;font-size:13px;vertical-align:top}
      th{width:38%;color:#374151;font-weight:600} tr{border-bottom:1px solid #eef2ee}
      .grp{background:#0f4c35;color:#fff;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding:6px 10px}
      @media print{body{padding:0}}</style></head><body>
      <h1>${childName}</h1><div class="sub">Child record export · ${new Date().toLocaleDateString('en-US')}</div>
      <table><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`
    const w = window.open('', '_blank', 'width=800,height=900')
    if (w) { w.document.write(html); w.document.close() }
  }

  const chk: React.CSSProperties = { width: 15, height: 15, accentColor: '#0f4c35', cursor: 'pointer' }
  const nSel = selected.size

  return (
    <div onClick={e => { e.stopPropagation(); onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 20, fontFamily: "'DM Sans',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ background: '#0f4c35', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Export · {childName}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>{nSel} field{nSel === 1 ? '' : 's'} selected</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={allOn} onChange={e => toggleGroup(allKeys, e.target.checked)} style={chk} />
            Select all
          </label>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 17 }}>×</button>
        </div>

        {/* Field list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 16px' }}>
          {groups.map(g => {
            const keys = g.rows.map(r => r.key)
            const on = keys.filter(k => selected.has(k)).length
            return (
              <div key={g.key} style={{ marginTop: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on === keys.length} ref={el => { if (el) el.indeterminate = on > 0 && on < keys.length }}
                    onChange={e => toggleGroup(keys, e.target.checked)} style={chk} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35' }}>{g.label}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>({on}/{keys.length})</span>
                </label>
                {g.rows.map(r => (
                  <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 22px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} style={chk} />
                    <span style={{ fontSize: 13, color: '#374151', minWidth: 150 }}>{r.label}</span>
                    <span style={{ fontSize: 13, color: r.value ? '#1a2e1a' : '#c0c8c0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value || '— empty'}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1.5px solid #e8f0e8', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#f8faf8', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #c0d8c0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
          <button onClick={printDoc} disabled={!nSel} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', cursor: nSel ? 'pointer' : 'default', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', opacity: nSel ? 1 : 0.5 }}>🖨 Print</button>
          <button onClick={exportCsv} disabled={!nSel} style={{ padding: '9px 20px', borderRadius: 8, background: '#0f4c35', color: '#fff', border: 'none', cursor: nSel ? 'pointer' : 'default', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', opacity: nSel ? 1 : 0.5 }}>⤓ Export CSV</button>
        </div>
      </div>
    </div>
  )
}
