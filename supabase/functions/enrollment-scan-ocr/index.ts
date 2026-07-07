// enrollment-scan-ocr — Phase 1.5 photo intake, OCR side (menumaker project).
//
// The director mobile app ("Scan child form") POSTs a photo of a signed paper
// enrollment form. This function:
//   1. uploads the image to the private `enrollment-scans` bucket (service role);
//   2. for a known form type, runs Claude vision to extract the packet fields
//      into the SAME form_data shape the online forms post (so the Inbox diff /
//      validation / duplicate-detector work unchanged), plus a lowConfidence[]
//      list of dotted paths the handwriting made uncertain;
//   3. returns a ready-to-submit form_data (scan_ref + _ocr embedded).
//
// The app then calls menumaker.submit_enrollment_form(..., source='paper_entry').
// Nothing here writes to the DB — approval stays a director action in the Inbox.
//
// ── MODES (2026-07-06) ───────────────────────────────────────────────────────
//   A) CAPTURE (legacy, unchanged contract): { image, submissionType, centerId }
//        submissionType a real type ('cacfp_enrollment'|'iea'|'dcy_01234') →
//        extract that type. 'other' → upload only, no OCR (engine 'none').
//        On a model error we RETRY (backoff 1s, 4s); if it still fails we return
//        HTTP 500 (Path A) so the operator is told to re-shoot rather than a
//        blank pending being created.
//   B) AUTO / RE-RUN: { scan_ref } (re-run from the bucket, no re-upload) OR
//        { image, submissionType:'auto', centerId }. We CLASSIFY the document
//        (cacfp_enrollment | iea | license | other) and extract accordingly.
//        This backs the Inbox "Re-run OCR" button. On a model error we return
//        HTTP 200 with ocrFailed:true + _ocr.failed (Path B) — a scan already in
//        the bucket must never be lost, so it degrades to a badged, recoverable
//        Inbox card. Also returns sha256 (dedup) and, for licenses, a `license`
//        block (→ menumaker.center_licenses).
//
// Secret required: ANTHROPIC_API_KEY (Claude vision). SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are injected by the runtime. Optional: OCR_MODEL
// (default 'claude-sonnet-5').
//
// NOTE: Claude may return a non-text (e.g. thinking) content block first, so we
// concatenate ALL type==='text' blocks rather than reading content[0].
//
// Deploy: supabase functions deploy enrollment-scan-ocr --project-ref trrmyqfpxntmgxnqkikp

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const OCR_MODEL = Deno.env.get('OCR_MODEL') ?? 'claude-sonnet-5'
const BUCKET = 'enrollment-scans'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Per-form-type extraction schema. Keys MUST match the online packet form_data so
// the Inbox diff/validation read them directly (see enrollmentValidationRules.ts).
const SCHEMAS: Record<string, string> = {
  cacfp_enrollment: `Fields to extract (JSON keys):
- child_name (string "First Last")
- birthdate ("YYYY-MM-DD")
- day_phone (digits)
- mailing: object {street, city, zip}
- schedule: object keyed by weekday ("Mon","Tue","Wed","Thu","Fri","Sat","Sun"); include ONLY days marked in care; each value is {in_care:true, arr1, dep1, meals:{breakfast,am_snack,lunch,pm_snack,supper} as booleans}
- signature_date ("YYYY-MM-DD")`,
  iea: `Fields to extract (JSON keys):
- children: array of {name, dob "YYYY-MM-DD", case_no "7 digits or empty"}
- benefit: {snap:boolean, owf:boolean}
- household: array of {name, zero:boolean, income:{earn:{amt, freq_mult}}}
- adult: {print_name, ssn_last4, no_ssn:boolean, day_phone, street, city_state_zip, county}
- signature_date ("YYYY-MM-DD")`,
  dcy_01234: `Fields to extract: child_name, birthdate ("YYYY-MM-DD"), signature_date ("YYYY-MM-DD").`,
}

// License extraction (→ menumaker.center_licenses). Used only in AUTO/RE-RUN mode.
const LICENSE_SCHEMA = `License fields (JSON keys):
- license_type (e.g. "FSO" for Food Service Operation, "childcare", "fire", "zoning")
- license_number
- issuing_authority (e.g. "Ohio Dept of Health", county board)
- issued_date ("YYYY-MM-DD")
- expires_date ("YYYY-MM-DD")
- capacity (integer, if present)
- administrator (name, if present)
- jurisdiction (e.g. "Lake County")
- risk_level (e.g. "IV" / "Risk IV", if present)`

const CLASSES = ['cacfp_enrollment', 'iea', 'license', 'other'] as const

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function parseImage(image: string): { base64: string; mediaType: string } {
  const m = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/)
  if (m) return { mediaType: m[1], base64: m[2] }
  return { mediaType: 'image/jpeg', base64: image }
}

function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

// btoa needs a binary string; build it in chunks to avoid arg-count limits.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Robustly pull a JSON object out of the model's text (handles ```json fences and
// leading/trailing prose).
function extractJson(text: string): any {
  let t = (text ?? '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  if (!t.startsWith('{')) {
    const s = t.indexOf('{'), e = t.lastIndexOf('}')
    if (s >= 0 && e > s) t = t.slice(s, e + 1)
  }
  try { return JSON.parse(t) } catch { return null }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Single Claude vision text call with retry+backoff on transient failures.
// Throws an Error (with .status) on the final failure.
async function callClaudeText(base64: string, mediaType: string, prompt: string, maxTokens = 2000): Promise<string> {
  const delays = [1000, 4000] // 2 retries → 3 attempts total
  let lastErr: any
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: OCR_MODEL,
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        const err: any = new Error(`Anthropic ${resp.status}: ${body}`)
        err.status = resp.status
        throw err
      }
      const data = await resp.json()
      const blocks = Array.isArray(data?.content) ? data.content : []
      return blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim()
    } catch (e: any) {
      lastErr = e
      const status: number | undefined = e?.status
      // Retry only on transient: network (no status), 408, 429, 5xx.
      const transient = status === undefined || status === 408 || status === 429 || status >= 500
      if (attempt < delays.length && transient) {
        console.warn(`callClaudeText attempt ${attempt + 1} failed (status ${status ?? 'network'}); retrying in ${delays[attempt]}ms`)
        await sleep(delays[attempt])
        continue
      }
      throw e
    }
  }
  throw lastErr
}

// CAPTURE mode: extract a single known type (schema-driven).
async function runOcr(base64: string, mediaType: string, submissionType: string) {
  const schema = SCHEMAS[submissionType]
  if (!schema || !ANTHROPIC_API_KEY) return { form_data: {} as any, lowConfidence: [] as string[] }
  const prompt =
    `You are reading a photographed, hand-completed childcare enrollment form. ` +
    `Transcribe the printed/handwritten values.\n${schema}\n\n` +
    `Return ONLY a JSON object (no markdown, no prose) of exactly this form:\n` +
    `{"form_data": { ...the fields above, omit any you cannot read... }, "lowConfidence": ["dotted.path", ...]}\n` +
    `lowConfidence lists field paths (e.g. "child_name","mailing.zip","children.0.case_no") ` +
    `where the handwriting was unclear or you guessed.`
  const text = await callClaudeText(base64, mediaType, prompt)
  const parsed = extractJson(text) ?? {}
  const form_data = parsed.form_data ?? ((parsed.child_name || parsed.children || parsed.mailing) ? parsed : {})
  const lowConfidence = Array.isArray(parsed.lowConfidence) ? parsed.lowConfidence.map(String) : []
  return { form_data, lowConfidence }
}

// AUTO/RE-RUN mode: classify the document AND extract in one call.
async function classifyAndExtract(base64: string, mediaType: string) {
  if (!ANTHROPIC_API_KEY) return { docType: 'other', form_data: {} as any, license: null as any, lowConfidence: [] as string[] }
  const prompt =
    `You are reading a photographed childcare-program document.\n` +
    `Step 1 — classify docType as EXACTLY one of:\n` +
    `  "cacfp_enrollment" = a CACFP child enrollment form (child name, in-care schedule, meals).\n` +
    `  "iea"              = an Income Eligibility Application (household members, SNAP/OWF, income).\n` +
    `  "license"          = an operating license/permit (e.g. Food Service Operation (FSO) license, childcare license, fire/zoning permit) — has an issuing authority, a license number, and an expiration date.\n` +
    `  "other"            = anything else.\n` +
    `Step 2 — extract fields for the classified type:\n` +
    `  cacfp_enrollment → ${SCHEMAS.cacfp_enrollment}\n` +
    `  iea → ${SCHEMAS.iea}\n` +
    `  license → ${LICENSE_SCHEMA}\n\n` +
    `Return ONLY JSON (no markdown, no prose):\n` +
    `{"docType":"...","form_data":{...cacfp/iea fields...},"license":{...license fields...},"lowConfidence":["dotted.path",...]}\n` +
    `Put enrollment fields in form_data; license fields in license; omit whichever block does not apply. Omit any field you cannot read.`
  const text = await callClaudeText(base64, mediaType, prompt)
  const parsed = extractJson(text) ?? {}
  let docType = String(parsed.docType ?? 'other')
  if (!CLASSES.includes(docType as any)) docType = 'other'
  const lowConfidence = Array.isArray(parsed.lowConfidence) ? parsed.lowConfidence.map(String) : []
  return {
    docType,
    form_data: (parsed.form_data && typeof parsed.form_data === 'object') ? parsed.form_data : {},
    license: (docType === 'license' && parsed.license && typeof parsed.license === 'object') ? parsed.license : null,
    lowConfidence,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const { image, submissionType, centerId, scan_ref } = body ?? {}
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Resolve the image bytes: either from an existing bucket object (re-run) or
    // from an uploaded data URL (capture, which also stores the scan).
    let base64: string
    let mediaType: string
    let bytes: Uint8Array
    let outRef: { bucket: string; path: string }
    const isRerun = !!scan_ref && (typeof scan_ref === 'string' || !!scan_ref.path)

    if (isRerun) {
      const bucket = (typeof scan_ref === 'object' && scan_ref.bucket) || BUCKET
      const path = typeof scan_ref === 'string' ? scan_ref : scan_ref.path
      if (!path) return json({ error: 'scan_ref.path required' }, 400)
      const dl = await admin.storage.from(bucket).download(path)
      if (dl.error) throw dl.error
      bytes = new Uint8Array(await dl.data.arrayBuffer())
      base64 = bytesToBase64(bytes)
      mediaType = dl.data.type || mimeFromExt(path)
      outRef = { bucket, path }
    } else {
      if (!image || !submissionType || !centerId) {
        return json({ error: 'image, submissionType, centerId required (or scan_ref for re-run)' }, 400)
      }
      const p = parseImage(image)
      base64 = p.base64
      mediaType = p.mediaType
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const ext = mediaType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const path = `${centerId}/${crypto.randomUUID()}.${ext}`
      const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mediaType, upsert: false })
      if (up.error) throw up.error
      outRef = { bucket: BUCKET, path }
    }

    const sha256 = await sha256hex(bytes)
    const auto = isRerun || !submissionType || submissionType === 'auto'

    let docType: string = submissionType ?? 'other'
    let form_data: any = {}
    let license: any = null
    let lowConfidence: string[] = []
    let engine: string
    let ocrFailed = false
    let ocrError: string | undefined

    if (auto) {
      // AUTO / RE-RUN → classify + extract; model failure degrades to a flagged
      // card (Path B), never a lost scan.
      try {
        const r = await classifyAndExtract(base64, mediaType)
        docType = r.docType
        form_data = r.form_data
        license = r.license
        lowConfidence = r.lowConfidence
        engine = docType === 'other' ? 'none' : OCR_MODEL
      } catch (e: any) {
        docType = 'other'
        engine = 'failed'
        ocrFailed = true
        ocrError = String(e?.message ?? e)
      }
    } else if (submissionType === 'other') {
      // Capture, explicit "other" → scan only, no OCR (unchanged).
      engine = 'none'
    } else {
      // Capture, known type → extract; persistent model failure → HTTP 500 so the
      // operator re-shoots (Path A) rather than creating a blank pending.
      try {
        const r = await runOcr(base64, mediaType, submissionType)
        form_data = r.form_data
        lowConfidence = r.lowConfidence
        engine = OCR_MODEL
      } catch (e: any) {
        return json({ error: `OCR failed after retries: ${String(e?.message ?? e)}`, scan_ref: outRef, ocrFailed: true }, 500)
      }
    }

    form_data = form_data && typeof form_data === 'object' ? form_data : {}
    form_data.scan_ref = outRef
    form_data._ocr = {
      docType,
      engine,
      at: new Date().toISOString(),
      lowConfidence,
      ...(ocrFailed ? { failed: true, error: ocrError } : {}),
    }

    return json({ scan_ref: outRef, submissionType: docType, form_data, license, lowConfidence, ocrFailed, sha256 })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
