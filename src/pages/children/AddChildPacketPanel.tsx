// AddChildPacketPanel.tsx — "Add Child" = the packet-set screen (director tool).
//
// Packet sets resolved from the registry (packets.<set>.slots) — composition & order
// are DATA, not code, and are FIXED by the set (no per-form checkboxes: a director
// combines READY sets, they don't tick a subset). The set button's QR/link is the
// whole set → storefront ?center=&set= (the storefront resolves the composition and
// handles if_applicable). A per-FORM QR stays for point issuance. `pending` slots show
// as a disabled "coming soon" row. QR = qrcode.react (client-side, no external calls).
import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { storefrontOnlyUrl, storefrontPacketUrl } from '@/config/showcaseLinks'

const GREEN = '#0f4c35'
const SETS: { key: string; label: string; sub: string }[] = [
  { key: 'starter', label: 'Starter', sub: 'New family' },
  { key: 'toddler_preschool', label: 'Toddler / Preschool', sub: 'Returning · addressed' },
  { key: 'infant', label: 'Infants', sub: 'Returning · addressed' },
  { key: 'school_age', label: 'School-Age', sub: 'Returning · addressed' },
]

// An "all centers" DB set (packet_sets, origin_id != null) rendered as a tile of the SAME
// class as the four above — DB-driven, not hardcoded. This center's own copy carries its own
// id, so its storefront link (?center=&set=<copy id>) is a permanent per-center QR. The
// storefront resolves the composition live (resolve_packet_set), so the tile needs no
// composition of its own — the whole-set Open/Copy/QR just carries the copy id.
type DbSet = { id: string; name: string; form_keys: string[] }
// Subtitle: Renewal gets its agreed line; any other all-centers set gets a generic one.
function dbSetSub(name: string): string {
  return name.trim().toLowerCase() === 'renewal' ? 'Existing families · annual refresh' : 'All centers · office packet'
}

type Slot = { key: string; section?: 'mandatory' | 'if_applicable'; label?: string; note?: string; pending?: boolean; handout?: boolean; group?: string }
type FormRec = { current?: string | null; versions?: Record<string, string | Record<string, string>>; fallbackUrl?: string | null; title?: string }
type Registry = { forms?: Record<string, FormRec>; packets?: Record<string, { title?: string; mode?: string; slots?: Slot[] }> }

// A version is either ONE url for everyone (string) or an object keyed by center slug
// when each center has its own copy — the Parent Handbook carries each center's address,
// licence and administrator. Without the object case this returned null for it and the
// panel showed the handbook as "no link".
function formUrl(reg: Registry | null, key: string, slug: string): string | null {
  const f = reg?.forms?.[key]
  if (!f) return null
  const pick = (v?: unknown): string | null =>
    (typeof v === 'string' && v !== 'PENDING' && /^https?:/.test(v) ? v : null)
  const resolve = (v?: unknown): string | null =>
    (v && typeof v === 'object' ? pick((v as Record<string, string>)[slug]) : pick(v))
  return resolve(f.current ? f.versions?.[f.current] : null) || pick(f.fallbackUrl) ||
    (f.versions ? (Object.values(f.versions).map(resolve).find(Boolean) ?? null) : null)
}
function withCenter(url: string, slug: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'center=' + encodeURIComponent(slug)
}

export default function AddChildPacketPanel({ center, onClose }: { center: { id: string; name: string; slug: string }; onClose: () => void }) {
  const [reg, setReg] = useState<Registry | null>(null)
  const [active, setActive] = useState<string>('starter')
  const [popup, setPopup] = useState<{ title: string; url: string } | null>(null)
  const [dbSets, setDbSets] = useState<DbSet[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((j: Registry | null) => { if (!cancelled && j) setReg(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // "All centers" sets for THIS center (packet_sets copies: origin_id set, active only —
  // archived stays out of the picker). RLS already scopes to the center; the filter mirrors it.
  useEffect(() => {
    let cancelled = false
    supabase.schema('menumaker').from('packet_sets')
      .select('id,name,form_keys')
      .eq('center_id', center.id)
      .not('origin_id', 'is', null)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        // A failed read must not read as "no sets" — but an empty result legitimately means
        // none exist yet (no all-centers set created). On error, just leave the picker as the
        // legacy four rather than inventing tiles.
        if (cancelled || error) return
        setDbSets((data ?? []) as DbSet[])
      })
    return () => { cancelled = true }
  }, [center.id])

  const activeDb = useMemo(() => dbSets.find(s => s.id === active) ?? null, [dbSets, active])
  // A DB set's composition is its form_keys (each a bare {key} slot — the storefront resolves
  // the rest); a legacy set reads its slots from the registry. Same renderer for both.
  const slots: Slot[] = useMemo(
    () => activeDb ? activeDb.form_keys.map(k => ({ key: k })) : (reg?.packets?.[active]?.slots ?? []),
    [reg, active, activeDb],
  )

  // A set's link/QR is the WHOLE set (?center=&set=) — composition is fixed by the set,
  // not by per-form selection; the storefront resolves it and filters if_applicable.
  const storefrontFor = (setKey: string) => storefrontPacketUrl(center.slug, setKey)
  const activeStorefront = storefrontFor(active)

  const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(10,20,15,0.55)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '30px 14px' }
  const sheet: React.CSSProperties = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, boxShadow: '0 24px 70px rgba(0,0,0,0.28)', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, Arial, sans-serif" }
  const tab = (on: boolean): React.CSSProperties => ({ textAlign: 'left', border: `1.5px solid ${on ? GREEN : '#d1fae5'}`, background: on ? '#f0f7f4' : '#fff', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' })
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
          {/* Equal grid — 2 columns → 4 sets read as a clean 2×2, not "3 + a full-width
              strip". >4 sets (future custom) wrap into equal 2-wide rows, never a lone
              stretched tile. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
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
            {/* All-centers DB sets (e.g. Renewal) — same tile class, DB-driven. Its own per-center
                copy id → permanent storefront QR. Honest composition badge ("0 forms" until filled). */}
            {dbSets.map(s => (
              <div key={s.id} style={tab(active === s.id)} onClick={() => setActive(s.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: active === s.id ? GREEN : '#14251b' }}>
                      {s.name}
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#155e75', background: '#cffafe', borderRadius: 999, padding: '1px 6px', marginLeft: 6 }}>all centers</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{dbSetSub(s.name)} · {s.form_keys.length} form{s.form_keys.length === 1 ? '' : 's'}</div>
                  </div>
                  {reg && miniQR(`${s.name} packet`, storefrontFor(s.id), 34)}
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
                  : 'This packet’s forms are fixed by the set. Share the whole packet below, or a single form’s QR.'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeDb && slots.length === 0 && (
                  <div style={{ fontSize: 12.5, color: '#9ca3af', fontStyle: 'italic', padding: '11px 14px', background: '#fafafa', border: '1px dashed #e5e7eb', borderRadius: 11 }}>
                    This set has no forms yet — the office is still filling it. The link and QR below already work and will serve whatever gets added.
                  </div>
                )}
                {slots.map(s => {
                  const label = s.label || reg.forms?.[s.key]?.title || s.key
                  // The FILE (director-facing: Print a handout). Never QR-encoded.
                  const fileLink = (() => { const u = formUrl(reg, s.key, center.slug); return u ? withCenter(u, center.slug) : null })()
                  // The QR/share target: always the storefront only= card, so a scan
                  // follows registry `current` instead of freezing today's version.
                  const link = fileLink ? storefrontOnlyUrl(center.slug, s.key) : null
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
                  return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #e6f2ec', borderRadius: 11, padding: '11px 14px', background: '#fff' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#14251b', lineHeight: 1.2 }}>
                          {label}
                          {s.handout && <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px', marginLeft: 7 }}>print &amp; hand</span>}
                          {s.section === 'if_applicable' && <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 999, padding: '1px 7px', marginLeft: 7 }}>if applicable</span>}
                        </div>
                        {s.note && <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{s.note}</div>}
                      </div>
                      {s.handout && fileLink ? (
                        <a href={fileLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: GREEN, textDecoration: 'none', flex: '0 0 auto' }}>🖨 Print</a>
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
                {miniQR(`${activeDb?.name ?? SETS.find(s => s.key === active)?.label} packet`, activeStorefront, 40)}
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
