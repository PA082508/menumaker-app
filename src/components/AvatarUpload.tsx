// AvatarUpload.tsx — editable avatar (settings pages + teacher surfaces).
//
// v2 (2026-07-16): tap the avatar → a three-action sheet.
//   • Take photo        — opens the camera straight from Safari on iPad
//   • Choose from library
//   • Remove photo
//
// Pipeline is unchanged: client-side resize → ~512px square webp → private
// `avatars` bucket → signed URL. The DB stores the PATH, never a URL.
//
// The camera is `<input type="file" capture>`. `capture="user"` = front camera
// (a teacher photographing themselves), `capture="environment"` = rear camera
// (photographing a child). Without the attribute, iOS shows its own picker —
// which is exactly what "Choose from library" wants, so the two inputs differ
// only by that attribute.
//
// Like v1, this uploads immediately and hands the stored path to the parent via
// onChange; the parent persists it on its own verified save path. `Remove photo`
// passes null — it clears the column, it does NOT delete the object (there is no
// DELETE policy on the bucket, and a delete would fail silently).
import { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import { uploadAvatar, type AvatarEntity } from '@/lib/avatars'

export default function AvatarUpload({
  entity,
  id,
  name,
  path,
  onChange,
  size = 72,
  facing = 'environment',
  compact = false,
}: {
  entity: AvatarEntity
  id: string
  name: string
  path?: string | null
  onChange: (path: string | null) => void
  size?: number
  /** 'user' = front camera (photographing yourself), 'environment' = rear (a child). */
  facing?: 'user' | 'environment'
  /** compact = avatar only, no side button — for grids/rosters where the tap IS the control. */
  compact?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  // Bump to force <Avatar> to re-fetch the signed URL after an overwrite (path
  // is stable — 'entity/id/avatar.webp' — so we cache-bust via a re-mount).
  const [nonce, setNonce] = useState(0)

  // Escape closes the sheet — a modal you can't dismiss with the keyboard is a trap.
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    setSheet(false)
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    setBusy(true); setErr(null)
    try {
      const stored = await uploadAvatar(entity, id, file)
      setNonce(n => n + 1)
      onChange(stored)
    } catch (e: any) {
      // A Storage RLS denial surfaces here. Say so plainly rather than leaving a
      // spinner that stops: the photo did NOT save.
      setErr(`Photo not saved — ${e?.message ?? 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    setSheet(false); setErr(null)
    setNonce(n => n + 1)
    onChange(null)
  }

  const avatar = (
    <div
      style={{ position: 'relative', cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}
      onClick={() => !busy && setSheet(true)}
      role="button" tabIndex={0}
      aria-label={path ? `Change photo for ${name}` : `Add photo for ${name}`}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); setSheet(true) } }}
    >
      <Avatar key={nonce} name={name} path={path} size={size} />
      {busy && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>…</div>
      )}
      {!busy && (
        <div aria-hidden style={{
          position: 'absolute', bottom: -1, right: -1,
          width: Math.max(16, size * 0.3), height: Math.max(16, size * 0.3),
          borderRadius: '50%', background: '#0f4c35', color: '#fff',
          border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.max(8, size * 0.15), lineHeight: 1,
        }}>📷</div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {avatar}

      {!compact && (
        <div>
          <button
            type="button" onClick={() => setSheet(true)} disabled={busy}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1.5px solid #0f4c35',
              background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
            }}>
            {path ? 'Change photo' : 'Add photo'}
          </button>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            Take a photo or choose one · resized to 512px · saved on Save Changes
          </div>
        </div>
      )}

      {err && !compact && <div style={{ fontSize: 12, color: '#b91c1c' }}>{err}</div>}

      {/* Two inputs, differing only by `capture`: with it iOS opens the camera
          directly; without it, iOS shows the photo library picker. */}
      <input ref={cameraRef} type="file" accept="image/*" capture={facing} onChange={onFile} style={{ display: 'none' }} />
      <input ref={libraryRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

      {sheet && (
        <div
          onClick={() => setSheet(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            role="dialog" aria-label={`Photo for ${name}`}
            style={{
              background: '#fff', width: '100%', maxWidth: 460,
              borderRadius: '16px 16px 0 0', padding: 12,
              fontFamily: "'DM Sans', sans-serif",
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            }}>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: '#6b7280', padding: '6px 0 10px' }}>{name}</div>
            <SheetBtn onClick={() => cameraRef.current?.click()}>📷 Take photo</SheetBtn>
            <SheetBtn onClick={() => libraryRef.current?.click()}>🖼 Choose from library</SheetBtn>
            {path && <SheetBtn onClick={remove} danger>🗑 Remove photo</SheetBtn>}
            {err && <div style={{ fontSize: 12, color: '#b91c1c', padding: '8px 4px' }}>{err}</div>}
            <div style={{ height: 8 }} />
            <SheetBtn onClick={() => setSheet(false)} plain>Cancel</SheetBtn>
          </div>
        </div>
      )}
    </div>
  )
}

function SheetBtn({ children, onClick, danger, plain }: { children: React.ReactNode; onClick: () => void; danger?: boolean; plain?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'center',
        padding: '14px 12px', marginBottom: 6, borderRadius: 12,
        border: plain ? '1px solid #e5e7eb' : 'none',
        background: plain ? '#fff' : '#f3f4f6',
        color: danger ? '#b91c1c' : plain ? '#6b7280' : '#111827',
        fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
      }}>
      {children}
    </button>
  )
}
