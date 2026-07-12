// ParentPacketPage.tsx — "Issue the admission packet to a parent" (director tool).
//
// One page / one action: for a center, assemble the full admission packet — the
// Required forms (Parent Consent → DCY 01234 → CACFP v9 → IEA v6 → Child Release →
// Parent Responsibilities → Center Parent Info → What To Bring) followed by the
// "If applicable" forms (infant / special-diet groups) and the director-issued
// in-person forms — with every link + QR pre-scoped to that center (?center=<slug>)
// so a family never picks a center. Plus the whole-packet storefront link and a
// printable QR-pack (one QR per center).
//
// Registry-driven: composition AND order come from enroll-registry.json
// (packets.admission.slots); form URLs from forms[key].current → versions[current].
// This is DATA — editing the packet is a registry change, no code change. Interim
// (dcy_01234 PDF) and dark (dcy_01217/01236, usda_waiver) slots resolve automatically
// and light up when their `current` is flipped live.

import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useOrg } from '@/contexts/OrgContext'
import { SHOWCASE_ORIGIN } from '@/config/showcaseLinks'

const GREEN = '#0f4c35'

type Slot = {
  key: string
  section: 'mandatory' | 'if_applicable'
  label?: string
  note?: string
}
type Condition = { title?: string; issue?: string }
type FormRec = { current?: string | null; versions?: Record<string, string>; fallbackUrl?: string | null; title?: string; note?: string; condition?: string }
type Registry = {
  forms?: Record<string, FormRec>
  conditions?: Record<string, Condition>   // the ONE condition map (titles + order + issue)
  packets?: { admission?: { title?: string; slots?: Slot[] } }
}

// Resolve a form's live URL — absolute http(s) only; PENDING / dark → null.
function formUrl(reg: Registry | null, key: string): { url: string | null; live: boolean } {
  const f = reg?.forms?.[key]
  if (!f) return { url: null, live: false }
  const live = !!f.current
  const pick = (v?: string | null) => (v && v !== 'PENDING' && /^https?:/.test(v) ? v : null)
  const url =
    pick(f.current ? f.versions?.[f.current] : null) ||
    pick(f.fallbackUrl) ||
    (f.versions ? (Object.values(f.versions).map(pick).find(Boolean) ?? null) : null)
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

type ResolvedSlot = Slot & { label: string; note: string; url: string | null; live: boolean; condition?: string; director: boolean }

export default function ParentPacketPage() {
  const { currentCenter, centers, isOrgAdmin } = useOrg()
  const [reg, setReg] = useState<Registry | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setReg(j) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Active center = the header switcher's current center (single source; no local picker).
  const activeSlug = currentCenter?.slug ?? null
  const activeName = currentCenter?.name ?? null

  // Full ordered packet, resolved to live URLs + center scope. A conditional slot's
  // group + director-line status derive from forms[key].condition + the ONE conditions map.
  const conditions = reg?.conditions ?? {}
  const slots: ResolvedSlot[] = useMemo(() => {
    const raw = reg?.packets?.admission?.slots ?? []
    return raw.map(s => {
      const { url, live } = formUrl(reg, s.key)
      const f = reg?.forms?.[s.key]
      const condition = f?.condition
      const director = !!(condition && reg?.conditions?.[condition]?.issue === 'director')
      return {
        ...s,
        label: s.label || f?.title || s.key,
        note: s.note || '',
        url: url ? withCenter(url, activeSlug) : null,
        live,
        condition,
        director,
      }
    })
  }, [reg, activeSlug])

  // If-applicable group order = conditions map key order (skip _note + director conditions).
  const condOrder = Object.keys(conditions).filter(k => k !== '_note' && conditions[k]?.issue !== 'director')
  const mandatory = slots.filter(s => s.section === 'mandatory')
  const conditional = slots.filter(s => s.section === 'if_applicable' && !s.director)
  const directorLines = slots.filter(s => s.director)

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
      `<html><head><title>Admission Packet — QR pack</title><style>
        body{font-family:'DM Sans',Arial,sans-serif;margin:24px;color:#0a3320}
        h1{font-size:18px;margin:0 0 4px} p{color:#6b7280;font-size:12px;margin:0 0 18px}
        .grid{display:flex;flex-wrap:wrap;gap:24px}
        .card{border:1px solid #d1fae5;border-radius:12px;padding:16px;text-align:center;width:240px}
        .card img{width:200px;height:200px} .card .n{font-weight:700;margin-top:8px}
        .card .u{font-size:10px;color:#6b7280;word-break:break-all;margin-top:4px}
        @media print{.card{page-break-inside:avoid}}
      </style></head><body>
      <h1>Play Academy — Admission Packet</h1>
      <p>Scan to open the admission packet for your center. Each code is pre-scoped — parents never pick a center.</p>
      <div class="grid">` +
      imgs.map(i => `<div class="card"><img src="${i.data}"/><div class="n">${i.name}</div><div class="u">${i.slug}</div></div>`).join('') +
      `</div></body></html>`
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' }
  // Library palette: exactly ONE solid fill per screen (the "Open packet ↗" CTA). Everything
  // else is a ghost link/button; status badges are muted; form names are the scan target.
  const openBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: GREEN, color: '#fff', textDecoration: 'none', textAlign: 'center', fontFamily: 'inherit', display: 'inline-block' }
  const ghost: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, fontSize: 13, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontFamily: 'inherit' }
  const openGhost: React.CSSProperties = { flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', textDecoration: 'none', textAlign: 'center', fontFamily: 'inherit', display: 'inline-block' }
  const mutedBadge: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }

  // One resolved-slot card. `num` = 1-based position for Required; null hides the bubble.
  function SlotCard({ s, num }: { s: ResolvedSlot; num: number | null }) {
    return (
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {num != null && (
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: GREEN, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{num}</span>
          )}
          {/* Form name = scan target → larger. */}
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0a3320', lineHeight: 1.25 }}>{s.label}</span>
          {!s.live && <span title="Registered but not flipped live yet" style={mutedBadge}>dark</span>}
        </div>
        {s.note && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{s.note}</div>}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {s.url ? (
            <>
              <a href={s.url} target="_blank" rel="noreferrer" style={openGhost}>Open ↗</a>
              {/* Compact QR icon — click to download the 256-res PNG. */}
              <div id={`qr-${s.key}`} title="Download QR" onClick={() => downloadQR(`qr-${s.key}`, `${s.key}-${activeSlug}.png`)}
                style={{ flex: '0 0 auto', cursor: 'pointer', lineHeight: 0, border: '1px solid #e5e7eb', borderRadius: 6, padding: 3 }}>
                <QRCodeCanvas value={s.url} size={256} level="M" marginSize={0} style={{ width: 36, height: 36, display: 'block' }} />
              </div>
            </>
          ) : (
            <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Link unavailable</span>
          )}
        </div>
      </div>
    )
  }

  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14, marginBottom: 8 }
  const sectionHead: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0a3320', margin: '22px 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }

  return (
    <div style={{ padding: '28px 24px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>ENROLLMENT</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0a3320', margin: 0 }}>Issue admission packet</h1>
      <p style={{ margin: '4px 0 18px', color: '#6b7280', fontSize: 13 }}>
        The full admission packet — Required forms in order, then the "If applicable" forms — every link & QR pre-scoped to one center. Share the link or the QR; the family never picks a center, and answers carry forward across the packet.
      </p>

      {/* Center scope — a single source: the header center switcher (no local picker). */}
      {currentCenter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: '#166534' }}>
          <span style={{ fontWeight: 700 }}>📍 {currentCenter.name}</span>
          <span style={{ color: '#15803d' }}>— this packet is scoped to your center (<code style={{ background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>?center={currentCenter.slug}</code>).</span>
        </div>
      )}

      {!activeSlug ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb' }}>
          {isOrgAdmin ? 'Pick a center in the switcher at the top to scope the packet.' : 'No center in scope.'}
        </div>
      ) : slots.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb' }}>
          Packet composition not found in the registry (packets.admission).
        </div>
      ) : (
        <>
          {/* Whole-packet storefront link */}
          {storefrontUrl && (
            <div style={{ ...card, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0a3320' }}>The full packet — one page</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Storefront listing every form for {activeName}. Best link to text or email a parent.</div>
              </div>
              <a href={storefrontUrl} target="_blank" rel="noreferrer" style={openBtn}>Open packet ↗</a>
              <button style={ghost} onClick={() => navigator.clipboard?.writeText(storefrontUrl)}>Copy link</button>
            </div>
          )}

          {/* Required */}
          <div style={sectionHead}>Required</div>
          <div style={gridStyle}>
            {mandatory.map((s, i) => <SlotCard key={s.key} s={s} num={i + 1} />)}
          </div>

          {/* If applicable — grouped by the ONE condition map (registry `conditions`) */}
          <div style={sectionHead}>If applicable</div>
          {condOrder.map(cid => {
            const group = conditional.filter(s => s.condition === cid)
            if (!group.length) return null
            return (
              <div key={cid} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '4px 0 8px' }}>{conditions[cid]?.title ?? cid}</div>
                <div style={gridStyle}>
                  {group.map(s => <SlotCard key={s.key} s={s} num={null} />)}
                </div>
              </div>
            )
          })}

          {/* Director-issued (dark, in person) */}
          {directorLines.length > 0 && (
            <div style={{ ...card, background: '#fbf7ec', border: '1px solid #e7dcc0', marginTop: 6, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6a5320', marginBottom: 6 }}>Issued by the director in person (not on the parent link)</div>
              {directorLines.map(s => (
                <div key={s.key} style={{ fontSize: 12, color: '#7a6533', lineHeight: 1.6 }}>
                  • <strong>{s.label}</strong>{s.note ? ` — ${s.note}` : ''}
                  {!s.live && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 6, marginLeft: 6 }}>dark</span>}
                </div>
              ))}
            </div>
          )}

          {/* QR-pack — one QR per center */}
          <div style={{ ...card }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0a3320' }}>QR pack — all centers</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Print and post at each center. Every code opens that center's packet.</div>
              </div>
              <button style={ghost} onClick={printPack}>🖨 Print QR pack</button>
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
