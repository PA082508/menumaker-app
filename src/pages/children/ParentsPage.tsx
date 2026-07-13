// ParentsPage.tsx — IA v2 "Parents" = a READ-ONLY family reference hub.
//
// The sidebar names WHO; here you look a family up — guardians, contacts, their
// children (+ room + status), F/R/P. There are NO operational buttons: admitting a
// child, resuming a packet, importing — all of that lives on Children. Contacts are
// click-to-call / click-to-email.
//
// Visibility is NOT widened: the page is gated with the same role check the roster
// uses, and F/R/P is shown exactly at the roster level (no determination controls).
//
// Data source note: guardians come from the normalized guardian / child_guardian
// tables. Enrollment-approve is roster-only today (guardians are Phase 2/4), so this
// hub is populated for families that already have guardian records — new approvals
// won't appear here until guardian-population lands. Honest empty states below.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

type Guardian = { id: string; first_name: string | null; last_name: string | null; email: string | null; mobile_phone: string | null; relationship: string | null }
type ChildLite = { child_id: string; name: string; room: string; frp: string | null }
type Family = { guardian: Guardian; children: ChildLite[] }

const GREEN = '#0f4c35'
const wrap: React.CSSProperties = { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000 }

export default function ParentsPage() {
  const { currentCenter, isOrgAdmin, orgRole } = useOrg()
  const centerId = currentCenter?.id ?? null
  const allowed = isOrgAdmin || ['admin', 'director', 'office_manager', 'owner'].includes(orgRole ?? '')

  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!allowed || !centerId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        // roster (this center, active) → child_id map
        const { data: roster } = await supabase.schema('menumaker').from('roster')
          .select('id, child_id, first_name, last_name, child_name, classroom_id, frp, is_active')
          .eq('center_id', centerId).eq('is_active', true)
        const kids = (roster ?? []).filter(r => r.child_id)
        const childIds = kids.map(r => r.child_id as string)
        if (childIds.length === 0) { if (!cancelled) setFamilies([]); return }

        const [{ data: links }, { data: rooms }] = await Promise.all([
          supabase.schema('menumaker').from('child_guardian').select('child_id, guardian_id').in('child_id', childIds),
          supabase.schema('menumaker').from('classrooms').select('id, name').eq('center_id', centerId),
        ])
        const gIds = Array.from(new Set((links ?? []).map(l => l.guardian_id as string)))
        if (gIds.length === 0) { if (!cancelled) setFamilies([]); return }

        const { data: gs } = await supabase.schema('menumaker').from('guardian')
          .select('id, first_name, last_name, email, mobile_phone, relationship').in('id', gIds)

        const roomName = new Map((rooms ?? []).map(r => [r.id as string, r.name as string]))
        const kidByCid = new Map(kids.map(r => [r.child_id as string, r]))
        const byGuardian = new Map<string, Family>()
        for (const g of gs ?? []) byGuardian.set(g.id as string, { guardian: g as Guardian, children: [] })
        for (const l of links ?? []) {
          const fam = byGuardian.get(l.guardian_id as string)
          const kid = kidByCid.get(l.child_id as string)
          if (!fam || !kid) continue
          fam.children.push({
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
          .select('form_data').eq('center_id', centerId).in('status', ['pending', 'approved'])
        const fromSubs = new Map<string, Family>()
        for (const s of subs ?? []) {
          const fd = (s.form_data ?? {}) as Record<string, string>
          const pname = (fd.parent_name || [fd.parent_first_name, fd.parent_last_name].filter(Boolean).join(' ') || '').trim()
          const email = (fd.parent_email || '').trim()
          const key = (email || pname).toLowerCase()
          if (!key || seen.has(key)) continue
          const [maybeLast, maybeFirst] = pname.includes(',') ? pname.split(',').map(x => x.trim()) : ['', pname]
          const fam: Family = fromSubs.get(key) ?? {
            guardian: { id: 'sub:' + key, first_name: maybeFirst || pname, last_name: maybeLast || null, email: email || null, mobile_phone: fd.phone || fd.phone_day || null, relationship: 'Parent · from enrollment' },
            children: [],
          }
          const cn = (fd.child_name || '').trim()
          if (cn && !fam.children.some(c => c.name === cn)) fam.children.push({ child_id: 'sub:' + key + ':' + cn, name: cn, room: '—', frp: null })
          fromSubs.set(key, fam)
        }
        const merged = list.concat(Array.from(fromSubs.values()).filter(f => f.children.length > 0))
          .sort((a, b) => (a.guardian.last_name ?? a.guardian.first_name ?? '').localeCompare(b.guardian.last_name ?? b.guardian.first_name ?? ''))
        if (!cancelled) setFamilies(merged)
      } catch {
        if (!cancelled) setFamilies([])
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
          {visible.map(f => <FamilyCard key={f.guardian.id} f={f} />)}
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

function FamilyCard({ f }: { f: Family }) {
  const g = f.guardian
  const name = `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim() || 'Guardian'
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: '#0a3320' }}>{name}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{g.relationship ?? 'Guardian'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 12.5 }}>
        {g.mobile_phone && <a href={`tel:${g.mobile_phone.replace(/[^\d+]/g, '')}`} style={{ color: GREEN, textDecoration: 'none' }}>📞 {g.mobile_phone}</a>}
        {g.email && <a href={`mailto:${g.email}`} style={{ color: GREEN, textDecoration: 'none' }}>✉ {g.email}</a>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {f.children.map(c => (
          <span key={c.child_id} style={{ fontSize: 11.5, background: '#f0f7f4', border: '1px solid #d1fae5', borderRadius: 8, padding: '3px 9px', color: '#1a2e1a' }}>
            🧒 {c.name} · {c.room}{c.frp ? ` · ${c.frp}` : ''}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 9 }}>Read-only — admit or resume from Children.</div>
    </div>
  )
}

const empty: React.CSSProperties = { padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb', marginTop: 16 }
