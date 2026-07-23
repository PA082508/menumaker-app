// HelpVideo — the two-tier help-video surface (see docs/videos/eforms-directors-shotlist.md
// and the placement scheme). The SAME asset shows two ways:
//   • HelpVideoBadge — a compact "▶ 0:30" chip for a working page header; click = popover player,
//     no poster on the working screen. One consistent spot across pages.
//   • HelpVideoCard — a rich card (poster + inline player) for the Document Hub / guides.
// Both: local <video>, no autoplay, EN voice + burned & soft subtitles. Assets in /public/videos.
//
// Pilot = one video ("E-Forms for Directors"). For the series, pass `video` per page; the pilot
// defaults to EFORMS so the two call-sites stay one-liners.

import { useEffect, useRef, useState } from 'react'

export type HelpVideoMeta = {
  id: string; title: string; duration: string
  webm: string; mp4: string; poster: string; blurb: string
}
export const EFORMS: HelpVideoMeta = {
  id: 'eforms-directors',
  title: 'E-Forms for Directors',
  duration: '0:30',
  webm: '/videos/eforms-directors.webm',
  mp4: '/videos/eforms-directors.mp4',
  poster: '/videos/eforms-directors-poster.jpg',
  blurb: 'How families fill & sign on their phone, and how you review and approve what comes back.',
}

const GREEN = '#0f4c35'

function Player({ v, width, autoPlay }: { v: HelpVideoMeta; width?: number | string; autoPlay?: boolean }) {
  return (
    <video controls autoPlay={autoPlay} preload="metadata" poster={v.poster}
      style={{ width: width ?? '100%', maxWidth: '100%', aspectRatio: '16 / 10', borderRadius: 10, background: '#000', display: 'block' }}>
      <source src={v.webm} type="video/webm" />
      <source src={v.mp4} type="video/mp4" />
    </video>
  )
}

// ── Tier 2: compact header badge + popover (working pages) ────────────────────
export function HelpVideoBadge({ video = EFORMS }: { video?: HelpVideoMeta }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setOpen(o => !o)} title={`Watch: ${video.title} (${video.duration})`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'inherit', fontSize: 12.5, fontWeight: 700,
          color: GREEN, background: '#eaf5ef', border: '1px solid #cdeadb', borderRadius: 999, padding: '4px 11px', cursor: 'pointer', lineHeight: 1 }}>
        ▶ {video.duration}
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 4000,
          width: 380, maxWidth: '90vw', background: '#fff', border: '1px solid #e4e8e4', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.22)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0a3320' }}>{video.title} · <span style={{ color: '#6b7280', fontWeight: 500 }}>{video.duration} · 🔊 EN voice + subtitles</span></span>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: '#6b7280' }}>×</button>
          </div>
          <Player v={video} autoPlay />
        </div>
      )}
    </span>
  )
}

// ── Tier 1: rich card (Document Hub / guides) ─────────────────────────────────
export function HelpVideoCard({ video = EFORMS }: { video?: HelpVideoMeta }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Player v={video} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>{video.title}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: '#dcfce7', borderRadius: 20, padding: '2px 8px' }}>▶ {video.duration}</span>
        <span style={{ fontSize: 10.5, color: '#6b7280' }}>🔊 EN voice + subtitles</span>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>{video.blurb}</div>
    </div>
  )
}
