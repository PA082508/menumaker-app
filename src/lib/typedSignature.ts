// typedSignature.ts — DocuSign-style TYPED autograph for the director countersign.
//
// The parent storefront kit already offers a typed rail (signature_method /
// signature_typed_value) rendered in a script face; this is the in-app equivalent for
// the director's countersign. We reuse the CONVENTION (method='typed') but the render is
// ours: the app has no typed-signature UI, and `adoptSample` requires a data:image even
// for a typed sample. So we rasterise the typed name in a chosen script face to a PNG
// data URL — the same shape a drawn stroke produces — so everything downstream (the slot
// image, the sample shelf, the replica) is method-agnostic.
//
// Faces are SYSTEM script fonts, chosen for the actual devices in use (director iPads +
// office Macs — Apple ships all three): no web-font download, no CDN, self-contained. A
// generic `cursive` tail keeps a non-Apple browser legible (a different-looking script,
// never a broken box). The raster bakes in whatever face resolved at render time.

export interface SigFace {
  key: string
  label: string
  /** CSS font-family stack — Apple system script first, generic `cursive` last. */
  stack: string
}

export const SIG_FACES: readonly SigFace[] = [
  { key: 'roundhand', label: 'Roundhand', stack: "'Snell Roundhand','Savoye LET','Apple Chancery',cursive" },
  { key: 'hand',      label: 'Handwriting', stack: "'Bradley Hand','Segoe Script','Comic Sans MS',cursive" },
  { key: 'marker',    label: 'Marker',    stack: "'Noteworthy','Marker Felt','Trebuchet MS',cursive" },
]

export const defaultFace = (): SigFace => SIG_FACES[0]

export function faceByKey(key: string | null | undefined): SigFace {
  return SIG_FACES.find(f => f.key === key) ?? SIG_FACES[0]
}

/**
 * Rasterise `name` in `face` to a transparent PNG data URL, ink #0f4c35 (the app's
 * signature green). The font auto-shrinks to fit the box width. Aspect ~ the program_sig
 * slot (wide + short) so `object-fit:contain` seats it naturally on the form.
 *
 * Waits for document.fonts.ready so the script face is loaded before the raster is taken
 * (otherwise the first render can bake the fallback). Returns '' for a blank name.
 */
export async function renderTypedSignature(
  name: string,
  face: SigFace,
  opts?: { width?: number; height?: number },
): Promise<string> {
  const text = (name ?? '').trim()
  if (!text) return ''
  const width = opts?.width ?? 780
  const height = opts?.height ?? 120

  // Best-effort: don't let a missing document.fonts API throw on old engines.
  try { if ((document as any).fonts?.ready) await (document as any).fonts.ready } catch { /* ignore */ }

  const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1) + 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#0f4c35'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // Fit the name to the box: start near the box height and shrink until it fits.
  let size = Math.floor(height * 0.62)
  const pad = 14
  ctx.font = `${size}px ${face.stack}`
  while (ctx.measureText(text).width > width - pad * 2 && size > 10) {
    size -= 2
    ctx.font = `${size}px ${face.stack}`
  }
  ctx.fillText(text, pad, height / 2)
  return canvas.toDataURL('image/png')
}
