// ApprovedFormViewer.tsx — Step 3 display/print of an APPROVED enrollment form FROM its frozen
// snapshot (the official pages exactly as signed). Screen chrome marks provenance
// ("COPY — WHAT WAS SIGNED · Snapshot at Approve <ts> · <edition> · sha …"); PRINT outputs the
// clean official pages ONLY, 1:1, no service marks (canon). If no snapshot exists yet, it falls
// back to a live replica render (OriginalFormViewer) so the form is never unviewable.
import { useEffect, useState } from 'react'
import { getLatestSnapshot, snapshotPageUrls, type SnapshotRow } from '@/lib/enrollmentSnapshot'
import OriginalFormViewer from './OriginalFormViewer'

export default function ApprovedFormViewer({
  submissionId, submissionType, formData, signatures, onClose,
}: {
  submissionId: string
  submissionType: string
  formData: any
  signatures: Record<string, any> | null | undefined
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [snap, setSnap] = useState<SnapshotRow | null>(null)
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    let off = false
    ;(async () => {
      const s = await getLatestSnapshot(submissionId)
      if (off) return
      if (s) {
        const u = await snapshotPageUrls(s.storage_path, s.page_count)
        if (!off) { setSnap(s); setUrls(u) }
      }
      if (!off) setLoading(false)
    })()
    return () => { off = true }
  }, [submissionId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // No snapshot (older approvals / capture pending) → live replica render, never a dead end.
  if (!loading && !snap) {
    return <OriginalFormViewer submissionType={submissionType} formData={formData} signatures={signatures} onClose={onClose} note="Live render — no snapshot on file" />
  }

  // Print the CLEAN official pages only — a bare print iframe with the page images at 8.5×11in,
  // no chrome. Never the screen provenance banner (canon: snapshot prints 1:1).
  function printClean() {
    if (!urls.length) return
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(f)
    const d = f.contentDocument
    if (!d) { f.remove(); return }
    d.open()
    d.write(
      '<!doctype html><html><head><style>' +
      '@page{size:8.5in 11in;margin:0}html,body{margin:0;padding:0}' +
      'img{display:block;width:8.5in;height:11in;page-break-after:always}' +
      'img:last-child{page-break-after:auto}' +
      '</style></head><body>' + urls.map(u => `<img src="${u}">`).join('') + '</body></html>',
    )
    d.close()
    const go = () => { try { f.contentWindow?.focus(); f.contentWindow?.print() } finally { setTimeout(() => f.remove(), 1500) } }
    const imgs = Array.from(d.querySelectorAll('img')) as HTMLImageElement[]
    let pending = imgs.length
    if (pending === 0) return go()
    imgs.forEach(im => { im.onload = im.onerror = () => { if (--pending === 0) go() } })
  }

  const ts = snap ? new Date(snap.created_at).toLocaleString() : ''

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, height: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        {/* SCREEN chrome — provenance. Not printed. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#0f4c35', color: '#fff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '.05em' }}>COPY — WHAT WAS SIGNED</div>
            <div style={{ fontSize: 11, color: '#bfe8d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {snap ? `Snapshot at Approve · ${ts} · ${snap.replica_edition} · sha ${snap.content_sha.slice(0, 10)}…` : 'Loading…'}
            </div>
          </div>
          <button onClick={printClean} disabled={!urls.length}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: urls.length ? 'pointer' : 'not-allowed', opacity: urls.length ? 1 : 0.5 }}>🖨 Print</button>
          <button onClick={onClose}
            style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#fff', color: '#0f4c35', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Close</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: '#eef1f4', padding: 16 }}>
          {loading
            ? <div style={{ color: '#888', textAlign: 'center', padding: 40, fontSize: 13 }}>Loading snapshot…</div>
            : urls.map((u, i) => (
              <img key={i} src={u} alt={`Page ${i + 1}`}
                style={{ display: 'block', width: '100%', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', background: '#fff' }} />
            ))}
        </div>
      </div>
    </div>
  )
}
