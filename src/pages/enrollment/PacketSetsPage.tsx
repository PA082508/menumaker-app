// PacketSetsPage — /packet-sets. The director edits what forms live in a packet SET.
//
// A "set" is a row in menumaker.packet_sets (migration 20260721): id = the stationary QR,
// composition = form_keys[] (registry keys — the forms themselves and their editions stay in
// enroll-registry; a set holds only WHICH forms and in what order). The storefront resolves a
// set's composition from the DB by id (resolve_packet_set, step #2), so editing a set here
// never changes its QR.
//
// This branch = #3a (list) + #3b (composition editor). CRUD chrome (+New / rename / archive)
// and the QR / mailing block are the next pieces (#3c / #4).
//
// Scope & guards, all enforced by RLS on packet_sets — the UI only MIRRORS them:
//   • sees base (org-wide) + custom of the active center;
//   • composition of ANY set is editable, INCLUDING base — when the state swaps a form the
//     director replaces it here, no developer/deploy needed;
//   • base cannot be archived/deleted (DB blocks it); this screen doesn't offer it anyway.
// The library is read through the useFormsLibrary() seam — this screen never touches the
// registry directly, so the registry can move to the DB later without changing this file.

import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useFormsLibrary, isDirectorComposable, type FormAccessMap } from '@/lib/formsLibrary'
import { SECTIONS, sectionOfKey, type SectionId } from '@/lib/documentSections'
import { storefrontPacketUrl } from '@/config/showcaseLinks'
import Button, { ButtonRow } from '@/components/ui/Button'
import BackBar from '@/components/BackBar'

const S = () => supabase.schema('menumaker')
const GREEN = '#0f4c35'

type PacketSet = {
  id: string
  org_id: string
  center_id: string | null
  name: string
  slug: string | null
  kind: 'base' | 'custom'
  form_keys: string[]
  status: 'active' | 'archived'
}

export default function PacketSetsPage() {
  const { org, currentCenter, centers, isOrgAdmin, orgRole } = useOrg()
  const allowed = isOrgAdmin || ['admin', 'director', 'office_manager', 'owner'].includes(orgRole ?? '')

  const lib = useFormsLibrary()

  const [sets, setSets] = useState<PacketSet[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([]) // form_keys being edited
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // ── CRUD chrome (#3c): create / rename / archive. All against the SAME packet_sets
  // RLS the composition editor already obeys — a director creates+edits custom sets for
  // their center; base sets stay owner-only and un-archivable (the DB blocks it, the UI
  // never offers it). No DELETE anywhere — archive is the only removal (RLS drops delete).
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCenterId, setNewCenterId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Director-access (closed-list; DEFAULT OPEN). The overlay menumaker.form_access holds ONLY
  // CLOSED forms (director_hidden=true); absence of a row = open. The General Director manages this
  // in Documents → Library (per-file 👁/🚫), NOT here — this screen only READS the closed-list to
  // filter a director's Add-from-library. A GD sees the whole library regardless.
  const isGD = isOrgAdmin
  const [hidden, setHidden] = useState<FormAccessMap>({})
  const [sectionFilter, setSectionFilter] = useState<SectionId | 'all'>('all')
  useEffect(() => {
    if (!org?.id) return
    let dead = false
    S().from('form_access').select('form_key,director_hidden').then(({ data, error }) => {
      if (dead || error) return // no overlay → nothing hidden → all open (the default polarity)
      const m: FormAccessMap = {}
      for (const r of (data ?? []) as { form_key: string; director_hidden: boolean }[]) {
        if (r.director_hidden === true) m[r.form_key] = true
      }
      setHidden(m)
    })
    return () => { dead = true }
  }, [org?.id])

  // ── Share (#4): storefront slug per center comes from the registry (never guessed
  // from the center's name — same map embed.js uses), keyed by center_id.
  const [centerSlug, setCenterSlug] = useState<Record<string, string>>({})
  const [shareCenterId, setShareCenterId] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (dead || !j?.centers) return
        const m: Record<string, string> = {}
        for (const [slug, v] of Object.entries<any>(j.centers)) if (v?.center_id) m[v.center_id] = slug
        setCenterSlug(m)
      })
      .catch(() => {})
    return () => { dead = true }
  }, [])

  const selected = useMemo(() => sets.find(s => s.id === selectedId) ?? null, [sets, selectedId])
  const dirty = useMemo(
    () => !!selected && (draft.length !== selected.form_keys.length || draft.some((k, i) => k !== selected.form_keys[i])),
    [draft, selected],
  )

  const load = async () => {
    if (!org?.id) return
    setLoading(true); setErr(null)
    try {
      // RLS already scopes this; the filter mirrors it for clarity.
      //  • director (a center in context) → base + own-center custom
      //  • org-admin in Organization view (no center) → NO filter: RLS returns base +
      //    EVERY center's custom (the owner manages the whole network)
      //  • anyone else with no center → base only (defensive)
      let q = S().from('packet_sets').select('*')
      if (currentCenter?.id) q = q.or(`center_id.eq.${currentCenter.id},center_id.is.null`)
      else if (!isOrgAdmin) q = q.is('center_id', null)
      const { data, error } = await q.order('kind', { ascending: true }).order('name', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as PacketSet[]
      setSets(rows)
      // keep selection if it survived; else pick the first
      setSelectedId(prev => (prev && rows.some(r => r.id === prev) ? prev : rows[0]?.id ?? null))
    } catch (e: any) {
      // Never a silent empty state — a swallowed RLS/column error reads as "no sets".
      setErr(`Could not load packet sets — ${e?.message ?? e}`)
      setSets([])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [org?.id, currentCenter?.id])

  // Mirror of the packet_sets RLS (UI ONLY — the DB enforces it regardless):
  //   base  → editable by the owner (org-admin) alone ("network standard");
  //   custom→ editable by its own center OR the owner.
  const canEdit = (s: PacketSet) =>
    s.kind === 'base' ? isOrgAdmin : (isOrgAdmin || s.center_id === currentCenter?.id)

  // Group the list: "Base — network standard" first, then a section per center. A director
  // sees Base + their one center; the owner sees Base + every center.
  const centerName = (id: string | null) =>
    id == null ? null : (centers.find(c => c.id === id)?.name ?? 'Center')
  const groups = useMemo(() => {
    const g: { key: string; label: string; items: PacketSet[] }[] = []
    const base = sets.filter(s => s.center_id == null)
    if (base.length) g.push({ key: 'base', label: 'Base — network standard', items: base })
    const byCenter = new Map<string, PacketSet[]>()
    for (const s of sets) if (s.center_id != null) {
      const arr = byCenter.get(s.center_id) ?? []
      arr.push(s); byCenter.set(s.center_id, arr)
    }
    const ids = [...byCenter.keys()].sort((a, b) => (centerName(a) ?? '').localeCompare(centerName(b) ?? ''))
    for (const cid of ids) g.push({ key: cid, label: centerName(cid) ?? 'Center', items: byCenter.get(cid)! })
    return g
  }, [sets, centers])
  // Load the selected set's composition into the draft whenever selection changes.
  useEffect(() => { setDraft(selected ? [...selected.form_keys] : []); setNote(null) }, [selectedId, selected?.form_keys])
  // A custom set's QR is its own center; a base set is org-wide → default to the active
  // center and let the director pick which center this QR is for.
  useEffect(() => { setShareCenterId(selected?.center_id ?? currentCenter?.id ?? null) }, [selectedId, selected?.center_id, currentCenter?.id])

  const inSet = useMemo(() => new Set(draft), [draft])
  // The WHOLE registry is always shown — search is the only filter. Forms already in the
  // set are not hidden (that read as "not the full registry"): they stay visible, marked
  // "in set" and inert. Any real exclusion must be a conscious flag, never a silent drop.
  const libShown = useMemo(() => {
    const q = search.trim().toLowerCase()
    let items = lib.items
    if (q) items = items.filter(i => i.title.toLowerCase().includes(q) || i.key.toLowerCase().includes(q))
    if (sectionFilter !== 'all') items = items.filter(i => sectionOfKey(i.key) === sectionFilter)
    // Access-gate HIDES for a director (unlike the publish-gate, which greys). Default is OPEN —
    // only forms the GD explicitly CLOSED in Documents → Library drop out. The GD sees everything.
    // A form already in the set stays in the In-this-set column regardless — this filters only ADD.
    if (!isGD) items = items.filter(i => isDirectorComposable(i.key, hidden))
    return items
  }, [lib.items, search, sectionFilter, isGD, hidden])

  const editable = selected ? canEdit(selected) : false
  const move = (i: number, dir: -1 | 1) => { if (!editable) return; setDraft(d => {
    const j = i + dir
    if (j < 0 || j >= d.length) return d
    const n = [...d]; [n[i], n[j]] = [n[j], n[i]]; return n
  }) }
  const remove = (key: string) => { if (editable) setDraft(d => d.filter(k => k !== key)) }
  const add = (key: string) => { if (editable) setDraft(d => (d.includes(key) ? d : [...d, key])) }
  const reset = () => { setDraft(selected ? [...selected.form_keys] : []); setNote(null) }

  const save = async () => {
    if (!selected || !dirty || !editable) return
    setSaving(true); setErr(null); setNote(null)
    try {
      const { error } = await S().from('packet_sets').update({ form_keys: draft }).eq('id', selected.id)
      if (error) throw error
      setNote(`Saved — “${selected.name}” now has ${draft.length} form${draft.length === 1 ? '' : 's'}.`)
      await load()
    } catch (e: any) {
      setErr(`Save failed — ${e?.message ?? e}. Nothing was changed.`)
    } finally { setSaving(false) }
  }

  const titleOf = (key: string) => lib.byKey.get(key)?.title ?? key
  const isUnknown = (key: string) => lib.items.length > 0 && !lib.byKey.has(key)
  // The map-is-the-gate read for a key already in a set: known to the library but not yet
  // publishable (registry PENDING / current:null). Flagged, never silently dropped.
  const isUnpublishable = (key: string) => {
    const it = lib.byKey.get(key)
    return !!it && !it.publishable
  }

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  const slugify = (name: string) =>
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || null
  // A slug is unique per org; keep it readable but never let a collision block creation —
  // the QR keys off the row id (uuid), not the slug, so a null slug is perfectly fine.
  const uniqueSlug = (name: string) => {
    const base = slugify(name)
    if (!base) return null
    const taken = new Set(sets.map(s => s.slug).filter(Boolean) as string[])
    if (!taken.has(base)) return base
    for (let n = 2; n < 50; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
    return null
  }

  const createTargetCenterId = currentCenter?.id ?? newCenterId
  const createSet = async () => {
    const name = newName.trim()
    if (!name) { setErr('Give the set a name first.'); return }
    if (!createTargetCenterId) { setErr('Pick which center this set belongs to.'); return }
    if (!org?.id) return
    setBusy(true); setErr(null); setNote(null)
    const row = { org_id: org.id, center_id: createTargetCenterId, name, slug: uniqueSlug(name), kind: 'custom' as const, form_keys: [] as string[], status: 'active' as const }
    try {
      let { data, error } = await S().from('packet_sets').insert(row).select('id').single()
      // Unique-slug race across sessions → retry once with no slug (uuid is the real key).
      if (error && String(error.code) === '23505') {
        ({ data, error } = await S().from('packet_sets').insert({ ...row, slug: null }).select('id').single())
      }
      if (error) throw error
      setCreating(false); setNewName(''); setNewCenterId(null)
      setNote(`Created “${name}” — empty. Add forms below, then Save.`)
      await load()
      if (data?.id) setSelectedId(data.id as string)
    } catch (e: any) {
      setErr(`Could not create the set — ${e?.message ?? e}. Nothing was changed.`)
    } finally { setBusy(false) }
  }

  const renameSet = async (s: PacketSet) => {
    const name = renameText.trim()
    if (!name) { setErr('The name can’t be empty.'); return }
    if (name === s.name) { setRenamingId(null); return }
    setBusy(true); setErr(null); setNote(null)
    try {
      const { error } = await S().from('packet_sets').update({ name }).eq('id', s.id)
      if (error) throw error
      setRenamingId(null); setNote(`Renamed to “${name}”.`)
      await load()
    } catch (e: any) {
      setErr(`Rename failed — ${e?.message ?? e}. The old name is unchanged.`)
    } finally { setBusy(false) }
  }

  const setStatus = async (s: PacketSet, status: 'active' | 'archived') => {
    setBusy(true); setErr(null); setNote(null)
    try {
      const { error } = await S().from('packet_sets').update({ status }).eq('id', s.id)
      if (error) throw error
      setNote(status === 'archived'
        ? `“${s.name}” archived — its QR still resolves, but it’s out of the way. Unarchive any time.`
        : `“${s.name}” is active again.`)
      await load()
    } catch (e: any) {
      setErr(`Could not ${status === 'archived' ? 'archive' : 'restore'} the set — ${e?.message ?? e}.`)
    } finally { setBusy(false) }
  }

  // ── Share (#4): stationary QR + copyable mailing block ─────────────────────
  const shareSlug = shareCenterId ? centerSlug[shareCenterId] ?? null : null
  // QR encodes only center + set.id → resolve_packet_set reads the SAVED composition
  // live from the DB, so the QR never changes when the set is edited.
  const shareUrl = selected && shareSlug ? storefrontPacketUrl(shareSlug, selected.id) : null
  const shareCenterName = centers.find(c => c.id === shareCenterId)?.name ?? ''

  const qrCanvas = () => document.getElementById('pset-qr')?.querySelector('canvas') as HTMLCanvasElement | null

  const buildBlockHtml = (): string | null => {
    const canvas = qrCanvas()
    if (!canvas || !shareUrl || !selected) return null
    const png = canvas.toDataURL('image/png')
    // Self-contained (inline PNG) so it survives paste into an email/flyer.
    return (
      `<table style="border-collapse:collapse;font-family:Arial,sans-serif"><tr>` +
      `<td style="padding:0 14px 0 0;vertical-align:top"><img src="${png}" width="150" height="150" alt="Packet QR"></td>` +
      `<td style="vertical-align:top">` +
      `<div style="font-size:16px;font-weight:bold;color:#0a3320">${selected.name}${shareCenterName ? ` — ${shareCenterName}` : ''}</div>` +
      `<div style="font-size:13px;color:#374151;margin:4px 0 8px">Scan the code or open the link to fill out your child's forms:</div>` +
      `<div style="font-size:12px"><a href="${shareUrl}" style="color:#0f4c35">${shareUrl}</a></div>` +
      `</td></tr></table>`
    )
  }

  const copyBlock = async () => {
    const html = buildBlockHtml()
    if (!html) { setErr('QR is not ready — pick a center first.'); return }
    setErr(null)
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([shareUrl ?? ''], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      setNote('Block copied — paste it into your email or flyer (the QR image comes with it).')
    } catch {
      try { await navigator.clipboard.writeText(html); setNote('Block HTML copied as text.') }
      catch { setErr('Copy failed — the browser blocked clipboard access.') }
    }
  }

  const downloadQr = () => {
    const canvas = qrCanvas()
    if (!canvas || !selected) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `packet-${selected.slug ?? selected.id}-${shareSlug ?? 'center'}.png`
    a.click()
  }

  // Entered by a button from the Children hub → leave by a button (nav standard:
  // a page opened from a hub carries a return control to that hub). Same BackBar
  // component the Enrollment Inbox uses — reused, not reinvented.
  if (!allowed) return (
    <div style={wrap}>
      <div style={{ margin: '-24px -32px 18px' }}><BackBar to="/children" label="Children" /></div>
      <div style={{ color: '#9ca3af', fontSize: 14 }}>You don’t have access to packet sets.</div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ margin: '-24px -32px 18px' }}><BackBar to="/children" label="Children" /></div>
      <Title center={currentCenter?.name} />

      {err && <Banner tone="bad">{err}</Banner>}
      {note && <Banner tone="ok">{note}</Banner>}
      {lib.error && <Banner tone="bad">Forms library failed to load ({lib.error}) — the composition editor needs it. Reload the page.</Banner>}

      <div style={cols}>
        {/* ── Sets ─────────────────────────────────────────────── */}
        <div style={colSets}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={colHead}>Sets</div>
            {!creating && (
              <button onClick={() => { setCreating(true); setErr(null); setNote(null); setNewName(''); setNewCenterId(currentCenter?.id ?? null) }}
                style={newBtn} title="Create a new custom set for your center">＋ New set</button>
            )}
          </div>

          {creating && (
            <div style={createCard}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0a3320', marginBottom: 7 }}>New custom set</div>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createSet(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="Set name (e.g. Summer Camp 2026)" style={searchBox} />
              {/* Owner in Organization view has no active center → must say which one. A director
                  is already scoped to their center, so no picker is shown. */}
              {!currentCenter?.id && (
                <select value={newCenterId ?? ''} onChange={e => setNewCenterId(e.target.value || null)} style={{ ...searchBox, marginBottom: 8 }}>
                  <option value="">— center for this set —</option>
                  {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <ButtonRow>
                <Button variant="primary" onClick={createSet} disabled={busy || !newName.trim() || !createTargetCenterId}>
                  {busy ? 'Creating…' : 'Create'}
                </Button>
                <Button onClick={() => { setCreating(false); setNewName(''); setNewCenterId(null) }} disabled={busy}>Cancel</Button>
              </ButtonRow>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, lineHeight: 1.45 }}>
                A new set starts empty and belongs to {currentCenter?.name ?? 'the center you pick'}. Base “network
                standard” sets are owner-managed and aren’t created here.
              </div>
            </div>
          )}

          {loading ? <div style={muted}>Loading…</div> : sets.length === 0 ? (
            <div style={empty}>No sets visible here.</div>
          ) : groups.map(grp => (
            <div key={grp.key} style={{ marginBottom: 10 }}>
              <div style={groupHead}>{grp.label}</div>
              {grp.items.map(s => {
                const on = s.id === selectedId
                const ro = !canEdit(s)
                return (
                  <button key={s.id} onClick={() => setSelectedId(s.id)} style={{ ...setRow, ...(on ? setRowOn : null) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontWeight: 600, color: '#0a3320' }}>{s.name}</span>
                      <span style={s.kind === 'base' ? tagBase : tagCustom}>{s.kind}</span>
                      {s.status === 'archived' && <span style={tagArchived}>archived</span>}
                      {ro && <span style={tagView} title="You can view this set; only the owner edits it">view</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                      {s.form_keys.length} form{s.form_keys.length === 1 ? '' : 's'}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.5 }}>
            Base sets are the network standard (owner-edited); a center’s own sets are grouped
            by center. Create custom sets for your center with “＋ New set”; rename or archive them
            from the panel on the right. Base sets can’t be archived — the storefront always keeps them.
          </div>
        </div>

        {/* ── Composition editor ───────────────────────────────── */}
        <div style={colEdit}>
          {!selected ? (
            <div style={empty}>Pick a set on the left to edit its forms.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {renamingId === selected.id ? (
                  <>
                    <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameSet(selected); if (e.key === 'Escape') setRenamingId(null) }}
                      style={{ ...searchBox, width: 260, marginBottom: 0 }} />
                    <Button variant="primary" onClick={() => renameSet(selected)} disabled={busy || !renameText.trim()}>Save name</Button>
                    <Button onClick={() => setRenamingId(null)} disabled={busy}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>{selected.name}</div>
                    <span style={selected.kind === 'base' ? tagBase : tagCustom}>{selected.kind}</span>
                    {selected.status === 'archived' && <span style={tagArchived}>archived</span>}
                    {selected.center_id && <span style={{ fontSize: 11.5, color: '#6b7280' }}>· {centerName(selected.center_id)}</span>}
                    {!editable ? (
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 5 }}>
                        View only — {selected.kind === 'base' ? 'the network standard is edited by the owner' : 'edited by its center or the owner'}
                      </span>
                    ) : selected.kind === 'base' ? (
                      <span style={{ fontSize: 11.5, color: '#6b7280' }}>network standard — editable by you (owner); it can’t be archived</span>
                    ) : null}
                    {/* Rename/archive live only for custom sets the user can edit. Base is owner-managed
                        and un-archivable by RLS — no button is shown rather than showing a dead one. */}
                    {editable && selected.kind === 'custom' && (
                      <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                        <button style={ghostBtn} disabled={busy} onClick={() => { setRenamingId(selected.id); setRenameText(selected.name); setErr(null); setNote(null) }}>Rename</button>
                        {selected.status === 'active'
                          ? <button style={ghostBtn} disabled={busy} onClick={() => setStatus(selected, 'archived')} title="Hide from the working list; the QR still resolves">Archive</button>
                          : <button style={{ ...ghostBtn, color: GREEN, borderColor: '#bbf7d0' }} disabled={busy} onClick={() => setStatus(selected, 'active')}>Unarchive</button>}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div style={editGrid}>
                {/* In this set — ordered */}
                <div>
                  <div style={colHead}>In this set · {draft.length}</div>
                  {draft.length === 0 ? (
                    <div style={empty}>Empty. Add forms from the library on the right.</div>
                  ) : (
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {draft.map((key, i) => (
                        <li key={key} style={chipRow}>
                          <span style={{ color: '#9ca3af', fontSize: 11.5, width: 20, textAlign: 'right' }}>{i + 1}</span>
                          <span style={{ flex: 1 }}>
                            {titleOf(key)}
                            {isUnknown(key) && <span style={tagUnknown} title="Not in the current forms library — kept as-is">unknown</span>}
                            {isUnpublishable(key) && <span style={tagPending} title="In the registry but not published yet — parents can’t receive it until it’s built">not published</span>}
                            {lib.byKey.get(key)?.isGovForm && <span style={tagGov} title={lib.byKey.get(key)?.requiringOrg || 'Government form'}>gov</span>}
                          </span>
                          <button style={iconBtn} title="Move up" disabled={!editable || i === 0} onClick={() => move(i, -1)}>↑</button>
                          <button style={iconBtn} title="Move down" disabled={!editable || i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
                          <button style={{ ...iconBtn, color: '#b91c1c' }} title="Remove" disabled={!editable} onClick={() => remove(key)}>✕</button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Library — the WHOLE registry, filtered by section + search. A director doesn't see
                    forms the office CLOSED in Documents → Library (default is open). Toggles live there. */}
                <div>
                  <div style={colHead}>
                    Library · {libShown.length} form{libShown.length === 1 ? '' : 's'}{lib.items.length !== libShown.length ? ` of ${lib.items.length}` : ''}
                    {draft.length > 0 && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · {draft.length} in this set</span>}
                    {!editable && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#92400e' }}> · view only</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} disabled={!editable} placeholder={editable ? 'Search…' : 'View only'} style={{ ...searchBox, marginBottom: 0, flex: 1, ...(!editable ? { background: '#fafafa', color: '#9ca3af' } : null) }} />
                    <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value as SectionId | 'all')} disabled={!editable} style={{ ...ctlSmall, minWidth: 0 }} title="Filter by library section">
                      <option value="all">All sections</option>
                      {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  {lib.loading ? <div style={muted}>Loading library…</div> : lib.items.length === 0 ? (
                    <div style={muted}>Library empty.</div>
                  ) : libShown.length === 0 ? (
                    <div style={muted}>
                      {search.trim() ? `No form matches “${search.trim()}”${sectionFilter !== 'all' ? ' in this section' : ''}.`
                        : sectionFilter !== 'all' ? 'No form in this section.'
                        : 'Library empty.'}
                    </div>
                  ) : (
                    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                      {libShown.map(i => {
                        const on = inSet.has(i.key)
                        if (on) return (
                          <div key={i.key} style={{ ...libRow, opacity: 0.55, cursor: 'default' }} title="Already in this set">
                            <span style={{ color: GREEN }}>✓</span>
                            <span style={{ flex: 1 }}>{i.title}</span>
                            {i.isGovForm && <span style={tagGov} title={i.requiringOrg || 'Government form'}>gov</span>}
                            <span style={{ fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>in set</span>
                          </div>
                        )
                        // Publish-gate: a form the registry hasn't built yet (PENDING / current:null) is
                        // shown greyed so the director knows it exists, but can't be added — a family must
                        // never be sent a link to a form that isn't built. (Separate from the closed-list.)
                        if (!i.publishable) return (
                          <div key={i.key} style={{ ...libRow, opacity: 0.6, cursor: 'not-allowed', background: '#fafafa' }}
                            title={`${i.unpublishedReason ?? 'Not published yet'} — can’t be added until it’s built`}>
                            <span style={{ color: '#9ca3af', fontWeight: 700 }}>＋</span>
                            <span style={{ flex: 1, color: '#9ca3af' }}>{i.title}</span>
                            {i.isGovForm && <span style={tagGov} title={i.requiringOrg || 'Government form'}>gov</span>}
                            <span style={tagPending}>{i.unpublishedReason ?? 'not published'}</span>
                          </div>
                        )
                        return (
                          <button key={i.key} disabled={!editable} onClick={() => add(i.key)}
                            style={{ ...libRow, ...(!editable ? { opacity: 0.5, cursor: 'not-allowed' } : null) }}
                            title={editable ? `Add “${i.title}”` : 'View only — the owner manages this set'}>
                            <span style={{ color: GREEN, fontWeight: 700 }}>＋</span>
                            <span style={{ flex: 1 }}>{i.title}</span>
                            {i.isGovForm && <span style={tagGov} title={i.requiringOrg || 'Government form'}>gov</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <ButtonRow style={{ marginTop: 14 }}>
                <Button variant="primary" onClick={save} disabled={!editable || !dirty || saving}>
                  {saving ? 'Saving…' : dirty ? 'Save composition' : 'Saved'}
                </Button>
                <Button onClick={reset} disabled={!dirty || saving}>Cancel</Button>
                {dirty && <span style={{ fontSize: 12, color: '#92400e', alignSelf: 'center' }}>unsaved changes</span>}
              </ButtonRow>

              {/* ── Share: stationary QR + copyable mailing block (#4) ── */}
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #eef1ee' }}>
                <div style={colHead}>Share this set</div>
                {selected.kind === 'base' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12.5, color: '#374151', marginRight: 8 }}>Center for this QR:</label>
                    <select value={shareCenterId ?? ''} onChange={e => setShareCenterId(e.target.value || null)} style={ctlSmall}>
                      <option value="">— pick a center —</option>
                      {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>
                      A base set is org-wide, but a QR is center-specific (the link carries <code>center=</code>). Pick which center this QR is for.
                    </div>
                  </div>
                )}
                {!shareUrl ? (
                  <div style={muted}>
                    {!shareCenterId ? 'Pick a center to build the QR.'
                      : 'This center has no slug in the forms registry — the QR link needs center=. Add it to enroll-registry.json first.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div id="pset-qr" style={{ background: '#fff', padding: 8, border: '1px solid #e4e8e4', borderRadius: 10 }}>
                      <QRCodeCanvas value={shareUrl} size={512} level="M" marginSize={2} style={{ width: 150, height: 150, display: 'block' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 5 }}>Permanent link — editing the set never changes it:</div>
                      <code style={{ fontSize: 11.5, color: GREEN, wordBreak: 'break-all', display: 'block', marginBottom: 10 }}>{shareUrl}</code>
                      <ButtonRow>
                        <Button variant="primary" onClick={copyBlock}>📋 Copy block</Button>
                        <Button onClick={() => { navigator.clipboard?.writeText(shareUrl); setNote('Link copied.') }}>🔗 Copy link</Button>
                        <Button onClick={downloadQr}>⬇ Download QR</Button>
                      </ButtonRow>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, lineHeight: 1.5 }}>
                        The QR carries only the center and this set’s id; parents receive whatever forms are <b>saved</b> in the set, read live from the database.
                        {dirty && <span style={{ color: '#92400e' }}> Save your changes first — unsaved edits aren’t in the QR yet.</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Title({ center }: { center?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>ENROLLMENT</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#0a3320', fontFamily: "'DM Serif Display', serif" }}>Packet sets</div>
      <div style={{ fontSize: 12.5, color: '#6b7280' }}>
        {center ? `📍 ${center} · ` : ''}Choose which forms live in each set. A set’s QR never changes when you edit it.
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
const cols: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 18, marginTop: 16, alignItems: 'start' }
const colSets: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const colEdit: React.CSSProperties = { minWidth: 0 }
const editGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }
const colHead: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }
const groupHead: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#0a3320', margin: '2px 0 5px' }
const tagView: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const setRow: React.CSSProperties = { textAlign: 'left', width: '100%', font: 'inherit', cursor: 'pointer', background: '#fff', border: '1px solid #e4e8e4', borderRadius: 9, padding: '8px 10px', marginBottom: 5 }
const setRowOn: React.CSSProperties = { borderColor: GREEN, background: '#f6fdf9', boxShadow: 'inset 3px 0 0 ' + GREEN }
const chipRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid #e4e8e4', borderRadius: 8, background: '#fff', marginBottom: 5, fontSize: 13, color: '#374151' }
const libRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', font: 'inherit', fontSize: 13, color: '#374151', cursor: 'pointer', background: '#fff', border: '1px solid #eef1ee', borderRadius: 8, padding: '6px 9px', marginBottom: 4 }
const iconBtn: React.CSSProperties = { font: 'inherit', fontSize: 13, lineHeight: 1, width: 26, height: 26, borderRadius: 7, border: '1px solid #d7ded7', background: '#fff', color: GREEN, cursor: 'pointer' }
const searchBox: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', width: '100%', boxSizing: 'border-box', marginBottom: 8 }
const ctlSmall: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', minWidth: 160 }
const empty: React.CSSProperties = { padding: '20px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13, background: '#fafafa', borderRadius: 10, border: '1px dashed #e5e7eb' }
const muted: React.CSSProperties = { color: '#9ca3af', fontSize: 13, padding: '8px 2px' }
const tagBase: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#0a3320', background: '#dcfce7', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagCustom: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#3730a3', background: '#e0e7ff', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagArchived: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagGov: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 5, marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagUnknown: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#7f1d1d', background: '#fee2e2', padding: '1px 5px', borderRadius: 5, marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagPending: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 5, marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
const newBtn: React.CSSProperties = { font: 'inherit', fontSize: 12, fontWeight: 600, color: '#fff', background: GREEN, border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { font: 'inherit', fontSize: 12, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #d7ded7', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }
const createCard: React.CSSProperties = { background: '#f6fdf9', border: '1px solid #cdeadb', borderRadius: 10, padding: 12, margin: '4px 0 10px' }
