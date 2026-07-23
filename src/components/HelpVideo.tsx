// HelpVideo — the two-tier help-video surface (placement scheme in memory).
//   • HelpVideoBadge — a bold YouTube-style RED "▶ 0:30" chip for a working-page header;
//     click = popover player. One consistent spot across pages.
//   • HelpVideoCard — a rich card (poster + inline player) for the Document Hub / guides.
// Unified RED video language: the same red ▶ appears on the badge and as the play overlay on
// every player (card + popover). No autoplay, no pulse/blink. Assets in /public/videos.

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

const RED = '#E53935', RED_DARK = '#C62828'

// :hover needs real CSS — inline styles can't do it. One small stylesheet, shared.
const CSS = `
.hv-badge{display:inline-flex;align-items:center;gap:7px;background:${RED};color:#fff;border:none;border-radius:10px;padding:7px 14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;line-height:1;box-shadow:0 2px 8px rgba(229,57,53,.35);transition:transform .12s ease,background .12s ease}
.hv-badge:hover{background:${RED_DARK};transform:scale(1.05)}
.hv-badge .tri{font-size:11px;line-height:1}
.hv-chip{display:inline-flex;align-items:center;gap:5px;background:${RED};color:#fff;border-radius:20px;padding:2px 9px;font-size:10.5px;font-weight:800}
.hv-chip .tri{font-size:8px}
.hv-wrap{position:relative;width:100%;max-width:100%}
.hv-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:62px;height:62px;border-radius:50%;background:${RED};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:transform .12s ease,background .12s ease;padding:0}
.hv-play:hover{background:${RED_DARK};transform:translate(-50%,-50%) scale(1.08)}
.hv-play .tri{font-size:24px;margin-left:4px;line-height:1}
`

function Player({ video, width }: { video: HelpVideoMeta; width?: number | string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  return (
    <div className="hv-wrap" style={{ width: width ?? '100%' }}>
      <video ref={ref} controls preload="metadata" poster={video.poster}
        onPlay={() => setStarted(true)} onEnded={() => setStarted(false)}
        style={{ width: '100%', aspectRatio: '16 / 10', borderRadius: 10, background: '#000', display: 'block' }}>
        <source src={video.webm} type="video/webm" />
        <source src={video.mp4} type="video/mp4" />
      </video>
      {!started && (
        <button className="hv-play" aria-label={`Play: ${video.title}`} onClick={() => ref.current?.play()}>
          <span className="tri">▶</span>
        </button>
      )}
    </div>
  )
}

// ── Tier 2: bold red header badge + popover (working pages) ───────────────────
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
      <style>{CSS}</style>
      <button className="hv-badge" onClick={() => setOpen(o => !o)} title={`Watch: ${video.title} (${video.duration})`}>
        <span className="tri">▶</span> {video.duration}
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 4000,
          width: 380, maxWidth: '90vw', background: '#fff', border: '1px solid #e4e8e4', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.22)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0a3320' }}>{video.title} · <span style={{ color: '#6b7280', fontWeight: 500 }}>{video.duration} · 🔊 EN voice + subtitles</span></span>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: '#6b7280' }}>×</button>
          </div>
          <Player video={video} />
        </div>
      )}
    </span>
  )
}

// ── Tier 1: rich card (Document Hub / guides) ─────────────────────────────────
export function HelpVideoCard({ video = EFORMS }: { video?: HelpVideoMeta }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{CSS}</style>
      <Player video={video} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>{video.title}</span>
        <span className="hv-chip"><span className="tri">▶</span>{video.duration}</span>
        <span style={{ fontSize: 10.5, color: '#6b7280' }}>🔊 EN voice + subtitles</span>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>{video.blurb}</div>
    </div>
  )
}
