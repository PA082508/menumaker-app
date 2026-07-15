// AddStaffPacketPanel.tsx — "Add Staff" = the onboarding-packet screen (director tool).
//
// Sibling of AddChildPacketPanel, one set: packets.staff = [staff_consent, staff],
// composition & order are DATA from the registry, not code. E-Signatures FIRST — the
// Consent mints the staff-scoped signature sample that Staff Enrollment then adopts,
// so an employee signs once. The old button opened Staff Enrollment directly and
// skipped the Consent entirely, which left nothing to adopt.
//
// Link + QR both point at the storefront (?center=&set=staff), never at a file URL:
// a printed QR must resolve the current version each time it is opened.
import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { storefrontPacketUrl } from '@/config/showcaseLinks'

const GREEN = '#0f4c35'
const SET_KEY = 'staff'

type Slot = { key: string; section?: string; label?: string; note?: string; pending?: boolean }
type FormRec = { current?: string | null; versions?: Record<string, string | Record<string, string>>; fallbackUrl?: string | null; title?: string }
type Registry = { forms?: Record<string, FormRec>; packets?: Record<string, { title?: string; audience?: string; slots?: Slot[] }> }

// A version is either ONE url (string) or an object keyed by center slug for documents
// that differ per center — see AddChildPacketPanel.formUrl.
function formUrl(reg: Registry | null, key: string, slug: string): string | null {
  const f = reg?.forms?.[key]
  if (!f) return null
  const pick = (v?: unknown): string | null =>
    (typeof v === 'string' && v !== 'PENDING' && /^https?:/.test(v) ? v : null)
  const resolve = (v?: unknown): string | null =>
    (v && typeof v === 'object' ? pick((v as Record<string, string>)[slug]) : pick(v))
  return resolve(f.current ? f.versions?.[f.current] : null) || pick(f.fallbackUrl)
}

export default function AddStaffPacketPanel({ center, onClose }: { center: { id: string; name: string; slug: string }; onClose: () => void }) {
  const [reg, setReg] = useState<Registry | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: Registry | null) => { if (!cancelled && j) setReg(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const slots: Slot[] = useMemo(() => reg?.packets?.[SET_KEY]?.slots ?? [], [reg])
  const packetUrl = storefrontPacketUrl(center.slug, SET_KEY)

  async function copyLink() {
    try { await navigator.clipboard.writeText(packetUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked — the link is on screen */ }
  }

  const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(10,20,15,0.55)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '30px 14px' }
  const sheet: React.CSSProperties = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 24px 70px rgba(0,0,0,0.28)', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, Arial, sans-serif" }

  return (
    <div style={ov} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={{ background: GREEN, color: '#fff', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Add Staff — onboarding packet</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{center.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {!reg ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 4px' }}>Loading…</div>
          ) : !slots.length ? (
            <div style={{ color: '#92400e', fontSize: 13, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px' }}>
              The staff packet is not in this app's registry copy yet. Nothing to share — ask for the registry mirror to be refreshed.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', margin: '0 2px 12px' }}>
                Send this to a new team member. They sign the Consent first — every later form then reuses that signature.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {slots.map((s, i) => {
                  const label = s.label || reg.forms?.[s.key]?.title || s.key
                  const url = formUrl(reg, s.key, center.slug)
                  return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 11, border: '1.5px solid #e6f2ec', borderRadius: 12, padding: '10px 12px', background: '#fff' }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: GREEN, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#14251b' }}>{label}</div>
                        {s.note && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{s.note}</div>}
                      </div>
                      {url && (
                        <a href={`${url}${url.includes('?') ? '&' : '?'}center=${encodeURIComponent(center.slug)}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, fontWeight: 700, color: GREEN, textDecoration: 'none', border: '1.5px solid #d1fae5', borderRadius: 8, padding: '5px 10px', flex: '0 0 auto' }}>Open</a>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 16, padding: '14px 12px', border: '1.5px solid #d1fae5', borderRadius: 12, background: '#f7fbf9' }}>
                <span style={{ lineHeight: 0, border: '1.5px solid #d1fae5', borderRadius: 8, padding: 4, background: '#fff', flex: '0 0 auto' }}>
                  <QRCodeCanvas value={packetUrl} size={256} level="M" marginSize={0} style={{ width: 88, height: 88, display: 'block' }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: GREEN, marginBottom: 3 }}>Scan or share the packet</div>
                  <div style={{ fontSize: 11, color: '#6b7280', wordBreak: 'break-all', marginBottom: 8 }}>{packetUrl}</div>
                  <button onClick={copyLink}
                    style={{ padding: '7px 14px', borderRadius: 8, background: copied ? '#dcfce7' : GREEN, color: copied ? '#166534' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}>
                    {copied ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
