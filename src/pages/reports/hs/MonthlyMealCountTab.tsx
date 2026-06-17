import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', am_snack: 'AM Snack', lunch: 'Lunch',
  pm_snack: 'PM Snack', supper: 'Supper',
}

interface ClassRow {
  id: string
  name: string
  counts: Record<string, number>
  total: number
}

export default function MonthlyMealCountTab() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows]   = useState<ClassRow[]>([])
  const [slots, setSlots] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: cfg } = await supabase.schema('menumaker').from('meal_count_settings')
      .select('active_slots').eq('center_id', CENTER_ID).maybeSingle()
    const activeSlots: string[] = cfg?.active_slots ?? ['breakfast','am_snack','lunch','supper']
    setSlots(activeSlots)

    const { data: ctrs } = await supabase.schema('menumaker').from('centers')
      .select('id,name').eq('is_active', true)

    const pad = (n: number) => String(n).padStart(2, '0')
    const weekStart = `${year}-${pad(month)}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const weekEnd = `${year}-${pad(month)}-${lastDay}`

    const { data: records } = await supabase.schema('menumaker').from('meal_count_week')
      .select('*')
      .gte('week_start', weekStart)
      .lte('week_start', weekEnd)

    const DAYS = ['mon','tue','wed','thu','fri']
    const SLOT_SHORT: Record<string, string> = {
      breakfast: 'b', am_snack: 'as', lunch: 'l', pm_snack: 'ps', supper: 'su',
    }

    const classMap: Record<string, ClassRow> = {}
    for (const ctr of ctrs ?? []) {
      classMap[ctr.id] = { id: ctr.id, name: ctr.name, counts: {}, total: 0 }
      for (const s of activeSlots) classMap[ctr.id].counts[s] = 0
    }
    if (!classMap[CENTER_ID]) {
      classMap[CENTER_ID] = { id: CENTER_ID, name: 'Pearl', counts: {}, total: 0 }
      for (const s of activeSlots) classMap[CENTER_ID].counts[s] = 0
    }

    for (const rec of records ?? []) {
      const cls = classMap[rec.center_id] ?? classMap[CENTER_ID]
      if (!cls) continue
      for (const slot of activeSlots) {
        const short = SLOT_SHORT[slot] ?? slot
        for (const d of DAYS) {
          const val = rec[`${d}_${short}`] ?? 0
          if (typeof val === 'number') cls.counts[slot] = (cls.counts[slot] ?? 0) + val
        }
      }
    }

    const result = Object.values(classMap).map(r => ({
      ...r,
      total: activeSlots.reduce((s, slot) => s + (r.counts[slot] ?? 0), 0),
    }))
    setRows(result)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const slotTotals = slots.reduce((acc, s) => ({
    ...acc, [s]: rows.reduce((n, r) => n + (r.counts[s] ?? 0), 0),
  }), {} as Record<string, number>)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => window.print()}
          style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          🖨️ Print
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 32, color: '#888', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0f4c35', color: '#fff' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Class</th>
                {slots.map(s => <th key={s} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{SLOT_LABELS[s] ?? s}</th>)}
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbf9' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: '#0a3320' }}>{r.name}</td>
                  {slots.map(s => <td key={s} style={{ padding: '9px 12px', textAlign: 'right', color: '#555' }}>{r.counts[s] ?? 0}</td>)}
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f4c35' }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0fff4', borderTop: '2px solid #0f4c35' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0a3320' }}>TOTAL</td>
                {slots.map(s => <td key={s} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f4c35' }}>{slotTotals[s] ?? 0}</td>)}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f4c35' }}>{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, color: '#aaa' }}>
        Head Start monthly meal count · No CACFP reimbursement claim · For grant documentation only
      </div>
    </div>
  )
}
