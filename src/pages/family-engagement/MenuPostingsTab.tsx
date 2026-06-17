import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const METHOD_LABELS: Record<string, string> = {
  printed: '🖨️ Printed', email: '📧 Email', bulletin: '📌 Bulletin Board',
}

interface PostingRow {
  id: string
  published_at: string
  week_number: number
  distribution_method: string
  rd_approved_by: string | null
  cycle_name: string | null
}

export default function MenuPostingsTab() {
  const [rows, setRows] = useState<PostingRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('published_menus')
      .select('id,published_at,week_number,distribution_method,rd_approved_by,menu_cycles(name)')
      .eq('center_id', CENTER_ID)
      .order('published_at', { ascending: false })
    setRows((data ?? []).map((d: any) => ({
      id: d.id,
      published_at: d.published_at,
      week_number: d.week_number,
      distribution_method: d.distribution_method,
      rd_approved_by: d.rd_approved_by,
      cycle_name: d.menu_cycles?.name ?? null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 24, color: '#888', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Menus published to families from the Menu Planner. Each row represents one week distributed to families.
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          No menus published yet. Use "Publish to Families" in the Menu Planner after RD approval.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f4f6f4', borderBottom: '2px solid #e4e8e4' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Date</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Cycle / Week</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Method</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Approved by RD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbf9', borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '9px 12px', color: '#333' }}>
                  {new Date(r.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style={{ padding: '9px 12px', color: '#555' }}>
                  {r.cycle_name ?? '—'} · Week {r.week_number}
                </td>
                <td style={{ padding: '9px 12px', color: '#555' }}>
                  {METHOD_LABELS[r.distribution_method] ?? r.distribution_method}
                </td>
                <td style={{ padding: '9px 12px', color: r.rd_approved_by ? '#0f4c35' : '#aaa' }}>
                  {r.rd_approved_by ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
