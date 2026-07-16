// avatars.ts — child/staff photo helpers over the private `avatars` bucket.
//
// The DB stores a Storage PATH ('staff/<id>/avatar.webp'), never a URL. Reads go
// through short-lived signed URLs (private bucket); uploads are resized on the
// client to ~512px webp so we never ship a 4 MB phone photo to Storage.
import { supabase } from '@/lib/supabase'

const BUCKET = 'avatars'
const SIGNED_TTL = 60 * 60 // 1h — matches the other private buckets in the app

export type AvatarEntity = 'staff' | 'child'

// ── signed-URL cache ─────────────────────────────────────────────────────────
// One signed URL per path, reused until it is close to expiry. Keeps a roster of
// 30 faces from minting 30 signed URLs on every re-render.
const cache = new Map<string, { url: string; expires: number }>()

export async function avatarSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const hit = cache.get(path)
  // getTime via Date is fine in app code (only workflow scripts forbid it)
  const now = Date.now()
  if (hit && hit.expires > now + 60_000) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
  if (error || !data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, expires: now + SIGNED_TTL * 1000 })
  return data.signedUrl
}

// ── client-side resize → webp ────────────────────────────────────────────────
// Square-crops to the shorter side, scales to `size`, encodes webp. Falls back to
// the original file if the browser can't encode webp (older Safari).
export async function resizeToWebp(file: File, size = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', quality))
  return blob ?? file
}

// ── upload ───────────────────────────────────────────────────────────────────
// Deterministic path per entity so re-upload overwrites (upsert). Returns the
// stored path to write into roster.photo_url / staff.photo_url.
export async function uploadAvatar(entity: AvatarEntity, id: string, file: File): Promise<string> {
  const blob = await resizeToWebp(file)
  const path = `${entity}/${id}/avatar.webp`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600',
  })
  if (error) throw error
  cache.delete(path) // force a fresh signed URL for the new image
  return path
}

// Initials + a stable color for the fallback avatar (shared with the old inline
// helpers so faces and initials look identical across pages).
const AVATAR_COLORS = ['#0f4c35', '#1a6b4a', '#2d8f64', '#4a7c6b', '#5c4f7c', '#7c4f4f', '#4f6b7c']
export function avatarColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const ini = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  return ini.toUpperCase() || '?'
}
