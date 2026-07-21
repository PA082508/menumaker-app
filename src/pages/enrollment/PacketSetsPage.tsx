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
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useFormsLibrary } from '@/lib/formsLibrary'
import Button, { ButtonRow } from '@/components/ui/Button'

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
  const { org, currentCenter, isOrgAdmin, orgRole } = useOrg()
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

  const selected = useMemo(() => sets.find(s => s.id === selectedId) ?? null, [sets, selectedId])
  const dirty = useMemo(
    () => !!selected && (draft.length !== selected.form_keys.length || draft.some((k, i) => k !== selected.form_keys[i])),
    [draft, selected],
  )

  const load = async () => {
    if (!org?.id) return
    setLoading(true); setErr(null)
    try {
      // RLS already scopes this; the filter mirrors it for clarity. In org view (no active
      // center) only base sets are visible — base is org-wide and still editable.
      let q = S().from('packet_sets').select('*')
      q = currentCenter?.id
        ? q.or(`center_id.eq.${currentCenter.id},center_id.is.null`)
        : q.is('center_id', null)
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
  // Load the selected set's composition into the draft whenever selection changes.
  useEffect(() => { setDraft(selected ? [...selected.form_keys] : []); setNote(null) }, [selectedId, selected?.form_keys])

  const inSet = useMemo(() => new Set(draft), [draft])
  const libFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lib.items.filter(i => !inSet.has(i.key) && (!q || i.title.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)))
  }, [lib.items, inSet, search])

  const move = (i: number, dir: -1 | 1) => setDraft(d => {
    const j = i + dir
    if (j < 0 || j >= d.length) return d
    const n = [...d]; [n[i], n[j]] = [n[j], n[i]]; return n
  })
  const remove = (key: string) => setDraft(d => d.filter(k => k !== key))
  const add = (key: string) => setDraft(d => (d.includes(key) ? d : [...d, key]))
  const reset = () => { setDraft(selected ? [...selected.form_keys] : []); setNote(null) }

  const save = async () => {
    if (!selected || !dirty) return
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

  if (!allowed) return <div style={wrap}><div style={{ color: '#9ca3af', fontSize: 14 }}>You don’t have access to packet sets.</div></div>

  return (
    <div style={wrap}>
      <Title center={currentCenter?.name} />

      {err && <Banner tone="bad">{err}</Banner>}
      {note && <Banner tone="ok">{note}</Banner>}
      {lib.error && <Banner tone="bad">Forms library failed to load ({lib.error}) — the composition editor needs it. Reload the page.</Banner>}

      <div style={cols}>
        {/* ── Sets ─────────────────────────────────────────────── */}
        <div style={colSets}>
          <div style={colHead}>Sets</div>
          {loading ? <div style={muted}>Loading…</div> : sets.length === 0 ? (
            <div style={empty}>No sets visible here.</div>
          ) : sets.map(s => {
            const on = s.id === selectedId
            return (
              <button key={s.id} onClick={() => setSelectedId(s.id)} style={{ ...setRow, ...(on ? setRowOn : null) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontWeight: 600, color: '#0a3320' }}>{s.name}</span>
                  <span style={s.kind === 'base' ? tagBase : tagCustom}>{s.kind}</span>
                  {s.status === 'archived' && <span style={tagArchived}>archived</span>}
                </div>
                <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                  {s.form_keys.length} form{s.form_keys.length === 1 ? '' : 's'}
                </div>
              </button>
            )
          })}
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.5 }}>
            Base sets show for every center; a center’s own sets show only here. Creating,
            renaming and archiving arrive next — for now you edit what forms each set holds.
          </div>
        </div>

        {/* ── Composition editor ───────────────────────────────── */}
        <div style={colEdit}>
          {!selected ? (
            <div style={empty}>Pick a set on the left to edit its forms.</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>{selected.name}</div>
                <span style={selected.kind === 'base' ? tagBase : tagCustom}>{selected.kind}</span>
                {selected.kind === 'base' && (
                  <span style={{ fontSize: 11.5, color: '#6b7280' }}>
                    base set — its forms are editable (swap a form when the state changes it); it can’t be archived
                  </span>
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
                            {lib.byKey.get(key)?.isGovForm && <span style={tagGov} title={lib.byKey.get(key)?.requiringOrg || 'Government form'}>gov</span>}
                          </span>
                          <button style={iconBtn} title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                          <button style={iconBtn} title="Move down" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
                          <button style={{ ...iconBtn, color: '#b91c1c' }} title="Remove" onClick={() => remove(key)}>✕</button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Library — add */}
                <div>
                  <div style={colHead}>Add from library</div>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search forms…" style={searchBox} />
                  {lib.loading ? <div style={muted}>Loading library…</div> : libFiltered.length === 0 ? (
                    <div style={muted}>{lib.items.length === 0 ? 'Library empty.' : 'Nothing left to add.'}</div>
                  ) : (
                    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                      {libFiltered.map(i => (
                        <button key={i.key} onClick={() => add(i.key)} style={libRow} title={`Add “${i.title}”`}>
                          <span style={{ color: GREEN, fontWeight: 700 }}>＋</span>
                          <span style={{ flex: 1 }}>{i.title}</span>
                          {i.isGovForm && <span style={tagGov} title={i.requiringOrg || 'Government form'}>gov</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <ButtonRow style={{ marginTop: 14 }}>
                <Button variant="primary" onClick={save} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : dirty ? 'Save composition' : 'Saved'}
                </Button>
                <Button onClick={reset} disabled={!dirty || saving}>Cancel</Button>
                {dirty && <span style={{ fontSize: 12, color: '#92400e', alignSelf: 'center' }}>unsaved changes</span>}
              </ButtonRow>
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
const setRow: React.CSSProperties = { textAlign: 'left', width: '100%', font: 'inherit', cursor: 'pointer', background: '#fff', border: '1px solid #e4e8e4', borderRadius: 9, padding: '8px 10px' }
const setRowOn: React.CSSProperties = { borderColor: GREEN, background: '#f6fdf9', boxShadow: 'inset 3px 0 0 ' + GREEN }
const chipRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid #e4e8e4', borderRadius: 8, background: '#fff', marginBottom: 5, fontSize: 13, color: '#374151' }
const libRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', font: 'inherit', fontSize: 13, color: '#374151', cursor: 'pointer', background: '#fff', border: '1px solid #eef1ee', borderRadius: 8, padding: '6px 9px', marginBottom: 4 }
const iconBtn: React.CSSProperties = { font: 'inherit', fontSize: 13, lineHeight: 1, width: 26, height: 26, borderRadius: 7, border: '1px solid #d7ded7', background: '#fff', color: GREEN, cursor: 'pointer' }
const searchBox: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', width: '100%', boxSizing: 'border-box', marginBottom: 8 }
const empty: React.CSSProperties = { padding: '20px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13, background: '#fafafa', borderRadius: 10, border: '1px dashed #e5e7eb' }
const muted: React.CSSProperties = { color: '#9ca3af', fontSize: 13, padding: '8px 2px' }
const tagBase: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#0a3320', background: '#dcfce7', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagCustom: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#3730a3', background: '#e0e7ff', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagArchived: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagGov: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 5, marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tagUnknown: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#7f1d1d', background: '#fee2e2', padding: '1px 5px', borderRadius: 5, marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
