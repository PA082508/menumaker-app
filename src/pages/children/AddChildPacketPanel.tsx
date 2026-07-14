// AddChildPacketPanel.tsx — "Add Child" = the packet-set screen (director tool).
//
// Three packet sets (Starter / Toddler-Preschool / Infants) resolved from the
// registry (packets.<set>.slots) — composition & order are DATA, not code. Every
// row is a REMOVABLE checkbox: `mandatory` default-checked, `if_applicable`
// default-unchecked, Consent first-by-order but removable like any other
// (signature-aware later). Two levels of QR: one per SET button (encodes the set's
// current checkbox selection → storefront ?center=&set=&only=) and one per FORM
// (point issuance). `pending` slots show as a disabled "coming soon" row and are
// never included. QR = qrcode.react (client-side, no external calls).
import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { SHOWCASE_ORIGIN } from '@/config/showcaseLinks'

const GREEN = '#0f4c35'
const SETS: { key: string; label: string; sub: string }[] = [
  { key: 'starter', label: 'Starter', sub: 'New family' },
  { key: 'toddler_preschool', label: 'Toddler / Preschool', sub: 'Returning · addressed' },
  { key: 'infant', label: 'Infants', sub: 'Returning · addressed' },
]

type Slot = { key: string; section?: 'mandatory' | 'if_applicable'; label?: string; note?: string; pending?: boolean; handout?: boolean; group?: string }
type FormRec = { current?: string | null; versions?: Record<string, string>; fallbackUrl?: string | null; title?: string }
type Registry = { forms?: Record<string, FormRec>; packets?: Record<string, { title?: string; mode?: string; slots?: Slot[] }> }

function formUrl(reg: Registry | null, key: string): string | null {
  const f = reg?.forms?.[key]
  if (!f) return null
  const pick = (v?: string | null) => (v && v !== 'PENDING' && /^https?:/.test(v) ? v : null)
  return pick(f.current ? f.versions?.[f.current] : null) || pick(f.fallbackUrl) ||
    (f.versions ? (Object.values(f.versions).map(pick).find(Boolean) ?? null) : null)
}
function withCenter(url: string, slug: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'center=' + encodeURIComponent(slug)
}

export default function AddChildPacketPanel({ center, onClose }: { center: { id: string; name: string; slug: string }; onClose: () => void }) {
  const [reg, setReg] = useState<Registry | null>(null)
  const [active, setActive] = useState<string>('starter')
  // Per-set checkbox selection, initialised to each set's mandatory (non-pending) slots.
  const [checkedBySet, setCheckedBySet] = useState<Record<string, Set<string>>>({})
  const [popup, setPopup] = useState<{ title: string; url: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((j: Registry | null) => {
        if (cancelled || !j) return
        setReg(j)
        const init: Record<string, Set<string>> = {}
        SETS.forEach(s => {
          const slots = j.packets?.[s.key]?.slots ?? []
          init[s.key] = new Set(slots.filter(sl => !sl.pending && sl.section !== 'if_applicable').map(sl => sl.key))
        })
        setCheckedBySet(init)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const slots: Slot[] = useMemo(() => reg?.packets?.[active]?.slots ?? [], [reg, active])
  const checked = checkedBySet[active] ?? new Set<string>()

  // Storefront link for a set = its current checkbox selection (only=), pending excluded.
  function storefrontFor(setKey: string): string {
    const sel = Array.from(checkedBySet[setKey] ?? []).filter(Boolean)
    const base = `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(center.slug)}&set=${encodeURIComponent(setKey)}`
    return sel.length ? `${base}&only=${sel.map(encodeURIComponent).join(',')}` : base
  }
  const activeStorefront = storefrontFor(active)

  function toggle(key: string) {
    setCheckedBySet(prev => {
      const next = new Set(prev[active] ?? [])
      next.has(key) ? next.delete(key) : next.add(key)
      return { ...prev, [active]: next }
    })
  }

  const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(10,20,15,0.55)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '30px 14px' }
  const sheet: React.CSSProperties = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, boxShadow: '0 24px 70px rgba(0,0,0,0.28)', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, Arial, sans-serif" }
  const tab = (on: boolean): React.CSSProperties => ({ flex: 1, minWidth: 150, textAlign: 'left', border: `1.5px solid ${on ? GREEN : '#d1fae5'}`, background: on ? '#f0f7f4' : '#fff', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' })
  const miniQR = (title: string, url: string, size = 40) => (
    <span title="Scan / share" onClick={e => { e.stopPropagation(); setPopup({ title, url }) }}
      style={{ cursor: 'pointer', lineHeight: 0, border: '1.5px solid #d1fae5', borderRadius: 8, padding: 3, background: '#fff', flex: '0 0 auto' }}>
      <QRCodeCanvas value={url} size={256} level="M" marginSize={0} style={{ width: size, height: size, display: 'block' }} />
    </span>
  )

  return (
    <div style={ov} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={{ background: GREEN, color: '#fff', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Add Child — enrollment packet</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>{center.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {/* Set switcher — each button carries a mini-QR of its current selection */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {SETS.map(s => (
              <div key={s.key} style={tab(active === s.key)} onClick={() => setActive(s.key)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: active === s.key ? GREEN : '#14251b' }}>{s.label}{s.key === 'starter' && <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#e6f2ec', borderRadius: 999, padding: '1px 6px', marginLeft: 6 }}>default</span>}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{s.sub}</div>
                  </div>
                  {reg && miniQR(`${s.label} packet`, storefrontFor(s.key), 34)}
                </div>
              </div>
            ))}
          </div>

          {!reg ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 4px' }}>Loading…</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', margin: '14px 2px 8px' }}>
                {reg.packets?.[active]?.mode === 'anonymous'
                  ? 'Anonymous — the family fills on-site or on their phone.'
                  : 'Addressed — pick the composition for this child. Uncheck anything already on file.'}
              </div>

              {/* Full packet — one master check toggles every non-pending row on;
                  clicking again resets to the set's mandatory default. */}
              {(() => {
                const selectable = slots.filter(s => !s.pending)
                const allOn = selectable.length > 0 && selectable.every(s => checked.has(s.key))
                const toggleAll = () => setCheckedBySet(prev => ({
                  ...prev,
                  [active]: allOn
                    ? new Set(slots.filter(s => !s.pending && s.section !== 'if_applicable').map(s => s.key))
                    : new Set(selectable.map(s => s.key)),
                }))
                return (
                  <button onClick={toggleAll} style={{ display: 'flex', alignItems: 'center', gap: 9, alignSelf: 'flex-start', margin: '0 2px 10px', padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${allOn ? GREEN : '#c9d3cd'}`, background: allOn ? GREEN : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1 }}>{allOn ? '✓' : ''}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: allOn ? GREEN : '#374151' }}>Full packet — select every form</span>
                  </button>
                )
              })()}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {slots.map(s => {
                  const label = s.label || reg.forms?.[s.key]?.title || s.key
                  const url = formUrl(reg, s.key)
                  const link = url ? withCenter(url, center.slug) : null
                  if (s.pending) return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px dashed #e5e7eb', borderRadius: 11, padding: '11px 14px', background: '#fafafa', opacity: 0.75 }}>
                      <span style={{ width: 19, height: 19, borderRadius: 5, border: '1.5px solid #d1d5db', flex: '0 0 auto' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#6b7280' }}>{label}</div>
                        <div style={{ fontSize: 11.5, color: '#9ca3af' }}>Coming soon — not part of the packet yet.</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 8px' }}>soon</span>
                    </div>
                  )
                  const on = checked.has(s.key)
                  return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${on ? '#d1fae5' : '#eef0ee'}`, borderRadius: 11, padding: '11px 14px', background: on ? '#fff' : '#fafbfa' }}>
                      <button onClick={() => toggle(s.key)} aria-label={on ? 'Remove' : 'Add'} style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${on ? GREEN : '#c9d3cd'}`, background: on ? GREEN : '#fff', color: '#fff', cursor: 'pointer', flex: '0 0 auto', fontSize: 12, lineHeight: 1, padding: 0 }}>{on ? '✓' : ''}</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#14251b', lineHeight: 1.2 }}>
                          {label}
                          {s.handout && <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px', marginLeft: 7 }}>print &amp; hand</span>}
                          {s.section === 'if_applicable' && <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 999, padding: '1px 7px', marginLeft: 7 }}>if applicable</span>}
                        </div>
                        {s.note && <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{s.note}</div>}
                      </div>
                      {s.handout && link ? (
                        <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: GREEN, textDecoration: 'none', flex: '0 0 auto' }}>🖨 Print</a>
                      ) : link ? miniQR(label, link, 40) : (
                        <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', flex: '0 0 auto' }}>no link</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Whole-set storefront actions (one solid CTA) */}
              <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <a href={activeStorefront} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 160, padding: '10px 14px', borderRadius: 10, background: GREEN, color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 14, textAlign: 'center' }}>Open packet ↗</a>
                <button onClick={() => navigator.clipboard?.writeText(activeStorefront)} style={{ padding: '10px 14px', borderRadius: 10, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>Copy link</button>
                {miniQR(`${SETS.find(s => s.key === active)?.label} packet`, activeStorefront, 40)}
              </div>
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 12, lineHeight: 1.5 }}>
                Returning family? Find them with search (incl. archived) and send an addressed packet — same mechanism, arriving with Resume Family.
              </div>
            </>
          )}
        </div>
      </div>

      {/* full-size QR popup */}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,15,0.6)', zIndex: 3100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>{popup.title}</div>
            <QRCodeCanvas value={popup.url} size={240} level="M" marginSize={2} style={{ width: 240, height: 240 }} />
            <div style={{ fontSize: 10.5, color: '#6b7280', wordBreak: 'break-all', margin: '10px 0 14px', fontFamily: 'ui-monospace, Menlo, monospace' }}>{popup.url}</div>
            <button onClick={() => setPopup(null)} style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: GREEN, border: 'none', borderRadius: 10, padding: '10px 22px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
