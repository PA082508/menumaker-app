// ============================================================
// detectAndCrop.ts — shared image auto-crop for uploads.
// Trims the white border around a photographed/scanned document (a phone photo
// of a form on a desk), re-encodes as JPEG q0.92. Non-images pass through
// untouched. Originally duplicated in MessagesPage / PortalMessagesPanel /
// MealCountPage — this is the single source. Safe: bails out (returns the
// original file) unless the detected content box is a confident sub-crop.
// ============================================================

export async function detectAndCrop(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')!
      c.width = img.width; c.height = img.height
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      const w = c.width, h = c.height
      let x0 = w, x1 = 0, y0 = h, y1 = 0
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        }
      }
      const p = 20, cw = Math.min(w, x1 + p) - Math.max(0, x0 - p), ch = Math.min(h, y1 + p) - Math.max(0, y0 - p)
      if (cw > w * 0.3 && ch > h * 0.3 && (cw < w * 0.95 || ch < h * 0.95)) {
        const out = document.createElement('canvas')
        out.width = cw; out.height = ch
        out.getContext('2d')!.drawImage(c, Math.max(0, x0 - p), Math.max(0, y0 - p), cw, ch, 0, 0, cw, ch)
        out.toBlob(b => resolve(new File([b!], file.name.replace(/\.[^.]+$/, '') + '_cropped.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92)
      } else resolve(file)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}
