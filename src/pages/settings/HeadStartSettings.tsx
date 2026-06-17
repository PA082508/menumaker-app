import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useProgramConfig } from '@/hooks/useProgramConfig'

const CENTER_SLUG = 'pearl'

interface HSForm {
  program_type: string
  program_hours: string
  program_start_time: string
  program_end_time: string
  fiscal_year_start_month: string
  dietitian_name: string
  dietitian_credentials: string
  dietitian_email: string
  health_manager_name: string
  health_manager_email: string
  grant_number: string
  enrollment_capacity: string
}

const EMPTY: HSForm = {
  program_type: 'cacfp',
  program_hours: '',
  program_start_time: '',
  program_end_time: '',
  fiscal_year_start_month: '10',
  dietitian_name: '',
  dietitian_credentials: '',
  dietitian_email: '',
  health_manager_name: '',
  health_manager_email: '',
  grant_number: '',
  enrollment_capacity: '',
}

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

export default function HeadStartSettings() {
  const [form, setForm]       = useState<HSForm>(EMPTY)
  const [centerId, setCenterId] = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)
  const { reload } = useProgramConfig()

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .schema('menumaker').from('centers')
        .select('id,program_type,program_hours,program_start_time,program_end_time,fiscal_year_start_month,dietitian_name,dietitian_credentials,dietitian_email,health_manager_name,health_manager_email,grant_number,enrollment_capacity')
        .eq('slug', CENTER_SLUG).maybeSingle()
      if (data) {
        setCenterId(data.id)
        setForm({
          program_type:             data.program_type ?? 'cacfp',
          program_hours:            data.program_hours?.toString() ?? '',
          program_start_time:       data.program_start_time ?? '',
          program_end_time:         data.program_end_time ?? '',
          fiscal_year_start_month:  data.fiscal_year_start_month?.toString() ?? '10',
          dietitian_name:           data.dietitian_name ?? '',
          dietitian_credentials:    data.dietitian_credentials ?? '',
          dietitian_email:          data.dietitian_email ?? '',
          health_manager_name:      data.health_manager_name ?? '',
          health_manager_email:     data.health_manager_email ?? '',
          grant_number:             data.grant_number ?? '',
          enrollment_capacity:      data.enrollment_capacity?.toString() ?? '',
        })
      }
    })()
  }, [])

  const set = (k: keyof HSForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!centerId) return
    setSaving(true)
    const { error } = await supabase
      .schema('menumaker').from('centers').update({
        program_type:             form.program_type,
        program_hours:            form.program_hours ? parseFloat(form.program_hours) : null,
        program_start_time:       form.program_start_time || null,
        program_end_time:         form.program_end_time || null,
        fiscal_year_start_month:  parseInt(form.fiscal_year_start_month),
        dietitian_name:           form.dietitian_name || null,
        dietitian_credentials:    form.dietitian_credentials || null,
        dietitian_email:          form.dietitian_email || null,
        health_manager_name:      form.health_manager_name || null,
        health_manager_email:     form.health_manager_email || null,
        grant_number:             form.grant_number || null,
        enrollment_capacity:      form.enrollment_capacity ? parseInt(form.enrollment_capacity) : null,
      }).eq('id', centerId)
    setSaving(false)
    setMsg(error ? `Error: ${error.message}` : 'Saved')
    setTimeout(() => setMsg(null), 3000)
    reload()
  }

  const inp = (label: string, k: keyof HSForm, type = 'text') => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={form[k]}
        onChange={set(k)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  )

  const hoursVal = parseFloat(form.program_hours || '0')
  const hoursHint = hoursVal > 0
    ? hoursVal < 6
      ? '⬇ Under 6 hours → meals must provide 1/3–1/2 of daily nutritional needs'
      : '⬆ 6+ hours → meals must provide 1/2–2/3 of daily nutritional needs'
    : ''

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Program Type */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Program Type</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['cacfp','headstart'] as const).map(pt => (
            <label key={pt} style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '10px 16px', borderRadius: 8,
              border: `2px solid ${form.program_type === pt ? '#0f4c35' : '#e4e8e4'}`,
              background: form.program_type === pt ? '#f0fff4' : '#fff',
            }}>
              <input type="radio" name="program_type" value={pt}
                checked={form.program_type === pt} onChange={set('program_type')}
                style={{ accentColor: '#0f4c35' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0a3320' }}>
                {pt === 'cacfp' ? 'CACFP' : 'Head Start'}
              </span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
          Switching program type changes the sidebar navigation, reports, and forms available to your team.
        </div>
      </div>

      {/* Program Schedule */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Program Schedule</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {inp('Daily Hours', 'program_hours', 'number')}
          {inp('Start Time', 'program_start_time', 'time')}
          {inp('End Time', 'program_end_time', 'time')}
        </div>
        {hoursHint && (
          <div style={{ fontSize: 11, color: '#0f4c35', marginTop: 4 }}>{hoursHint}</div>
        )}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>Fiscal Year Start Month</div>
          <select value={form.fiscal_year_start_month} onChange={set('fiscal_year_start_month')}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit' }}>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Registered Dietitian */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Registered Dietitian (RD)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inp('Name', 'dietitian_name')}
          {inp('Credentials (e.g. RD, LDN)', 'dietitian_credentials')}
          {inp('Email', 'dietitian_email', 'email')}
          {inp('Grant Number', 'grant_number')}
        </div>
      </div>

      {/* Health Manager */}
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0a3320', marginBottom: 12 }}>Health Manager</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {inp('Name', 'health_manager_name')}
          {inp('Email', 'health_manager_email', 'email')}
          {inp('Enrollment Capacity', 'enrollment_capacity', 'number')}
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          fontFamily: 'inherit',
        }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#c0392b' : '#0f4c35' }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}
