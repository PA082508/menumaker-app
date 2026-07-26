// SafePassDriverPage.tsx — route /safepass/driver (PUBLIC, device-gated)
//
// The driver's own phone, held in one hand at a school kerb. Everything here is sized for that:
// one column, big targets, the count of children aboard always on screen.
//
// Identity: the phone is a registered DEVICE (device_kind='driver'); the PIN says who is driving.
// Every write goes through a token+PIN RPC — the page never claims an identity of its own.
//
// Two rules from the canon are enforced by the SERVER and merely surfaced here, so they cannot be
// clicked away:
//   • capacity is a HARD limit: a child over the seat count is refused, and boarding one anyway
//     takes a deliberate second tap that records the exception (never silence);
//   • a run cannot be completed while a child is still aboard, and the refusal NAMES them.
import { useCallback, useEffect, useState } from 'react'
import {
  adoptDeviceTokenFromUrl, pinHash, InvalidPinError,
  driverBoot, driverRunsToday, driverOpenRun, driverRunChildren, driverTap,
  driverCompleteRun, driverAttachSheet,
  type DriverBoot, type DriverRun, type RunChild,
} from '@/lib/safepassDevice'
import { safePassPalette, KEY } from './shared/theme'
import { humanPinError } from './shared/PinPad'

const C = safePassPalette()

const RUN_TYPES = [
  { key: 'morning_to_school', label: 'Morning — to school' },
  { key: 'afternoon_from_school', label: 'Afternoon — from school' },
  { key: 'field_trip', label: 'Field trip' },
] as const

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'

export default function SafePassDriverPage() {
  const [token] = useState<string | null>(() => adoptDeviceTokenFromUrl())
  const [boot, setBoot] = useState<DriverBoot | null>(null)
  const [fatal, setFatal] = useState('')
  const [pin, setPin] = useState('')
  const [pinHashHex, setPinHashHex] = useState('')       // held for the session, never the PIN itself
  const [driverName, setDriverName] = useState('')
  const [runs, setRuns] = useState<DriverRun[]>([])
  const [run, setRun] = useState<DriverRun | null>(null)
  const [children, setChildren] = useState<RunChild[]>([])
  const [notice, setNotice] = useState<{ text: string; kind: 'refused' | 'done' } | null>(null)
  const [pendingForce, setPendingForce] = useState<RunChild | null>(null)
  const [busy, setBusy] = useState(false)
  const [newVehicle, setNewVehicle] = useState('')
  const [newCapacity, setNewCapacity] = useState('')
  const [newType, setNewType] = useState<string>('morning_to_school')

  // Installable as an app, without an App Store and without touching any other route. The tags
  // are attached only while this screen is mounted: the driver's phone gets "Trip", nobody else's
  // home screen changes. iOS reads apple-touch-icon and the apple-mobile-* metas; Chrome reads
  // the manifest — so both are set.
  useEffect(() => {
    const added: HTMLElement[] = []
    const put = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      document.head.appendChild(el); added.push(el)
    }
    put('link', { rel: 'manifest', href: '/driver.webmanifest' })
    put('link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/driver-icon-180.png' })
    put('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
    put('meta', { name: 'apple-mobile-web-app-title', content: 'Trip' })
    put('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' })
    put('meta', { name: 'theme-color', content: '#05603a' })
    const prevTitle = document.title
    document.title = 'Trip'
    return () => { added.forEach(el => el.remove()); document.title = prevTitle }
  }, [])

  useEffect(() => {
    if (!token) { setFatal('This phone is not registered — ask the director for a registration link.'); return }
    driverBoot(token).then(setBoot).catch(() => setFatal('This phone is not registered, or its access was revoked.'))
  }, [token])

  const loadRuns = useCallback(async (hash: string) => {
    const d = await driverRunsToday(token!, hash)
    setDriverName(d.driver?.name ?? '')
    setRuns((d.runs ?? []) as DriverRun[])
  }, [token])

  async function signIn() {
    if (!boot || pin.length < 4) return
    setBusy(true); setNotice(null)
    try {
      const h = await pinHash(boot.center_id, pin)
      await loadRuns(h)
      setPinHashHex(h); setPin('')
    } catch (e) {
      setNotice({ kind: 'refused', text: e instanceof InvalidPinError ? 'That PIN is not recognised at this center.' : humanPinError((e as Error)?.message ?? '') })
      setPin('')
    } finally { setBusy(false) }
  }

  const openRoute = useCallback(async (r: DriverRun) => {
    setRun(r)
    const d = await driverRunChildren(token!, r.run_id)
    setChildren((d.children ?? []) as RunChild[])
  }, [token])

  async function startRun() {
    const cap = parseInt(newCapacity, 10)
    if (!cap || cap <= 0) { setNotice({ kind: 'refused', text: 'Enter how many seats this bus has — the limit is per vehicle.' }); return }
    setBusy(true)
    try {
      const d = await driverOpenRun(token!, pinHashHex, newType, newVehicle.trim(), cap)
      if (!d?.ok) { setNotice({ kind: 'refused', text: 'Could not start the run — nothing was saved.' }); return }
      await loadRuns(pinHashHex)
      const d2 = await driverRunsToday(token!, pinHashHex)
      const fresh = (d2.runs ?? []).find((x: DriverRun) => x.run_id === d.run_id)
      if (fresh) await openRoute(fresh)
    } finally { setBusy(false) }
  }

  // A tap is two gestures when it crosses the limit: the first is refused with the reason, the
  // second — on the same child, deliberately — records the exception.
  async function tap(child: RunChild, kind: 'on_bus' | 'off', force = false) {
    if (!run) return
    setBusy(true); setNotice(null)
    try {
      const d = await driverTap(token!, pinHashHex, run.run_id, child.child_id, kind, force)
      if (!d?.ok && d?.error === 'capacity_reached') {
        setPendingForce(child)
        setNotice({ kind: 'refused', text: `The bus is full — ${d.aboard} of ${d.capacity} seats. Start a second run, or tap ${child.child_name} again to board anyway; that is recorded.` })
        return
      }
      if (!d?.ok) { setNotice({ kind: 'refused', text: 'Not recorded — try again, or use the paper sheet.' }); return }
      setPendingForce(null)
      setNotice({ kind: 'done', text: `${child.child_name} ${kind === 'on_bus' ? 'on the bus' : 'off the bus'}${d.over_capacity ? ' — over capacity, recorded as an exception' : ''}.` })
      await openRoute(run)
    } catch (e) {
      setNotice({ kind: 'refused', text: humanPinError((e as Error)?.message ?? '') })
    } finally { setBusy(false) }
  }

  async function complete() {
    if (!run) return
    setBusy(true); setNotice(null)
    try {
      const d = await driverCompleteRun(token!, pinHashHex, run.run_id)
      if (!d?.ok && d?.error === 'children_still_aboard') {
        setNotice({ kind: 'refused', text: `Still on the bus: ${(d.children as string[]).join(', ')}. The run cannot be closed until every child is off.` })
        return
      }
      if (!d?.ok) { setNotice({ kind: 'refused', text: 'Could not close the run — nothing was saved.' }); return }
      setNotice({ kind: 'done', text: 'Run completed.' })
      setRun(null); setChildren([])
      await loadRuns(pinHashHex)
    } finally { setBusy(false) }
  }

  async function attachSheet(file: File) {
    if (!run) return
    setBusy(true)
    try {
      const path = `transport/${run.run_id}/sheet-${file.name.replace(/[^\w.]+/g, '_')}`
      const { supabase } = await import('@/lib/supabase')
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) { setNotice({ kind: 'refused', text: 'Photo not saved — the sheet stays on paper.' }); return }
      const d = await driverAttachSheet(token!, pinHashHex, run.run_id, path)
      setNotice(d?.ok
        ? { kind: 'done', text: 'Paper sheet attached to this run.' }
        : { kind: 'refused', text: 'Photo uploaded but not linked — tell the office.' })
    } finally { setBusy(false) }
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  const page: React.CSSProperties = { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif", padding: '16px 14px 40px' }
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }
  const bigBtn = (bg: string): React.CSSProperties => ({ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: bg, color: C.onAccent, fontSize: KEY.action, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' })
  const input: React.CSSProperties = { width: '100%', padding: '13px 14px', borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' }

  if (fatal) return (
    <div style={page}><div role="alert" style={{ ...card, background: C.redDim, border: `2px solid ${C.red}`, color: C.red, fontSize: KEY.banner, fontWeight: 700 }}>{fatal}</div></div>
  )
  if (!boot) return <div style={page}><div style={{ color: C.muted }}>Loading…</div></div>

  const aboard = children.filter(c => c.status === 'boarded').length
  const bySchool = children.reduce<Record<string, RunChild[]>>((acc, c) => {
    const k = c.school_name || 'No school on file'
    ;(acc[k] ||= []).push(c); return acc
  }, {})

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>🚌 Trip</div>
        <div style={{ fontSize: 12, color: C.muted }}>{boot.center_name}{driverName ? ` · ${driverName}` : ''}</div>
      </div>

      {notice && (
        <div role="alert" style={{ ...card, marginBottom: 12,
          background: notice.kind === 'refused' ? C.amberDim : C.greenDim,
          border: `1.5px solid ${notice.kind === 'refused' ? C.amber : C.green}`,
          color: notice.kind === 'refused' ? C.amber : C.green, fontSize: KEY.banner, fontWeight: 700 }}>
          {notice.kind === 'refused' ? '⚠️ ' : '✓ '}{notice.text}
        </div>
      )}

      {/* Install hint: shown only in a browser tab, never inside the installed app. */}
      {typeof window !== 'undefined' && !window.matchMedia?.('(display-mode: standalone)').matches
        && !(navigator as any).standalone && (
        <div style={{ ...card, background: C.blueDim, border: `1.5px solid ${C.blue}`, color: C.blue, fontSize: 13, fontWeight: 600 }}>
          📲 Put this on your home screen: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.
          It then opens like an app — full screen, no address bar.
        </div>
      )}

      {/* PIN */}
      {!pinHashHex && (
        <div style={card}>
          <div style={{ fontSize: KEY.action, fontWeight: 800, marginBottom: 8 }}>Your 4-digit staff PIN</div>
          <input style={input} type="tel" inputMode="numeric" value={pin} maxLength={4}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && signIn()} placeholder="••••" />
          <div style={{ height: 10 }} />
          <button style={bigBtn(pin.length === 4 && !busy ? C.green : C.border)} disabled={pin.length < 4 || busy} onClick={signIn}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </div>
      )}

      {/* Runs today / start a run */}
      {pinHashHex && !run && (
        <>
          {runs.map(r => (
            <button key={r.run_id} onClick={() => openRoute(r)} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ fontSize: KEY.action, fontWeight: 800 }}>{RUN_TYPES.find(t => t.key === r.run_type)?.label ?? r.run_type}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
                {r.vehicle || 'bus'} · seats {r.capacity} · on board {r.aboard} · off {r.alighted} · {r.status} · {hhmm(r.started_at)}
              </div>
            </button>
          ))}
          <div style={card}>
            <div style={{ fontSize: KEY.action, fontWeight: 800, marginBottom: 10 }}>Start a run</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {RUN_TYPES.map(t => (
                <button key={t.key} onClick={() => setNewType(t.key)}
                  style={{ padding: '8px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: 700, background: newType === t.key ? C.green : C.surface2, color: newType === t.key ? C.onAccent : C.muted }}>
                  {t.label}
                </button>
              ))}
            </div>
            <input style={input} value={newVehicle} onChange={e => setNewVehicle(e.target.value)} placeholder="Bus (e.g. Wickliffe 1)" />
            <div style={{ height: 8 }} />
            <input style={input} type="tel" inputMode="numeric" value={newCapacity}
              onChange={e => setNewCapacity(e.target.value.replace(/\D/g, ''))} placeholder="Seats on this bus (e.g. 14)" />
            <div style={{ fontSize: 12, color: C.muted, margin: '6px 2px 10px' }}>
              The seat count belongs to this bus and to this run. It is a limit, not a suggestion.
            </div>
            <button style={bigBtn(busy ? C.border : C.blue)} disabled={busy} onClick={startRun}>Start run</button>
          </div>
        </>
      )}

      {/* Route */}
      {run && (
        <>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: KEY.action, fontWeight: 800 }}>{RUN_TYPES.find(t => t.key === run.run_type)?.label}</div>
              <div style={{ fontSize: 13, color: C.muted }}>{run.vehicle || 'bus'} · {children.length} on the list</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: aboard > run.capacity ? C.red : C.text }}>{aboard}<span style={{ fontSize: 15, color: C.muted }}>/{run.capacity}</span></div>
              <div style={{ fontSize: 11, color: C.muted }}>on board</div>
            </div>
          </div>

          {Object.entries(bySchool).map(([school, kids]) => (
            <div key={school} style={card}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>{school}</div>
              {kids.map(c => {
                const forcing = pendingForce?.child_id === c.child_id
                return (
                  <div key={c.child_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: KEY.tileName, fontWeight: 700 }}>{c.child_name}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>
                        {c.status === 'boarded' ? `on the bus · ${hhmm(c.boarded_at)}` : c.status === 'delivered' ? `off · ${hhmm(c.alighted_at)}` : 'not boarded'}
                        {c.over_capacity && <span style={{ color: C.amber, fontWeight: 700 }}> · over capacity</span>}
                      </div>
                    </div>
                    {c.status !== 'boarded' ? (
                      <button disabled={busy} onClick={() => tap(c, 'on_bus', forcing)}
                        style={{ padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 14, fontWeight: 800, background: forcing ? C.amber : C.green, color: C.onAccent }}>
                        {forcing ? 'Board anyway' : 'On bus'}
                      </button>
                    ) : (
                      <button disabled={busy} onClick={() => tap(c, 'off')}
                        style={{ padding: '12px 16px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${C.blue}`,
                          color: C.blue, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
                        Off
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          <div style={card}>
            <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 8 }}>
              Filled the paper sheet by hand? Photograph it here.
            </label>
            <input type="file" accept="image/*" capture="environment"
              onChange={e => e.target.files?.[0] && attachSheet(e.target.files[0])} style={{ fontSize: 13 }} />
          </div>

          <button style={bigBtn(busy ? C.border : C.blue)} disabled={busy} onClick={complete}>Run completed</button>
          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 8 }}>
            A run cannot be closed while a child is still on the bus.
          </div>
          <div style={{ height: 10 }} />
          <button onClick={() => { setRun(null); setNotice(null) }}
            style={{ ...bigBtn('transparent'), color: C.muted, border: `1px solid ${C.border}` }}>← Back to today's runs</button>
        </>
      )}
    </div>
  )
}
