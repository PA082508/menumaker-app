// Avatar.tsx — one face component for the whole app.
//
// Given a photo path it resolves a signed URL and shows the photo; given none (or
// on a load error) it falls back to the initials chip, so a roster with 3 photos
// and 27 blanks looks consistent. Used in the roster, SafePass and Meal Count.
import { useEffect, useState } from 'react'
import { avatarSignedUrl, avatarColor, initialsOf } from '@/lib/avatars'

export default function Avatar({
  name,
  path,
  size = 40,
  fontSize,
}: {
  name: string
  path?: string | null
  size?: number
  fontSize?: number
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    if (!path) { setUrl(null); return }
    avatarSignedUrl(path).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path])

  const common: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  }

  if (url && !failed) {
    return (
      <div style={common}>
        <img
          src={url}
          alt={name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    )
  }

  return (
    <div style={{ ...common, background: avatarColor(name || '?'), color: '#fff', fontWeight: 700, fontSize: fontSize ?? Math.round(size * 0.4) }}>
      {initialsOf(name || '?')}
    </div>
  )
}
