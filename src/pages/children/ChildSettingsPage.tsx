// src/pages/children/ChildSettingsPage.tsx
// Full child record — 7 tabs with completeness badges
// Profile | Family | Enrollment | Health | CACFP | SafePass | Billing

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  completeness as regCompleteness, tabCounts as regTabCounts,
  fieldsForTab, isFieldActive, fieldValue,
  type TabKey, type RecordCtx, type FieldDef,
} from '@/lib/childFieldRegistry'
import { displayChildName } from '@/lib/childName'
import { useAuth } from '@/hooks/useAuth'
import { parseIeaFiscalYear, frpExpiryDefault, recordDetermination } from '@/lib/enrollmentApprove'
import ChildExportPanel from './ChildExportPanel'
import ChildDocumentsTab from './ChildDocumentsTab'

// registry helpers don't export isEmpty — mirror it locally for the filled-indicator.
const isEmptyVal = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
const todayStr = new Date().toISOString().slice(0, 10)

// tab order → registry TabKeys
const TAB_KEYS: TabKey[] = ['profile','family','enrollment','health','cacfp','safepass','billing','documents']

// ─── Types ────────────────────────────────────────────────────────────────────

interface Child {
  id: string; org_id: string; center_id: string; classroom_id: string | null
  child_id: string | null   // FK → menumaker.child.id (bridge to child_guardian)
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
  is_emergency_contact?: boolean; emergency_contact_order?: number; ordinal?: number
}

// Legacy role encodes pickup right (can_pickup default-true is unreliable in v1).
const canPickupFromRole = (role?: string) => role === 'pickup' || role === 'parent'
// relationship stored in mixed case (father/Father, grandma/Grandmother) — tidy on display.
const capWords = (s?: string | null) =>
  (s ?? '').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

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
  childId, onClose, classrooms, initialTab = 0, focusField
}: {
  childId: string
  onClose: () => void
  classrooms: { id: string; name: string }[]
  initialTab?: number
  focusField?: string   // registry field key to scroll to + highlight on open (e.g. 'date_out')
}) {
  const [tab, setTab] = useState(initialTab)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [child, setChild] = useState<Child | null>(null)
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [medical, setMedical] = useState<ChildMedical | null>(null)
  const [view, setView] = useState<Record<string, any> | null>(null)   // v_child_age_profile (read-only)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [confirmDeact, setConfirmDeact] = useState(false)   // deactivate confirm overlay
  const [deactReason, setDeactReason] = useState('')
  const [deactBusy, setDeactBusy] = useState(false)
  const { user } = useAuth()
  // Layer 2 — F/R/P late corrections: capture the eligibility as loaded so a
  // change on save is recorded as a determination (income_eligibility + log),
  // and surface the current-cycle determination signature on the CACFP tab.
  const [orig, setOrig] = useState<{ frp: string | null; expires: string | null }>({ frp: null, expires: null })
  const [fiscalYear, setFiscalYear] = useState<string | null>(null)
  const [detSig, setDetSig] = useState<{ eligibility: string | null; by: string | null; at: string | null; source: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/enroll-registry.json', { cache: 'no-cache' })
        const j = await r.json(); const iea = j?.forms?.iea
        if (!cancelled) setFiscalYear(parseIeaFiscalYear(iea?.versions?.[iea?.current] ?? iea?.fallbackUrl))
      } catch { if (!cancelled) setFiscalYear(null) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { loadAll() }, [childId])

  // Scroll to + highlight a specific field when opened with focusField
  // (e.g. the Deactivate shortcut jumps to END DATE on the Profile tab).
  useEffect(() => {
    if (!focusField || !child) return
    const t = setTimeout(() => {
      document.getElementById(`field-${focusField}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightKey(focusField)
      setTimeout(() => setHighlightKey(k => (k === focusField ? null : k)), 2600)
    }, 120)
    return () => clearTimeout(t)
  }, [focusField, child])

  async function loadAll() {
    // roster.id (childId) ≠ child.id. Guardians hang off child_guardian.child_id
    // which FKs to menumaker.child.id — reached via roster.child_id. Load the
    // roster row first, then fetch guardians by its child_id.
    const { data: c } = await supabase.schema('menumaker').from('roster').select('*').eq('id', childId).single()
    if (c) { setChild(c as Child); setOrig({ frp: (c as any).frp ?? null, expires: (c as any).frp_expires ?? null }) }
    const cid = (c as any)?.child_id as string | null

    let guardianRows: any[] = []
    if (cid) {
      const { data: g } = await supabase.schema('menumaker').from('child_guardian')
        .select('*, guardian:guardian_id(*)')
        .eq('child_id', cid)
        .order('emergency_contact_order', { ascending: true, nullsFirst: false })
        .order('ordinal', { ascending: true })
      guardianRows = g ?? []
    }
    setGuardians(guardianRows.map((row: any) => ({
      ...row.guardian, role: row.role, relationship: row.relationship, can_pickup: row.can_pickup,
      is_emergency_contact: row.is_emergency_contact, emergency_contact_order: row.emergency_contact_order, ordinal: row.ordinal,
    })))

    const { data: m } = await supabase.schema('menumaker').from('child_medical').select('*').eq('child_id', childId).maybeSingle()
    setMedical(m as ChildMedical ?? { allergies: null, medications: null, doctor_name: null, doctor_phone: null, health_condition_name: null, condition_symptoms: null, foods_to_avoid: null, activities_to_avoid: null, care_instructions: null, emergency_action: null, evacuation_notes: null, medication_details: null, parent_signed_at: null })

    // read-only age/milk profile for CACFP tab + registry export
    const { data: vw } = await supabase.schema('menumaker').from('v_child_age_profile').select('*').eq('id', childId).maybeSingle()
    setView(vw ?? null)
  }

  // Load the current-cycle determination signature for the CACFP tab.
  useEffect(() => {
    if (!childId || !fiscalYear) { setDetSig(null); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('income_eligibility')
        .select('eligibility,determined_by_name,determined_at,eligibility_source')
        .eq('roster_id', childId).eq('fiscal_year', fiscalYear)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (!cancelled) setDetSig(data ? {
        eligibility: (data as any).eligibility, by: (data as any).determined_by_name,
        at: (data as any).determined_at ? String((data as any).determined_at).slice(0, 10) : null,
        source: (data as any).eligibility_source,
      } : null)
    })()
    return () => { cancelled = true }
  }, [childId, fiscalYear])

  async function doSaveRoster() {
    if (!child) return
    const frp = (child.frp ?? '').trim().toUpperCase().slice(0, 1) || null
    // A late F/R correction defaults frp_expires to determination + 12 months
    // (CACFP validity) when left blank — mirrors the IEA approve flow.
    const expires = (frp === 'F' || frp === 'R')
      ? (child.frp_expires || frpExpiryDefault(todayStr, null))
      : child.frp_expires
    await supabase.schema('menumaker').from('roster').update({
      first_name: child.first_name, last_name: child.last_name,
      birthday: child.birthday, classroom_id: child.classroom_id,
      date_in: child.date_in, date_out: child.date_out,
      frp, frp_expires: expires, milk_kind: child.milk_kind,
      child_address: child.child_address, has_health_condition: child.has_health_condition,
      development_notes: child.development_notes, accommodations: child.accommodations,
      specialized_services: child.specialized_services,
      emergency_transport_auth: child.emergency_transport_auth,
      enrollment_reviewed_at: child.enrollment_reviewed_at,
      // child_name canonical = "Last First" (see docs/platform-standards.md)
      child_name: `${child.last_name ?? ''} ${child.first_name ?? ''}`.trim()
    }).eq('id', childId)

    // Layer 2: if eligibility changed, record it as a determination (manual,
    // profile edit) on the current-cycle income_eligibility row + append-only
    // log, so late corrections carry the same audit trail as an IEA approval.
    const changed = frp !== (orig.frp ?? null) || (expires ?? null) !== (orig.expires ?? null)
    if (changed && frp && fiscalYear) {
      await recordDetermination({
        roster_id: childId, org_id: child.org_id, center_id: child.center_id,
        frp, frp_expires: expires ?? null, fiscal_year: fiscalYear,
        eligibility_source: 'manual', ieSource: 'profile_edit',
        determined_by: user?.id ?? '',
        determined_by_name: (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff',
      })
      setOrig({ frp, expires: expires ?? null })
      setChild(p => p ? { ...p, frp, frp_expires: expires ?? null } as Child : p)
      setDetSig({ eligibility: frp, by: (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff', at: todayStr, source: 'manual' })
    }
  }

  // Deactivate: stop the child being countable (meal count / reports filter
  // is_active=true). Also stamps date_out (if unset) so date_out-honoring queries
  // agree, plus an audit trail. Reactivate reverses it and clears date_out so the
  // active-roster filter shows the child again.
  async function doDeactivate() {
    if (!child) return
    setDeactBusy(true)
    const patch: Record<string, any> = {
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivation_reason: deactReason.trim() || null,
    }
    if (!child.date_out) patch.date_out = todayStr
    await supabase.schema('menumaker').from('roster').update(patch).eq('id', childId)
    setChild(p => p ? { ...p, ...patch } as Child : p)
    setDeactBusy(false); setConfirmDeact(false); setDeactReason('')
  }

  async function doReactivate() {
    if (!child) return
    setDeactBusy(true)
    const patch = { is_active: true, date_out: null, deactivated_at: null, deactivation_reason: null }
    await supabase.schema('menumaker').from('roster').update(patch).eq('id', childId)
    setChild(p => p ? { ...p, ...patch } as Child : p)
    setDeactBusy(false)
  }

  async function doSaveMedical() {
    if (!medical || !child) return
    const exists = !!(medical as any).id
    if (exists) {
      await supabase.schema('menumaker').from('child_medical').update(medical).eq('child_id', childId)
    } else {
      await supabase.schema('menumaker').from('child_medical').insert({ ...medical, child_id: childId, org_id: child.org_id })
    }
  }

  // Save exactly the tables the current tab touches (Health mixes roster + child_medical).
  async function saveCurrent() {
    const tables = new Set(fieldsForTab(TAB_KEYS[tab]).map(f => f.table))
    if (tables.size === 0) return   // guardian/placeholder tabs — nothing to persist here
    setSaving(true)
    const tasks: Promise<any>[] = []
    if (tables.has('roster')) tasks.push(doSaveRoster())
    if (tables.has('child_medical')) tasks.push(doSaveMedical())
    await Promise.all(tasks)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
    loadAll()  // refresh view (age/milk) + badges after write
  }

  // ─── Completeness counters — driven by childFieldRegistry (B.1) ───────────
  function counts() {
    if (!child) return Array(7).fill({ e: 0, o: 0 })
    const ctx: RecordCtx = { roster: child, medical, view }
    return TAB_KEYS.map(k => {
      const c = regTabCounts(k, ctx, guardians)
      return { e: c.empty, o: c.overdue }
    })
  }

  const badges = counts()
  const totalEmpty = badges.reduce((s, b) => s + b.e, 0)
  const totalOverdue = badges.reduce((s, b) => s + b.o, 0)
  const completePct = child ? regCompleteness({ roster: child, medical, view }, guardians).pct : 0

  const TABS = ['👤 Profile','👨‍👩‍👧 Family','📋 Enrollment','🏥 Health','🍽️ CACFP','🔒 SafePass','💰 Billing','📁 Documents']

  if (!child) return <div style={{ padding: 24, color: '#888', fontFamily:"'DM Sans',sans-serif" }}>Loading…</div>

  const set = (k: keyof Child, v: any) => setChild(p => p ? { ...p, [k]: v } : p)
  const setMed = (k: keyof ChildMedical, v: any) => setMedical(p => p ? { ...p, [k]: v } : p)

  const fullName = displayChildName(child)

  // ─── Registry-driven field rendering (B.2) ───────────────────────────────
  // NOTE: these are plain functions, NOT nested <Components>. Calling them as
  // functions keeps the inputs part of THIS component's tree — declaring a
  // component inside render would remount on every keystroke and drop focus.
  const ctx: RecordCtx = { roster: child, medical, view }

  const writeField = (f: FieldDef, val: any) => {
    if (f.table === 'roster') set(f.column as keyof Child, val)
    else if (f.table === 'child_medical') setMed(f.column as keyof ChildMedical, val)
    // 'view' fields are read-only — never written
  }

  const roVal: React.CSSProperties = {
    ...inp, background: '#f4f7f4', color: '#4b5563', display: 'flex', alignItems: 'center',
  }

  const renderEditor = (f: FieldDef) => {
    const v = fieldValue(f, ctx)
    if (f.readOnly) return <div style={roVal}>{v ?? '—'}</div>
    switch (f.type) {
      case 'textarea':
        return <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={v ?? ''} onChange={e => writeField(f, e.target.value)} />
      case 'date':
        return <input type="date" style={inp} value={v ?? ''} onChange={e => writeField(f, e.target.value)} />
      case 'boolean': {
        const opts = f.options ?? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
        const cur = v === true ? 'true' : v === false ? 'false' : ''
        return (
          <select style={inp} value={cur} onChange={e => writeField(f, e.target.value === '' ? null : e.target.value === 'true')}>
            <option value="">— Select —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      }
      case 'select': {
        const opts = f.column === 'classroom_id'
          ? classrooms.map(c => ({ value: c.id, label: c.name }))
          : (f.options ?? [])
        return (
          <select style={inp} value={v ?? ''} onChange={e => writeField(f, e.target.value)}>
            <option value="">— Select —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      }
      default: // text | phone | email
        return <input style={inp} value={v ?? ''} onChange={e => writeField(f, e.target.value)} />
    }
  }

  const renderFieldRow = (f: FieldDef) => {
    const v = fieldValue(f, ctx)
    const filled = !isEmptyVal(v)
    const showStar = !!f.required && !filled && !f.readOnly
    const isOverdue = !!f.overdue && !!v && String(v).slice(0, 10) < todayStr
    const highlighted = highlightKey === f.key
    return (
      <div key={f.key} id={`field-${f.key}`} style={{
        marginBottom: 14,
        ...(highlighted ? { background: '#fef9c3', borderRadius: 8, padding: 8, boxShadow: '0 0 0 2px #fde047', transition: 'background 0.3s' } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ fontSize: 15, lineHeight: 1, color: filled ? '#16a34a' : '#c0c8c0' }}>{filled ? '☑' : '☐'}</span>
          <label style={{ ...lbl, margin: 0 }}>{f.label}</label>
          {showStar && <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 700 }} title="Required">★</span>}
          {isOverdue && <span style={{ fontSize: 10, background: '#1a2e1a', color: '#fff', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>OVERDUE</span>}
          {f.readOnly && <span style={{ fontSize: 10, color: '#9ca3af' }}>· auto</span>}
        </div>
        {renderEditor(f)}
      </div>
    )
  }

  // Render all active fields for a tab, grouped by section (order preserved).
  const renderFieldsTab = (tabKey: TabKey) => {
    const fields = fieldsForTab(tabKey).filter(f => isFieldActive(f, ctx))
    if (fields.length === 0) return <div style={{ color: '#aaa', fontSize: 13 }}>No fields on this tab yet.</div>
    // Merge by section (first-seen order) so non-consecutive same-section fields share one header.
    const groups = new Map<string, FieldDef[]>()
    for (const f of fields) (groups.get(f.section) ?? groups.set(f.section, []).get(f.section)!).push(f)
    return <div>{[...groups].map(([title, items]) => <div key={title}>{section(title)}{items.map(renderFieldRow)}</div>)}</div>
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ background:'#0f4c35', padding:'16px 20px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:700, color:'#7ee8b0' }}>
            {(child.first_name?.[0]??'')}{(child.last_name?.[0]??'')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:17, display:'flex', alignItems:'center', gap:8 }}>
              {fullName}
              {!child.is_active && <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.06em', background:'#dc2626', color:'#fff', padding:'2px 8px', borderRadius:6 }}>INACTIVE</span>}
            </div>
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
          <button onClick={() => setShowExport(true)} title="Export / print this child"
            style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', height:32, padding:'0 12px', borderRadius:16, cursor:'pointer', fontSize:12, fontWeight:600, marginRight:8 }}>⤓ Export</button>
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

          {/* ── TAB 0: Profile (registry-driven) ── */}
          {tab === 0 && renderFieldsTab('profile')}

          {/* ── TAB 1: Family ── */}
          {tab === 1 && (
            <div>
              {section('Parents & Guardians')}
              {guardians.length === 0 ? (
                <div style={{ color:'#aaa', fontSize:13, padding:'20px 0' }}>No guardians on file. Add via Enrollment form.</div>
              ) : guardians.map((g, i) => (
                <div key={g.id} style={{ background:'#f8faf8', borderRadius:10, padding:14, marginBottom:10, border:'1.5px solid #e8f0e8' }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#0f4c35', marginBottom:8 }}>
                    {capWords(g.role) || `Guardian ${i+1}`}{g.relationship ? ` · ${capWords(g.relationship)}` : ''}
                    {canPickupFromRole(g.role) && <span style={{ marginLeft:8, fontSize:11, background:'#dcfce7', color:'#16a34a', padding:'1px 8px', borderRadius:6 }}>✓ Pickup</span>}
                    {g.is_emergency_contact && <span style={{ marginLeft:6, fontSize:11, background:'#fef3c7', color:'#d97706', padding:'1px 8px', borderRadius:6 }}>🚨 Emergency</span>}
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

          {/* ── TAB 2: Enrollment (registry-driven) ── */}
          {tab === 2 && renderFieldsTab('enrollment')}

          {/* ── TAB 3: Health (registry-driven; DCY 01236 detail auto-reveals when has_health_condition) ── */}
          {tab === 3 && renderFieldsTab('health')}

          {/* ── TAB 4: CACFP (registry-driven) ── */}
          {tab === 4 && (
            <div>
              {renderFieldsTab('cacfp')}
              <div style={{ borderRadius:10, padding:'10px 14px', fontSize:12.5, marginTop:4,
                background: detSig ? '#f0fff4' : '#fff3cd', border: `1px solid ${detSig ? '#bbf7d0' : '#ffc107'}`,
                color: detSig ? '#0f4c35' : '#856404' }}>
                {detSig
                  ? <>Determination on file ({fiscalYear}): <strong>{detSig.eligibility}</strong> — set by {detSig.by ?? 'unknown'} on {detSig.at ?? '—'}{detSig.source ? ` · ${detSig.source}` : ''}. Changing FRP here records a new manual determination.</>
                  : <>⚠️ No current-cycle IEA determination on file{fiscalYear ? ` (${fiscalYear})` : ''}. Changing FRP here records a manual determination; prefer approving the IEA form when available.</>}
              </div>
              <div style={{ background:'#f0f7f4', borderRadius:10, padding:14, fontSize:13, color:'#0f4c35', marginTop:8 }}>
                <strong>Note:</strong> Age group and milk (oz) are auto-calculated from birthday via v_child_age_profile (read-only). Edit birthday on the Profile tab to change them.
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

          {/* ── TAB 7: Documents ── */}
          {tab === 7 && <ChildDocumentsTab childDbId={child.child_id ?? childId} />}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1.5px solid #e8f0e8', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8faf8', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:12, color:saved?'#16a34a':'#888' }}>
              {saved ? '✓ Saved' : `${totalEmpty} fields empty · ${totalOverdue} overdue`}
            </div>
            {child.is_active ? (
              <button onClick={() => setConfirmDeact(true)}
                style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #fecaca', background:'#fff', color:'#dc2626', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600 }}>
                Deactivate
              </button>
            ) : (
              <button onClick={doReactivate} disabled={deactBusy}
                style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #86efac', background:'#f0fdf4', color:'#16a34a', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, opacity:deactBusy?0.6:1 }}>
                {deactBusy ? '…' : '↩ Reactivate'}
              </button>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>
              Close
            </button>
            {fieldsForTab(TAB_KEYS[tab]).length > 0 && (
              <button onClick={saveCurrent} disabled={saving}
                style={{ padding:'9px 20px', borderRadius:8, background:'#0f4c35', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit', opacity:saving?0.6:1 }}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDeact && (
        <div onClick={() => !deactBusy && setConfirmDeact(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2100, padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, padding:22, boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#dc2626', marginBottom:8 }}>Deactivate {fullName}?</div>
            <div style={{ fontSize:13, color:'#4b5563', lineHeight:1.5, marginBottom:14 }}>
              The child stops being countable in meal count and reports.
              {!child.date_out && <> End date will be set to <strong>today</strong>.</>} You can Reactivate later.
            </div>
            <label style={{ ...lbl }}>Reason (optional)</label>
            <textarea value={deactReason} onChange={e=>setDeactReason(e.target.value)} placeholder="e.g. withdrew, moved, aged out"
              style={{ ...inp, minHeight:56, resize:'vertical', marginBottom:16 }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setConfirmDeact(false)} disabled={deactBusy}
                style={{ padding:'9px 16px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:13 }}>Cancel</button>
              <button onClick={doDeactivate} disabled={deactBusy}
                style={{ padding:'9px 18px', borderRadius:8, background:'#dc2626', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit', opacity:deactBusy?0.6:1 }}>
                {deactBusy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <ChildExportPanel
          childName={fullName}
          child={child}
          medical={medical}
          view={view}
          guardians={guardians}
          classrooms={classrooms}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
