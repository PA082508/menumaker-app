// enrollment-snapshot — service-role writer for the frozen "approved original form" snapshot.
//
// The client (Approve flow) renders the same-origin replica, html2canvas'es each page to PNG,
// and POSTs the base64 pages here. This function is the ONLY writer to the private
// enrollment-snapshots bucket + menumaker.enrollment_snapshots table (mirrors enrollment-scan-ocr).
//
// AUTHORITATIVE: org_id / center_id / form_type / submission_content_hash come from the
// submission row (read with the service role), never from the client. AUTHZ: the caller's JWT
// must be able to read the submission's center under RLS (i.e. be an org member) — reusing the
// existing RLS instead of a bespoke check. Snapshot pixels are the clean official pages; this
// function records provenance (edition + sha + ts + submission link), it never alters pixels.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'unauthorized' }, 401)

  // caller identity + RLS-scoped client (used only to prove org membership)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    db: { schema: 'menumaker' },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const uid = userData.user.id

  let body: any
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const submissionId = body?.submission_id as string | undefined
  const replicaEdition = String(body?.replica_edition ?? '').trim()
  const pages: string[] = Array.isArray(body?.pages) ? body.pages : []
  if (!submissionId || pages.length === 0) return json({ error: 'submission_id and pages required' }, 400)
  if (pages.length > 6) return json({ error: 'too many pages' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'menumaker' } })

  // authoritative submission row
  const { data: sub, error: subErr } = await admin
    .from('enrollment_submissions')
    .select('id, org_id, center_id, submission_type, content_hash')
    .eq('id', submissionId).maybeSingle()
  if (subErr || !sub) return json({ error: 'submission not found' }, 404)

  // authz: the caller must be able to read this submission's center under RLS (org member)
  const { data: centerRow } = await userClient.from('centers').select('id').eq('id', sub.center_id).maybeSingle()
  if (!centerRow) return json({ error: 'forbidden' }, 403)

  // upload pages (service role) + content sha over the concatenated PNG bytes
  const prefix = `${sub.center_id}/${sub.id}`
  const parts: Uint8Array[] = []
  for (let i = 0; i < pages.length; i++) {
    const bytes = b64ToBytes(pages[i])
    parts.push(bytes)
    const { error: upErr } = await admin.storage.from('enrollment-snapshots')
      .upload(`${prefix}/page-${i + 1}.png`, bytes, { contentType: 'image/png', upsert: true })
    if (upErr) return json({ error: 'upload failed: ' + upErr.message }, 500)
  }
  const contentSha = await sha256Hex(concat(parts))

  const { data: snap, error: insErr } = await admin
    .from('enrollment_snapshots')
    .insert({
      submission_id: sub.id, org_id: sub.org_id, center_id: sub.center_id,
      form_type: sub.submission_type, replica_edition: replicaEdition || 'unknown',
      storage_path: prefix, page_count: pages.length,
      content_sha: contentSha, submission_content_hash: sub.content_hash ?? null,
      created_by: uid,
    })
    .select('id').single()
  if (insErr) return json({ error: 'insert failed: ' + insErr.message }, 500)

  return json({ ok: true, id: snap.id, storage_path: prefix, page_count: pages.length, content_sha: contentSha })
})

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return a
}
function concat(arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}
