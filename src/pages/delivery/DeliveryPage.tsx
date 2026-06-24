// Delivery — tabbed page mounted at /delivery (replaces the old placeholder).
// Tabs: Log | Temperature Log | Label. The Log tab's "print label" buttons jump
// to the Label tab pre-filled; the Label tab also has its own route/stop/container
// picker so you can print any container's label directly.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { DeliveryLog } from './DeliveryLog'
import { DeliveryTemperatureLog } from './DeliveryTemperatureLog'
import { DeliveryLabel } from './DeliveryLabel'

type Tab = 'log' | 'temp' | 'label'
type Preset = { routeId: string; stopId: string; containerId: string }

const TABS: [Tab, string][] = [['log', '📋 Log'], ['temp', '🌡️ Temperature Log'], ['label', '🏷️ Label']]

export default function DeliveryPage() {
  const { org } = useOrg()
  const orgId = org?.id
  const [tab, setTab] = useState<Tab>('log')
  const [preset, setPreset] = useState<Preset | null>(null)

  const showLabel = (routeId: string, stopId: string, containerId: string) => {
    setPreset({ routeId, stopId, containerId })
    setTab('label')
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100%', background: '#f4f6f4' }}>
      <div style={{ display: 'flex', gap: 2, padding: '12px 20px 0', background: '#fff', borderBottom: '1px solid #e8e8e8', position: 'sticky', top: 0, zIndex: 5 }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => { if (k !== 'label') setPreset(null); setTab(k) }}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              color: tab === k ? '#0f4c35' : '#888',
              borderBottom: tab === k ? '2px solid #0f4c35' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'log'   && <DeliveryLog orgId={orgId} onShowLabel={showLabel} />}
      {tab === 'temp'  && <DeliveryTemperatureLog orgId={orgId} />}
      {tab === 'label' && <LabelTab orgId={orgId} preset={preset} />}
    </div>
  )
}

// ─── Label tab: pick route → stop → container, then render the label ──────────
interface RouteOpt { id: string; delivery_date: string; meal_slot: string | null }
interface StopOpt { id: string; stop_order: number; center_name: string }
interface ContOpt { id: string; container_label: string | null; container_type: string | null; portion_count: number | null }

function LabelTab({ orgId, preset }: { orgId?: string; preset: Preset | null }) {
  const [routes, setRoutes] = useState<RouteOpt[]>([])
  const [stops, setStops] = useState<StopOpt[]>([])
  const [containers, setContainers] = useState<ContOpt[]>([])
  const [routeId, setRouteId] = useState(preset?.routeId ?? '')
  const [stopId, setStopId] = useState(preset?.stopId ?? '')
  const [containerId, setContainerId] = useState(preset?.containerId ?? '')

  // routes for this org (recent first)
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('delivery_routes')
        .select('id, delivery_date, meal_slot').eq('org_id', orgId)
        .order('delivery_date', { ascending: false }).limit(50)
      if (!cancelled) setRoutes((data ?? []) as RouteOpt[])
    })()
    return () => { cancelled = true }
  }, [orgId])

  // stops for the chosen route (+ center names)
  useEffect(() => {
    if (!routeId) { setStops([]); return }
    let cancelled = false
    ;(async () => {
      const { data: s } = await supabase.schema('menumaker').from('delivery_stops')
        .select('id, stop_order, center_id').eq('route_id', routeId).order('stop_order')
      const ids = [...new Set((s ?? []).map((x: any) => x.center_id).filter(Boolean))]
      const { data: ctrs } = ids.length
        ? await supabase.schema('menumaker').from('centers').select('id, name').in('id', ids)
        : { data: [] as any[] }
      const nameMap = Object.fromEntries((ctrs ?? []).map((c: any) => [c.id, c.name]))
      if (!cancelled) setStops((s ?? []).map((x: any) => ({
        id: x.id, stop_order: x.stop_order, center_name: (nameMap[x.center_id] ?? '—').replace(/^Play Academy\s+/i, ''),
      })))
    })()
    return () => { cancelled = true }
  }, [routeId])

  // containers for the chosen stop
  useEffect(() => {
    if (!stopId) { setContainers([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('delivery_containers')
        .select('id, container_label, container_type, portion_count').eq('stop_id', stopId)
      if (!cancelled) setContainers((data ?? []) as ContOpt[])
    })()
    return () => { cancelled = true }
  }, [stopId])

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 5 }
  const selStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', background: '#fff', outline: 'none' }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 18, marginBottom: 16, maxWidth: 560 }}>
        <div style={{ fontWeight: 600, color: '#0a3320', marginBottom: 14 }}>Select a container to print its label</div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Route</label>
          <select value={routeId} style={selStyle}
            onChange={e => { setRouteId(e.target.value); setStopId(''); setContainerId('') }}>
            <option value="">— Select route —</option>
            {routes.map(r => <option key={r.id} value={r.id}>{r.delivery_date} · {r.meal_slot ?? 'route'}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Stop</label>
          <select value={stopId} style={selStyle} disabled={!routeId}
            onChange={e => { setStopId(e.target.value); setContainerId('') }}>
            <option value="">— Select stop —</option>
            {stops.map(s => <option key={s.id} value={s.id}>Stop {s.stop_order} · {s.center_name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Container</label>
          <select value={containerId} style={selStyle} disabled={!stopId}
            onChange={e => setContainerId(e.target.value)}>
            <option value="">— Select container —</option>
            {containers.map(c => (
              <option key={c.id} value={c.id}>
                {c.container_label || `${c.container_type || 'Container'} · ${c.portion_count ?? 0} portions`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {routeId && stopId && containerId && (
        <DeliveryLabel routeId={routeId} stopId={stopId} containerId={containerId} />
      )}
    </div>
  )
}
