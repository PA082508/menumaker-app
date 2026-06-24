// DeliveryDispatch — mobile-first dispatch creation for kitchen staff (Cook @ Ridge).
// Direct INSERT on delivery_* is RLS-blocked, so everything goes through
// SECURITY DEFINER RPCs: delivery_dispatch_init / create_delivery_route /
// dispatch_delivery_route.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

const PEARL_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const ALPHA_ID = '099c404b-e6d3-4543-9d9a-1fb11a2ee62d'
const SLOTS: [string, string][] = [['breakfast', 'Breakfast'], ['am_snack', 'AM Snack'], ['lunch', 'Lunch'], ['supper', 'Supper']]

interface Setting { center_id: string; center: string; meal_slot: string; arrival: string }
interface TodayRoute { id: string; meal_slot: string; status: string }
interface InitData { date: string; settings: Setting[]; today_routes: TodayRoute[] }
interface Container { container_label: string; program: 'child' | 'infant'; portion_count: string; temp_at_dispatch: string }
interface StopEntry { center_id: string; center_name: string; arrival_window: string; containers: Container[] }

const blankContainer = (): Container => ({ container_label: '', program: 'child', portion_count: '', temp_at_dispatch: '' })

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase.schema('menumaker').rpc as any)(fn, args)
  if (error) throw new Error(error.message)
  return data
}

export default function DeliveryDispatch() {
  const { org } = useOrg()
  const orgId = org?.id
  const { user } = useAuth()
  const dispatchedBy = user?.email ?? 'Kitchen'

  const [init, setInit] = useState<InitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'slots' | 'entry' | 'done'>('slots')
  const [active, setActive] = useState<{ id: string; meal_slot: string } | null>(null)
  const [stops, setStops] = useState<StopEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ slot: string; stops: number; containers: number; portions: number } | null>(null)

  const loadInit = async () => {
    if (!orgId) return
    setLoading(true); setError(null)
    try { setInit(await rpc('delivery_dispatch_init', { p_org_id: orgId }) as InitData) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadInit() }, [orgId])

  const arrivalFor = (slot: string, centerId: string) =>
    init?.settings.find(s => s.meal_slot === slot && s.center_id === centerId)?.arrival ?? '—'
  const routeFor = (slot: string) => init?.today_routes.find(r => r.meal_slot === slot)

  const openEntry = (routeId: string, slot: string) => {
    setActive({ id: routeId, meal_slot: slot })
    setStops([
      { center_id: PEARL_ID, center_name: 'Pearl', arrival_window: arrivalFor(slot, PEARL_ID), containers: [blankContainer()] },
      { center_id: ALPHA_ID, center_name: 'Alpha', arrival_window: arrivalFor(slot, ALPHA_ID), containers: [blankContainer()] },
    ])
    setView('entry')
  }

  const createRoute = async (slot: string) => {
    if (!orgId) return
    setBusy(true)
    try {
      const r = await rpc('create_delivery_route', { p_meal_slot: slot, p_org_id: orgId })
      if (r?.ok === false) throw new Error(r.error || 'create failed')
      openEntry(r.id, slot)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const setContainer = (si: number, ci: number, patch: Partial<Container>) =>
    setStops(prev => prev.map((s, i) => i !== si ? s : { ...s, containers: s.containers.map((c, j) => j !== ci ? c : { ...c, ...patch }) }))
  const addContainer = (si: number) =>
    setStops(prev => prev.map((s, i) => i !== si ? s : { ...s, containers: [...s.containers, blankContainer()] }))
  const removeContainer = (si: number, ci: number) =>
    setStops(prev => prev.map((s, i) => i !== si ? s : { ...s, containers: s.containers.filter((_, j) => j !== ci) }))

  const payload = stops.map(s => ({
    center_id: s.center_id, stop_order: s.center_id === PEARL_ID ? 1 : 2, arrival_window: s.arrival_window,
    containers: s.containers
      .filter(c => c.container_label.trim() || Number(c.portion_count) > 0)
      .map(c => ({
        container_label: c.container_label.trim() || null, program: c.program,
        portion_count: Number(c.portion_count) || 0,
        temp_at_dispatch: c.temp_at_dispatch === '' ? null : Number(c.temp_at_dispatch),
      })),
  }))
  const totalContainers = payload.reduce((n, s) => n + s.containers.length, 0)

  const dispatch = async () => {
    if (!active || totalContainers === 0) return
    setBusy(true); setError(null)
    try {
      const r = await rpc('dispatch_delivery_route', { p_route_id: active.id, p_dispatched_by: dispatchedBy, p_stops: payload })
      if (r?.ok === false) throw new Error(r.error || 'dispatch failed')
      setSummary({ slot: active.meal_slot, stops: r.stops, containers: r.containers, portions: r.portions })
      setView('done')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  // ─── styles ──────────────────────────────────────────────────────────────
  const wrap: React.CSSProperties = { maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: "'DM Sans', sans-serif" }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 16, marginBottom: 14 }
  const btnPri: React.CSSProperties = { width: '100%', padding: '13px', borderRadius: 11, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', marginBottom: 3, display: 'block' }
  const slotLabel = SLOTS.find(([k]) => k === active?.meal_slot)?.[1] ?? active?.meal_slot

  if (loading) return <div style={{ ...wrap, color: '#888' }}>Loading…</div>

  return (
    <div style={wrap}>
      {error && <div style={{ ...card, background: '#fff0f0', borderColor: '#fcc', color: '#b02a37', fontSize: 13 }}>⚠️ {error}</div>}

      {/* ── SLOTS ── */}
      {view === 'slots' && (
        <>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>🚚 Dispatch · Ridge Kitchen</div>
          <h2 style={{ margin: '0 0 16px', fontSize: 20, color: '#0a3320' }}>Today — {init?.date}</h2>
          {SLOTS.map(([slot, label]) => {
            const route = routeFor(slot)
            const dispatched = route && route.status !== 'pending'
            return (
              <div key={slot} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#0a3320' }}>{label}</div>
                  {dispatched && <span style={{ fontSize: 11, fontWeight: 700, color: '#0f7a4a', background: '#e7f7ee', padding: '3px 9px', borderRadius: 20 }}>Dispatched ✓</span>}
                </div>
                <div style={{ fontSize: 12, color: '#888', margin: '6px 0 12px' }}>
                  Pearl {arrivalFor(slot, PEARL_ID)} · Alpha {arrivalFor(slot, ALPHA_ID)}
                </div>
                {dispatched ? null
                  : route ? <button style={btnPri} disabled={busy} onClick={() => openEntry(route.id, slot)}>Continue →</button>
                  : <button style={btnPri} disabled={busy} onClick={() => createRoute(slot)}>{busy ? '…' : 'Create Route'}</button>}
              </div>
            )
          })}
        </>
      )}

      {/* ── ENTRY ── */}
      {view === 'entry' && active && (
        <>
          <button onClick={() => { setView('slots'); loadInit() }} style={{ background: 'none', border: 'none', color: '#1a6b4a', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Back</button>
          <h2 style={{ margin: '0 0 16px', fontSize: 20, color: '#0a3320' }}>{slotLabel} · containers</h2>

          {stops.map((stop, si) => (
            <div key={stop.center_id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0a3320' }}>Stop {si + 1}: {stop.center_name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>Arrival {stop.arrival_window}</div>
              </div>

              {stop.containers.map((c, ci) => (
                <div key={ci} style={{ borderTop: ci === 0 ? 'none' : '1px solid #f0f0f0', paddingTop: ci === 0 ? 0 : 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Container label</label>
                      <input style={inp} value={c.container_label} placeholder="e.g. Pearl Lunch A"
                        onChange={e => setContainer(si, ci, { container_label: e.target.value })} />
                    </div>
                    {stop.containers.length > 1 && (
                      <button onClick={() => removeContainer(si, ci)} title="Remove"
                        style={{ border: 'none', background: '#fbeaea', color: '#c0392b', borderRadius: 8, width: 38, height: 38, fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>×</button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lbl}>Program</label>
                      <select style={inp} value={c.program} onChange={e => setContainer(si, ci, { program: e.target.value as 'child' | 'infant' })}>
                        <option value="child">Child</option><option value="infant">Infant</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Portions</label>
                      <input style={inp} type="number" inputMode="numeric" value={c.portion_count} placeholder="0"
                        onChange={e => setContainer(si, ci, { portion_count: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Temp °F</label>
                      <input style={inp} type="number" inputMode="decimal" value={c.temp_at_dispatch} placeholder="165"
                        onChange={e => setContainer(si, ci, { temp_at_dispatch: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => addContainer(si)}
                style={{ width: '100%', padding: '9px', borderRadius: 9, border: '1.5px dashed #bbb', background: '#fafafa', color: '#0f4c35', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add Container
              </button>
            </div>
          ))}

          <button style={{ ...btnPri, background: totalContainers && !busy ? '#0f4c35' : '#bbb', cursor: totalContainers && !busy ? 'pointer' : 'default' }}
            disabled={!totalContainers || busy} onClick={dispatch}>
            {busy ? 'Dispatching…' : `Dispatch ✓ (${totalContainers} container${totalContainers === 1 ? '' : 's'})`}
          </button>
        </>
      )}

      {/* ── DONE ── */}
      {view === 'done' && summary && (
        <div style={{ ...card, textAlign: 'center', background: '#e7f7ee', borderColor: '#9fe3bf', padding: '32px 20px' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f7a4a', marginBottom: 8 }}>Dispatched!</div>
          <div style={{ fontSize: 14, color: '#0a3320', lineHeight: 1.6 }}>
            {SLOTS.find(([k]) => k === summary.slot)?.[1] ?? summary.slot} · {init?.date}<br />
            {summary.stops} stops · {summary.containers} containers · {summary.portions} portions
          </div>
          <button style={{ ...btnPri, marginTop: 20 }} onClick={() => { setSummary(null); setActive(null); setView('slots'); loadInit() }}>
            New Dispatch
          </button>
        </div>
      )}
    </div>
  )
}
