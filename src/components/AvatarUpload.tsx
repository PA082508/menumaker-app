// AvatarUpload.tsx — editable avatar for the settings pages (staff + child).
//
// Uploads the resized webp to Storage immediately, then hands the stored PATH to
// the parent via onChange. The parent writes that path into its photo_url field
// and persists it on its own Save (so the row write stays on the page's one
// verified save path). Falls back to initials when there is no photo yet.
import { useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import { uploadAvatar, type AvatarEntity } from '@/lib/avatars'

export default function AvatarUpload({
  entity,
  id,
  name,
  path,
  onChange,
  size = 72,
}: {
  entity: AvatarEntity
  id: string
  name: string
  path?: string | null
  onChange: (path: string) => void
  size?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Bump to force <Avatar> to re-fetch the signed URL after an overwrite (path
  // is stable — 'entity/id/avatar.webp' — so we cache-bust via a query nonce).
  const [nonce, setNonce] = useState(0)

  const pick = () => inputRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    setBusy(true); setErr(null)
    try {
      const stored = await uploadAvatar(entity, id, file)
      setNonce(n => n + 1)
      onChange(stored)
    } catch (e: any) {
      setErr(`Upload failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative' }}>
        <Avatar key={nonce} name={name} path={path} size={size} />
        {busy && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>…</div>
        )}
      </div>
      <div>
        <button
          type="button" onClick={pick} disabled={busy}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1.5px solid #0f4c35',
            background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
          }}>
          {path ? 'Change photo' : 'Add photo'}
        </button>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          Square JPG/PNG · resized to 512px · saved on Save Changes
        </div>
        {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{err}</div>}
        <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
