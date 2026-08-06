// ParentCardPage.tsx — карточка родителя, маршрут /parents/:guardianId
//
// КАНОН ВЛАДЕЛЬЦА: ОДНА ЗАПИСЬ — ДВА ВХОДА. Это окно открывается и из списка
// родителей, и из вкладки Family карточки ребёнка — по ОДНОМУ адресу. Второй
// «родительской версии» тех же данных не заводится: разошлись бы на первой правке.
//
// ⚠️ ДВА КЛЮЧА, И ЭТО НЕ ОПЕЧАТКА:
//   child_guardian.child_id            → menumaker.child.id   (через roster.child_id)
//   safepass_trusted_persons.child_id  → roster.id
// На этой паре уже дважды ловились (спрятанный раздел Step-3; медкарта, годами
// находившая 0 строк из 70). Поэтому оба перехода написаны здесь явно и рядом.
//
// Право забирать сегодня живёт в ДВУХ носителях (can_pickup у связки и строка у
// двери). Пока они не сведены, карточка ПОКАЗЫВАЕТ ОБА и говорит вслух, если они
// разошлись; править отсюда нельзя — иначе третий источник правды.
import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Avatar from '@/components/Avatar'
import { AVATAR } from '@/lib/avatarSizes'
import BackBar from '@/components/BackBar'

const S = () => supabase.schema('menumaker')
const GREEN = '#0f4c35'

type Guardian = {
  id: string
  first_name: string | null; last_name: string | null
  email: string | null; mobile_phone: string | null
  phone_1: string | null; phone_2: string | null
  address: string | null
}
type Kid = {
  roster_id: string | null      // ключ ростера — им живут SafePass и income
  child_id: string              // ключ child — им живёт связка
  center_id: string | null
  name: string; room: string
  frp: string | null
  relationship: string | null
  can_pickup_link: boolean      // child_guardian.can_pickup
  income_on_file: boolean
}
type DoorRow = { phone: string | null; registered: boolean; signed_in: boolean; photo_url: string | null; child_ids: string[] }

const EDITABLE: { key: keyof Guardian; label: string; type?: string }[] = [
  { key: 'first_name',   label: 'First name' },
  { key: 'last_name',    label: 'Last name' },
  { key: 'email',        label: 'Email', type: 'email' },
  { key: 'mobile_phone', label: 'Mobile', type: 'tel' },
  { key: 'phone_1',      label: 'Phone 1', type: 'tel' },
  { key: 'phone_2',      label: 'Phone 2', type: 'tel' },
  { key: 'address',      label: 'Address' },
]

export default function ParentCardPage() {
  const { guardianId } = useParams<{ guardianId: string }>()
  const [g, setG] = useState<Guardian | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [door, setDoor] = useState<DoorRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'profile' | 'children' | 'safepass'>('profile')

  const [draft, setDraft] = useState<Guardian | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    if (!guardianId) return
    let cancelled = false
    ;(async () => {
      setLoading(true); setLoadErr(null)
      try {
        const { data: gr, error: gErr } = await S().from('guardian')
          .select('id, first_name, last_name, email, mobile_phone, phone_1, phone_2, address')
          .eq('id', guardianId).single()
        if (gErr) throw gErr
        if (!cancelled) { setG(gr as Guardian); setDraft(gr as Guardian) }

        // ── КЛЮЧ 1: связка живёт на child.id ──────────────────────────────
        const { data: links, error: lErr } = await S().from('child_guardian')
          .select('child_id, relationship, role, can_pickup').eq('guardian_id', guardianId)
        if (lErr) throw lErr
        const childIds = (links ?? []).map((l: any) => l.child_id as string)
        if (childIds.length === 0) { if (!cancelled) { setKids([]); setDoor(null) } return }

        // ── КЛЮЧ 2: ростер сшивает child.id ↔ roster.id ───────────────────
        const { data: roster, error: rErr } = await S().from('roster')
          .select('id, child_id, center_id, first_name, last_name, child_name, classroom_id, frp, is_active')
          .in('child_id', childIds).eq('is_active', true)
        if (rErr) throw rErr
        const roomIds = Array.from(new Set((roster ?? []).map((r: any) => r.classroom_id).filter(Boolean)))
        const { data: rooms } = roomIds.length
          ? await S().from('classrooms').select('id,name').in('id', roomIds)
          : { data: [] as any[] }
        const roomName = new Map((rooms ?? []).map((r: any) => [r.id, r.name]))

        const { data: inc, error: iErr } = await S().rpc('income_determination_status')
        if (iErr) throw iErr
        const onFile = new Set(((inc ?? []) as any[]).filter(r => r.status === 'on_file').map(r => r.child_id))

        const byChildId = new Map((roster ?? []).map((r: any) => [r.child_id as string, r]))
        const list: Kid[] = (links ?? []).map((l: any) => {
          const r = byChildId.get(l.child_id as string)
          return {
            roster_id: (r?.id as string) ?? null,
            center_id: (r?.center_id as string) ?? null,
            child_id: l.child_id as string,
            name: r ? ((r.first_name && r.last_name) ? `${r.first_name} ${r.last_name}` : (r.child_name ?? '—')) : '—',
            room: r?.classroom_id ? (roomName.get(r.classroom_id) ?? '—') : '— no classroom yet —',
            frp: (r?.frp as string) ?? null,
            relationship: (l.relationship as string) || (l.role as string) || null,
            can_pickup_link: l.can_pickup === true,
            income_on_file: r?.id ? onFile.has(r.id) : false,
          }
        }).filter(k => k.roster_id !== null || k.name !== '—')

        // ── Дверь: строки прав по ROSTER.ID ───────────────────────────────
        const rosterIds = list.map(k => k.roster_id).filter(Boolean) as string[]
        const { data: tps, error: tErr } = rosterIds.length
          ? await S().from('safepass_trusted_persons')
              .select('child_id, person_name, phone, photo_url, registered_at, phone_verified')
              .in('child_id', rosterIds).eq('is_active', true)
          : { data: [] as any[], error: null }
        if (tErr) throw tErr
        const fullName = `${(gr as Guardian).first_name ?? ''} ${(gr as Guardian).last_name ?? ''}`.trim().toLowerCase()
        const mine = ((tps ?? []) as any[]).filter(t => (t.person_name ?? '').trim().toLowerCase() === fullName)
        if (!cancelled) {
          setKids(list)
          setDoor(mine.length ? {
            phone: mine[0].phone ?? null,
            registered: mine.some((t: any) => t.registered_at != null),
            signed_in: mine.some((t: any) => t.phone_verified === true),
            photo_url: mine.find((t: any) => t.photo_url)?.photo_url ?? null,
            child_ids: mine.map((t: any) => t.child_id as string),
          } : null)
        }
      } catch (e: any) {
        // Отказ чтения не смеет выглядеть как «у родителя нет детей».
        if (!cancelled) { setLoadErr(e?.message ?? String(e)); setKids([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [guardianId])

  // Расхождение двух носителей права забирать — называем словами, не выбираем сторону.
  const pickupMismatch = useMemo(() => {
    if (!door) return kids.filter(k => k.can_pickup_link).map(k => k.name)
    return kids.filter(k => k.can_pickup_link !== (k.roster_id ? door.child_ids.includes(k.roster_id) : false)).map(k => k.name)
  }, [kids, door])

  const norm = (v: string | null) => { const t = (v ?? '').trim(); return t === '' ? null : t }
  const save = async () => {
    if (!draft || !guardianId) return
    setSaving(true); setSaveErr(null)
    // Перенесено ДОСЛОВНО из FamilyCard: отказ RLS возвращает ноль строк и НЕ
    // возвращает ошибку, поэтому «Saved ✓» без проверки — ложь на экране.
    const { data: updated, error } = await S().from('guardian').update({
      first_name: norm(draft.first_name), last_name: norm(draft.last_name),
      email: norm(draft.email), mobile_phone: norm(draft.mobile_phone),
      phone_1: norm(draft.phone_1), phone_2: norm(draft.phone_2),
      address: norm(draft.address),
    }).eq('id', guardianId).select('id')
    setSaving(false)
    if (error) { setSaveErr(`Not saved — the database rejected the change: ${error.message}. Nothing was written.`); return }
    if (!updated || updated.length === 0) {
      setSaveErr('Not saved — 0 rows updated. You may not have permission to edit this family (the change was blocked, not written). Nothing has changed.')
      return
    }
    setG(draft); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  const name = `${g?.first_name ?? ''} ${g?.last_name ?? ''}`.trim() || 'Guardian'

  if (loading) return <div style={wrap}><div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div></div>
  if (loadErr) return (
    <div style={wrap}>
      <div role="alert" style={alertStyle}>This family could not be loaded — it is <b>not</b> empty, it failed: {loadErr}</div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ margin: '-24px -32px 18px' }}><BackBar to="/parents" label="Parents" /></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Avatar name={name} path={door?.photo_url ?? null} size={AVATAR.header} fontSize={22} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#0a3320' }}>{name}</div>
          <div style={{ fontSize: 12.5, color: '#6b7280' }}>
            {kids.length} {kids.length === 1 ? 'child' : 'children'}
            {g?.mobile_phone ? ` · ${g.mobile_phone}` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 18 }}>
        {([['profile', '👤 Profile'], ['children', '🧒 Children'], ['safepass', '🛡 SafePass']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13.5, fontWeight: tab === k ? 700 : 400,
            color: tab === k ? GREEN : '#888',
            borderBottom: tab === k ? `2px solid ${GREEN}` : '2px solid transparent', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'profile' && draft && (
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {EDITABLE.map(f => (
              <label key={f.key} style={{ display: 'grid', gap: 4 }}>
                <span style={lbl}>{f.label}</span>
                <input type={f.type ?? 'text'} value={(draft[f.key] as string | null) ?? ''}
                  onChange={e => setDraft(d => d ? { ...d, [f.key]: e.target.value } : d)} style={inp} />
              </label>
            ))}
          </div>
          {saveErr && <div role="alert" style={{ ...alertStyle, marginTop: 12 }}>{saveErr}</div>}
          <div style={{ marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={saving ? { ...btnPri, opacity: 0.7 } : saved ? { ...btnPri, background: '#0f7a4a' } : btnPri}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {tab === 'children' && (
        <div style={card}>
          {kids.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13.5 }}>
              No children on file for this adult. If that looks wrong, the link between family and
              child records may be missing — it is not the same as having no children.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {kids.map(k => (
                <div key={k.child_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f2f5f2' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* ВТОРОЙ ВХОД: отсюда — к ребёнку, из Family ребёнка — сюда. Одно окно. */}
                    {k.roster_id && k.center_id
                      ? <Link to={`/center/${k.center_id}?child=${k.roster_id}`} style={{ fontSize: 14, fontWeight: 600, color: GREEN, textDecoration: 'none' }}>{k.name}</Link>
                      : <span style={{ fontSize: 14, fontWeight: 600 }}>{k.name}</span>}
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {k.room}{k.frp ? ` · ${k.frp}` : ''}{k.relationship ? ` · ${k.relationship}` : ''}
                    </div>
                  </div>
                  {k.income_on_file && <span style={chipGreen} title="Income determination is on file and current — handled by the General Director; its content is never shown here.">💲 on file</span>}
                  {k.can_pickup_link && <span style={chipGreen}>✓ Pickup</span>}
                </div>
              ))}
            </div>
          )}
          {pickupMismatch.length > 0 && (
            <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 9, background: '#fffbeb', border: '1.5px solid #fde68a', color: '#92400e', fontSize: 12.5, fontWeight: 600, lineHeight: 1.5 }}>
              Pickup rights disagree between the family record and the door list for: {pickupMismatch.join(', ')}.
              Both are shown as they are — neither is silently preferred. Bringing them into one place is a separate job.
            </div>
          )}
        </div>
      )}

      {tab === 'safepass' && (
        <div style={card}>
          {!door ? (
            <div style={{ color: '#9ca3af', fontSize: 13.5 }}>
              This adult is not on the pickup list for any of their children yet, so SafePass has
              nothing to show. Pickup rights and phone registration are set on the Parent access screen.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar name={name} path={door.photo_url} size={AVATAR.row} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{door.phone ?? 'no phone on file'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {door.registered && <span style={chipGreen}>✓ registered</span>}
                  {door.signed_in && <span style={chipBlue}>✓ signed-in</span>}
                  {!door.registered && <span style={{ fontSize: 12, color: '#92400e' }}>phone not registered yet</span>}
                </div>
              </div>
              <Link to="/safepass/issue" style={{ fontSize: 12.5, color: GREEN }}>Parent access →</Link>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 12 }}>
            Read-only here on purpose: access is granted and revoked on one screen, so there is never
            a second place that thinks it decides.
          </div>
        </div>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px' }
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6b7280' }
const inp: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8 }
const btnPri: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: GREEN, color: '#fff', fontWeight: 600, cursor: 'pointer' }
const alertStyle: React.CSSProperties = { padding: '11px 14px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 12.5, fontWeight: 500 }
const chipGreen: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#0f5132', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }
const chipBlue: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }
