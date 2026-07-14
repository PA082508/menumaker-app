import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import {
  ROLES_WITH_JD, signSetForRole, fetchActiveJdBody,
  type StaffRole, type JdDoc,
} from '@/lib/staffJdRegistry'
import AckSignModal, { type AckSignPayload } from '@/components/signing/AckSignModal'

// Staff onboarding — the first-day sign-set (role JD + §6 BYOD). SURFACE = IN-APP,
// signer variant (в): the new hire signs PERSONALLY in the director's session (like
// the parent kiosk). EVERY item — JD and BYOD — lands in staff_agreement_signatures
// (staging, pending_approve; witnessed_by_auth_id = the director whose session it is),
// carried to the permanent tables at Approve→staff. The new hire is NOT an auth user,
// so onboarding BYOD must NOT write byod_signatures (that table's RLS expects a
// self-signing employee) — the legacy self-service BYOD modal is untouched.

const S = () => supabase.schema('menumaker')

export default function StaffJdOnboarding() {
  const { org, currentCenter } = useOrg()
  const { user } = useAuth()
  const [role, setRole] = useState<StaffRole | ''>('')
  const [signing, setSigning] = useState<JdDoc | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [pending, setPending] = useState<number | null>(null)

  const set = role ? signSetForRole(role) : []

  useEffect(() => {
    if (!org?.id) return
    S().from('staff_agreement_signatures').select('id', { count: 'exact', head: true })
      .eq('org_id', org.id).eq('status', 'pending_approve')
      .then(({ count }) => setPending(count ?? 0))
  }, [org?.id, signing])

  // Open the sign flow for any sign-set item. Every doc — JDs and 'byod' — reads its
  // active body from policy_documents (byod seeded by migration 20260709e).
  async function openDocSign(doc: JdDoc) {
    setSigning(doc); setBody(null); setBodyLoading(true)
    const b = await fetchActiveJdBody(doc)
    setBody(b); setBodyLoading(false)
  }

  // Every item — JD and BYOD — writes to the SAME staging table (symmetric).
  async function submitSign(p: AckSignPayload): Promise<{ refId: string }> {
    if (!currentCenter?.id) throw new Error('Select a center first (onboarding is center-specific).')
    if (!user?.id) throw new Error('You must be signed in to witness a signature.')
    const doc = signing!
    const { data, error } = await S().from('staff_agreement_signatures').insert({
      org_id: org?.id,
      center_id: currentCenter.id,
      person_name: p.intake.name.trim(),
      person_role: role,
      policy_code: doc.policyKey,
      document_version: doc.version,
      ack_line: doc.ackLine,
      signature_method: 'drawn',
      signature_image: p.signaturePng,
      witnessed_by_auth_id: user.id,
    }).select('id').single()
    if (error) throw error
    return { refId: String(data.id).slice(0, 8).toUpperCase() }
  }

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '16px 18px', border: '1.5px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 10 }
  const primaryBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1a5c3f', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Library palette (fix 9): muted band, not a loud gradient — matches the BYOD
          band below and the storefront's single solid CTA is the one fill per screen. */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#0a3320', fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em' }}>✍️ Staff Onboarding — Job Description Acknowledgments</div>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>
            New hire signs personally on this device. {pending !== null && <>· {pending} awaiting director approval</>}
          </div>
        </div>
        <select value={role} onChange={e => setRole(e.target.value as StaffRole)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1fae5', fontSize: 14, fontFamily: 'inherit', minWidth: 200, background: '#fff' }}>
          <option value="">Select role…</option>
          {ROLES_WITH_JD.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {!currentCenter && (
        <div style={{ padding: 14, borderRadius: 10, background: '#fef3c7', color: '#92400e', fontSize: 13 }}>
          Select a center (top bar) to onboard staff — a signature is filed against a specific center.
        </div>
      )}

      {role && currentCenter && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '2px 2px 10px' }}>
            {set.length} document{set.length !== 1 ? 's' : ''} to sign for <strong>{role}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {set.map(doc => {
              const isByod = doc.policyKey === 'byod'
              return (
                <div key={doc.policyKey} style={card}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', marginBottom: 4 }}>{doc.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{isByod ? '§6 Smartphone / BYOD' : `${doc.policyKey} · ${doc.version}`}</div>
                  </div>
                  <div style={{ marginTop: 'auto' }}>
                    <button onClick={() => openDocSign(doc)} style={primaryBtn}>✍️ Sign {isByod ? 'BYOD' : 'JD'} →</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {signing && (
        <AckSignModal
          headerTitle={signing.title}
          headerSubtitle={`Play Academy — ${role} · ${currentCenter?.name ?? ''}`}
          intake={[{ key: 'name', label: 'Employee full name (print)', placeholder: 'First Last' }]}
          bodyNode={<ReactMarkdown>{body || ''}</ReactMarkdown>}
          bodyLoading={bodyLoading}
          ackLine={signing.ackLine}
          submitLabel="File signature (pending approval) ✓"
          onSubmit={submitSign}
          onClose={() => setSigning(null)}
          renderSuccess={({ intake, refId }) => (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <h2 style={{ color: '#1a5c3f', marginBottom: 8 }}>Acknowledgment Signed</h2>
              <p style={{ color: '#6b7280', fontSize: 13 }}>Filed for director approval. It becomes part of the staff record on approval.</p>
              <div style={{ background: '#f0f7f4', borderRadius: 10, padding: 16, margin: '16px 0', textAlign: 'left', fontSize: 13 }}>
                <div><strong>Employee:</strong> {intake.name}</div>
                <div><strong>Role:</strong> {role}</div>
                <div><strong>Document:</strong> {signing.title} ({signing.version})</div>
                <div><strong>Reference ID:</strong> {refId}</div>
              </div>
              <button onClick={() => setSigning(null)} style={{ width: '100%', padding: 13, background: '#1a5c3f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
            </div>
          )}
        />
      )}
    </div>
  )
}
