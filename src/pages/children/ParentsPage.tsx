// ParentsPage.tsx — IA v2 "Parents" = the family reference hub.
//
// The sidebar names WHO; here you look a family up — guardians, contacts, their
// children (+ room + status), F/R/P. There are NO operational buttons: admitting a
// child, resuming a packet, importing — all of that lives on Children. Contacts are
// click-to-call / click-to-email.
//
// Visibility is NOT widened: the page is gated with the same role check the roster
// uses, and F/R/P is shown exactly at the roster level (no determination controls).
//
// Contact details ARE editable here (2026-07-16) — an office manager correcting a
// phone number should not have to re-run an enrollment packet. Scope is deliberately
// the guardian row only: name, email, phones, address. NOT household.frp /
// frp_expires — an F/R/P determination is claim-evidence and belongs to the F/R/P
// editor with its signature + income_eligibility write, never to a free-text card.
//
// Data source note: guardians come from the normalized guardian / child_guardian
// tables. Enrollment-approve is roster-only today (guardians are Phase 2/4), so
// families that predate guardian-population appear from enrollment form_data as
// read-only 'sub:' pseudo-rows — those have no guardian PK, so they cannot be
// edited (writing to a fabricated id would target nothing). Honest empty states below.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

type Guardian = {
  id: string
  first_name: string | null; last_name: string | null
  email: string | null; mobile_phone: string | null
  phone_1: string | null; phone_2: string | null
  address: string | null
  relationship: string | null   // derived from child_guardian, NOT a guardian column
}
// `id` = roster.id — the key income_determination_status() returns as child_id
// (enrollment_submissions.child_id holds roster.id, not menumaker.child.id). Absent for
// from-enrollment placeholder children (not yet admitted → no determination row).
type ChildLite = { id?: string; child_id: string; name: string; room: string; frp: string | null }
type Family = { guardian: Guardian; children: ChildLite[] }

const isRealGuardian = (id: string) => !id.startsWith('sub:')

const GREEN = '#0f4c35'
const wrap: React.CSSProperties = { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000 }

export default function ParentsPage() {
  const { currentCenter, isOrgAdmin, orgRole } = useOrg()
  const centerId = currentCenter?.id ?? null
  const allowed = isOrgAdmin || ['admin', 'director', 'office_manager', 'owner'].includes(orgRole ?? '')

  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [loadErr, setLoadErr] = useState<string | null>(null)
  // Ф3: roster.id → income-determination status. Content-free (no F/R/P, no IEA-vs-waiver);
  // the director never reads income rows (RLS income_org_only) — only "on file".
  const [incomeStatus, setIncomeStatus] = useState<Map<string, string>>(new Map())

  const applyEdit = (g: Guardian) =>
    setFamilies(prev => prev.map(f => f.guardian.id === g.id ? { ...f, guardian: g } : f))

  useEffect(() => {
    if (!allowed || !centerId) return
    let cancelled = false
    ;(async () => {
      setLoading(true); setLoadErr(null)
      try {
        // roster (this center, active) → child_id map
        const { data: roster } = await supabase.schema('menumaker').from('roster')
          .select('id, child_id, first_name, last_name, child_name, classroom_id, frp, is_active')
          .eq('center_id', centerId).eq('is_active', true)
        const kids = (roster ?? []).filter(r => r.child_id)
        const childIds = kids.map(r => r.child_id as string)
        if (childIds.length === 0) { if (!cancelled) setFamilies([]); return }

        // `relationship` lives on child_guardian (the link), not on guardian — a
        // person can be Mother to one child and Guardian to another. Selecting it
        // off guardian returns a 400 and, with the error dropped, silently emptied
        // this page of every real family.
        const [{ data: links }, { data: rooms }] = await Promise.all([
          supabase.schema('menumaker').from('child_guardian').select('child_id, guardian_id, relationship, role').in('child_id', childIds),
          supabase.schema('menumaker').from('classrooms').select('id, name').eq('center_id', centerId),
        ])
        const gIds = Array.from(new Set((links ?? []).map(l => l.guardian_id as string)))
        if (gIds.length === 0) { if (!cancelled) setFamilies([]); return }

        const { data: gs, error: gErr } = await supabase.schema('menumaker').from('guardian')
          .select('id, first_name, last_name, email, mobile_phone, phone_1, phone_2, address').in('id', gIds)
        if (gErr) throw gErr

        const roomName = new Map((rooms ?? []).map(r => [r.id as string, r.name as string]))
        const kidByCid = new Map(kids.map(r => [r.child_id as string, r]))
        const relByGuardian = new Map<string, string>()
        for (const l of links ?? []) {
          const rel = (l.relationship as string) || (l.role as string)
          if (rel && !relByGuardian.has(l.guardian_id as string)) relByGuardian.set(l.guardian_id as string, rel)
        }
        const byGuardian = new Map<string, Family>()
        for (const g of gs ?? []) {
          byGuardian.set(g.id as string, {
            guardian: { ...(g as Omit<Guardian, 'relationship'>), relationship: relByGuardian.get(g.id as string) ?? null },
            children: [],
          })
        }
        for (const l of links ?? []) {
          const fam = byGuardian.get(l.guardian_id as string)
          const kid = kidByCid.get(l.child_id as string)
          if (!fam || !kid) continue
          fam.children.push({
            id: kid.id as string,   // roster.id — join key for income_determination_status()
            child_id: kid.child_id as string,
            name: (kid.child_name as string) || `${kid.last_name ?? ''}, ${kid.first_name ?? ''}`.trim(),
            room: roomName.get(kid.classroom_id as string) ?? '—',
            frp: (kid.frp as string) ?? null,
          })
        }
        const list = Array.from(byGuardian.values()).filter(f => f.children.length > 0)

        // Secondary source (decision 1b): pull parent contacts from enrollment
        // submissions' form_data so the hub is populated before guardian-population
        // (Phase 2/4) lands. De-duped against guardian families by email/name.
        const seen = new Set(list.map(f => (f.guardian.email || `${f.guardian.first_name ?? ''} ${f.guardian.last_name ?? ''}`).toLowerCase().trim()))
        const { data: subs } = await supabase.schema('menumaker').from('enrollment_submissions')
          // 'received' belongs here: an auto-filed submission is MORE settled than a
          // pending one, so excluding it while including pending would drop a family
          // from this hub the moment their consent filed itself.
          .select('form_data').eq('center_id', centerId).in('status', ['pending', 'approved', 'received'])
        const fromSubs = new Map<string, Family>()
        for (const s of subs ?? []) {
          const fd = (s.form_data ?? {}) as Record<string, string>
          const pname = (fd.parent_name || [fd.parent_first_name, fd.parent_last_name].filter(Boolean).join(' ') || '').trim()
          const email = (fd.parent_email || '').trim()
          const key = (email || pname).toLowerCase()
          if (!key || seen.has(key)) continue
          const [maybeLast, maybeFirst] = pname.includes(',') ? pname.split(',').map(x => x.trim()) : ['', pname]
          const fam: Family = fromSubs.get(key) ?? {
            guardian: {
              id: 'sub:' + key,
              first_name: maybeFirst || pname, last_name: maybeLast || null,
              email: email || null, mobile_phone: fd.phone || fd.phone_day || null,
              phone_1: null, phone_2: null, address: fd.address || null,
              relationship: 'Parent · from enrollment',
            },
            children: [],
          }
          const cn = (fd.child_name || '').trim()
          if (cn && !fam.children.some(c => c.name === cn)) fam.children.push({ child_id: 'sub:' + key + ':' + cn, name: cn, room: '—', frp: null })
          fromSubs.set(key, fam)
        }
        const merged = list.concat(Array.from(fromSubs.values()).filter(f => f.children.length > 0))
          .sort((a, b) => (a.guardian.last_name ?? a.guardian.first_name ?? '').localeCompare(b.guardian.last_name ?? b.guardian.first_name ?? ''))
        if (!cancelled) setFamilies(merged)

        // Ф3 — the unified "income determination — on file" chip. SECURITY DEFINER fn,
        // self-scoped (director = own centers); returns {child_id=roster.id, status} only,
        // never form_data/signatures, never IEA-vs-waiver. Bind the error so a failed read
        // shows no chip rather than a false "nothing on file".
        const { data: incomeRows, error: incErr } = await supabase.schema('menumaker').rpc('income_determination_status')
        if (incErr) throw incErr
        if (!cancelled) {
          const im = new Map<string, string>()
          for (const r of (incomeRows ?? []) as { child_id: string; status: string }[]) if (r.child_id) im.set(r.child_id, r.status)
          setIncomeStatus(im)
        }
      } catch (e: any) {
        // A failed query must never masquerade as "no families on file" — that is
        // how a broken column reference read as an empty centre for weeks.
        if (!cancelled) { setFamilies([]); setLoadErr(e?.message ?? String(e)) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [allowed, centerId])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return families
    return families.filter(f =>
      `${f.guardian.first_name ?? ''} ${f.guardian.last_name ?? ''}`.toLowerCase().includes(q) ||
      f.children.some(c => c.name.toLowerCase().includes(q)))
  }, [families, search])

  if (!allowed) return <div style={wrap}><div style={{ color: '#9ca3af', fontSize: 14 }}>You don't have access to family records.</div></div>
  if (!centerId) return <div style={wrap}><Title /><div style={empty}>Pick a center in the switcher at the top to look up its families.</div></div>

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Title center={currentCenter?.name} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔎 Search families…"
          style={{ font: 'inherit', fontSize: 13, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 9, minWidth: 200 }} />
      </div>

      {loadErr && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16,
          padding: '12px 16px', borderRadius: 10,
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 13, fontWeight: 500,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠</span>
          <span>Families could not be loaded — this list is <b>not</b> empty, it failed: {loadErr}</span>
        </div>
      )}

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13, marginTop: 18 }}>Loading families…</div>
      ) : visible.length === 0 ? (
        <div style={empty}>
          No family records on file yet for this center.
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
            Families appear here once guardian details are on file. Add or admit children from <b>Children</b>.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14, marginTop: 16 }}>
          {visible.map(f => <FamilyCard key={f.guardian.id} f={f} onSaved={applyEdit} income={incomeStatus} />)}
        </div>
      )}
    </div>
  )
}

function Title({ center }: { center?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>PEOPLE</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#0a3320' }}>Parents &amp; Families</div>
      <div style={{ fontSize: 12.5, color: '#6b7280' }}>{center ? `📍 ${center} · ` : ''}Look up a family — contacts, children, status. Read-only; actions live on Children.</div>
    </div>
  )
}

const EDITABLE: { key: keyof Guardian; label: string; type?: string }[] = [
  { key: 'first_name',   label: 'First name' },
  { key: 'last_name',    label: 'Last name' },
  { key: 'email',        label: 'Email', type: 'email' },
  { key: 'mobile_phone', label: 'Mobile', type: 'tel' },
  { key: 'phone_1',      label: 'Phone 1', type: 'tel' },
  { key: 'phone_2',      label: 'Phone 2', type: 'tel' },
  { key: 'address',      label: 'Address' },
]

function FamilyCard({ f, onSaved, income }: { f: Family; onSaved: (g: Guardian) => void; income: Map<string, string> }) {
  const g = f.guardian
  const editable = isRealGuardian(g.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Guardian>(g)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const name = `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim() || 'Guardian'
  const open = () => { setDraft(g); setSaveErr(null); setEditing(true) }
  const cancel = () => { setDraft(g); setSaveErr(null); setEditing(false) }
  const norm = (v: string | null) => { const t = (v ?? '').trim(); return t === '' ? null : t }

  const save = async () => {
    setSaving(true); setSaveErr(null)

    // Verify the write landed. An RLS denial returns zero rows and NO error, so a
    // bare await would paint "Saved ✓" over a change that was never written.
    // `.select('id')` makes the affected rows observable: an error is an error,
    // and an empty array means nothing was written.
    const { data: updated, error } = await supabase.schema('menumaker').from('guardian').update({
      first_name: norm(draft.first_name), last_name: norm(draft.last_name),
      email: norm(draft.email), mobile_phone: norm(draft.mobile_phone),
      phone_1: norm(draft.phone_1), phone_2: norm(draft.phone_2),
      address: norm(draft.address),
    }).eq('id', g.id).select('id')

    if (error) {
      setSaving(false)
      setSaveErr(`Not saved — the database rejected the change: ${error.message}. Nothing was written.`)
      return
    }
    if (!updated || updated.length === 0) {
      setSaving(false)
      setSaveErr('Not saved — 0 rows updated. You may not have permission to edit this family (the change was blocked, not written). Nothing has changed.')
      return
    }

    setSaving(false); setEditing(false); setSaved(true)
    onSaved({ ...draft, id: g.id, relationship: g.relationship })
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: '#0a3320' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{g.relationship ?? 'Guardian'}</div>
        </div>
        {editable && !editing && (
          <button onClick={open} style={btnEdit}>{saved ? 'Saved ✓' : '✎ Edit'}</button>
        )}
      </div>

      {saveErr && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10,
          padding: '10px 12px', borderRadius: 9,
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 12, fontWeight: 500,
        }}>
          <span style={{ fontSize: 14, lineHeight: 1.2 }}>⚠</span><span>{saveErr}</span>
        </div>
      )}

      {editing ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {EDITABLE.map(fl => (
            <label key={fl.key} style={{ display: 'grid', gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6b7280' }}>{fl.label}</span>
              <input
                type={fl.type ?? 'text'}
                value={(draft[fl.key] as string | null) ?? ''}
                onChange={e => setDraft(d => ({ ...d, [fl.key]: e.target.value }))}
                style={{ font: 'inherit', fontSize: 12.5, padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 8 }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button onClick={save} disabled={saving} style={saving ? { ...btnSave, opacity: 0.7 } : btnSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} disabled={saving} style={btnEdit}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 12.5 }}>
            {g.mobile_phone && <a href={`tel:${g.mobile_phone.replace(/[^\d+]/g, '')}`} style={{ color: GREEN, textDecoration: 'none' }}>📞 {g.mobile_phone}</a>}
            {g.email && <a href={`mailto:${g.email}`} style={{ color: GREEN, textDecoration: 'none' }}>✉ {g.email}</a>}
          </div>
          {g.address && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>📍 {g.address}</div>}
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {f.children.map(c => {
          // Ф3 chip: content-free. The fn returns a row ONLY for a period-effective
          // determination on file (income_determination_status, 20260722e) — no F/R/P,
          // no IEA-vs-waiver. No row (absent OR expired) → no chip: the director sees the
          // packet is incomplete without learning why. Income itself lives with the GD.
          const onFile = !!c.id && income.get(c.id) === 'on_file'
          return (
            <span key={c.child_id} style={{ fontSize: 11.5, background: '#f0f7f4', border: '1px solid #d1fae5', borderRadius: 8, padding: '3px 9px', color: '#1a2e1a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              🧒 {c.name} · {c.room}{c.frp ? ` · ${c.frp}` : ''}
              {onFile && (
                <span title="Income determination is on file and current — handled by the General Director; its content is never shown here."
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.01em', background: '#dcfce7', color: '#0f5132', border: '1px solid #bbf7d0', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                  💲 Income determination — on file
                </span>
              )}
            </span>
          )
        })}
      </div>

      {!editable && (
        <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 9 }}>
          From an enrollment form — not a family record yet, so it can't be edited here. Admit or resume from Children.
        </div>
      )}
    </div>
  )
}

const btnEdit: React.CSSProperties = { font: 'inherit', fontSize: 11.5, padding: '5px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' }
const btnSave: React.CSSProperties = { font: 'inherit', fontSize: 11.5, padding: '5px 12px', borderRadius: 8, border: 'none', background: GREEN, color: '#fff', cursor: 'pointer', fontWeight: 600 }

const empty: React.CSSProperties = { padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb', marginTop: 16 }
