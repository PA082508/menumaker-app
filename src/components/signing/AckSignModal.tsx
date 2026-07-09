import { useState } from 'react'

// ============================================================
// AckSignModal — generic acknowledgment-and-sign flow, extracted from the BYOD
// SignModal pattern so JD acknowledgments (and later BYOD) share one component:
//   §1 intake → read-only body + ack-line confirm → signature pad + date → done.
// The body node is caller-supplied (Markdown from policy_documents for JD, static
// JSX for BYOD); onSubmit persists wherever the caller wants (staging vs byod).
// ============================================================

export interface IntakeField {
  key: string
  label: string
  type?: 'text' | 'tel'
  placeholder?: string
  options?: string[]        // present ⇒ rendered as <select>
}

export interface AckSignPayload {
  intake: Record<string, string>
  signaturePng: string      // data:image/png;base64,…
  signedAt: Date
}

export interface AckSignModalProps {
  headerTitle: string
  headerSubtitle?: string
  intake: IntakeField[]
  /** Read-only document body (Markdown-rendered node for JD, JSX for BYOD). */
  bodyNode: React.ReactNode
  bodyLoading?: boolean
  /** Confirm-checkbox label — the document's native acknowledgment line. */
  ackLine: string
  submitLabel?: string
  onSubmit: (p: AckSignPayload) => Promise<{ refId: string }>
  /** Success screen — caller renders its own confirmation body. */
  renderSuccess: (ctx: { intake: Record<string, string>; refId: string }) => React.ReactNode
  onClose: () => void
}

export default function AckSignModal(props: AckSignModalProps) {
  const { headerTitle, headerSubtitle, intake, bodyNode, bodyLoading, ackLine, submitLabel, onSubmit, renderSuccess, onClose } = props
  const [step, setStep] = useState(1)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refId, setRefId] = useState('')
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(intake.map(i => [i.key, ''])))
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)

  function getPos(e: any, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect()
    if (e.touches) return { x: (e.touches[0].clientX - r.left) * (c.width / r.width), y: (e.touches[0].clientY - r.top) * (c.height / r.height) }
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }

  const intakeComplete = intake.every(i => (f[i.key] || '').trim() !== '')

  async function submit() {
    if (!canvas || !hasSig) return
    setBusy(true)
    try {
      const png = canvas.toDataURL('image/png')
      const { refId: id } = await onSubmit({ intake: f, signaturePng: png, signedAt: new Date() })
      setRefId(id); setStep(4)
    } catch (e: any) {
      alert('Error: ' + (e?.message || 'could not save'))
    } finally {
      setBusy(false)
    }
  }

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 12px' }
  const modal: React.CSSProperties = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }
  const hdr: React.CSSProperties = { background: '#1a5c3f', color: '#fff', padding: '16px 20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginTop: 4 }
  const pb = (ok: boolean): React.CSSProperties => ({ width: '100%', padding: 13, background: ok ? '#1a5c3f' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: ok ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginTop: 12 })

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={hdr}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{headerTitle}</div>
            {headerSubtitle && <div style={{ fontSize: 12, opacity: 0.8 }}>{headerSubtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
          {['Info', 'Agreement', 'Sign', 'Done'].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '10px 4px', fontSize: 11, fontWeight: 600, color: step === i + 1 ? '#1a5c3f' : step > i + 1 ? '#059669' : '#9ca3af', borderBottom: `3px solid ${step === i + 1 ? '#1a5c3f' : step > i + 1 ? '#059669' : 'transparent'}` }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', marginRight: 4, fontSize: 10, background: step === i + 1 ? '#1a5c3f' : step > i + 1 ? '#059669' : '#e5e7eb', color: step >= i + 1 ? '#fff' : '#9ca3af' }}>{step > i + 1 ? '✓' : i + 1}</span>{s}
            </div>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          {step === 1 && <div>
            {intake.map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{field.label} *</label>
                {field.options ? (
                  <select value={f[field.key]} onChange={e => set(field.key, e.target.value)} style={inp}>
                    <option value="">Select...</option>
                    {field.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={field.type || 'text'} value={f[field.key]} onChange={e => set(field.key, e.target.value)} placeholder={field.placeholder} style={inp} />
                )}
              </div>
            ))}
            <button onClick={() => { if (!intakeComplete) { alert('Fill all fields'); return } setStep(2) }} style={pb(true)}>Continue →</button>
          </div>}
          {step === 2 && <div>
            <div style={{ height: 260, overflowY: 'auto', border: '1px solid #d1fae5', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.7, background: '#f8faf8', marginBottom: 14 }}>
              {bodyLoading ? <div style={{ color: '#6b7280' }}>Loading…</div> : bodyNode}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: 12, background: '#f0f7f4', borderRadius: 8, marginBottom: 12 }}>
              <input type="checkbox" id="ack" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#1a5c3f' }} />
              <label htmlFor="ack" style={{ fontSize: 13, cursor: 'pointer' }}>{ackLine}</label>
            </div>
            <button onClick={() => setStep(3)} disabled={!agreed} style={pb(agreed)}>Continue to Signature →</button>
            <button onClick={() => setStep(1)} style={{ width: '100%', padding: 10, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginTop: 4 }}>← Back</button>
          </div>}
          {step === 3 && <div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Sign below using finger (mobile) or mouse (desktop).</p>
            <canvas
              ref={node => { setCanvas(node); if (node) { const ctx = node.getContext('2d')!; ctx.strokeStyle = '#1a5c3f'; ctx.lineWidth = 2.5; ctx.lineCap = 'round' } }}
              width={480} height={140}
              style={{ width: '100%', height: 140, border: `2px ${hasSig ? 'solid #1a5c3f' : 'dashed #d1fae5'}`, borderRadius: 10, background: '#fafff9', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
              onMouseDown={e => { if (!canvas) return; setDrawing(true); const p = getPos(e, canvas); const ctx = canvas.getContext('2d')!; ctx.beginPath(); ctx.moveTo(p.x, p.y) }}
              onMouseMove={e => { if (!drawing || !canvas) return; const p = getPos(e, canvas); const ctx = canvas.getContext('2d')!; ctx.lineTo(p.x, p.y); ctx.stroke(); setHasSig(true) }}
              onMouseUp={() => setDrawing(false)} onMouseLeave={() => setDrawing(false)}
              onTouchStart={e => { e.preventDefault(); if (!canvas) return; setDrawing(true); const p = getPos(e, canvas); const ctx = canvas.getContext('2d')!; ctx.beginPath(); ctx.moveTo(p.x, p.y) }}
              onTouchMove={e => { e.preventDefault(); if (!drawing || !canvas) return; const p = getPos(e, canvas); const ctx = canvas.getContext('2d')!; ctx.lineTo(p.x, p.y); ctx.stroke(); setHasSig(true) }}
              onTouchEnd={() => setDrawing(false)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={() => { if (canvas) { canvas.getContext('2d')!.clearRect(0, 0, 480, 140); setHasSig(false) } }} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6, background: '#f3f4f6', border: 'none', cursor: 'pointer' }}>Clear</button>
              <span style={{ fontSize: 11, color: hasSig ? '#059669' : '#9ca3af' }}>{hasSig ? '✓ Captured' : 'Sign above'}</span>
            </div>
            <div style={{ marginTop: 12, padding: 12, background: '#f8faf8', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
              <strong>Date:</strong> {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <button onClick={submit} disabled={!hasSig || busy} style={pb(hasSig && !busy)}>{busy ? 'Submitting...' : (submitLabel || 'Submit ✓')}</button>
            <button onClick={() => setStep(2)} style={{ width: '100%', padding: 10, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginTop: 4 }}>← Back</button>
          </div>}
          {step === 4 && <div>{renderSuccess({ intake: f, refId })}</div>}
        </div>
      </div>
    </div>
  )
}
