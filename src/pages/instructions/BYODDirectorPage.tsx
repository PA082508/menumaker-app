// ============================================================
// BYODDirectorPage.tsx — route /byod-director
// Director view: see all signed BYOD agreements,
// countersign with digital signature
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

type Sig = {
  id: string
  employee_name: string
  employee_position: string
  center_name: string
  device_make_model: string
  phone_number: string
  employee_signature: string
  director_name: string | null
  director_signature: string | null
  director_signed_at: string | null
  signed_at: string
  status: string
}

// ── Countersign Modal ───────────────────────────────────────
function CounterSignModal({ sig, dirName, onClose, onDone }: {
  sig: Sig
  dirName: string
  onClose: () => void
  onDone: () => void
}) {
  const cvs = useRef<HTMLCanvasElement>(null)
  const [draw, setDraw] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!cvs.current) return
    const ctx = cvs.current.getContext('2d')!
    ctx.strokeStyle = '#1a5c3f'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  function pos(e: any) {
    const r = cvs.current!.getBoundingClientRect()
    const sx = cvs.current!.width / r.width, sy = cvs.current!.height / r.height
    if (e.touches) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy }
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }
  function down(e: any) { setDraw(true); const p = pos(e); const ctx = cvs.current!.getContext('2d')!; ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  function move(e: any) { if (!draw) return; const p = pos(e); const ctx = cvs.current!.getContext('2d')!; ctx.lineTo(p.x, p.y); ctx.stroke(); setHasSig(true) }
  function clear() { cvs.current!.getContext('2d')!.clearRect(0, 0, 512, 140); setHasSig(false) }

  async function submit() {
    setBusy(true)
    const dirSig = cvs.current!.toDataURL('image/png')
    const { error } = await supabase.schema('menumaker').from('byod_signatures')
      .update({ director_name: dirName, director_signature: dirSig, director_signed_at: new Date().toISOString(), status: 'signed' })
      .eq('id', sig.id)
    if (error) { alert('Error: ' + error.message); setBusy(false); return }
    onDone()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>

        <div style={{ background: '#1a5c3f', color: '#fff', padding: '18px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Director Countersignature</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>BYOD Agreement — Play Academy Inc.</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>

          {/* Employee summary */}
          <div style={{ background: '#f0f7f4', borderRadius: 10, padding: 16, marginBottom: 20, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: '#1a5c3f', marginBottom: 10, fontSize: 14 }}>Agreement Summary</div>
            {[
              ['Employee', sig.employee_name],
              ['Position', sig.employee_position],
              ['Center', sig.center_name],
              ['Device', sig.device_make_model],
              ['Phone', sig.phone_number],
              ['Employee Signed', new Date(sig.signed_at).toLocaleString('en-US')],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                <span style={{ color: '#6b7280', minWidth: 120 }}>{l}:</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Employee signature preview */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Employee Signature (on file)</div>
            <img src={sig.employee_signature} alt="Employee signature"
              style={{ width: '100%', height: 100, objectFit: 'contain', border: '1px solid #d1fae5', borderRadius: 8, background: '#fafff9' }} />
          </div>

          {/* Director signature */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Director Countersignature * <span style={{ color: '#6b7280', fontWeight: 400 }}>({dirName})</span>
            </div>
            <canvas ref={cvs} width={512} height={140}
              style={{ width: '100%', height: 140, border: `2px ${hasSig ? 'solid #1a5c3f' : 'dashed #d1fae5'}`, borderRadius: 10, background: '#fafff9', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
              onMouseDown={down} onMouseMove={move} onMouseUp={() => setDraw(false)} onMouseLeave={() => setDraw(false)}
              onTouchStart={e => { e.preventDefault(); down(e) }}
              onTouchMove={e => { e.preventDefault(); move(e) }}
              onTouchEnd={() => setDraw(false)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={clear} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6, background: '#f3f4f6', color: '#6b7280', border: 'none', cursor: 'pointer' }}>Clear</button>
              <span style={{ fontSize: 11, color: hasSig ? '#059669' : '#9ca3af' }}>{hasSig ? '✓ Signature captured' : 'Sign in the box above'}</span>
            </div>
          </div>

          <div style={{ padding: 12, background: '#f8faf8', borderRadius: 8, fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
            <strong>Date of countersignature:</strong> {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br />
            By signing, you confirm this BYOD Agreement is approved and the employee's $20.00/month stipend is authorized.
          </div>

          <button onClick={submit} disabled={!hasSig || busy}
            style={{ width: '100%', padding: 13, background: hasSig && !busy ? '#1a5c3f' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: hasSig ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {busy ? 'Saving...' : 'Confirm & Countersign ✓'}
          </button>
          <button onClick={onClose} style={{ width: '100%', padding: 10, background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginTop: 6 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Modal ───────────────────────────────────────────
function DetailModal({ sig, onClose }: { sig: Sig; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ background: '#1a5c3f', color: '#fff', padding: '16px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Agreement Detail</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ background: '#f0f7f4', borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 13 }}>
            {[
              ['Reference ID', sig.id.slice(0, 8).toUpperCase()],
              ['Employee', sig.employee_name],
              ['Position', sig.employee_position],
              ['Center', sig.center_name],
              ['Device', sig.device_make_model],
              ['Phone', sig.phone_number],
              ['Employee Signed', new Date(sig.signed_at).toLocaleString('en-US')],
              ['Status', sig.status === 'signed' ? '✅ Fully Signed' : '⏳ Pending Director'],
              ...(sig.director_name ? [['Director', sig.director_name], ['Director Signed', new Date(sig.director_signed_at!).toLocaleString('en-US')]] : []),
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ color: '#6b7280', minWidth: 130, fontSize: 12 }}>{l}:</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Employee Signature</div>
            <img src={sig.employee_signature} alt="sig" style={{ width: '100%', height: 100, objectFit: 'contain', border: '1px solid #d1fae5', borderRadius: 8, background: '#fafff9' }} />
          </div>

          {sig.director_signature && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Director Signature ({sig.director_name})</div>
              <img src={sig.director_signature} alt="dir sig" style={{ width: '100%', height: 100, objectFit: 'contain', border: '1px solid #d1fae5', borderRadius: 8, background: '#fafff9' }} />
            </div>
          )}

          <button onClick={onClose} style={{ width: '100%', padding: 12, background: '#1a5c3f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function BYODDirectorPage() {
  const { currentOrg } = useOrg()
  const [sigs, setSigs] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'signed'>('all')
  const [counterSig, setCounterSig] = useState<Sig | null>(null)
  const [detail, setDetail] = useState<Sig | null>(null)
  const [dirName, setDirName] = useState('Sonia Texidor')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.schema('menumaker').from('byod_signatures')
      .select('*').eq('org_id', org?.id).order('signed_at', { ascending: false })
    setSigs(data || [])
    setLoading(false)
  }, [org?.id])

  useEffect(() => { load() }, [load])

  const filtered = sigs.filter(s =>
    filter === 'all' ? true : filter === 'pending' ? s.status !== 'signed' : s.status === 'signed'
  )

  const pending = sigs.filter(s => s.status !== 'signed').length
  const signed = sigs.filter(s => s.status === 'signed').length

  const statusBadge = (s: Sig) => s.status === 'signed'
    ? <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#d1fae5', color: '#065f46' }}>✓ Fully Signed</span>
    : <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>⏳ Pending</span>

  return (
    <div style={{ padding: '28px 24px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>BYOD MANAGEMENT</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0a3320', margin: 0, fontFamily: "'DM Serif Display', serif" }}>BYOD Agreements</h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Review and countersign employee device use agreements</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Signed', value: sigs.length, color: '#1a5c3f', bg: '#f0f7f4' },
          { label: 'Pending Director', value: pending, color: '#92400e', bg: '#fef3c7' },
          { label: 'Fully Complete', value: signed, color: '#065f46', bg: '#d1fae5' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Director name selector + filter */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Signing as Director</label>
          <select value={dirName} onChange={e => setDirName(e.target.value)}
            style={{ padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fafafa' }}>
            <option>Sonia Texidor</option>
            <option>Theresa Rolf</option>
            <option>Carmen Santiago</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Filter</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'pending', 'signed'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: 'none', fontWeight: 600, background: filter === f ? '#1a5c3f' : '#f3f4f6', color: filter === f ? '#fff' : '#374151' }}>
                {f === 'all' ? 'All' : f === 'pending' ? `Pending (${pending})` : `Signed (${signed})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#f9fafb', borderRadius: 12 }}>
          No agreements found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(sig => (
            <div key={sig.id} style={{
              background: '#fff', borderRadius: 12, padding: '16px 20px',
              border: `1.5px solid ${sig.status === 'signed' ? '#d1fae5' : '#fde68a'}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>

              {/* Signature thumbnail */}
              <img src={sig.employee_signature} alt="sig"
                style={{ width: 80, height: 44, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafff9', flexShrink: 0 }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a3320' }}>{sig.employee_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{sig.employee_position} · {sig.center_name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sig.device_make_model} · {sig.phone_number}</div>
              </div>

              {/* Date + status */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ marginBottom: 6 }}>{statusBadge(sig)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(sig.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                {sig.director_signed_at && (
                  <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>
                    Dir: {new Date(sig.director_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => setDetail(sig)}
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontFamily: 'inherit' }}>
                  View
                </button>
                {sig.status !== 'signed' && (
                  <button onClick={() => setCounterSig(sig)}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#1a5c3f', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✍️ Sign
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {counterSig && (
        <CounterSignModal
          sig={counterSig}
          dirName={dirName}
          onClose={() => setCounterSig(null)}
          onDone={() => { setCounterSig(null); load() }}
        />
      )}
      {detail && <DetailModal sig={detail} onClose={() => setDetail(null)} />}

    </div>
  )
}
