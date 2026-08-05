// ExpectedCountsTile.tsx — плитка кухонного стола «Expected counts».
//
// ЧТО ЭТО. Сколько порций ждать сегодня и на неделе, по приёмам и возрастным
// группам. Числа приходят из `get_daily_counts` — это ПРОГНОЗ, максимум за четыре
// полные недели, а не факт сегодняшнего дня. Поэтому в шапке стоит слово forecast
// и окно: число без окна читается как обещание, а обещать посещаемость нельзя.
//
// ТРИ СОСТОЯНИЯ, И КАЖДОЕ ГОВОРИТ СЛОВАМИ (спека владельца 05.08):
//   1. паттернов у центра нет — «прогноза ещё нет», а не пустая плитка: пустота
//      на кухонном столе читается как «готовить ноль»;
//   2. последний пересев ПРОПУСТИЛ центр (мало данных в окне) — показываем прежние
//      числа и честно говорим, что они не свежие;
//   3. чтение отказало — говорим об отказе, а не показываем ноль.
//
// Повар видит свой центр (он у него один), админ — все центры вкладками.
// Плитка НЕ редактируется: ручных правок прогноза не бывает (решение владельца
// 05.08, DECISIONS) — и не печатается: это рабочая подсказка, а не документ.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { centerLabel, sortCentersForSwitcher } from '@/lib/centerLabels'

const GREEN = '#0f4c35'
const DAYS: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri']]
const MEALS: [string, string][] = [
  ['breakfast', 'Breakfast'], ['am_snack', 'AM snack'], ['lunch', 'Lunch'], ['supper', 'Supper'],
]
const AGE_LABEL: Record<string, string> = {
  birth_5mo: 'Birth–5 mo', '6_11mo': '6–11 mo', '1_2': '1–2 yr', '3_5': '3–5 yr', '6_12': '6–12 yr',
  undetermined: 'not determined',
}
const AGE_ORDER = ['birth_5mo', '6_11mo', '1_2', '3_5', '6_12', 'undetermined']

export interface TileCenter { id: string; slug: string; name: string }

type Row = { meal_type: string; age_group: string; expected: number }
type RunInfo = { run_at: string; window_start: string | null; window_end: string | null; skipped: boolean; skip_reason: string | null }

/** ISO-день недели 1..5; суббота и воскресенье показывают понедельник — кухня в выходные не считает. */
function todayDow(): number {
  const d = new Date().getDay()          // 0=Sun … 6=Sat
  return d >= 1 && d <= 5 ? d : 1
}
function fmtRunDate(iso: string): string {
  // Срез строки, без new Date: дата-день в нью-йоркском поясе съезжает на вчера.
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
}

export default function ExpectedCountsTile({ centers, initialCenterId }: {
  centers: TileCenter[]
  initialCenterId?: string | null
}) {
  const [activeId, setActiveId] = useState<string | null>(initialCenterId ?? centers[0]?.id ?? null)
  const [byDay, setByDay] = useState<Record<number, Row[]> | null>(null)
  const [run, setRun] = useState<RunInfo | null>(null)
  const [runErr, setRunErr] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!initialCenterId) return
    setActiveId(prev => prev ?? initialCenterId)
  }, [initialCenterId])

  const active = centers.find(c => c.id === activeId) ?? centers[0] ?? null

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      setLoading(true); setErr(null); setByDay(null); setRun(null); setRunErr(null)
      const results = await Promise.all(
        DAYS.map(([d]) => (supabase.schema('menumaker').rpc as any)('get_daily_counts', {
          p_center_slug: active.slug, p_day: d,
        })),
      )
      if (cancelled) return
      const firstErr = results.find(r => r.error)?.error
      if (firstErr) {
        // Отказ ГОВОРИТ. Ноль вместо чисел — это указание готовить на ноль детей.
        setErr(firstErr.message); setLoading(false); return
      }
      const map: Record<number, Row[]> = {}
      DAYS.forEach(([d], i) => { map[d] = (results[i].data ?? []) as Row[] })
      setByDay(map)

      const { data: runs, error: runErr } = await supabase.schema('menumaker').from('attendance_pattern_runs')
        .select('run_at, window_start, window_end, skipped, skip_reason')
        .eq('center_id', active.id).order('run_at', { ascending: false }).limit(1)
      // Отказ ИМЕННО ЗДЕСЬ не прячет числа — они уже прочитаны, — но и не выдаёт
      // себя за «пересева не было»: подпись скажет, что историю прочитать не смогли.
      if (!cancelled && runErr) setRunErr(runErr.message)
      if (!cancelled && !runErr && runs && runs.length) setRun(runs[0] as RunInfo)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [active?.id, active?.slug])

  const dow = todayDow()
  const today = byDay?.[dow] ?? []
  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const [m] of MEALS) t[m] = today.filter(r => r.meal_type === m).reduce((s, r) => s + (r.expected ?? 0), 0)
    return t
  }, [today])
  const ageRows = useMemo(() => {
    const present = AGE_ORDER.filter(a => today.some(r => r.age_group === a && (r.expected ?? 0) > 0))
    return present.map(a => ({
      age: a,
      cells: MEALS.map(([m]) => today.find(r => r.meal_type === m && r.age_group === a)?.expected ?? 0),
    }))
  }, [today])
  const hasAny = useMemo(
    () => !!byDay && Object.values(byDay).some(rows => rows.some(r => (r.expected ?? 0) > 0)),
    [byDay],
  )

  if (!active) return null

  const caption = err ? null
    : !hasAny ? 'No forecast for this centre yet — the weekly reseed has not filled it.'
    : run?.skipped
      ? `Forecast from ${fmtRunDate(run.run_at)} — the last reseed skipped this centre: ${run.skip_reason ?? 'too little data in the window'}`
      : runErr ? 'Forecast numbers are shown, but the reseed history could not be read — the date below is unknown.'
      : run
        ? `Reseeded ${fmtRunDate(run.run_at)} · max of the last 4 full weeks${run.window_start ? ` (${fmtRunDate(run.window_start)}–${fmtRunDate(run.window_end ?? run.window_start)})` : ''}`
        : 'Forecast source unknown — no reseed has been recorded for this centre.'

  return (
    <div className="no-print" style={{
      border: '1.5px solid #e8f0e8', borderRadius: 14, background: '#fff', padding: '14px 16px',
      marginBottom: 16, fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#0a3320' }}>Expected counts</div>
        <div style={{ fontSize: 11.5, color: '#9ca3af' }}>forecast — not today’s attendance</div>
        {centers.length > 1 && (
          // Подписи и порядок — те же, что в переключателе центров: человек не
          // должен узнавать свой центр по другому имени в соседней плитке.
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sortCentersForSwitcher(centers).map(c => (
              <button key={c.id} onClick={() => setActiveId(c.id)} style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', border: c.id === active.id ? 'none' : '1px solid #e5e7eb',
                background: c.id === active.id ? GREEN : '#fff', color: c.id === active.id ? '#fff' : '#374151',
              }}>{centerLabel(c)}</button>
            ))}
          </div>
        )}
      </div>

      {err ? (
        <div role="alert" style={{ fontSize: 13, color: '#991b1b' }}>
          The forecast could not be read — {err}. No numbers are shown rather than zeros.
        </div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: '#aaa' }}>Loading…</div>
      ) : !hasAny ? (
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
          {caption}
          <br />Nothing is missing from the kitchen — the count screen below works as usual.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {MEALS.map(([m, label]) => (
              <div key={m} data-meal={m} style={{
                flex: '1 1 110px', border: '1px solid #eef3ee', borderRadius: 10, padding: '8px 10px', background: '#fbfdfb',
              }}>
                <div style={{ fontSize: 11.5, color: '#6b7280' }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: GREEN, lineHeight: 1.15 }}>{totals[m] ?? 0}</div>
              </div>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 10 }}>
            <thead>
              <tr style={{ color: '#9ca3af' }}>
                <th style={{ textAlign: 'left', fontWeight: 600, padding: '2px 4px' }}>by age group · today</th>
                {MEALS.map(([m, l]) => <th key={m} style={{ textAlign: 'right', fontWeight: 600, padding: '2px 6px' }}>{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {ageRows.map(r => (
                <tr key={r.age} data-age={r.age}>
                  <td style={{ padding: '2px 4px', color: r.age === 'undetermined' ? '#b45309' : '#374151' }}>
                    {AGE_LABEL[r.age] ?? r.age}
                  </td>
                  {r.cells.map((n, i) => (
                    <td key={i} style={{ textAlign: 'right', padding: '2px 6px', color: '#374151' }}>{n}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: '#9ca3af' }}>
                <th style={{ textAlign: 'left', fontWeight: 600, padding: '2px 4px' }}>this week</th>
                {DAYS.map(([d, l]) => (
                  <th key={d} style={{ textAlign: 'right', fontWeight: 600, padding: '2px 6px', color: d === dow ? GREEN : undefined }}>
                    {d === dow ? `[${l}]` : l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEALS.map(([m, label]) => (
                <tr key={m}>
                  <td style={{ padding: '2px 4px', color: '#374151' }}>{label}</td>
                  {DAYS.map(([d]) => {
                    const n = (byDay?.[d] ?? []).filter(r => r.meal_type === m).reduce((s, r) => s + (r.expected ?? 0), 0)
                    return <td key={d} style={{ textAlign: 'right', padding: '2px 6px', fontWeight: d === dow ? 700 : 400, color: d === dow ? GREEN : '#374151' }}>{n}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div data-caption="1" style={{ fontSize: 11.5, color: run?.skipped ? '#b45309' : '#9ca3af', marginTop: 8 }}>
            {caption}
          </div>
        </>
      )}
    </div>
  )
}
