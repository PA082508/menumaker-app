import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const FORMAT_LABELS: Record<string, string> = {
  classroom: '🏫 Classroom', newsletter: '📰 Newsletter',
  parent_meeting: '👥 Parent Meeting', home_visit: '🏠 Home Visit',
}

interface LogRow {
  id: string
  event_date: string
  topic: string
  format: string
  families_reached: number
  notes: string | null
}

const EMPTY_FORM = { event_date: '', topic: '', format: 'classroom', families_reached: '0', notes: '' }

export default function EducationLogTab() {
  const [rows, setRows]     = useState<LogRow[]>([])
  const [form, setForm]     = useState(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('nutrition_education_log')
      .select('id,event_date,topic,format,families_reached,notes')
      .eq('center_id', CENTER_ID)
      .order('event_date', { ascending: false })
    setRows(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.event_date || !form.topic) return
    setSaving(true)
    await supabase.schema('menumaker').from('nutrition_education_log').insert({
      center_id: CENTER_ID,
      event_date: form.event_date,
      topic: form.topic,
      format: form.format,
      families_reached: parseInt(form.families_reached) || 0,
      notes: form.notes || null,
    })
    setForm(EMPTY_FORM)
    setAdding(false)
    setSaving(false)
    load()
  }

  const yearTotal = rows.reduce((s, r) => s + r.families_reached, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#888' }}>
          {rows.length} activities logged · {yearTotal} total families reached
        </div>
        <button onClick={() => setAdding(a => !a)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Activity
        </button>
      </div>

      {adding && (
        <div style={{ marginBottom: 16, padding: 16, background: '#f0fff4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Date</div>
              <input type="date" value={form.event_date} onChange={set('event_date')}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Topic</div>
              <input type="text" value={form.topic} onChange={set('topic')} placeholder="e.g. Healthy Snacks at Home"
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Format</div>
              <select value={form.format} onChange={set('format')}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit' }}>
                {Object.entries(FORMAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Families Reached</div>
              <input type="number" value={form.families_reached} onChange={set('families_reached')}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3 }}>Notes</div>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid #ddd', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setAdding(false)}
              style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f4f6f4', borderBottom: '2px solid #e4e8e4' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Date</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Topic</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Format</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#555' }}>Families</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No activities logged yet. Add your first entry above.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fbf9', borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '9px 12px', color: '#555' }}>
                {new Date(r.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td style={{ padding: '9px 12px', color: '#333', fontWeight: 500 }}>{r.topic}</td>
              <td style={{ padding: '9px 12px', color: '#555' }}>{FORMAT_LABELS[r.format] ?? r.format}</td>
              <td style={{ padding: '9px 12px', textAlign: 'right', color: '#0f4c35', fontWeight: 600 }}>{r.families_reached}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
