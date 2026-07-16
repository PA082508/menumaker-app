// IssueRenewalPage — issue a renewal portion: one personal, tokenized link per child.
//
// This is the thing the contour was missing. Everything else was built and waiting:
// prefill_tokens + mint_prefill_token + get_prefill existed, campaigns existed,
// enrollment-autofile was deployed — but nothing ISSUED, so no token ever existed, so
// auto-file correctly filed nothing.
//
// A renewal is not matched by name, it is RECOGNISED by the token this page mints.
// See docs/prefill-engine-spec.md and docs/specs/renewal-contour-spec.md §2e.
//
// ⚠️ NO QR HERE, deliberately. Locked decision 6: a shared QR carrying a token is a leak —
// whoever photographs it gets a link that prefills a named child's data. Delivery is the
// family's email on file, or the director opening the link on a kiosk at drop-off. The
// token-free centre QR lives on Issue Packet and is unaffected.
//
// ⚠️ Sending is MANUAL in v1: there is no email provider in this project (send-push is
// web-push). The address shown comes from the DB — the director copies the link to the
// address ON FILE. That keeps decision 6's controlled channel; it just isn't automated.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import { displayChildName, byEnrollmentName } from '@/lib/childName'
import { storefrontTokenUrl } from '@/config/showcaseLinks'
import Button, { ButtonRow } from '@/components/ui/Button'

const S = () => supabase.schema('menumaker')
const GREEN = '#0f4c35'

type Kid = {
  id: string; child_id: string | null
  first_name: string | null; last_name: string | null; child_name: string | null
}
type Row = Kid & { email: string | null; token: string | null; issuedAt: string | null }
type Campaign = { id: string; title: string; form_keys: string[]; status: string }

export default function IssueRenewalPage() {
  const { org, currentCenter, isOrgAdmin, orgRole } = useOrg()
  const { user } = useAuth()
  const allowed = isOrgAdmin || ['admin', 'director', 'office_manager', 'owner'].includes(orgRole ?? '')

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [slug, setSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Centre slug for the storefront link. Comes from the registry (the same map embed.js
  // uses), never guessed from the centre's name.
  useEffect(() => {
    if (!currentCenter?.id) { setSlug(null); return }
    let dead = false
    ;(async () => {
      try {
        const r = await fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
        const j = await r.json()
        const hit = Object.entries<any>(j.centers ?? {}).find(([, v]) => v.center_id === currentCenter.id)
        if (!dead) setSlug(hit?.[0] ?? null)
      } catch { if (!dead) setSlug(null) }
    })()
    return () => { dead = true }
  }, [currentCenter?.id])

  const load = async () => {
    if (!org?.id || !currentCenter?.id) return
    setLoading(true); setErr(null)
    try {
      const { data: cs, error: cErr } = await S().from('campaigns')
        .select('id,title,form_keys,status')
        .eq('org_id', org.id).eq('status', 'active')
        .or(`center_id.eq.${currentCenter.id},center_id.is.null`)
        .order('created_at', { ascending: false })
      if (cErr) throw cErr
      setCampaigns((cs ?? []) as Campaign[])
      const cid = campaignId || (cs?.[0]?.id ?? '')
      setCampaignId(cid)

      const { data: kids, error: kErr } = await S().from('roster')
        .select('id,child_id,first_name,last_name,child_name')
        .eq('center_id', currentCenter.id).eq('is_active', true)
      if (kErr) throw kErr

      // Guardian email travels roster.child_id → child_guardian.child_id, NOT roster.id.
      // I got this wrong once and measured "0 of 332 families have an email"; the bridge
      // column is the join. (ParentsPage does the same walk.)
      const bridge = (kids ?? []).map(k => k.child_id).filter(Boolean) as string[]
      const mailByBridge = new Map<string, string>()
      if (bridge.length) {
        const { data: links } = await S().from('child_guardian')
          .select('child_id,guardian_id,emergency_contact_order').in('child_id', bridge)
        const gIds = Array.from(new Set((links ?? []).map(l => l.guardian_id as string)))
        if (gIds.length) {
          const { data: gs } = await S().from('guardian').select('id,email').in('id', gIds)
          const mail = new Map((gs ?? []).map(g => [g.id as string, (g.email as string) || '']))
          for (const l of (links ?? []).sort((a: any, b: any) =>
            (a.emergency_contact_order ?? 99) - (b.emergency_contact_order ?? 99))) {
            const e = mail.get(l.guardian_id as string)
            if (e && !mailByBridge.has(l.child_id as string)) mailByBridge.set(l.child_id as string, e)
          }
        }
      }

      // Who has already been issued IN THIS campaign. This is the "sent" column, and the
      // roster minus it is "who else to send to" — both straight out of prefill_tokens,
      // which is why there is no second table.
      const tokByChild = new Map<string, { token: string; at: string }>()
      if (cid) {
        const { data: toks } = await S().from('prefill_tokens')
          .select('token,child_id,created_at').eq('batch_id', cid)
        for (const t of toks ?? []) tokByChild.set(t.child_id as string, { token: t.token as string, at: t.created_at as string })
      }

      setRows(((kids ?? []) as Kid[]).sort(byEnrollmentName).map(k => ({
        ...k,
        email: k.child_id ? (mailByBridge.get(k.child_id) ?? null) : null,
        token: tokByChild.get(k.id)?.token ?? null,
        issuedAt: tokByChild.get(k.id)?.at ?? null,
      })))
    } catch (e: any) {
      // A failed load must never read as "nobody to issue to".
      setErr(e?.message ?? String(e)); setRows([])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [org?.id, currentCenter?.id, campaignId])

  const campaign = campaigns.find(c => c.id === campaignId) ?? null
  const stats = useMemo(() => ({
    total: rows.length,
    sent: rows.filter(r => r.token).length,
    todo: rows.filter(r => !r.token).length,
    noMail: rows.filter(r => !r.email).length,
  }), [rows])

  async function createCampaign() {
    const title = window.prompt('Name this portion (e.g. "Renewal 2026-27")')
    if (!title?.trim() || !org?.id || !currentCenter?.id) return
    setBusy(true); setErr(null)
    try {
      const { data, error } = await S().from('campaigns').insert({
        org_id: org.id, center_id: currentCenter.id, title: title.trim(),
        // Wave 1 (decided): the two clean-signature forms. The set lives on the batch,
        // not on the token — one token covers the whole portion ("Form N of M").
        form_keys: ['parent_consent', 'parents_book_ack'],
        status: 'active', created_by: user?.id ?? null,
      }).select('id').single()
      if (error) throw error
      setCampaignId(data.id); setNote(`Portion “${title.trim()}” created.`)
    } catch (e: any) { setErr(`Not created — ${e?.message ?? e}`) }
    finally { setBusy(false) }
  }

  async function issue() {
    if (!campaign || !org?.id || !currentCenter?.id || sel.size === 0) return
    setBusy(true); setErr(null); setNote(null)
    let ok = 0
    try {
      for (const rosterId of sel) {
        // mint_prefill_token upserts on child_id: a child has exactly ONE live token, and
        // re-issuing REPLACES the old one (locked decision 4). Re-issuing is therefore
        // safe and is how you resend.
        const { error } = await S().rpc('mint_prefill_token', {
          p_child: rosterId, p_center: currentCenter.id, p_org: org.id, p_batch: campaign.id,
        })
        if (error) throw error
        ok++
      }
      setSel(new Set())
      setNote(`Issued ${ok} personal ${ok === 1 ? 'link' : 'links'}. Nothing was sent — copy each link to the address on file.`)
      await load()
    } catch (e: any) {
      setErr(`Stopped after ${ok} — ${e?.message ?? e}. Nothing else was issued.`)
      await load()
    } finally { setBusy(false) }
  }

  const linkFor = (r: Row) =>
    slug && r.token && campaign ? storefrontTokenUrl(slug, r.token, campaign.form_keys) : null

  if (!allowed) return <div style={wrap}><div style={{ color: '#9ca3af', fontSize: 14 }}>You don’t have access to issuing.</div></div>
  if (!currentCenter?.id) return <div style={wrap}><Title /><div style={empty}>Pick a center in the switcher at the top — a personal link must be scoped to one center.</div></div>

  return (
    <div style={wrap}>
      <Title center={currentCenter.name} />

      {err && <Banner tone="bad">{err}</Banner>}
      {note && <Banner tone="ok">{note}</Banner>}
      {!slug && (
        <Banner tone="bad">
          This center has no slug in the forms registry, so a personal link cannot be built —
          a storefront URL without <code>center=</code> dead-ends at the packet gate. Add the
          center to <code>enroll-registry.json</code> first.
        </Banner>
      )}

      <ButtonRow style={{ margin: '14px 0 6px' }}>
        <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={ctl}>
          {campaigns.length === 0 && <option value="">— no portion yet —</option>}
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <Button onClick={createCampaign} disabled={busy}>➕ New portion</Button>
        <Button variant="primary" onClick={issue} disabled={busy || !campaign || !slug || sel.size === 0}>
          {busy ? 'Issuing…' : `Issue ${sel.size || ''} personal ${sel.size === 1 ? 'link' : 'links'}`}
        </Button>
      </ButtonRow>

      {campaign && (
        <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 12 }}>
          Forms in this portion: <b>{campaign.form_keys.join(', ')}</b> · sent <b>{stats.sent}</b> ·
          not yet sent <b>{stats.todo}</b> of {stats.total}
          {stats.noMail > 0 && <> · <span style={{ color: '#92400e' }}>{stats.noMail} without an email on file → hand at drop-off</span></>}
        </div>
      )}

      {loading ? <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div> : rows.length === 0 ? (
        <div style={empty}>No active children in this center.</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, background: '#fff' }}>
          <thead>
            <tr>
              <th style={th}>
                <input type="checkbox"
                  checked={sel.size > 0 && sel.size === rows.filter(r => !r.token).length}
                  onChange={e => setSel(e.target.checked ? new Set(rows.filter(r => !r.token).map(r => r.id)) : new Set())} />
              </th>
              <th style={{ ...th, textAlign: 'left' }}>Child</th>
              <th style={{ ...th, textAlign: 'left' }}>Send to</th>
              <th style={th}>Personal link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const url = linkFor(r)
              return (
                <tr key={r.id} style={{ background: r.token ? '#f6fdf9' : '#fff' }}>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={sel.has(r.id)}
                      onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} />
                  </td>
                  <td style={td}>
                    {displayChildName(r)}
                    {!r.child_id && (
                      <span title="This roster row has no link to a parent record, so there is no address on file"
                        style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>
                        no parent record
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, color: r.email ? '#374151' : '#92400e' }}>
                    {r.email ?? 'no email on file → open on a kiosk at drop-off'}
                  </td>
                  <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {!r.token ? <span style={{ color: '#c9cdc9' }}>—</span> : !url ? <span style={{ color: '#c9cdc9' }}>—</span> : (
                      <>
                        <button onClick={() => { navigator.clipboard?.writeText(url); setNote('Link copied. Send it to the address on file — nothing else.') }}
                          style={mini}>📋 Copy</button>
                        {/* The kiosk lane from decision 6: open the family's own link on
                            this device at drop-off. Same token, controlled channel. */}
                        <a href={url} target="_blank" rel="noreferrer" style={{ ...mini, textDecoration: 'none', marginLeft: 6, display: 'inline-block' }}>
                          🖥 Open here
                        </a>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 3 }}>
                          issued {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : ''}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: '#9ca3af', lineHeight: 1.6 }}>
        A personal link carries a token that prefills <b>this child’s</b> data and files the
        returned form to <b>this child</b> automatically. It is not a poster: never put it on a
        QR, a group chat or a noticeboard. It expires in 30 days, and filing the form ends it.
        Re-issuing replaces a child’s previous link.
      </div>
    </div>
  )
}

function Title({ center }: { center?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>ENROLLMENT</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#0a3320', fontFamily: "'DM Serif Display', serif" }}>Issue a renewal portion</div>
      <div style={{ fontSize: 12.5, color: '#6b7280' }}>
        {center ? `📍 ${center} · ` : ''}One personal link per child. What comes back files itself.
      </div>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  const bad = tone === 'bad'
  return (
    <div role={bad ? 'alert' : undefined} style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0',
      padding: '11px 14px', borderRadius: 9, fontSize: 13, fontWeight: 500,
      background: bad ? '#fef2f2' : '#f0fff4', border: `1px solid ${bad ? '#fca5a5' : '#d1fae5'}`,
      color: bad ? '#991b1b' : '#166534',
    }}><span>{bad ? '⚠' : '✓'}</span><span>{children}</span></div>
  )
}

const wrap: React.CSSProperties = { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1000 }
const empty: React.CSSProperties = { padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb', marginTop: 16 }
const ctl: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', minWidth: 190 }
const th: React.CSSProperties = { border: '1px solid #e4e8e4', background: '#f0fff4', padding: '6px 8px', color: '#0a3320', fontSize: 11.5 }
const td: React.CSSProperties = { border: '1px solid #e4e8e4', padding: '6px 8px', color: '#374151' }
const mini: React.CSSProperties = { font: 'inherit', fontSize: 11.5, padding: '4px 9px', borderRadius: 7, border: '1px solid #c0d8c0', background: '#fff', color: GREEN, cursor: 'pointer' }
