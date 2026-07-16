// ScheduleEditor — planned attendance days + hours for one child.
//
// Why this is not a childFieldRegistry field: the registry models scalars
// (text/date/select/boolean/...). A schedule is a composite — a Mon–Fri bitmask plus
// a pair of times that must move together — so it gets its own block, the way the
// photo block does.
//
// It also saves on its OWN verified path rather than riding doSaveRoster, which
// bare-awaits its update and inspects nothing (an RLS denial there reports success).
// Every edit is dated: sched_updated_by / sched_updated_at, source='manual'.
//
// Previously printed sheets are never rewritten — printing always reads the schedule
// as of generation. Nothing here touches history.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Mon=1 · Tue=2 · Wed=4 · Thu=8 · Fri=16 · full week = 31
export const DAY_BITS: { bit: number; label: string }[] = [
  { bit: 1, label: 'Mon' }, { bit: 2, label: 'Tue' }, { bit: 4, label: 'Wed' },
  { bit: 8, label: 'Thu' }, { bit: 16, label: 'Fri' },
]
export const ALL_DAYS = 31

export type Sched = {
  sched_days: number | null
  sched_in: string | null       // 'HH:MM:SS' from Postgres `time`
  sched_out: string | null
  sched_source: string | null
  sched_updated_at: string | null
}

/** 'HH:MM:SS' → 'HH:MM' for <input type="time">; null-safe. */
const toInput = (t: string | null) => (t ? t.slice(0, 5) : '')
/** '' → null so the pair stays all-or-nothing (DB CHECK enforces it too). */
const fromInput = (t: string) => (t.trim() === '' ? null : `${t}:00`)

export function daysLabel(mask: number | null): string {
  if (mask == null) return '—'
  if (mask === ALL_DAYS) return 'Mon–Fri'
  const on = DAY_BITS.filter(d => mask & d.bit).map(d => d.label)
  return on.length ? on.join(' ') : '—'
}
export function hoursLabel(s: Sched): string {
  if (!s.sched_in || !s.sched_out) return ''
  const h = (t: string) => {
    const [H, M] = t.split(':').map(Number)
    const ap = H >= 12 ? 'pm' : 'am'
    const h12 = H % 12 === 0 ? 12 : H % 12
    return `${h12}:${String(M).padStart(2, '0')}${ap}`
  }
  return `${h(s.sched_in)}-${h(s.sched_out)}`
}

export default function ScheduleEditor({ childId, value, onSaved }: {
  childId: string
  value: Sched
  onSaved: (s: Sched) => void
}) {
  const { user } = useAuth()
  const [draft, setDraft] = useState<Sched>(value)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dirty =
    draft.sched_days !== value.sched_days ||
    draft.sched_in !== value.sched_in ||
    draft.sched_out !== value.sched_out

  const toggle = (bit: number) =>
    setDraft(d => {
      const cur = d.sched_days ?? 0
      const next = cur & bit ? cur & ~bit : cur | bit
      return { ...d, sched_days: next === 0 ? null : next }
    })

  const save = async () => {
    setSaving(true); setErr(null)

    // Guard the pair before the DB does, so the message names the field rather
    // than quoting a constraint at a director.
    if ((draft.sched_in === null) !== (draft.sched_out === null)) {
      setSaving(false); setErr('Enter both an arrival and a departure time, or leave both empty.'); return
    }
    if (draft.sched_in && draft.sched_out && draft.sched_out <= draft.sched_in) {
      setSaving(false); setErr('Departure must be later than arrival.'); return
    }
    if (draft.sched_days == null && (draft.sched_in || draft.sched_out)) {
      setSaving(false); setErr('Pick at least one day for these hours.'); return
    }

    const patch = {
      sched_days: draft.sched_days,
      sched_in: draft.sched_in,
      sched_out: draft.sched_out,
      sched_source: 'manual',
      sched_updated_by: user?.id ?? null,
      sched_updated_at: new Date().toISOString(),
    }

    // Verify the write landed: an RLS denial returns zero rows and NO error, so a
    // bare await would paint "Saved ✓" over a change that was never written.
    const { data, error } = await supabase.schema('menumaker').from('roster')
      .update(patch).eq('id', childId).select('id')

    if (error) { setSaving(false); setErr(`Not saved — the database rejected the change: ${error.message}. Nothing was written.`); return }
    if (!data || data.length === 0) {
      setSaving(false)
      setErr('Not saved — 0 rows updated. You may not have permission to edit this child (the change was blocked, not written). Nothing has changed.')
      return
    }

    setSaving(false); setSaved(true)
    onSaved({ ...draft, sched_source: 'manual', sched_updated_at: patch.sched_updated_at })
    setTimeout(() => setSaved(false), 2500)
  }

  const srcLabel = value.sched_source === 'import' ? 'imported from the centre’s books'
    : value.sched_source === 'start_form' ? 'from the Start form'
    : value.sched_source === 'manual' ? 'edited here' : null

  return (
    <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 8 }}>
        Attendance schedule
      </div>

      {err && (
        <div role="alert" style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 9, marginBottom: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 12, fontWeight: 500 }}>
          <span>⚠</span><span>{err}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {DAY_BITS.map(d => {
          const on = !!((draft.sched_days ?? 0) & d.bit)
          return (
            <button key={d.bit} type="button" onClick={() => toggle(d.bit)} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: on ? '1.5px solid #0f4c35' : '1.5px solid #e5e7eb',
              background: on ? '#0f4c35' : '#fff', color: on ? '#fff' : '#6b7280',
            }}>{d.label}</button>
          )
        })}
        <button type="button" onClick={() => setDraft(d => ({ ...d, sched_days: d.sched_days === ALL_DAYS ? null : ALL_DAYS }))}
          style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11.5, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
          {draft.sched_days === ALL_DAYS ? 'Clear' : 'Mon–Fri'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Arrives</span>
          <input type="time" value={toInput(draft.sched_in)}
            onChange={e => setDraft(d => ({ ...d, sched_in: fromInput(e.target.value) }))} style={ctl} />
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Leaves</span>
          <input type="time" value={toInput(draft.sched_out)}
            onChange={e => setDraft(d => ({ ...d, sched_out: fromInput(e.target.value) }))} style={ctl} />
        </label>
        <button onClick={save} disabled={saving || !dirty} style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: 'none', fontFamily: 'inherit',
          background: saved ? '#0f7a4a' : '#0f4c35', color: '#fff',
          cursor: saving || !dirty ? 'default' : 'pointer', opacity: saving || !dirty ? 0.5 : 1,
        }}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save schedule'}</button>
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 7 }}>
        {value.sched_days == null
          ? 'No schedule on file — the printed sheet leaves Hours blank for this child.'
          : <>Prints as <b>{hoursLabel(value) || '—'}</b> · {daysLabel(value.sched_days)}
              {srcLabel && <> · {srcLabel}</>}
              {value.sched_updated_at && <> · last changed {new Date(value.sched_updated_at).toLocaleDateString()}</>}
            </>}
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
        Changing this does not alter sheets already printed — a sheet keeps the schedule it was printed with.
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6b7280' }
const ctl: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 8 }
