// SafePassEnrollDevice.tsx — route /t/:token (PUBLIC)
//
// Charging a tablet, take two. The query-string form (/safepass/teacher?device_token=…)
// is undeliverable in practice: Mail, Notes and iPad Safari's paste all truncate a
// URL at the '?', so the token silently never arrives and the teacher page shows
// "This tablet is not registered" — a transport failure wearing a database failure's
// clothes. We lost an hour to that today.
//
// The token rides as a PATH SEGMENT here. No '?', nothing for an auto-linker to cut,
// and nothing to lose across a redirect.
//
// PUBLIC on purpose: it persists the token and then sends the tablet on. If there is
// no session yet, ProtectedRoute takes over from /safepass/teacher and the token is
// already in localStorage by then — so the old "log in FIRST or the redirect eats
// your token" ordering trap cannot happen any more, in either order.
import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { setDeviceToken } from '@/lib/safepassDevice'

export default function SafePassEnrollDevice() {
  const { token } = useParams<{ token: string }>()
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (token) setDeviceToken(token)
    setDone(true)
  }, [token])

  if (!token) return <Navigate to="/safepass/teacher" replace />
  // replace: the token must not sit in the tablet's back-history.
  if (done) return <Navigate to="/safepass/teacher" replace />

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center',
                  background: '#0a0c12', color: '#f0f2ff', fontFamily: "'Inter',sans-serif" }}>
      Registering this tablet…
    </div>
  )
}
