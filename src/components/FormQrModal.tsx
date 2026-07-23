// FormQrModal — one per-FORM QR surface, shared by every place a form is listed
// (Documents → Library cards, the Packet-Sets builder, the Documents upload page).
//
// The QR/link is ALWAYS the storefront `only=` card (never a raw file URL) and ALWAYS carries
// `?center=` — a family never picks a center. When a center is already active it shows that
// center's QR straight away; with no active center (Organization view) it asks which center
// first — same mechanic as a packet set. Only forms with a storefront URL get here; print-only
// / code-gen documents pass `null` and simply don't render the button.

import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { storefrontOnlyUrl } from '@/config/showcaseLinks'

const GREEN = '#0f4c35'
export type QrCenter = { name: string; slug: string | null | undefined }

export function FormQrModal({ formKey, title, centers, presetSlug, onClose }: {
  formKey: string; title: string; centers: QrCenter[]; presetSlug?: string | null; onClose: () => void
}) {
  const withSlug = centers.filter(c => !!c.slug) as { name: string; slug: string }[]
  const [slug, setSlug] = useState<string | null>(presetSlug || (withSlug.length === 1 ? withSlug[0].slug : null))
  const url = slug ? storefrontOnlyUrl(slug, formKey) : null
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h) }, [onClose])

  const download = () => {
    const c = document.getElementById('fqm-qr')?.querySelector('canvas') as HTMLCanvasElement | null
    if (!c) return
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `qr-${formKey}-${slug}.png`; a.click()
  }
  return (
    <div onClick={onClose} style={ov}>
      <div onClick={e => e.stopPropagation()} style={sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0a3320' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        {/* center picker: shown when no center yet, or to switch when more than one is available */}
        {(withSlug.length > 1 || !slug) && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12.5, color: '#374151', marginRight: 8 }}>Center for this QR:</label>
            <select value={slug ?? ''} onChange={e => { setSlug(e.target.value || null); setNote(null) }} style={ctl}>
              <option value="">— pick a center —</option>
              {withSlug.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>The link carries <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>?center=</code> — a family never picks a center.</div>
          </div>
        )}

        {!url ? (
          <div style={{ padding: '18px 8px', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>Pick a center to build the QR.</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div id="fqm-qr" style={{ background: '#fff', padding: 8, border: '1px solid #e4e8e4', borderRadius: 10 }}>
              <QRCodeCanvas value={url} size={512} level="M" marginSize={2} style={{ width: 176, height: 176, display: 'block' }} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 5 }}>Scan or share — opens just this form, pre-scoped to the center:</div>
              <code style={{ fontSize: 11, color: GREEN, wordBreak: 'break-all', display: 'block', marginBottom: 10 }}>{url}</code>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => { navigator.clipboard?.writeText(url); setNote('Link copied.') }} style={btn}>🔗 Copy link</button>
                <button onClick={download} style={btn}>⬇ Download QR</button>
              </div>
              {note && <div style={{ fontSize: 12, color: GREEN, marginTop: 8 }}>{note}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ov: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(10,20,15,0.55)', zIndex: 3200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const sheet: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 470, boxShadow: '0 24px 70px rgba(0,0,0,0.28)', fontFamily: "'DM Sans', system-ui, sans-serif" }
const ctl: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', minWidth: 170 }
const btn: React.CSSProperties = { font: 'inherit', fontSize: 13, fontWeight: 600, color: '#1a5c3f', background: '#f0f7f4', border: '1px solid #d1fae5', borderRadius: 9, padding: '8px 12px', cursor: 'pointer' }
