import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'

export default function PIRDataTab() {
  const [specialDietCount, setSpecialDietCount] = useState<number>(0)
  const [rdApprovedMenus, setRdApprovedMenus]   = useState<number>(0)
  const [publishedMenus, setPublishedMenus]     = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [diet, approved, published] = await Promise.all([
        supabase.schema('menumaker').from('special_diet_forms').select('id', { count: 'exact', head: true }),
        supabase.schema('menumaker').from('menu_cycles').select('id', { count: 'exact', head: true }).in('status', ['rd_approved','published']),
        supabase.schema('menumaker').from('published_menus').select('id', { count: 'exact', head: true }).eq('center_id', CENTER_ID),
      ])
      setSpecialDietCount(diet.count ?? 0)
      setRdApprovedMenus(approved.count ?? 0)
      setPublishedMenus(published.count ?? 0)
      setLoading(false)
    })()
  }, [])

  const row = (label: string, value: string | number, note?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div>
        <div style={{ fontSize: 13, color: '#333' }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{note}</div>}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f4c35', minWidth: 60, textAlign: 'right' }}>{value}</div>
    </div>
  )

  if (loading) return <div style={{ padding: 32, color: '#888', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>PIR — Nutrition Section Data</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
          Program Information Report · Section III Health Services · Export to HSES manually
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4', padding: '0 20px', marginBottom: 20 }}>
        {row('Children with special dietary needs (CF/HS-27 on file)', specialDietCount, 'From Form Submissions → Special Diet')}
        {row('Menu cycles approved by RD', rdApprovedMenus, 'Cycles with status rd_approved or published')}
        {row('Menu weeks published to families', publishedMenus, 'From published_menus table')}
        {row('Family-style meal service', 'Yes', 'Implemented per Head Start Performance Standards 1302.44')}
      </div>

      <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
        <strong>Note:</strong> Copy these numbers into the official PIR system (HSES) under Section III — Health Services — Nutrition.
        Dental, vision, and hearing screenings are tracked separately outside this application.
      </div>

      <button onClick={() => window.print()} style={{
        marginTop: 16, padding: '9px 20px', borderRadius: 8, border: '1px solid #0f4c35',
        background: '#fff', color: '#0f4c35', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        🖨️ Print for Records
      </button>
    </div>
  )
}
