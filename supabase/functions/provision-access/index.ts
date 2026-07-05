// provision-access — create (or top up) a scoped staff login for one org.
//
// Caller must be an org **admin** (via core.memberships) OR an **office_manager**
// (via menumaker.user_roles). The function resolves the caller's org, validates
// the target center(s) belong to it, creates a pre-confirmed email+password auth
// account, and grants — idempotently — all THREE records a scoped user needs:
//
//   1. core.memberships           org-level role (= category)            via core.add_member
//   2. menumaker.user_roles       functional role, one row PER center    (role, center_id)
//   3. core.user_center_access    active center access, one row PER center
//
// (3) is the one the earlier version missed: core.accessible_centers() reads
// user_center_access, and OrgContext pins a director to accessible[0]. Without a
// row there a director logs in to an EMPTY app (no center). So it is mandatory.
//
// Inputs (all backward compatible with the Meal Count Access form):
//   email       string  (required)
//   password    string  (optional — if absent/too short we generate a temp one
//                        and return it as `temp_password`)
//   category    string  ('director' | 'cook', case-insensitive)
//   center_id   string  (single center)          ─┐ at least one of these
//   center_ids  string[](one or more centers)    ─┘ is required
//
// Deploy: supabase functions deploy provision-access --project-ref trrmyqfpxntmgxnqkikp

import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function b64url(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  return atob(s)
}

function callerFromJwt(authHeader: string): string | null {
  try {
    const tok = authHeader.replace(/^Bearer\s+/i, '')
    const payload = JSON.parse(b64url(tok.split('.')[1]))
    return payload.sub ?? null
  } catch {
    return null
  }
}

// Strong, human-readable temp password (no ambiguous chars). ~72 bits.
function genPassword(): string {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const digit = '23456789'
  const all = alpha + digit
  const buf = new Uint8Array(14)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < buf.length; i++) out += all[buf[i] % all.length]
  // guarantee at least one letter + one digit
  return 'Pa' + out + digit[buf[0] % digit.length]
}

const ALLOWED = ['director', 'cook'] // teacher requires a CHECK change -> deferred

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!DB_URL) return json({ error: 'server misconfigured: no DB url' }, 500)

  const callerId = callerFromJwt(req.headers.get('Authorization') || '')
  if (!callerId) return json({ error: 'не авторизован' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  const email = String(body.email || '').trim().toLowerCase()
  // case-insensitive: the Meal Count Access form sends "Director"/"Cook".
  const category = String(body.category || '').trim().toLowerCase()
  // accept single center_id OR center_ids[]; de-dupe, drop blanks.
  const centerIds: string[] = Array.from(new Set(
    [...(Array.isArray(body.center_ids) ? body.center_ids : []), body.center_id]
      .map((c: unknown) => (c ? String(c) : ''))
      .filter(Boolean)
  ))

  // Password: use the caller's if valid, otherwise generate a temp one.
  const suppliedPw = String(body.password || '')
  const generated = suppliedPw.length < 8
  const password = generated ? genPassword() : suppliedPw

  if (!email) return json({ error: 'email обязателен' }, 400)
  if (!ALLOWED.includes(category)) {
    return json({ error: 'категория должна быть director или cook (teacher — позже)' }, 400)
  }
  if (centerIds.length === 0) return json({ error: 'нужно выбрать хотя бы один центр' }, 400)

  const sql = postgres(DB_URL, { prepare: false })
  try {
    // 1) caller must be owner (admin via membership, OR office_manager via user_roles); resolve their org
    const owner = await sql`
      select m.org_id
      from core.memberships m
      where m.user_id = ${callerId}
        and (
          m.role = 'admin'
          or exists (
            select 1 from menumaker.user_roles ur
            where ur.user_id = ${callerId} and ur.role = 'office_manager'
          )
        )
      limit 1`
    if (owner.length === 0) {
      return json({ error: 'только admin/office_manager могут выдавать доступ' }, 403)
    }
    const org_id = owner[0].org_id as string

    // 2) every center must belong to that org
    const ctr = await sql`
      select id from menumaker.centers
      where org_id = ${org_id} and id in ${sql(centerIds)}`
    if (ctr.length !== centerIds.length) {
      return json({ error: 'один из центров не найден в вашей организации' }, 400)
    }

    // 3) create the auth account (email+password, pre-confirmed)
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
    const created = await res.json()
    if (!res.ok) {
      const msg = created?.msg || created?.error_description || created?.message || 'не удалось создать аккаунт'
      const dup = /registered|exists|already/i.test(String(msg))
      return json({ error: dup ? 'аккаунт с таким email уже существует' : msg }, dup ? 409 : 400)
    }
    const newUserId = created.id as string

    // 4) org membership (org role = category) via blessed fn; service role passes its authz
    await sql`select core.add_member(${org_id}::uuid, ${newUserId}::uuid, ${category}::text, '{}'::text[])`

    // 5) + 6) per center: functional role (center-scoped) AND active center access.
    //     BOTH idempotent so re-running never errors.
    for (const cid of centerIds) {
      await sql`
        insert into menumaker.user_roles (user_id, role, org_id, center_id)
        values (${newUserId}::uuid, ${category}::text, ${org_id}::uuid, ${cid}::uuid)
        on conflict (user_id, role, center_id) do nothing`
      await sql`
        insert into core.user_center_access (org_id, user_id, center_id, granted_by, is_active)
        values (${org_id}::uuid, ${newUserId}::uuid, ${cid}::uuid, ${callerId}::uuid, true)
        on conflict (org_id, user_id, center_id) do update set is_active = true`
    }

    return json({
      ok: true,
      user_id: newUserId,
      email,
      category,
      center_ids: centerIds,
      org_id,
      // only surfaced when WE generated it — the admin must hand it to the user once.
      temp_password: generated ? password : undefined,
    })
  } catch (e) {
    return json({ error: 'server error', detail: String(e) }, 500)
  } finally {
    try { await sql.end() } catch { /* noop */ }
  }
})
