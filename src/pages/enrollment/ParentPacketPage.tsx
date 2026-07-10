// ParentPacketPage.tsx — "Issue enrollment packet to a parent" (Phase 1).
//
// One page / one action: for a center, assemble the parent enrollment packet
//   Parent Consent (E-Sign) v1 → CACFP Enrollment v9 → Income Eligibility v6
// with every link + QR pre-scoped to that center (?center=<slug>) so a family
// never picks a center. Plus the whole-packet storefront link and a printable
// QR-pack (one QR per center). Prefill across the packet is automatic — the
// forms share the kit session-packet (data-fk-field), carrying answers forward
// and never overwriting a field the parent already touched.
//
// Registry-driven: form URLs come from enroll-registry.json (forms[key].current
// → versions[current]). Consent is DARK (current:null) until the gate-smoke flip
// — shown with a "Not live yet" badge but still linkable for smoke-testing.

import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useOrg } from '@/contexts/OrgContext'
import { SHOWCASE_ORIGIN } from '@/config/showcaseLinks'

const GREEN = '#0f4c35'

// Ordered packet — the Child-enrollment scenario (consent first = signature adoption).
const PACKET = [
  { key: 'parent_consent', label: 'Parent Consent (E-Sign)', note: 'Signed first — adopts the parent signature for the packet.' },
  { key: 'enroll',         label: 'CACFP Enrollment',        note: 'Days, hours and meals in care. One per child, yearly.' },
  { key: 'iea',            label: 'Income Eligibility (IEA)', note: 'Free / reduced-price eligibility. One per household.' },
] as const

type Registry = {
  forms?: Record<string, { current?: string | null; versions?: Record<string, string>; fallbackUrl?: string; title?: string }>
}

function formUrl(reg: Registry | null, key: string): { url: string | null; live: boolean } {
  const f = reg?.forms?.[key]
  if (!f) return { url: null, live: false }
  const cur = f.current
  const live = !!cur
  const url = (cur && f.versions?.[cur]) || f.fallbackUrl || (f.versions ? Object.values(f.versions)[0] : null) || null
  return { url, live }
}

function withCenter(url: string, slug: string | null | undefined): string {
  if (!slug) return url
  return url + (url.includes('?') ? '&' : '?') + 'center=' + encodeURIComponent(slug)
}

// Pull the <canvas> a QRCodeCanvas rendered (by wrapper id) → PNG download.
function downloadQR(wrapperId: string, filename: string) {
  const canvas = document.getElementById(wrapperId)?.querySelector('canvas') as HTMLCanvasElement | null
  if (!canvas) return
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = filename
  a.click()
}

export default function ParentPacketPage() {
  const { currentCenter, centers, isOrgAdmin } = useOrg()
  const [reg, setReg] = useState<Registry | null>(null)
  const [pickCenter, setPickCenter] = useState<string>('')  // admin org-view choice (slug)

  useEffect(() => {
    let cancelled = false
    fetch('/enroll-registry.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setReg(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Active center: the director's own center, else the admin's picked slug.
  const activeSlug = currentCenter?.slug ?? (pickCenter || null)
  const activeName = currentCenter?.name
    ?? centers.find(c => c.slug === pickCenter)?.name
    ?? null

  const packetLinks = useMemo(() => PACKET.map(p => {
    const { url, live } = formUrl(reg, p.key)
    return { ...p, url: url ? withCenter(url, activeSlug) : null, live }
  }), [reg, activeSlug])

  const storefrontUrl = activeSlug ? `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(activeSlug)}` : null

  // QR-pack: one QR per center → the whole-packet storefront for that center.
  const qrPack = centers.map(c => ({
    slug: c.slug, name: c.name,
    url: `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(c.slug)}`,
  }))

  function printPack() {
    const imgs = qrPack.map(c => {
      const canvas = document.getElementById(`qrpack-${c.slug}`)?.querySelector('canvas') as HTMLCanvasElement | null
      return { name: c.name, slug: c.slug, data: canvas?.toDataURL('image/png') || '' }
    })
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(
      `<html><head><title>Parent Packet — QR pack</title><style>
        body{font-family:'DM Sans',Arial,sans-serif;margin:24px;color:#0a3320}
        h1{font-size:18px;margin:0 0 4px} p{color:#6b7280;font-size:12px;margin:0 0 18px}
        .grid{display:flex;flex-wrap:wrap;gap:24px}
        .card{border:1px solid #d1fae5;border-radius:12px;padding:16px;text-align:center;width:240px}
        .card img{width:200px;height:200px} .card .n{font-weight:700;margin-top:8px}
        .card .u{font-size:10px;color:#6b7280;word-break:break-all;margin-top:4px}
        @media print{.card{page-break-inside:avoid}}
      </style></head><body>
      <h1>Play Academy — Parent Enrollment Packet</h1>
      <p>Scan to open the enrollment packet for your center. Each code is pre-scoped — parents never pick a center.</p>
      <div class="grid">` +
      imgs.map(i => `<div class="card"><img src="${i.data}"/><div class="n">${i.name}</div><div class="u">${i.slug}</div></div>`).join('') +
      `</div></body></html>`
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' }
  const openBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: GREEN, color: '#fff', textDecoration: 'none', textAlign: 'center', fontFamily: 'inherit', display: 'inline-block' }
  const ghost: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, fontSize: 13, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div style={{ padding: '28px 24px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>ENROLLMENT</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0a3320', margin: 0 }}>Issue packet to a parent</h1>
      <p style={{ margin: '4px 0 18px', color: '#6b7280', fontSize: 13 }}>
        Consent → CACFP Enrollment → Income Eligibility, every link & QR pre-scoped to one center. Share the link or the QR — the family never picks a center, and answers carry forward across the packet.
      </p>

      {/* Center scope */}
      {currentCenter ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#166534' }}>
          <span style={{ fontWeight: 700 }}>📍 {currentCenter.name}</span>
          <span style={{ color: '#15803d' }}>— this packet is scoped to your center (<code style={{ background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>?center={currentCenter.slug}</code>).</span>
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Choose a center to scope the packet</label>
          <select value={pickCenter} onChange={e => setPickCenter(e.target.value)}
            style={{ padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">Select…</option>
            {centers.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
      )}

      {!activeSlug ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb' }}>
          {isOrgAdmin ? 'Pick a center above to build the packet.' : 'No center in scope.'}
        </div>
      ) : (
        <>
          {/* Whole-packet storefront link */}
          {storefrontUrl && (
            <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0a3320' }}>The full packet — one page</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Storefront listing all forms for {activeName}. Best link to text or email a parent.</div>
              </div>
              <a href={storefrontUrl} target="_blank" rel="noreferrer" style={openBtn}>Open packet ↗</a>
              <button style={ghost} onClick={() => navigator.clipboard?.writeText(storefrontUrl)}>Copy link</button>
            </div>
          )}

          {/* Per-form cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14, marginBottom: 24 }}>
            {packetLinks.map((p, i) => (
              <div key={p.key} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0a3320' }}>{p.label}</span>
                  {!p.live && <span title="Registered but not flipped live yet" style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: 6 }}>DARK · not live</span>}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{p.note}</div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.url ? (
                    <>
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ ...openBtn, flex: 1 }}>Open ↗</a>
                      <div id={`qr-${p.key}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <QRCodeCanvas value={p.url} size={256} level="M" marginSize={2} style={{ width: 76, height: 76 }} />
                        <button style={{ ...ghost, padding: '2px 8px', fontSize: 11 }} onClick={() => downloadQR(`qr-${p.key}`, `${p.key}-${activeSlug}.png`)}>QR ↓</button>
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Link unavailable</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* QR-pack — one QR per center */}
          <div style={{ ...card }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0a3320' }}>QR pack — all centers</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Print and post at each center. Every code opens that center's packet.</div>
              </div>
              <button style={{ ...openBtn, cursor: 'pointer', border: 'none' }} onClick={printPack}>🖨 Print QR pack</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {qrPack.map(c => (
                <div key={c.slug} id={`qrpack-${c.slug}`} style={{ textAlign: 'center', border: '1px solid #d1fae5', borderRadius: 10, padding: 12, width: 168 }}>
                  <QRCodeCanvas value={c.url} size={256} level="M" marginSize={2} style={{ width: 132, height: 132 }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0a3320', marginTop: 8 }}>{c.name}</div>
                  <button style={{ ...ghost, padding: '3px 10px', fontSize: 11, marginTop: 6 }} onClick={() => downloadQR(`qrpack-${c.slug}`, `packet-${c.slug}.png`)}>Download</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
