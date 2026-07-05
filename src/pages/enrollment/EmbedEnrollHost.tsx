// EmbedEnrollHost — mounts the shared public/embed.js loader inside the app so
// staff can fill the SAME embedded GitHub Pages form (embed mode) in-app. The
// loader resolves the form from the registry, runs the origin-checked pa-embed
// handshake and, on submit, writes a source='embed' submission via the anon RPC.
// The app origin must be in the registry's allowedParentOrigins.
//
// On a successful save the loader dispatches `pa-embed:saved` on window; we
// surface it via onSaved so the Inbox can refresh.
import { useEffect, useRef, useState } from 'react'

let seq = 0

export default function EmbedEnrollHost({
  center, form = 'enroll', onSaved,
}: {
  center: string                      // center slug OR center_id (loader resolves both)
  form?: 'enroll' | 'iea'
  onSaved?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const didInit = useRef(false)       // guard against StrictMode double-invoke
  const [domId] = useState(() => `pa-embed-host-${++seq}`)

  useEffect(() => {
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined
      if (detail?.id) onSaved?.(detail.id)
    }
    window.addEventListener('pa-embed:saved', onEvt as EventListener)

    if (!didInit.current) {
      didInit.current = true
      const script = document.createElement('script')
      script.src = '/embed.js'
      script.async = true
      script.setAttribute('data-target', `#${domId}`)
      script.setAttribute('data-form', form)
      script.setAttribute('data-center', center)
      containerRef.current?.appendChild(script)
    }

    return () => window.removeEventListener('pa-embed:saved', onEvt as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div id={domId} ref={containerRef} style={{ minHeight: 520, width: '100%' }} />
  )
}
