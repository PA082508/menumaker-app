import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'

type ItemStatus = 'met' | 'not_met' | 'na'

interface AssessItem { section: string; id: string; label: string }
interface AssessAnswer { item_id: string; status: ItemStatus; note: string }

const CHECKLIST: AssessItem[] = [
  { section: 'Menu Planning', id: 'mp_usda',     label: 'Menus meet USDA CACFP meal pattern requirements' },
  { section: 'Menu Planning', id: 'mp_rd',       label: 'Menus reviewed/approved by RD or nutritionist annually' },
  { section: 'Menu Planning', id: 'mp_families', label: 'Menus posted or distributed to families' },
  { section: 'Menu Planning', id: 'mp_cultural', label: 'Menus are culturally and linguistically appropriate' },
  { section: 'Menu Planning', id: 'mp_variety',  label: 'No main dish repeated more than once per week' },
  { section: 'Meal Service',  id: 'ms_family',   label: 'Family-style meal service implemented' },
  { section: 'Meal Service',  id: 'ms_time',     label: 'Adequate time for meals (20+ min for lunch)' },
  { section: 'Meal Service',  id: 'ms_staff',    label: 'Staff eat with children at meals' },
  { section: 'Special Dietary Needs', id: 'sdn_forms',  label: 'CF/HS-27 forms on file for all children with special needs' },
  { section: 'Special Dietary Needs', id: 'sdn_annual', label: 'CF/HS-27 forms reviewed annually' },
  { section: 'Special Dietary Needs', id: 'sdn_hm',     label: 'Health manager sign-off is current' },
  { section: 'Documentation', id: 'doc_cn',      label: 'CN Labels / PFS on file for all manufactured products' },
  { section: 'Documentation', id: 'doc_recipe',  label: 'Standardized recipes available for all scratch-cooked items' },
  { section: 'Family Engagement', id: 'fe_edu',   label: 'Nutrition education activities conducted this year' },
  { section: 'Family Engagement', id: 'fe_menus', label: 'Menus sent home to families regularly' },
  { section: 'Family Engagement', id: 'fe_input', label: 'Families included in menu planning feedback' },
]

const SECTIONS = [...new Set(CHECKLIST.map(i => i.section))]

export default function NutritionSelfAssessmentTab() {
  const year = new Date().getFullYear()
  const [answers, setAnswers] = useState<Record<string, AssessAnswer>>({})
  const [recordId, setRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .schema('menumaker').from('nutrition_self_assessments')
      .select('id,items').eq('center_id', CENTER_ID).eq('fiscal_year', year).maybeSingle()
    if (data) {
      setRecordId(data.id)
      const map: Record<string, AssessAnswer> = {}
      for (const a of (data.items as AssessAnswer[])) map[a.item_id] = a
      setAnswers(map)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const setStatus = (id: string, status: ItemStatus) =>
    setAnswers(a => ({ ...a, [id]: { item_id: id, status, note: a[id]?.note ?? '' } }))

  const setNote = (id: string, note: string) =>
    setAnswers(a => ({ ...a, [id]: { item_id: id, status: a[id]?.status ?? 'na', note } }))

  const save = async (complete = false) => {
    setSaving(true)
    const items = CHECKLIST.map(i => answers[i.id] ?? { item_id: i.id, status: 'na' as ItemStatus, note: '' })
    const payload = {
      center_id: CENTER_ID,
      fiscal_year: year,
      items,
      overall_status: complete ? 'complete' : 'draft',
      ...(complete ? { completed_at: new Date().toISOString() } : {}),
    }
    if (recordId) {
      await supabase.schema('menumaker').from('nutrition_self_assessments').update(payload).eq('id', recordId)
    } else {
      const { data } = await supabase.schema('menumaker').from('nutrition_self_assessments').insert(payload).select('id').single()
      if (data) setRecordId(data.id)
    }
    setSaving(false)
    setMsg(complete ? 'Self-Assessment marked complete!' : 'Draft saved')
    setTimeout(() => setMsg(null), 3000)
  }

  const metCount = CHECKLIST.filter(i => answers[i.id]?.status === 'met').length
  const total = CHECKLIST.length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>Nutrition Self-Assessment {year}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            Head Start Performance Standards · Annual requirement · {metCount}/{total} items met
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: '#0f4c35' }}>{msg}</span>}
          <button onClick={() => save(false)} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Save Draft
          </button>
          <button onClick={() => save(true)} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Mark Complete
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20, background: '#f0f0f0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: '#0f4c35', borderRadius: 6, width: `${(metCount / total) * 100}%`, transition: 'width 0.3s' }} />
      </div>

      {SECTIONS.map(section => (
        <div key={section} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0a3320', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #e4e8e4' }}>
            {section}
          </div>
          {CHECKLIST.filter(i => i.section === section).map(item => {
            const ans = answers[item.id]
            return (
              <div key={item.id} style={{
                marginBottom: 8, padding: '10px 14px', borderRadius: 8, background: '#fff',
                border: `1px solid ${ans?.status === 'met' ? '#bbf7d0' : ans?.status === 'not_met' ? '#fecaca' : '#e4e8e4'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {(['met','not_met','na'] as ItemStatus[]).map(s => (
                      <button key={s} onClick={() => setStatus(item.id, s)} style={{
                        padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                        background: ans?.status === s ? (s === 'met' ? '#0f4c35' : s === 'not_met' ? '#c0392b' : '#888') : '#f0f0f0',
                        color: ans?.status === s ? '#fff' : '#888',
                      }}>
                        {s === 'met' ? 'Met' : s === 'not_met' ? 'Not Met' : 'N/A'}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#333' }}>{item.label}</div>
                    <input type="text" placeholder="Note (optional)" value={ans?.note ?? ''} onChange={e => setNote(item.id, e.target.value)}
                      style={{ marginTop: 4, width: '100%', padding: '4px 8px', borderRadius: 5, border: '1px solid #eee', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#555' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
