// EmbedEnrollHost — mounts the shared public/embed.js loader inside the app so
// staff can fill the SAME embedded GitHub Pages form (embed mode) in-app. The
// loader resolves the form from the registry, runs the origin-checked pa-embed
// handshake and, on submit, writes a source='embed' submission via the anon RPC.
// The app origin must be in the registry's allowedParentOrigins.
//
// The form's own toolbar (and its Submit button) is hidden in embed mode, so THIS
// host renders the modal footer: Submit drives the form's save via the loader
// (pa-embed:submit → form runs save_()), and saving/saved/error states come back
// as window events the loader dispatches (pa-embed:saved / pa-embed:error).
import { useEffect, useRef, useState } from 'react'

let seq = 0

// Fixed content width of each paper-replica form (for scale-to-fit in the loader).
const FORM_WIDTH: Record<string, number> = { enroll: 1275 }

type Status = 'idle' | 'saving' | 'saved' | 'error'

export default function EmbedEnrollHost({
  center, form = 'enroll', onSaved, onClose,
}: {
  center: string                      // center slug OR center_id (loader resolves both)
  form?: 'enroll' | 'iea'
  onSaved?: (id: string) => void
  onClose?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const didInit = useRef(false)       // guard against StrictMode double-invoke
  const [domId] = useState(() => `pa-embed-host-${++seq}`)
  const [status, setStatus] = useState<Status>('idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const onSavedEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined
      setStatus('saved'); setErrMsg('')
      if (detail?.id) onSaved?.(detail.id)
    }
    const onErrEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined
      setStatus('error'); setErrMsg(detail?.message || 'Could not submit — please try again')
    }
    window.addEventListener('pa-embed:saved', onSavedEvt as EventListener)
    window.addEventListener('pa-embed:error', onErrEvt as EventListener)

    if (!didInit.current) {
      didInit.current = true
      const script = document.createElement('script')
      script.src = '/embed.js'
      script.async = true
      script.setAttribute('data-target', `#${domId}`)
      script.setAttribute('data-form', form)
      script.setAttribute('data-center', center)
      if (FORM_WIDTH[form]) script.setAttribute('data-formwidth', String(FORM_WIDTH[form]))
      containerRef.current?.appendChild(script)
    }

    return () => {
      window.removeEventListener('pa-embed:saved', onSavedEvt as EventListener)
      window.removeEventListener('pa-embed:error', onErrEvt as EventListener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit() {
    if (status === 'saving') return
    setStatus('saving'); setErrMsg('')
    window.dispatchEvent(new CustomEvent('pa-embed:submit', { detail: { target: domId } }))
  }

  const saving = status === 'saving'
  const saved = status === 'saved'

  return (
    <div>
      {/* The loader mounts the (scaled-to-fit) iframe here. */}
      <div id={domId} ref={containerRef} style={{ width: '100%', minHeight: 320 }} />

      {/* Host footer — the form's own toolbar is hidden in embed mode. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 14,
        borderTop: '1px solid #eef0ee',
      }}>
        <div style={{ flex: 1, fontSize: 13, minHeight: 18 }}>
          {status === 'error' && <span style={{ color: '#b91c1c', fontWeight: 600 }}>⚠ {errMsg}</span>}
          {saved && <span style={{ color: '#166534', fontWeight: 600 }}>✓ Submitted — filed to the Inbox.</span>}
          {saving && <span style={{ color: '#6b7280' }}>Submitting…</span>}
        </div>
        <button onClick={() => onClose?.()} style={{
          padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
          fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151',
        }}>Close</button>
        {!saved && (
          <button onClick={submit} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: saving ? '#9ca3af' : '#0f4c35', color: '#fff',
            fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>{saving ? 'Submitting…' : 'Submit'}</button>
        )}
      </div>
    </div>
  )
}
