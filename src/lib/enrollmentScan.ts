// enrollmentScan.ts — Phase 1.5 (photo intake) contract + helpers, review side.
//
// A photographed paper form is submitted through submit_enrollment_form with
// source='paper_entry'. The scan itself and the OCR metadata ride inside
// form_data so no schema/RPC change is needed and the channel stays extensible
// to any document type (voucher printouts, etc.):
//
//   form_data.scan_ref : where the image lives. Accepts, most→least specific:
//       - { url }            a ready-to-render URL (public or long-lived signed)
//       - { bucket, path }   a Storage object → we mint a signed URL
//       - "storage/path.jpg" a bare path in the default bucket
//       - "https://…"        a bare URL
//     (Full-URL forms make the channel project-agnostic: whichever Supabase
//     project hosts the bucket, the mobile app can hand review a URL directly.)
//
//   form_data._ocr : { docType?, engine?, at?, lowConfidence?: string[] }
//     lowConfidence lists field keys / edit-paths the OCR was unsure about, so
//     review can flag them "verify" against the scan. submission_type 'other'
//     skips OCR entirely (scan only, no _ocr).

import { supabase } from '@/lib/supabase'

export const ENROLLMENT_SCAN_BUCKET = 'enrollment-scans'

export type ScanRef =
  | string
  | { bucket?: string | null; path?: string | null; url?: string | null }
  | null
  | undefined

export interface OcrMeta {
  docType?: string
  engine?: string
  at?: string
  lowConfidence?: string[]
}

const isUrl = (s: string) => /^https?:\/\//i.test(s)

async function sign(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
  if (error) return null
  return data?.signedUrl ?? null
}

/** Resolve a scan_ref to a viewable URL (null if none / unreadable). */
export async function resolveScanUrl(ref: ScanRef): Promise<string | null> {
  if (!ref) return null
  if (typeof ref === 'string') {
    return isUrl(ref) ? ref : sign(ENROLLMENT_SCAN_BUCKET, ref)
  }
  if (ref.url) return ref.url
  if (ref.path) return sign(ref.bucket || ENROLLMENT_SCAN_BUCKET, ref.path)
  return null
}

export const hasScan = (formData: any): boolean => !!formData?.scan_ref

/** Field keys/paths the OCR flagged as low-confidence ("verify" in review). */
export function lowConfidenceSet(formData: any): Set<string> {
  const lc = (formData?._ocr as OcrMeta | undefined)?.lowConfidence
  return new Set(Array.isArray(lc) ? lc.map(String) : [])
}

export const ocrMeta = (formData: any): OcrMeta => (formData?._ocr ?? {}) as OcrMeta

/** True when a prior OCR attempt errored after retries (Path B) and the card is
 *  awaiting a re-run. Distinct from engine==='none' (an intentional 'other' scan). */
export const ocrFailed = (formData: any): boolean => {
  const m = ocrMeta(formData)
  return m.engine === 'failed' || (m as any)?.failed === true
}

export interface ReRunResult {
  submissionType: string
  ocrFailed: boolean
  lowConfidence: string[]
}

/** Re-run OCR on an already-stored scan via the edge function's scan_ref mode
 *  (no re-upload). The function classifies (cacfp_enrollment | iea | license |
 *  other) and re-extracts; we persist the fresh submission_type + form_data so
 *  the Inbox card updates in place. Backs the "Re-run OCR" button. */
export async function reRunOcr(submission: { id: string; form_data: any }): Promise<ReRunResult> {
  const ref = submission.form_data?.scan_ref
  if (!ref) throw new Error('No scan is attached to this submission.')
  const { data, error } = await supabase.functions.invoke('enrollment-scan-ocr', { body: { scan_ref: ref } })
  if (error) throw error
  if (!data || data.error) throw new Error(data?.error || 'OCR re-run failed.')
  const nextType = data.submissionType ?? ocrMeta(submission.form_data).docType ?? 'other'
  const { error: upErr } = await supabase.schema('menumaker').from('enrollment_submissions')
    .update({ submission_type: nextType, form_data: data.form_data ?? {} })
    .eq('id', submission.id)
  if (upErr) throw upErr
  return { submissionType: nextType, ocrFailed: !!data.ocrFailed, lowConfidence: data.lowConfidence ?? [] }
}
