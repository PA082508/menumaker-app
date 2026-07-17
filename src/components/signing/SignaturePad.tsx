import { useState } from 'react'

// ============================================================
// SignaturePad — the drawing surface, extracted from AckSignModal so the
// director's countersignature and the JD acknowledgment share ONE pad. Copying
// it would have been a fork without a merge: the next fix would land in one
// copy and not the other (platform-standards, «скопированная константа стиля»).
//
// It draws and reports; it does not decide WHOSE signature this is or WHERE it
// goes. The shelf (parent / staff / director) is the caller's business — see
// signatureSamples.ts. A pad that guessed its own scope is how a staff pad once
// offered a parent's signature.
// ============================================================

export interface SignaturePadProps {
  /** Called on every stroke change: the PNG data URL, or null once cleared. */
  onChange: (png: string | null) => void
  height?: number
  /** Shown under the pad, e.g. "Sign as Sonia Texidor, Director". */
  hint?: string
  disabled?: boolean
}

const W = 480

export default function SignaturePad({ onChange, height = 140, hint, disabled }: SignaturePadProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)

  function getPos(e: any, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - r.left) * (c.width / r.width), y: (src.clientY - r.top) * (c.height / r.height) }
  }

  const begin = (e: any) => {
    if (disabled || !canvas) return
    setDrawing(true)
    const p = getPos(e, canvas)
    const ctx = canvas.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  const move = (e: any) => {
    if (disabled || !drawing || !canvas) return
    const p = getPos(e, canvas)
    const ctx = canvas.getContext('2d')!
    ctx.lineTo(p.x, p.y); ctx.stroke()
    if (!hasSig) setHasSig(true)
    onChange(canvas.toDataURL('image/png'))
  }
  const end = () => setDrawing(false)

  function clear() {
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, W, height)
    setHasSig(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={node => {
          setCanvas(node)
          if (node) {
            const ctx = node.getContext('2d')!
            ctx.strokeStyle = '#0f4c35'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
          }
        }}
        width={W} height={height}
        style={{
          width: '100%', height, borderRadius: 10, background: disabled ? '#f3f4f6' : '#fafff9',
          border: `2px ${hasSig ? 'solid #0f4c35' : 'dashed #d1fae5'}`,
          cursor: disabled ? 'not-allowed' : 'crosshair', touchAction: 'none', display: 'block',
        }}
        onMouseDown={begin} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={e => { e.preventDefault(); begin(e) }}
        onTouchMove={e => { e.preventDefault(); move(e) }}
        onTouchEnd={end}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button type="button" onClick={clear} disabled={disabled || !hasSig}
          style={{
            padding: '6px 14px', fontSize: 12, borderRadius: 6, background: '#f3f4f6',
            border: 'none', cursor: hasSig && !disabled ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>Clear</button>
        <span style={{ fontSize: 11, color: hasSig ? '#059669' : '#9ca3af' }}>
          {hasSig ? '✓ Captured' : (hint ?? 'Sign above')}
        </span>
      </div>
    </div>
  )
}
