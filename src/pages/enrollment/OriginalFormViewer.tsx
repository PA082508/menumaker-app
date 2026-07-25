// OriginalFormViewer.tsx — Step 1 "View original form".
//
// A full-screen overlay that renders the LOCAL, same-origin read-only replica
// (public/forms/<type>_original.html) inside an iframe and injects the submitted
// form_data + signatures via postMessage — mirroring the CACFP report iframe contract
// ({ type:'…-render', data }). It DISPLAYS ONLY: no writes, no roster/diff/claim-bridge.
//
// The parent signature (signatures.parent_sig) is drawn on the replica as filed; the
// director slot (program_sig) shows "awaiting countersign" until Step 2 wires it.
import { useEffect, useRef } from 'react'
import { originalReplica } from '@/lib/originalFormReplicas'

export default function OriginalFormViewer({
  submissionType, formData, signatures, onClose, note,
}: {
  submissionType: string
  formData: any
  signatures: Record<string, any> | null | undefined
  onClose: () => void
  // On-screen provenance marker (canon: an artifact declares its source). e.g. a live render
  // that is NOT a frozen snapshot passes "Live render — no snapshot on file". Never printed.
  note?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const replica = originalReplica(submissionType)

  // Push the data once the replica has loaded, and again if the data changes.
  function inject() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'original-render', formData: formData ?? {}, signatures: signatures ?? {} },
      '*',
    )
  }
  useEffect(() => { inject() }, [formData, signatures]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!replica) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.55)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 900, height: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#0f4c35', color: '#fff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              Original form
              {note && <span style={{ marginLeft: 10, fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6 }}>{note}</span>}
            </div>
            <div style={{ fontSize: 11, color: '#bfe8d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replica.title}</div>
          </div>
          <button
            onClick={() => iframeRef.current?.contentWindow?.print()}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
          >🖨 Print</button>
          <button
            onClick={onClose}
            style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#fff', color: '#0f4c35', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
          >Close</button>
        </div>
        <iframe
          ref={iframeRef}
          title="Original form"
          src={replica.url}
          onLoad={inject}
          style={{ flex: 1, width: '100%', border: 'none', background: '#eef1f4' }}
        />
      </div>
    </div>
  )
}
