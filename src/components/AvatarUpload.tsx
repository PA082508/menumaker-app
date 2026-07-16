// AvatarUpload.tsx — editable avatar (settings pages + teacher surfaces).
//
// v3 (2026-07-16): the tap goes where the person is going.
//   • avatar WITH a photo → straight to the full-screen viewer. Looking is the common
//     act (identify a child at the door); Change/Remove live inside the viewer.
//   • avatar WITHOUT a photo → straight to the camera sheet. There is nothing to look
//     at, so the only sensible intent is "add one".
//   No double-click anywhere: it collides with touch zoom and nobody discovers it.
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
import { uploadAvatar, avatarSignedUrl, type AvatarEntity } from '@/lib/avatars'

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
  // Full-size view. A 72px circle is enough to spot a child in a list; it is NOT enough
  // to be sure at the door, which is where SafePass actually needs the face.
  const [viewing, setViewing] = useState<string | null>(null)
  // Bump to force <Avatar> to re-fetch the signed URL after an overwrite (path
  // is stable — 'entity/id/avatar.webp' — so we cache-bust via a re-mount).
  const [nonce, setNonce] = useState(0)

  // Escape closes the sheet — a modal you can't dismiss with the keyboard is a trap.
  useEffect(() => {
    if (!sheet && !viewing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (viewing) setViewing(null); else setSheet(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, viewing])

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

  const view = async () => {
    if (!path) return
    setSheet(false); setErr(null)
    try {
      const url = await avatarSignedUrl(path)
      if (!url) { setErr('Photo could not be opened.'); return }
      setViewing(url)
    } catch (e: any) {
      setErr(`Photo could not be opened — ${e?.message ?? 'unknown error'}`)
    }
  }

  const remove = () => {
    setSheet(false); setErr(null)
    setNonce(n => n + 1)
    onChange(null)
  }

  // One rule, so the keyboard and the tap can never disagree.
  const primary = () => { if (busy) return; if (path) view(); else setSheet(true) }

  const avatar = (
    <div
      style={{ position: 'relative', cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}
      onClick={primary}
      role="button" tabIndex={0}
      aria-label={path ? `View photo of ${name}` : `Add photo for ${name}`}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); primary() } }}
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
        }}>{path ? '🔍' : '📷'}</div>
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

      {viewing && (
        <div
          onClick={() => setViewing(null)}
          role="dialog" aria-label={`Photo of ${name}`}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
            padding: 'env(safe-area-inset-top) 16px env(safe-area-inset-bottom)',
          }}>
          <img src={viewing} alt={name} onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 12, objectFit: 'contain' }} />
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{name}</div>
          {/* Change/Remove live HERE: you are already looking at the photo, which is
              exactly when you decide it is the wrong one. */}
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" onClick={() => { setViewing(null); setSheet(true) }} style={viewerBtn}>📷 Change photo</button>
            <button type="button" onClick={() => { setViewing(null); remove() }}
              style={{ ...viewerBtn, borderColor: 'rgba(248,113,113,0.55)', color: '#fca5a5' }}>🗑 Remove</button>
            <button type="button" onClick={() => setViewing(null)} style={viewerBtn}>Close</button>
          </div>
        </div>
      )}

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

const viewerBtn: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)',
  background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
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
