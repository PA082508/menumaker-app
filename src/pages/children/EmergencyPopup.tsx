// ============================================================
// EmergencyPopup.tsx — quick "who to call" sheet for a child.
// Join: roster.id → roster.child_id → child_guardian.child_id → guardian.
// Order: emergency_contact_order (new DCY model), fallback ordinal.
// No contacts on file → Active-Intelligence CTA to add one (Family tab).
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Contact = {
  id: string
  first_name: string | null; last_name: string | null
  email: string | null; mobile_phone: string | null; phone_1: string | null; phone_2: string | null
  role: string | null; relationship: string | null
  is_emergency_contact: boolean | null; emergency_contact_order: number | null; ordinal: number | null
}

const capWords = (s?: string | null) =>
  (s ?? '').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
const isPickup = (role?: string | null) => role === 'pickup' || role === 'parent'
const fullName = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Contact'
const phones = (c: Contact) => [c.mobile_phone, c.phone_1, c.phone_2].filter(Boolean) as string[]

export default function EmergencyPopup({
  childId, childName, onClose, onAddContact,
}: {
  childId: string
  childName: string
  onClose: () => void
  onAddContact: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: r } = await supabase.schema('menumaker').from('roster').select('child_id').eq('id', childId).single()
      const cid = (r as any)?.child_id as string | null
      let rows: any[] = []
      if (cid) {
        const { data } = await supabase.schema('menumaker').from('child_guardian')
          .select('role,relationship,is_emergency_contact,emergency_contact_order,ordinal,guardian:guardian_id(*)')
          .eq('child_id', cid)
          .order('emergency_contact_order', { ascending: true, nullsFirst: false })
          .order('ordinal', { ascending: true })
        rows = data ?? []
      }
      if (cancelled) return
      setContacts(rows.map((row: any) => ({
        ...row.guardian, role: row.role, relationship: row.relationship,
        is_emergency_contact: row.is_emergency_contact, emergency_contact_order: row.emergency_contact_order, ordinal: row.ordinal,
      })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [childId])

  // emergency-flagged first (already sorted by the query), then the rest
  const emergency = contacts.filter(c => c.is_emergency_contact)
  const others = contacts.filter(c => !c.is_emergency_contact)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 420, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ background: '#b91c1c', color: '#fff', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '16px 16px 0 0' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px' }}>🚨 Emergency Contacts</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{childName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {loading ? (
            <div style={{ color: '#aaa', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>
          ) : contacts.length === 0 ? (
            // Active-Intelligence CTA — turn the data gap into the tool to close it
            <div style={{ background: '#fff8f0', border: '1.5px solid #fcd9b6', borderRadius: 12, padding: '20px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>No emergency contacts on file</div>
              <div style={{ fontSize: 12.5, color: '#8a6d3b', lineHeight: 1.5, marginBottom: 16 }}>
                This child has no guardians recorded. Add one so staff can reach someone in an emergency.
              </div>
              <button onClick={onAddContact} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ➕ Add contact
              </button>
            </div>
          ) : (
            <>
              {emergency.length > 0 && <Section title="Emergency contacts">{emergency.map(c => <ContactCard key={c.id} c={c} emphasize />)}</Section>}
              {others.length > 0 && <Section title={emergency.length ? 'Other guardians' : 'Guardians'}>{others.map(c => <ContactCard key={c.id} c={c} />)}</Section>}
              {emergency.length === 0 && (
                <div style={{ marginTop: 12, fontSize: 11.5, color: '#b45309', background: '#fff8f0', border: '1px solid #fcd9b6', borderRadius: 8, padding: '8px 10px' }}>
                  ⚠️ No contact is flagged as <b>emergency</b> yet — showing all guardians. Set an emergency contact on the Family tab.
                </div>
              )}
              <button onClick={onAddContact} style={{ marginTop: 14, width: '100%', padding: '9px', borderRadius: 9, border: '1.5px solid #c0d8c0', background: '#fff', color: '#0f4c35', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Manage contacts →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function ContactCard({ c, emphasize }: { c: Contact; emphasize?: boolean }) {
  const ps = phones(c)
  return (
    <div style={{ background: emphasize ? '#fff1f1' : '#f8faf8', border: `1.5px solid ${emphasize ? '#fbc5c5' : '#e8f0e8'}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: ps.length ? 8 : 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0a3320' }}>{fullName(c)}</span>
        {c.relationship && <span style={{ fontSize: 12, color: '#888' }}>· {capWords(c.relationship)}</span>}
        {c.is_emergency_contact && <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#b91c1c', padding: '1px 7px', borderRadius: 6 }}>🚨 Emergency</span>}
        {isPickup(c.role) && <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#16a34a', padding: '1px 7px', borderRadius: 6 }}>✓ Pickup</span>}
      </div>
      {ps.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ps.map((p, i) => (
            <a key={i} href={`tel:${p.replace(/[^\d+]/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: '#0f4c35', textDecoration: 'none', background: '#fff', border: '1px solid #c0d8c0', borderRadius: 8, padding: '6px 12px' }}>
              📞 {p}
            </a>
          ))}
          {c.email && <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#1e6b4a', textDecoration: 'none', background: '#fff', border: '1px solid #c0d8c0', borderRadius: 8, padding: '6px 12px' }}>✉️ Email</a>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#c0392b' }}>No phone on file{c.email ? '' : ''}{c.email && <a href={`mailto:${c.email}`} style={{ marginLeft: 6, color: '#1e6b4a' }}>✉️ {c.email}</a>}</div>
      )}
    </div>
  )
}
