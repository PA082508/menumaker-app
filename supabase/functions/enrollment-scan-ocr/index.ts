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
// 'other' = upload only, no OCR.
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

async function runOcr(base64: string, mediaType: string, submissionType: string) {
  const schema = SCHEMAS[submissionType]
  if (!schema || !ANTHROPIC_API_KEY) return { form_data: {}, lowConfidence: [] as string[] }

  const prompt =
    `You are reading a photographed, hand-completed childcare enrollment form. ` +
    `Transcribe the printed/handwritten values.\n${schema}\n\n` +
    `Return ONLY a JSON object (no markdown, no prose) of exactly this form:\n` +
    `{"form_data": { ...the fields above, omit any you cannot read... }, "lowConfidence": ["dotted.path", ...]}\n` +
    `lowConfidence lists field paths (e.g. "child_name","mailing.zip","children.0.case_no") ` +
    `where the handwriting was unclear or you guessed.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  // Claude may emit a non-text block first — take ALL text blocks.
  const blocks = Array.isArray(data?.content) ? data.content : []
  const text: string = blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim()
  const parsed = extractJson(text) ?? {}
  const form_data = parsed.form_data ?? ((parsed.child_name || parsed.children || parsed.mailing) ? parsed : {})
  const lowConfidence = Array.isArray(parsed.lowConfidence) ? parsed.lowConfidence.map(String) : []
  return { form_data, lowConfidence }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const { image, submissionType, centerId } = await req.json()
    if (!image || !submissionType || !centerId) {
      return json({ error: 'image, submissionType, centerId required' }, 400)
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { base64, mediaType } = parseImage(image)

    // 1) upload the scan (service role → bypasses RLS). Path namespaced by center.
    const ext = mediaType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    const path = `${centerId}/${crypto.randomUUID()}.${ext}`
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mediaType, upsert: false })
    if (up.error) throw up.error

    const scan_ref = { bucket: BUCKET, path }

    // 2) OCR (skipped for 'other' or when no schema/key).
    let form_data: any = {}
    let lowConfidence: string[] = []
    if (submissionType !== 'other') {
      const r = await runOcr(base64, mediaType, submissionType)
      form_data = r.form_data
      lowConfidence = r.lowConfidence
    }

    // 3) embed scan + OCR metadata → ready for submit_enrollment_form.
    form_data.scan_ref = scan_ref
    form_data._ocr = {
      docType: submissionType,
      engine: submissionType === 'other' ? 'none' : OCR_MODEL,
      at: new Date().toISOString(),
      lowConfidence,
    }

    return json({ scan_ref, form_data, lowConfidence })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
