// src/pages/children/ChildSettingsPage.tsx
// Full child record — 7 tabs with completeness badges
// Profile | Family | Enrollment | Health | CACFP | SafePass | Billing

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Child {
  id: string; org_id: string; center_id: string; classroom_id: string | null
  first_name: string | null; last_name: string | null; child_name: string | null
  birthday: string | null; date_in: string | null; date_out: string | null
  frp: string | null; frp_expires: string | null; milk_kind: string | null
  allergies: string | null; is_active: boolean
  child_address: string | null; has_health_condition: boolean | null
  development_notes: string | null; accommodations: string | null
  specialized_services: string | null; emergency_transport_auth: boolean | null
  enrollment_reviewed_at: string | null; age_group_food: string | null
}

interface Guardian {
  id: string; first_name: string | null; last_name: string | null
  email: string | null; mobile_phone: string | null; phone_1: string | null
  phone_2: string | null; address: string | null
  role?: string; relationship?: string; can_pickup?: boolean
  is_emergency_contact?: boolean; ordinal?: number
}

interface ChildMedical {
  id?: string; allergies: string | null; medications: string | null
  doctor_name: string | null; doctor_phone: string | null
  health_condition_name: string | null; condition_symptoms: string | null
  foods_to_avoid: string | null; activities_to_avoid: string | null
  care_instructions: string | null; emergency_action: string | null
  evacuation_notes: string | null; medication_details: any
  parent_signed_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit',
  background: '#fff', boxSizing: 'border-box' as const, outline: 'none',
  color: '#1a2e1a'
}
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  display: 'block', marginBottom: 4
}
const section = (title: string) => (
  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', marginBottom: 12,
    paddingBottom: 6, borderBottom: '1.5px solid #e8f0e8', marginTop: 4 }}>{title}</div>
)
const field = (label: string, children: React.ReactNode) => (
  <div style={{ marginBottom: 12 }}>
    <label style={lbl}>{label}</label>
    {children}
  </div>
)

// ─── Badge counter ────────────────────────────────────────────────────────────

function Badge({ empty, overdue }: { empty: number; overdue: number }) {
  if (!empty && !overdue) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 6 }}>
      {empty > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10,
        fontSize: 10, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4 }}>{empty}</span>}
      {overdue > 0 && <span style={{ background: '#1a2e1a', color: '#fff', borderRadius: 10,
        fontSize: 10, fontWeight: 700, padding: '1px 5px', lineHeight: 1.4 }}>{overdue}</span>}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChildSettingsPage({
  childId, onClose, classrooms
}: {
  childId: string
  onClose: () => void
  classrooms: { id: string; name: string }[]
}) {
  const [tab, setTab] = useState(0)
  const [child, setChild] = useState<Child | null>(null)
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [medical, setMedical] = useState<ChildMedical | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadAll() }, [childId])

  async function loadAll() {
    const [{ data: c }, { data: g }, { data: m }] = await Promise.all([
      supabase.schema('menumaker').from('roster').select('*').eq('id', childId).single(),
      supabase.schema('menumaker').from('child_guardian')
        .select('*, guardian:guardian_id(*)')
        .eq('child_id', childId).order('ordinal'),
      supabase.schema('menumaker').from('child_medical').select('*').eq('child_id', childId).maybeSingle(),
    ])
    if (c) setChild(c as Child)
    if (g) setGuardians(g.map((row: any) => ({ ...row.guardian, role: row.role, relationship: row.relationship, can_pickup: row.can_pickup, is_emergency_contact: row.is_emergency_contact, ordinal: row.ordinal })))
    setMedical(m as ChildMedical ?? { allergies: null, medications: null, doctor_name: null, doctor_phone: null, health_condition_name: null, condition_symptoms: null, foods_to_avoid: null, activities_to_avoid: null, care_instructions: null, emergency_action: null, evacuation_notes: null, medication_details: null, parent_signed_at: null })
  }

  async function saveChild() {
    if (!child) return
    setSaving(true)
    await supabase.schema('menumaker').from('roster').update({
      first_name: child.first_name, last_name: child.last_name,
      birthday: child.birthday, classroom_id: child.classroom_id,
      date_in: child.date_in, date_out: child.date_out,
      frp: child.frp, frp_expires: child.frp_expires, milk_kind: child.milk_kind,
      child_address: child.child_address, has_health_condition: child.has_health_condition,
      development_notes: child.development_notes, accommodations: child.accommodations,
      specialized_services: child.specialized_services,
      emergency_transport_auth: child.emergency_transport_auth,
      enrollment_reviewed_at: child.enrollment_reviewed_at,
      child_name: `${child.last_name ?? ''} ${child.first_name ?? ''}`.trim()
    }).eq('id', childId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function saveMedical() {
    if (!medical || !child) return
    setSaving(true)
    const exists = !!(medical as any).id
    if (exists) {
      await supabase.schema('menumaker').from('child_medical').update(medical).eq('child_id', childId)
    } else {
      await supabase.schema('menumaker').from('child_medical').insert({ ...medical, child_id: childId, org_id: child.org_id })
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  // ─── Completeness counters ────────────────────────────────────────────────

  function counts() {
    if (!child) return Array(7).fill({ e: 0, o: 0 })
    const today = new Date().toISOString().slice(0, 10)
    const e = (v: any) => !v || v === '' ? 1 : 0
    const expired = (d: string | null) => d && d < today ? 1 : 0

    // Profile
    const p_e = e(child.first_name) + e(child.last_name) + e(child.birthday) + e(child.classroom_id) + e(child.date_in)
    // Family
    const f_e = guardians.length === 0 ? 2 : 0
    // Enrollment
    const en_e = e(child.frp) + e(child.enrollment_reviewed_at)
    const en_o = expired(child.frp_expires) + expired(child.enrollment_reviewed_at)
    // Health
    const h_e = !medical ? 2 : e(medical.doctor_name) + e(medical.doctor_phone)
    // CACFP
    const c_e = e(child.frp) + e(child.milk_kind)
    // SafePass
    const sp_e = guardians.filter(g => g.can_pickup).length === 0 ? 1 : 0
    // Billing
    const b_e = 0 // TODO when billing module added

    return [
      { e: p_e,  o: 0 },
      { e: f_e,  o: 0 },
      { e: en_e, o: en_o },
      { e: h_e,  o: 0 },
      { e: c_e,  o: 0 },
      { e: sp_e, o: 0 },
      { e: b_e,  o: 0 },
    ]
  }

  const badges = counts()
  const totalEmpty = badges.reduce((s, b) => s + b.e, 0)
  const totalOverdue = badges.reduce((s, b) => s + b.o, 0)
  const completePct = child ? Math.round((1 - totalEmpty / Math.max(totalEmpty + 15, 15)) * 100) : 0

  const TABS = ['👤 Profile','👨‍👩‍👧 Family','📋 Enrollment','🏥 Health','🍽️ CACFP','🔒 SafePass','💰 Billing']

  if (!child) return <div style={{ padding: 24, color: '#888', fontFamily:"'DM Sans',sans-serif" }}>Loading…</div>

  const set = (k: keyof Child, v: any) => setChild(p => p ? { ...p, [k]: v } : p)
  const setMed = (k: keyof ChildMedical, v: any) => setMedical(p => p ? { ...p, [k]: v } : p)

  const fullName = `${child.last_name ?? ''} ${child.first_name ?? ''}`.trim() || child.child_name || '—'

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ background:'#0f4c35', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:700, color:'#7ee8b0' }}>
            {(child.first_name?.[0]??'')}{(child.last_name?.[0]??'')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:17 }}>{fullName}</div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12, marginTop:2 }}>
              {classrooms.find(c=>c.id===child.classroom_id)?.name ?? '—'}
              {child.birthday ? ` · b. ${new Date(child.birthday).toLocaleDateString('en-US')}` : ''}
            </div>
          </div>
          {/* Progress */}
          <div style={{ textAlign:'center', marginRight:8 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginBottom:4 }}>Complete</div>
            <div style={{ position:'relative', width:80, height:6, background:'rgba(255,255,255,0.2)', borderRadius:3 }}>
              <div style={{ position:'absolute', left:0, top:0, height:6, borderRadius:3, width:`${completePct}%`, background: completePct>80?'#7ee8b0':completePct>50?'#fbbf24':'#f87171', transition:'width 0.3s' }}/>
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:3 }}>{completePct}%</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:32, height:32, borderRadius:'50%', cursor:'pointer', fontSize:18 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', overflowX:'auto', background:'#f8faf8', borderBottom:'1.5px solid #e8f0e8', flexShrink:0 }}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding:'10px 14px', border:'none', cursor:'pointer', fontFamily:'inherit',
              fontSize:12, fontWeight:600, whiteSpace:'nowrap',
              background: tab===i ? '#fff' : 'transparent',
              color: tab===i ? '#0f4c35' : '#6b7280',
              borderBottom: tab===i ? '2px solid #0f4c35' : '2px solid transparent',
              display:'flex', alignItems:'center'
            }}>
              {t}
              <Badge empty={badges[i].e} overdue={badges[i].o} />
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>

          {/* ── TAB 0: Profile ── */}
          {tab === 0 && (
            <div>
              {section('Basic Information')}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {field('First Name', <input style={inp} value={child.first_name??''} onChange={e=>set('first_name',e.target.value)}/>)}
                {field('Last Name', <input style={inp} value={child.last_name??''} onChange={e=>set('last_name',e.target.value)}/>)}
                {field('Birthday', <input type="date" style={inp} value={child.birthday??''} onChange={e=>set('birthday',e.target.value)}/>)}
                {field('Classroom', (
                  <select style={inp} value={child.classroom_id??''} onChange={e=>set('classroom_id',e.target.value)}>
                    <option value="">Select…</option>
                    {classrooms.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ))}
                {field('Date In', <input type="date" style={inp} value={child.date_in??''} onChange={e=>set('date_in',e.target.value)}/>)}
                {field('Date Out', <input type="date" style={inp} value={child.date_out??''} onChange={e=>set('date_out',e.target.value)}/>)}
              </div>
              {field('Home Address', <input style={inp} placeholder="Street, City, State ZIP" value={child.child_address??''} onChange={e=>set('child_address',e.target.value)}/>)}
            </div>
          )}

          {/* ── TAB 1: Family ── */}
          {tab === 1 && (
            <div>
              {section('Parents & Guardians')}
              {guardians.length === 0 ? (
                <div style={{ color:'#aaa', fontSize:13, padding:'20px 0' }}>No guardians on file. Add via Enrollment form.</div>
              ) : guardians.map((g, i) => (
                <div key={g.id} style={{ background:'#f8faf8', borderRadius:10, padding:14, marginBottom:10, border:'1.5px solid #e8f0e8' }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#0f4c35', marginBottom:8 }}>
                    {g.role ?? `Guardian ${i+1}`} · {g.relationship ?? ''}
                    {g.can_pickup && <span style={{ marginLeft:8, fontSize:11, background:'#dcfce7', color:'#16a34a', padding:'1px 8px', borderRadius:6 }}>✓ Pickup</span>}
                    {g.is_emergency_contact && <span style={{ marginLeft:6, fontSize:11, background:'#fef3c7', color:'#d97706', padding:'1px 8px', borderRadius:6 }}>Emergency</span>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
                    <div><span style={{ color:'#888', fontSize:11 }}>Name</span><br/>{g.first_name} {g.last_name}</div>
                    <div><span style={{ color:'#888', fontSize:11 }}>Phone</span><br/>{g.mobile_phone ?? g.phone_1 ?? '—'}</div>
                    <div><span style={{ color:'#888', fontSize:11 }}>Email</span><br/>{g.email ?? '—'}</div>
                    <div><span style={{ color:'#888', fontSize:11 }}>Address</span><br/>{g.address ?? '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB 2: Enrollment ── */}
          {tab === 2 && (
            <div>
              {section('DCY 01234 — Enrollment')}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {field('FRP Status', (
                  <select style={inp} value={child.frp??''} onChange={e=>set('frp',e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="F">Free</option>
                    <option value="R">Reduced</option>
                    <option value="P">Paid</option>
                  </select>
                ))}
                {field('FRP Expires', <input type="date" style={inp} value={child.frp_expires??''} onChange={e=>set('frp_expires',e.target.value)}/>)}
                {field('Last Annual Review', <input type="date" style={inp} value={child.enrollment_reviewed_at??''} onChange={e=>set('enrollment_reviewed_at',e.target.value)}/>)}
                {field('Emergency Transport', (
                  <select style={inp} value={child.emergency_transport_auth===false?'no':'yes'} onChange={e=>set('emergency_transport_auth',e.target.value==='yes')}>
                    <option value="yes">✓ Authorized</option>
                    <option value="no">✗ Not authorized</option>
                  </select>
                ))}
              </div>
              {field('Development Notes', <textarea style={{...inp, minHeight:80, resize:'vertical'}} value={child.development_notes??''} onChange={e=>set('development_notes',e.target.value)} placeholder="Personal, behavior, patterns, habits…"/>)}
              {field('Accommodations', <textarea style={{...inp, minHeight:60, resize:'vertical'}} value={child.accommodations??''} onChange={e=>set('accommodations',e.target.value)}/>)}
              {field('Specialized Services', <input style={inp} value={child.specialized_services??''} onChange={e=>set('specialized_services',e.target.value)} placeholder="Provider name and frequency…"/>)}
            </div>
          )}

          {/* ── TAB 3: Health ── */}
          {tab === 3 && (
            <div>
              {section('DCY 01236 — Health Care Plan')}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {field('Doctor Name', <input style={inp} value={medical?.doctor_name??''} onChange={e=>setMed('doctor_name',e.target.value)}/>)}
                {field('Doctor Phone', <input style={inp} value={medical?.doctor_phone??''} onChange={e=>setMed('doctor_phone',e.target.value)}/>)}
              </div>
              {field('Chronic Health Condition', <input style={inp} value={medical?.health_condition_name??''} onChange={e=>setMed('health_condition_name',e.target.value)} placeholder="e.g. Asthma, Diabetes, Epilepsy…"/>)}
              {field('Signs / Symptoms Requiring Action', <textarea style={{...inp,minHeight:70,resize:'vertical'}} value={medical?.condition_symptoms??''} onChange={e=>setMed('condition_symptoms',e.target.value)}/>)}
              {field('Foods / Activities to Avoid', <textarea style={{...inp,minHeight:60,resize:'vertical'}} value={medical?.foods_to_avoid??''} onChange={e=>setMed('foods_to_avoid',e.target.value)}/>)}
              {field('Care Instructions', <textarea style={{...inp,minHeight:80,resize:'vertical'}} value={medical?.care_instructions??''} onChange={e=>setMed('care_instructions',e.target.value)}/>)}
              {field('Emergency Action', (
                <select style={inp} value={medical?.emergency_action??''} onChange={e=>setMed('emergency_action',e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="911">Call 9-1-1</option>
                  <option value="parent">Call Parent</option>
                  <option value="both">Both</option>
                </select>
              ))}
              {field('Allergies', <textarea style={{...inp,minHeight:60,resize:'vertical'}} value={medical?.allergies??''} onChange={e=>setMed('allergies',e.target.value)}/>)}
              {field('Current Medications', <textarea style={{...inp,minHeight:60,resize:'vertical'}} value={medical?.medications??''} onChange={e=>setMed('medications',e.target.value)}/>)}
              {field('Evacuation Notes', <input style={inp} value={medical?.evacuation_notes??''} onChange={e=>setMed('evacuation_notes',e.target.value)}/>)}
            </div>
          )}

          {/* ── TAB 4: CACFP ── */}
          {tab === 4 && (
            <div>
              {section('CACFP Meal Program')}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {field('FRP Status', (
                  <select style={inp} value={child.frp??''} onChange={e=>set('frp',e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="F">Free</option>
                    <option value="R">Reduced</option>
                    <option value="P">Paid</option>
                  </select>
                ))}
                {field('FRP Expires', <input type="date" style={inp} value={child.frp_expires??''} onChange={e=>set('frp_expires',e.target.value)}/>)}
                {field('Milk Type', (
                  <select style={inp} value={child.milk_kind??''} onChange={e=>set('milk_kind',e.target.value)}>
                    <option value="">— Select —</option>
                    <option value="whole">Whole</option>
                    <option value="1pct">1%</option>
                    <option value="red">Reduced fat</option>
                    <option value="formula">Formula</option>
                  </select>
                ))}
                {field('Age Group', (
                  <select style={inp} value={child.age_group_food??''} onChange={e=>set('age_group_food',e.target.value)}>
                    <option value="">— Auto from birthday —</option>
                    <option value="infant_0_5m">0-5 months</option>
                    <option value="infant_6_11m">6-11 months</option>
                    <option value="1y">1 year</option>
                    <option value="2y">2 years</option>
                    <option value="3_5">3-5 years</option>
                    <option value="6_12">6-12 years</option>
                  </select>
                ))}
              </div>
              <div style={{ background:'#f0f7f4', borderRadius:10, padding:14, fontSize:13, color:'#0f4c35', marginTop:4 }}>
                <strong>Note:</strong> Age group and milk type are auto-calculated from birthday via v_child_age_profile. Manual override here only when birthday-based calculation is incorrect.
              </div>
            </div>
          )}

          {/* ── TAB 5: SafePass ── */}
          {tab === 5 && (
            <div>
              {section('Authorized Pickup')}
              {guardians.length === 0 ? (
                <div style={{ color:'#aaa', fontSize:13 }}>No guardians on file.</div>
              ) : guardians.map((g,i) => (
                <div key={g.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, border:'1.5px solid #e8f0e8', marginBottom:8, background:'#fafbfa' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{g.first_name} {g.last_name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{g.role} · {g.mobile_phone ?? g.phone_1 ?? '—'}</div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontSize:12, padding:'3px 10px', borderRadius:6, background: g.can_pickup?'#dcfce7':'#f3f4f6', color: g.can_pickup?'#16a34a':'#888', fontWeight:600 }}>
                      {g.can_pickup ? '✓ Can pickup' : '✗ No pickup'}
                    </span>
                    {g.is_emergency_contact && <span style={{ fontSize:12, padding:'3px 10px', borderRadius:6, background:'#fef3c7', color:'#d97706', fontWeight:600 }}>Emergency</span>}
                  </div>
                </div>
              ))}
              {section('SafePass History')}
              <div style={{ color:'#aaa', fontSize:13, padding:'8px 0' }}>SafePass log available in SafePass module.</div>
            </div>
          )}

          {/* ── TAB 6: Billing ── */}
          {tab === 6 && (
            <div>
              {section('Tuition & Billing')}
              <div style={{ background:'#f8faf8', borderRadius:10, padding:20, textAlign:'center', color:'#aaa', fontSize:13 }}>
                <div style={{ fontSize:24, marginBottom:8 }}>💰</div>
                Billing module coming soon.<br/>Will include: tuition rate, payment schedule, sponsor, balance, payment history.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1.5px solid #e8f0e8', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8faf8', flexShrink:0 }}>
          <div style={{ fontSize:12, color:saved?'#16a34a':'#888' }}>
            {saved ? '✓ Saved' : `${totalEmpty} fields empty · ${totalOverdue} overdue`}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>
              Close
            </button>
            <button onClick={tab===3 ? saveMedical : saveChild} disabled={saving}
              style={{ padding:'9px 20px', borderRadius:8, background:'#0f4c35', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit', opacity:saving?0.6:1 }}>
              {saving ? 'Saving…' : '✓ Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
