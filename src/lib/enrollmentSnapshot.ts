// enrollmentSnapshot.ts — Step 3 client side of the "freeze the approved original" flow.
//
// captureAndUploadSnapshot renders the SAME-ORIGIN replica offscreen with the final form_data +
// signatures (including the director countersign), html2canvas'es each page to PNG, and hands the
// base64 pages to the enrollment-snapshot edge function (the only writer). It builds and tears
// down its OWN DOM (an offscreen iframe on document.body), so it survives the caller unmounting —
// safe to fire-and-forget at Approve. A failed capture is backfillable from the child's documents.
//
// Display side: getLatestSnapshot + snapshotPageUrls feed ApprovedFormViewer, which shows the
// clean official pages (screen chrome marks provenance; print stays 1:1, no chrome).

import { supabase } from '@/lib/supabase'
import { originalReplica } from '@/lib/originalFormReplicas'
import html2canvas from 'html2canvas'

export type SnapshotRow = {
  id: string
  submission_id: string
  storage_path: string
  page_count: number
  replica_edition: string
  content_sha: string
  created_at: string
}

export type CaptureResult = { ok: boolean; id: string; storage_path: string; page_count: number; content_sha: string }

export async function captureAndUploadSnapshot(opts: {
  submissionId: string
  submissionType: string
  formData: any
  signatures: Record<string, any> | null | undefined
}): Promise<CaptureResult> {
  const replica = originalReplica(opts.submissionType)
  if (!replica) throw new Error(`no original replica for submission type "${opts.submissionType}"`)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  // rendered (not display:none) but off-screen, at the replica's natural width so html2canvas
  // captures actual-size pages.
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1275px;height:3400px;border:0;background:#fff;opacity:0;pointer-events:none'
  iframe.src = replica.url
  document.body.appendChild(iframe)

  try {
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('replica load timeout')), 15000)
      iframe.onload = () => { clearTimeout(to); resolve() }
      iframe.onerror = () => { clearTimeout(to); reject(new Error('replica load error')) }
    })

    const win = iframe.contentWindow as (Window & { renderOriginal?: (fd: any, sg: any) => void }) | null
    const doc = iframe.contentDocument
    if (!win || !doc) throw new Error('replica window unavailable')

    // inject the final data + signatures (replica exposes renderOriginal, also listens for postMessage)
    if (typeof win.renderOriginal === 'function') win.renderOriginal(opts.formData ?? {}, opts.signatures ?? {})
    else win.postMessage({ type: 'original-render', formData: opts.formData ?? {}, signatures: opts.signatures ?? {} }, '*')

    // capture at actual size (the replica scales to fit the viewport on screen; we want zoom 1)
    const docEl = doc.getElementById('doc')
    if (docEl) (docEl as HTMLElement).style.zoom = '1'

    await waitForImages(doc, 8000)
    await sleep(400) // let signature images + overlay settle

    const pageEls = Array.from(doc.querySelectorAll('.page')) as HTMLElement[]
    if (pageEls.length === 0) throw new Error('replica rendered no pages')

    const pages: string[] = []
    for (const el of pageEls) {
      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
        windowWidth: 1275, windowHeight: 1650,
      })
      pages.push(canvas.toDataURL('image/png').split(',')[1])
    }

    const { data, error } = await supabase.functions.invoke('enrollment-snapshot', {
      body: { submission_id: opts.submissionId, replica_edition: replica.version, pages },
    })
    if (error) throw error
    return data as CaptureResult
  } finally {
    iframe.remove()
  }
}

export async function getLatestSnapshot(submissionId: string): Promise<SnapshotRow | null> {
  const { data } = await supabase.schema('menumaker').from('enrollment_snapshots')
    .select('id,submission_id,storage_path,page_count,replica_edition,content_sha,created_at')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as SnapshotRow | null) ?? null
}

export async function snapshotPageUrls(storagePath: string, pageCount: number): Promise<string[]> {
  const urls: string[] = []
  for (let i = 1; i <= pageCount; i++) {
    const { data } = await supabase.storage.from('enrollment-snapshots')
      .createSignedUrl(`${storagePath}/page-${i}.png`, 3600)
    if (data?.signedUrl) urls.push(data.signedUrl)
  }
  return urls
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

function waitForImages(doc: Document, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[]
    const done = () => imgs.every(i => i.complete && i.naturalWidth > 0)
    if (done()) return resolve()
    const start = Date.now()
    const t = setInterval(() => {
      if (done() || Date.now() - start > timeoutMs) { clearInterval(t); resolve() }
    }, 150)
  })
}
