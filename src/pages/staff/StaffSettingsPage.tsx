// ============================================================
// StaffSettingsPage.tsx — route /staff/:staffId/settings
// Full employee profile editor — personal, payroll, schedule, benefits
// ============================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// ── styles ────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 24, marginBottom: 20 }
const h3: React.CSSProperties = { margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: '#0a3320', borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 5 }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
const sel: React.CSSProperties = { ...inp, appearance: 'none', cursor: 'pointer' }
const btnPri: React.CSSProperties = { padding: '10px 20px', borderRadius: 9, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnSec: React.CSSProperties = { padding: '10px 18px', borderRadius: 9, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

const POSITIONS = ['Lead Teacher','Assistant Teacher','Teacher','Cook','Floater','Director','Assistant Director','Office Manager','Administrator','Other']
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

type StaffData = {
  id: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; phone2: string | null
  position: string | null; center_id: string | null
  class_primary: string | null; class_secondary: string | null
  hire_date: string | null; birthday: string | null
  address: string | null
  is_active: boolean | null
  // payroll
  pay_type: 'hourly' | 'salary' | null
  hourly_rate: number | null; contract_hours: number | null
  salary_amount: number | null
  overtime_eligible: boolean | null; overtime_rate: number | null
  max_weekly_hours: number | null
  // education
  degree: string | null; certification: string | null
  ece_credits: string | null; infant_toddler_credits: string | null
  // emergency
  emergency_contact_name: string | null
  emergency_contact_relationship: string | null
  emergency_contact_phone: string | null
  // medical
  allergies: string | null; medications: string | null
  doctor_name: string | null; doctor_phone: string | null
  // bonus
  bonus_eligible: boolean | null; bonus_type: string | null
  bonus_amount: number | null; bonus_notes: string | null
}

type Schedule = {
  day_of_week: number
  shift_start: string; shift_end: string; break_minutes: number; is_active: boolean
}

type TrainingRecord = {
  id: string; training_type: string; training_name: string
  provider: string | null; completed_date: string; hours_earned: number
  expires_date: string | null; certificate_url: string | null
  verified_by: string | null; notes: string | null
}
type DocRecord = {
  id: string; doc_type: string; title: string; file_name: string
  storage_path: string; uploaded_at: string; expires_date: string | null
  uploaded_by: string; notes: string | null
}

const fmtDate = (d: string | null) => d ? d.slice(0, 10) : ''
const fmtDateDisplay = (d: string | null) => {
  if (!d) return '—'
  const [y,m,day] = d.slice(0,10).split('-')
  return `${Number(m)}/${Number(day)}/${y}`
}
const avatarColor = (name: string) => {
  const colors = ['#0f4c35','#1a6b4a','#2d8f64','#4a7c6b','#5c4f7c','#7c4f4f','#4f6b7c']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}

const TRAINING_TYPES = ['First Aid/CPR','Child Abuse Prevention','Health & Safety','Nutrition','Curriculum','Special Needs','CACFP','Fire Safety','Other']
const DOC_TYPES: Record<string, string> = {
  contract: 'Contract', i9: 'I-9', w4: 'W-4',
  certification: 'Certification', training: 'Training',
  performance: 'Performance Review', disciplinary: 'Disciplinary',
  identity: 'ID Document', other: 'Other',
}

// Benefits eligibility
const monthsWorked = (hire: string | null) => {
  if (!hire) return 0
  const h = new Date(hire); const now = new Date()
  return (now.getFullYear() - h.getFullYear()) * 12 + now.getMonth() - h.getMonth()
}

export default function StaffSettingsPage() {
  const { staffId } = useParams<{ staffId: string }>()
  const { centers, org } = useOrg()
  const navigate = useNavigate()

  const [data, setData]         = useState<StaffData | null>(null)
  const [sched, setSched]       = useState<Schedule[]>([])
  const [training, setTraining] = useState<TrainingRecord[]>([])
  const [docs, setDocs]         = useState<DocRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [saveErr, setSaveErr]   = useState<string | null>(null)
  const [tab, setTab]           = useState<'profile'|'work'|'docs'>('profile')

  // Training form
  const [showTrainingForm, setShowTrainingForm] = useState(false)
  const [tForm, setTForm] = useState({ training_type: '', training_name: '', provider: '', completed_date: '', hours_earned: '', expires_date: '', notes: '' })
  const [addingTraining, setAddingTraining] = useState(false)

  useEffect(() => {
    if (!staffId) return
    ;(async () => {
      const [{ data: s }, { data: sc }, { data: tr }, { data: dc }] = await Promise.all([
        supabase.schema('menumaker').from('staff').select('*').eq('id', staffId).single(),
        supabase.schema('menumaker').from('staff_schedules').select('*').eq('staff_id', staffId),
        supabase.schema('menumaker').from('staff_training_records').select('*').eq('staff_id', staffId).order('completed_date', { ascending: false }),
        supabase.schema('menumaker').from('staff_documents').select('*').eq('staff_id', staffId).eq('is_active', true).order('uploaded_at', { ascending: false }),
      ])
      setData(s as StaffData)
      const days = DAYS.map((_, i) => {
        const existing = (sc ?? []).find((r: any) => r.day_of_week === i)
        return existing
          ? { day_of_week: i, shift_start: existing.shift_start?.slice(0,5) ?? '', shift_end: existing.shift_end?.slice(0,5) ?? '', break_minutes: existing.break_minutes ?? 30, is_active: existing.is_active ?? false }
          : { day_of_week: i, shift_start: '', shift_end: '', break_minutes: 30, is_active: false }
      })
      setSched(days)
      setTraining((tr ?? []) as TrainingRecord[])
      setDocs((dc ?? []) as DocRecord[])
      setLoading(false)
    })()
  }, [staffId])

  const set = (field: keyof StaffData, value: any) =>
    setData(prev => prev ? { ...prev, [field]: value } : prev)

  const setSchedDay = (dayIdx: number, field: keyof Schedule, value: any) =>
    setSched(prev => prev.map((d, i) => i === dayIdx ? { ...d, [field]: value } : d))

  const save = async () => {
    if (!data || !staffId) return
    setSaving(true); setSaveErr(null)

    // Update staff — and VERIFY it landed. A row-level-security denial returns
    // zero rows and NO error, so `await` without inspecting the result reports
    // "Saved ✓" over a write that never happened (silent 0-row update = an
    // interface lie). `.select('id')` makes the affected rows observable:
    // an error is an error, and an empty array means nothing was written.
    const { data: updated, error: staffErr } = await supabase.schema('menumaker').from('staff').update({
      first_name: data.first_name, last_name: data.last_name,
      email: data.email, phone: data.phone, phone2: data.phone2,
      position: data.position, center_id: data.center_id,
      class_primary: data.class_primary, class_secondary: data.class_secondary,
      hire_date: data.hire_date || null, birthday: data.birthday || null,
      address: data.address, is_active: data.is_active,
      hourly_rate: data.hourly_rate, contract_hours: data.contract_hours,
      overtime_eligible: data.overtime_eligible, overtime_rate: data.overtime_rate,
      max_weekly_hours: data.max_weekly_hours,
      pay_type: data.pay_type ?? 'hourly', salary_amount: data.salary_amount,
      degree: data.degree, certification: data.certification,
      ece_credits: data.ece_credits, infant_toddler_credits: data.infant_toddler_credits,
      emergency_contact_name: data.emergency_contact_name,
      emergency_contact_relationship: data.emergency_contact_relationship,
      emergency_contact_phone: data.emergency_contact_phone,
      allergies: data.allergies, medications: data.medications,
      doctor_name: data.doctor_name, doctor_phone: data.doctor_phone,
      bonus_eligible: data.bonus_eligible, bonus_type: data.bonus_type,
      bonus_amount: data.bonus_amount, bonus_notes: data.bonus_notes,
    }).eq('id', staffId).select('id')

    if (staffErr) {
      setSaving(false)
      setSaveErr(`Not saved — the database rejected the change: ${staffErr.message}. Nothing was written.`)
      return
    }
    if (!updated || updated.length === 0) {
      setSaving(false)
      setSaveErr('Not saved — 0 rows updated. You may not have permission to edit this staff member (the change was blocked, not written). Nothing has changed.')
      return
    }

    // Upsert schedule — verified the same way.
    const schedRows = sched.filter(s => s.is_active && s.shift_start && s.shift_end).map(s => ({
      staff_id: staffId, org_id: org?.id, center_id: data.center_id,
      classroom_id: data.class_primary, // approximate
      day_of_week: s.day_of_week,
      shift_start: s.shift_start, shift_end: s.shift_end,
      break_minutes: s.break_minutes, is_active: true,
      effective_from: new Date().toISOString().slice(0, 10),
    }))
    if (schedRows.length > 0) {
      const { error: schedErr } = await supabase.schema('menumaker').from('staff_schedules')
        .upsert(schedRows, { onConflict: 'staff_id,day_of_week,effective_from' }).select('staff_id')
      if (schedErr) {
        setSaving(false)
        setSaveErr(`Profile saved, but the schedule was not: ${schedErr.message}.`)
        return
      }
    }

    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#aaa' }}>Loading…</div>
  if (!data)   return <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#aaa' }}>Staff member not found.</div>

  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Staff'
  const ini  = ((data.first_name?.[0] ?? '') + (data.last_name?.[0] ?? '')).toUpperCase() || '?'
  const months = monthsWorked(data.hire_date)
  const hasBenefits = months >= 3
  const isFullTime = (data.contract_hours ?? 0) >= 32

  // IA v2 — 7 tabs → 3 (approved mockup 5bf0f5e8): Profile (Personal + Emergency),
  // Work (Position + Payroll + Schedule + Benefits), Docs (Education + Training + Documents).
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'profile', label: '👤 Profile' },
    { key: 'work',    label: `🗂 Work${hasBenefits ? ' · benefits ✓' : ''}` },
    { key: 'docs',    label: `📋 Docs${(training.length + docs.length) > 0 ? ` (${training.length + docs.length})` : ''}` },
  ]

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Typography standard — 960px centered content over the full-bleed background. */}
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={() => navigate('/staff')} style={{ ...btnSec, padding: '7px 14px', fontSize: 13 }}>← Staff</button>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: avatarColor(name),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0,
        }}>{ini}</div>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#0a3320' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {data.position ?? 'Staff'} · {centers.find(c => c.id === data.center_id)?.name?.replace(/^Play Academy\s+/i,'') ?? '—'}
            {data.hire_date && <span> · {months}mo</span>}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Active toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}>
            <div
              onClick={() => set('is_active', !data.is_active)}
              style={{
                width: 40, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s',
                background: data.is_active ? '#0f4c35' : '#d1d5db', position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: data.is_active ? 21 : 3,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </div>
            {data.is_active ? 'Active' : 'Inactive'}
          </label>
          <button onClick={save} disabled={saving} style={saving ? { ...btnPri, opacity: 0.7 } : saved ? { ...btnPri, background: '#0f7a4a' } : btnPri}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Save error — a blocked write must never look saved */}
      {saveErr && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
          padding: '12px 16px', borderRadius: 10,
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b',
          fontSize: 13, fontWeight: 500,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠</span>
          <span>{saveErr}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e0e8e0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? '#0f4c35' : '#888',
            borderBottom: tab === t.key ? '2px solid #0f4c35' : '2px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── PROFILE: Personal + Emergency ── */}
      {tab === 'profile' && (
          <div style={card}>
            <h3 style={h3}>Personal Information</h3>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div><label style={lbl}>First Name</label><input style={inp} value={data.first_name ?? ''} onChange={e => set('first_name', e.target.value)} /></div>
              <div><label style={lbl}>Last Name</label><input style={inp} value={data.last_name ?? ''} onChange={e => set('last_name', e.target.value)} /></div>
            </div>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div><label style={lbl}>Email</label><input style={inp} type="email" value={data.email ?? ''} onChange={e => set('email', e.target.value)} /></div>
              <div><label style={lbl}>Phone</label><input style={inp} type="tel" value={data.phone ?? ''} onChange={e => set('phone', e.target.value)} /></div>
            </div>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div><label style={lbl}>Phone 2</label><input style={inp} type="tel" value={data.phone2 ?? ''} onChange={e => set('phone2', e.target.value)} /></div>
              <div><label style={lbl}>Birthday</label><input style={inp} type="date" value={fmtDate(data.birthday)} onChange={e => set('birthday', e.target.value)} /></div>
            </div>
            <div><label style={lbl}>Home Address</label><input style={inp} value={data.address ?? ''} onChange={e => set('address', e.target.value)} /></div>
          </div>
      )}

      {/* ── WORK: Position + Payroll + Schedule + Benefits ── */}
      {tab === 'work' && (
          <div style={card}>
            <h3 style={h3}>Position & Assignment</h3>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Position</label>
                <select style={sel} value={data.position ?? ''} onChange={e => set('position', e.target.value)}>
                  <option value="">— select —</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Center</label>
                <select style={sel} value={data.center_id ?? ''} onChange={e => set('center_id', e.target.value)}>
                  <option value="">— select —</option>
                  {centers.map(c => <option key={c.id} value={c.id}>{c.name.replace(/^Play Academy\s+/i,'')}</option>)}
                </select>
              </div>
            </div>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div><label style={lbl}>Primary Classroom</label><input style={inp} value={data.class_primary ?? ''} onChange={e => set('class_primary', e.target.value)} /></div>
              <div><label style={lbl}>Secondary Classroom</label><input style={inp} value={data.class_secondary ?? ''} onChange={e => set('class_secondary', e.target.value)} /></div>
            </div>
            <div style={grid2}>
              <div><label style={lbl}>Hire Date</label><input style={inp} type="date" value={fmtDate(data.hire_date)} onChange={e => set('hire_date', e.target.value)} /></div>
            </div>
          </div>
      )}

      {/* ── DOCS: Education + Training + Documents ── */}
      {tab === 'docs' && (
          <div style={card}>
            <h3 style={h3}>Education & Certifications</h3>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div><label style={lbl}>Degree</label><input style={inp} value={data.degree ?? ''} onChange={e => set('degree', e.target.value)} /></div>
              <div><label style={lbl}>Certification</label><input style={inp} value={data.certification ?? ''} onChange={e => set('certification', e.target.value)} /></div>
            </div>
            <div style={grid2}>
              <div><label style={lbl}>ECE Credits</label><input style={inp} value={data.ece_credits ?? ''} onChange={e => set('ece_credits', e.target.value)} /></div>
              <div><label style={lbl}>Infant/Toddler Credits</label><input style={inp} value={data.infant_toddler_credits ?? ''} onChange={e => set('infant_toddler_credits', e.target.value)} /></div>
            </div>
          </div>
      )}

      {/* ── WORK: Payroll ── */}
      {tab === 'work' && (
        <div style={card}>
          <h3 style={h3}>Payroll Settings</h3>

          {/* Pay type toggle */}
          <div style={{ display: 'flex', gap: 0, border: '1.5px solid #0f4c35', borderRadius: 8, overflow: 'hidden', marginBottom: 20, width: 'fit-content' }}>
            {[['hourly','⏱ Hourly'],['salary','📅 Salary (fixed)']].map(([key, label]) => (
              <button key={key} onClick={() => set('pay_type', key)} style={{
                padding: '8px 20px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: data.pay_type === key ? 700 : 400,
                background: data.pay_type === key ? '#0f4c35' : '#fff',
                color: data.pay_type === key ? '#fff' : '#0f4c35',
              }}>{label}</button>
            ))}
          </div>

          {/* Hourly fields */}
          {(data.pay_type === 'hourly' || !data.pay_type) && (
            <div style={{ ...grid3, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Hourly Rate ($)</label>
                <input style={inp} type="number" step="0.01" min="0" value={data.hourly_rate ?? ''} onChange={e => set('hourly_rate', parseFloat(e.target.value) || null)} />
              </div>
              <div>
                <label style={lbl}>Contract Hours / Week</label>
                <input style={inp} type="number" step="1" min="0" value={data.contract_hours ?? ''} onChange={e => set('contract_hours', parseFloat(e.target.value) || null)} />
              </div>
              <div>
                <label style={lbl}>Max Weekly Hours</label>
                <input style={inp} type="number" step="1" min="0" value={data.max_weekly_hours ?? 40} onChange={e => set('max_weekly_hours', parseInt(e.target.value) || 40)} />
              </div>
            </div>
          )}

          {/* Salary fields */}
          {data.pay_type === 'salary' && (
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Fixed Amount per Period ($)</label>
                <input style={inp} type="number" step="0.01" min="0" value={data.salary_amount ?? ''} onChange={e => set('salary_amount', parseFloat(e.target.value) || null)} />
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Weekly/biweekly/monthly — set period in notes</div>
              </div>
              <div>
                <label style={lbl}>Annual Equivalent</label>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f4c35', padding: '9px 0' }}>
                  ${data.salary_amount ? (data.salary_amount * 52).toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>× 52 weeks</div>
              </div>
            </div>
          )}

          {/* Overtime — only for hourly */}
          {(data.pay_type === 'hourly' || !data.pay_type) && (
            <div style={{ background: '#f8fbf8', borderRadius: 10, border: '1px solid #e0e8e0', padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a3320' }}>Overtime</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <div onClick={() => set('overtime_eligible', !data.overtime_eligible)} style={{
                    width: 36, height: 20, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
                    background: data.overtime_eligible ? '#0f4c35' : '#d1d5db', position: 'relative',
                  }}>
                    <div style={{ position: 'absolute', top: 2, left: data.overtime_eligible ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  OT eligible
                </label>
              </div>
              {data.overtime_eligible && (
                <div style={grid2}>
                  <div>
                    <label style={lbl}>OT Rate multiplier</label>
                    <input style={inp} type="number" step="0.1" min="1" value={data.overtime_rate ?? 1.5} onChange={e => set('overtime_rate', parseFloat(e.target.value))} />
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Standard: 1.5x · After 40h/week</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: 13, color: '#555' }}>
                      OT rate: <strong>${((data.hourly_rate ?? 0) * (data.overtime_rate ?? 1.5)).toFixed(2)}/hr</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bonus */}
          <div style={{ background: '#f8fbf8', borderRadius: 10, border: '1px solid #e0e8e0', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0a3320' }}>Bonus</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <div onClick={() => set('bonus_eligible', !data.bonus_eligible)} style={{
                  width: 36, height: 20, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
                  background: data.bonus_eligible ? '#0f4c35' : '#d1d5db', position: 'relative',
                }}>
                  <div style={{ position: 'absolute', top: 2, left: data.bonus_eligible ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
                Bonus eligible
              </label>
            </div>
            {data.bonus_eligible && (
              <div style={{ ...grid3, gap: 12 }}>
                <div>
                  <label style={lbl}>Type</label>
                  <select style={sel} value={data.bonus_type ?? ''} onChange={e => set('bonus_type', e.target.value)}>
                    <option value="">—</option>
                    <option value="flat">Flat amount</option>
                    <option value="percent">% of salary</option>
                    <option value="performance">Performance</option>
                  </select>
                </div>
                <div><label style={lbl}>Amount ($)</label><input style={inp} type="number" step="0.01" value={data.bonus_amount ?? ''} onChange={e => set('bonus_amount', parseFloat(e.target.value) || null)} /></div>
                <div><label style={lbl}>Notes</label><input style={inp} value={data.bonus_notes ?? ''} onChange={e => set('bonus_notes', e.target.value)} /></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WORK: Schedule ── */}
      {tab === 'work' && (
        <div style={card}>
          <h3 style={h3}>Work Schedule</h3>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            Toggle days on/off · Set shift times and break · Weekly hours auto-calculated
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                {['Day','Active','Shift Start','Shift End','Break (min)','Hours'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sched.map((d, i) => {
                const hrs = (d.is_active && d.shift_start && d.shift_end)
                  ? (() => {
                      const [sh, sm] = d.shift_start.split(':').map(Number)
                      const [eh, em] = d.shift_end.split(':').map(Number)
                      const total = (eh * 60 + em) - (sh * 60 + sm) - d.break_minutes
                      return total > 0 ? (total / 60).toFixed(1) : '—'
                    })()
                  : '—'
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f8f8f8', background: d.is_active ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600, color: d.is_active ? '#0a3320' : '#bbb' }}>{DAYS[i]}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <div onClick={() => setSchedDay(i, 'is_active', !d.is_active)} style={{
                        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                        background: d.is_active ? '#0f4c35' : '#d1d5db', position: 'relative', transition: 'background 0.2s',
                      }}>
                        <div style={{ position: 'absolute', top: 2, left: d.is_active ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                      </div>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <input type="time" value={d.shift_start} disabled={!d.is_active}
                        onChange={e => setSchedDay(i, 'shift_start', e.target.value)}
                        style={{ ...inp, width: 120, opacity: d.is_active ? 1 : 0.4 }} />
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <input type="time" value={d.shift_end} disabled={!d.is_active}
                        onChange={e => setSchedDay(i, 'shift_end', e.target.value)}
                        style={{ ...inp, width: 120, opacity: d.is_active ? 1 : 0.4 }} />
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <input type="number" min={0} max={120} step={5} value={d.break_minutes} disabled={!d.is_active}
                        onChange={e => setSchedDay(i, 'break_minutes', parseInt(e.target.value) || 0)}
                        style={{ ...inp, width: 70, opacity: d.is_active ? 1 : 0.4 }} />
                    </td>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f4c35' }}>{hrs}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e0e8e0', background: '#f0f4f1' }}>
                <td colSpan={5} style={{ padding: '8px 10px', fontWeight: 700, color: '#0a3320', fontSize: 13 }}>Total weekly hours</td>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f4c35', fontSize: 14 }}>
                  {sched.filter(d => d.is_active && d.shift_start && d.shift_end).reduce((sum, d) => {
                    const [sh, sm] = d.shift_start.split(':').map(Number)
                    const [eh, em] = d.shift_end.split(':').map(Number)
                    const total = (eh * 60 + em) - (sh * 60 + sm) - d.break_minutes
                    return sum + (total > 0 ? total / 60 : 0)
                  }, 0).toFixed(1)}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── WORK: Benefits ── */}
      {tab === 'work' && (
        <div style={card}>
          <h3 style={h3}>Benefits Eligibility</h3>
          {/* Status banner */}
          <div style={{
            padding: '14px 18px', borderRadius: 10, marginBottom: 20,
            background: hasBenefits ? '#f0fff4' : '#fff8e1',
            border: `1px solid ${hasBenefits ? '#bbf7d0' : '#fde68a'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>{hasBenefits ? '✅' : '⏳'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: hasBenefits ? '#0f4c35' : '#92400e' }}>
                {hasBenefits ? 'Benefits eligible' : `${3 - months} month${3 - months !== 1 ? 's' : ''} until benefits eligibility`}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                {months} months worked · Hired {fmtDate(data.hire_date) || '—'}
                {hasBenefits && ` · Full-time: ${isFullTime ? 'Yes (holiday & vacation pay)' : 'No (32h+ required for holiday/vacation pay)'}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'PTO / Vacation', desc: '2 weeks (80h) per year', eligible: hasBenefits, note: isFullTime ? '' : 'Requires 32h+/week' },
              { label: 'Sick Leave', desc: 'Included in 2-week PTO', eligible: hasBenefits, note: '' },
              { label: 'Holiday Pay', desc: 'Paid holidays when center closed', eligible: hasBenefits && isFullTime, note: isFullTime ? '' : 'Requires 32h+/week' },
              { label: 'Overtime Pay', desc: '1.5x after 40h/week', eligible: data.overtime_eligible ?? false, note: '' },
              { label: 'Bonus', desc: 'Performance-based', eligible: data.bonus_eligible ?? false, note: '' },
            ].map(({ label, desc, eligible, note }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 10,
                background: eligible ? '#f0fff4' : '#fafafa',
                border: `1px solid ${eligible ? '#bbf7d0' : '#e8e8e8'}`,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1a2e1a' }}>{label}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{desc}{note ? ` · ${note}` : ''}</div>
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                  background: eligible ? '#0f4c35' : '#e8e8e8',
                  color: eligible ? '#fff' : '#aaa',
                }}>
                  {eligible ? 'Eligible' : 'Not eligible'}
                </div>
              </div>
            ))}
          </div>

          {/* Anniversary tracker */}
          {data.hire_date && (
            <div style={{ marginTop: 20, padding: 16, background: '#f8fbf8', borderRadius: 10, border: '1px solid #e0e8e0' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0a3320', marginBottom: 10 }}>📅 Anniversary Tracker</div>
              {[1,2,3,4,5].map(yr => {
                const anniv = new Date(data.hire_date!)
                anniv.setFullYear(anniv.getFullYear() + yr)
                const isPast = anniv <= new Date()
                return (
                  <div key={yr} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{isPast ? '✅' : '⬜'}</span>
                    <span style={{ fontSize: 13, color: isPast ? '#0f4c35' : '#888', fontWeight: isPast ? 600 : 400 }}>
                      Year {yr} — {anniv.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {isPast ? ' (completed)' : ` (in ${Math.ceil((anniv.getTime() - Date.now()) / 86400000)} days)`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DOCS: Training ── */}
      {tab === 'docs' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
            <h3 style={{ ...h3, margin: 0, border: 'none', padding: 0 }}>📚 Training Records</h3>
            <button onClick={() => setShowTrainingForm(!showTrainingForm)} style={btnPri}>
              {showTrainingForm ? 'Cancel' : '+ Add Training'}
            </button>
          </div>

          {/* Add form */}
          {showTrainingForm && (
            <div style={{ background: '#f0f7f2', borderRadius: 10, border: '1px solid #b8dfc8', padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f4c35', marginBottom: 12 }}>New Training Record</div>
              <div style={{ ...grid2, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Type</label>
                  <select style={sel} value={tForm.training_type} onChange={e => setTForm(p => ({ ...p, training_type: e.target.value }))}>
                    <option value="">— select —</option>
                    {TRAINING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Training Name</label>
                  <input style={inp} value={tForm.training_name} onChange={e => setTForm(p => ({ ...p, training_name: e.target.value }))} placeholder="Course or certificate name" />
                </div>
              </div>
              <div style={{ ...grid3, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Provider</label>
                  <input style={inp} value={tForm.provider} onChange={e => setTForm(p => ({ ...p, provider: e.target.value }))} placeholder="Organization" />
                </div>
                <div>
                  <label style={lbl}>Completed Date</label>
                  <input style={inp} type="date" value={tForm.completed_date} onChange={e => setTForm(p => ({ ...p, completed_date: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Hours Earned</label>
                  <input style={inp} type="number" step="0.5" min="0" value={tForm.hours_earned} onChange={e => setTForm(p => ({ ...p, hours_earned: e.target.value }))} />
                </div>
              </div>
              <div style={{ ...grid2, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Expires Date (optional)</label>
                  <input style={inp} type="date" value={tForm.expires_date} onChange={e => setTForm(p => ({ ...p, expires_date: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Notes</label>
                  <input style={inp} value={tForm.notes} onChange={e => setTForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <button
                disabled={addingTraining || !tForm.training_type || !tForm.training_name || !tForm.completed_date}
                onClick={async () => {
                  if (!staffId || !data) return
                  setAddingTraining(true)
                  const { data: rec } = await supabase.schema('menumaker').from('staff_training_records').insert({
                    staff_id: staffId, org_id: org?.id, center_id: data.center_id,
                    training_type: tForm.training_type, training_name: tForm.training_name,
                    provider: tForm.provider || null, completed_date: tForm.completed_date,
                    hours_earned: parseFloat(tForm.hours_earned) || 0,
                    expires_date: tForm.expires_date || null, notes: tForm.notes || null,
                    self_reported: true,
                  }).select().single()
                  if (rec) setTraining(prev => [rec as TrainingRecord, ...prev])
                  setTForm({ training_type: '', training_name: '', provider: '', completed_date: '', hours_earned: '', expires_date: '', notes: '' })
                  setShowTrainingForm(false)
                  setAddingTraining(false)
                }}
                style={{ ...btnPri, opacity: (!tForm.training_type || !tForm.training_name || !tForm.completed_date) ? 0.5 : 1 }}
              >
                {addingTraining ? 'Saving…' : 'Save Record'}
              </button>
            </div>
          )}

          {/* Training list */}
          {training.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0' }}>No training records yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {training.map(t => {
                const isExpired = t.expires_date && new Date(t.expires_date) < new Date()
                const expiresSoon = t.expires_date && !isExpired && (new Date(t.expires_date).getTime() - Date.now()) < 30 * 86400000
                return (
                  <div key={t.id} style={{
                    padding: '12px 16px', borderRadius: 10,
                    border: `1px solid ${isExpired ? '#fca5a5' : expiresSoon ? '#fde68a' : '#e8e8e8'}`,
                    background: isExpired ? '#fff5f5' : expiresSoon ? '#fffbeb' : '#fafbfa',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1a2e1a' }}>{t.training_name}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {t.training_type} · {t.provider ?? 'Self-reported'} · {fmtDateDisplay(t.completed_date)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0f4c35' }}>{t.hours_earned}h</span>
                        {t.expires_date && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: isExpired ? '#fee2e2' : expiresSoon ? '#fef3c7' : '#f0fff4',
                            color: isExpired ? '#dc2626' : expiresSoon ? '#92400e' : '#0f4c35',
                          }}>
                            {isExpired ? '⚠ Expired' : `Expires ${fmtDateDisplay(t.expires_date)}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {t.notes && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{t.notes}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Summary */}
          {training.length > 0 && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: '#f0f4f1', borderRadius: 8, fontSize: 13 }}>
              <strong>Total:</strong> {training.reduce((s, t) => s + (t.hours_earned ?? 0), 0).toFixed(1)}h across {training.length} records
              {training.filter(t => t.expires_date && new Date(t.expires_date) < new Date()).length > 0 && (
                <span style={{ color: '#dc2626', marginLeft: 12 }}>
                  ⚠ {training.filter(t => t.expires_date && new Date(t.expires_date) < new Date()).length} expired
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── DOCS: Documents ── */}
      {tab === 'docs' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
            <h3 style={{ ...h3, margin: 0, border: 'none', padding: 0 }}>📋 Documents</h3>
            <div style={{ fontSize: 12, color: '#888' }}>Upload via Supabase Storage · staff-documents bucket</div>
          </div>

          {docs.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0' }}>No documents on file.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => {
                const isExpired = d.expires_date && new Date(d.expires_date) < new Date()
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${isExpired ? '#fca5a5' : '#e8e8e8'}`,
                    background: isExpired ? '#fff5f5' : '#fafbfa',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>
                        {d.doc_type === 'contract' ? '📄' : d.doc_type === 'certification' ? '🎓' : d.doc_type === 'i9' || d.doc_type === 'w4' ? '🏛' : '📋'}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2e1a' }}>{d.title}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {DOC_TYPES[d.doc_type] ?? d.doc_type} · Uploaded {fmtDateDisplay(d.uploaded_at)} by {d.uploaded_by}
                          {d.expires_date && ` · ${isExpired ? '⚠ Expired' : `Expires ${fmtDateDisplay(d.expires_date)}`}`}
                        </div>
                      </div>
                    </div>
                    <a href={`https://trrmyqfpxntmgxnqkikp.supabase.co/storage/v1/object/public/staff-documents/${d.storage_path}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#0f4c35', fontWeight: 600, textDecoration: 'none' }}>
                      View ↗
                    </a>
                  </div>
                )
              })}
            </div>
          )}

          {/* Doc type breakdown */}
          {docs.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(DOC_TYPES).map(([key, label]) => {
                const count = docs.filter(d => d.doc_type === key).length
                if (!count) return null
                return (
                  <span key={key} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: '#f0f4f1', color: '#0f4c35', fontWeight: 600 }}>
                    {label}: {count}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PROFILE: Emergency ── */}
      {tab === 'profile' && (
        <>
          <div style={card}>
            <h3 style={h3}>Emergency Contact</h3>
            <div style={{ ...grid3, marginBottom: 16 }}>
              <div><label style={lbl}>Name</label><input style={inp} value={data.emergency_contact_name ?? ''} onChange={e => set('emergency_contact_name', e.target.value)} /></div>
              <div><label style={lbl}>Relationship</label><input style={inp} value={data.emergency_contact_relationship ?? ''} onChange={e => set('emergency_contact_relationship', e.target.value)} /></div>
              <div><label style={lbl}>Phone</label><input style={inp} type="tel" value={data.emergency_contact_phone ?? ''} onChange={e => set('emergency_contact_phone', e.target.value)} /></div>
            </div>
          </div>

          <div style={card}>
            <h3 style={h3}>Medical Information</h3>
            <div style={{ ...grid2, marginBottom: 16 }}>
              <div><label style={lbl}>Allergies</label><input style={inp} value={data.allergies ?? ''} onChange={e => set('allergies', e.target.value)} /></div>
              <div><label style={lbl}>Medications</label><input style={inp} value={data.medications ?? ''} onChange={e => set('medications', e.target.value)} /></div>
            </div>
            <div style={grid2}>
              <div><label style={lbl}>Doctor Name</label><input style={inp} value={data.doctor_name ?? ''} onChange={e => set('doctor_name', e.target.value)} /></div>
              <div><label style={lbl}>Doctor Phone</label><input style={inp} type="tel" value={data.doctor_phone ?? ''} onChange={e => set('doctor_phone', e.target.value)} /></div>
            </div>
          </div>
        </>
      )}

      {/* Bottom save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 40 }}>
        <button onClick={save} disabled={saving} style={saving ? { ...btnPri, opacity: 0.7 } : saved ? { ...btnPri, background: '#0f7a4a' } : btnPri}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      </div>
      </div>
    </div>
  )
}
