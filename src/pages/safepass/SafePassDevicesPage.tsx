// SafePassDevicesPage.tsx — route /settings/safepass-devices (STAFF, authenticated)
//
// Mini-Devices, the tail of move 2-T. The point is one sentence: a director connects a driver's
// phone or a classroom pad WITHOUT a developer. Full version — last seen, re-label, history —
// stays in move 3, and this screen deliberately does not pretend to have it.
//
// The raw token is shown ONCE, at registration, and never again: the database keeps only its
// sha256. That is why the modal says so out loud instead of leaving the director to find out.
import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { registerDeviceKind } from '@/lib/safepassDevice'

type Device = {
  device_id: string; label: string | null; kind: 'classroom' | 'driver'
  center_id: string; center_name: string | null
  classroom_id: string | null; classroom_name: string | null
  registered_at: string; revoked_at: string | null; is_active: boolean
}
type Classroom = { id: string; name: string }

const C = {
  bg: '#f4f6fa', surface: '#ffffff', border: '#c9d0de', text: '#101521', muted: '#4a5568',
  green: '#05603a', blue: '#1a45b0', red: '#a4123a', amber: '#7a4a00', amberDim: 'rgba(122,74,0,0.10)',
}

export default function SafePassDevicesPage() {
  const { currentCenter, currentOrg } = useOrg() as any
  const [devices, setDevices] = useState<Device[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [err, setErr] = useState('')
  const [kind, setKind] = useState<'classroom' | 'driver'>('driver')
  const [label, setLabel] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [minted, setMinted] = useState<{ url: string; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_devices_for_center', { p_center: currentCenter?.id ?? null })
    // A failed read is loud: an empty table would read as "no devices", which is a different fact.
    if (error || !data?.ok) { setErr('Could not load the device list. Check your connection and that you are signed in as staff.'); return }
    setErr(''); setDevices((data.devices ?? []) as Device[])
  }, [currentCenter?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!currentCenter?.id) return
    supabase.schema('menumaker').from('classrooms').select('id,name')
      .eq('center_id', currentCenter.id).eq('is_active', true).order('sort_order')
      .then(({ data }) => setClassrooms((data ?? []) as Classroom[]))
  }, [currentCenter?.id])

  async function register() {
    if (!currentCenter?.id) { setErr('Pick a center first.'); return }
    if (kind === 'classroom' && !classroomId) { setErr('A classroom pad needs a room.'); return }
    setBusy(true); setErr('')
    try {
      const token = await registerDeviceKind(
        currentOrg?.id ?? currentCenter.org_id, currentCenter.id,
        kind === 'classroom' ? classroomId : null, label.trim() || null, kind)
      setMinted({ url: `${window.location.origin}/t/${token}`, label: label.trim() || (kind === 'driver' ? 'driver phone' : 'classroom pad') })
      setLabel(''); setClassroomId('')
      await load()
    } catch (e) {
      setErr((e as Error)?.message?.includes('not authorized')
        ? 'You do not have the right to register devices — ask the director.'
        : 'Could not register the device — nothing was created.')
    } finally { setBusy(false) }
  }

  async function revoke(d: Device) {
    if (!window.confirm(`Revoke “${d.label ?? 'this device'}”?\n\nThe tablet or phone stops working immediately. Registering it again needs a new link.`)) return
    const { data, error } = await supabase.schema('menumaker').rpc('safepass_revoke_device', { p_device: d.device_id })
    if (error || !data?.ok) { setErr('Could not revoke — the device is still active.'); return }
    load()
  }

  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }
  const input: React.CSSProperties = { padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', minWidth: 200 }
  const btn = (bg: string): React.CSSProperties => ({ padding: '10px 16px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' })

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: '100vh', fontFamily: "'Inter',system-ui,sans-serif", color: C.text }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>SafePass — Devices</h1>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
        Classroom pads and drivers' phones. A device is trusted by its link, and the person is
        still identified by their PIN on every action.
      </p>

      {err && <div role="alert" style={{ ...card, background: 'rgba(164,18,58,0.08)', border: `1.5px solid ${C.red}`, color: C.red, fontWeight: 700 }}>{err}</div>}

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Register a device</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['driver', 'classroom'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{ ...btn(kind === k ? C.green : '#eef1f7'), color: kind === k ? '#fff' : C.muted }}>
              {k === 'driver' ? '🚌 Driver phone' : '🏫 Classroom pad'}
            </button>
          ))}
          <input style={input} value={label} onChange={e => setLabel(e.target.value)}
            placeholder={kind === 'driver' ? "Driver's phone (e.g. Wickliffe 1)" : 'Pad label (e.g. Red pilot)'} />
          {kind === 'classroom' && (
            <select style={input} value={classroomId} onChange={e => setClassroomId(e.target.value)}>
              <option value="">— room —</option>
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button style={btn(busy ? C.border : C.blue)} disabled={busy} onClick={register}>Register →</button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          A driver's phone has no room: the driver picks the run, not a classroom.
        </div>
      </div>

      {minted && (
        <div style={{ ...card, border: `2px solid ${C.green}` }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Open this link on the device — once</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
            <b>This is the only time the link is shown.</b> The database keeps only a fingerprint of
            it. If it is lost, revoke the device and register it again.
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <QRCodeCanvas value={minted.url} size={148} includeMargin />
            <code style={{ fontSize: 12, wordBreak: 'break-all', background: '#eef1f7', padding: '8px 10px', borderRadius: 8, flex: 1, minWidth: 220 }}>{minted.url}</code>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button style={btn(C.blue)} onClick={() => navigator.clipboard?.writeText(minted.url)}>Copy link</button>
            <button style={{ ...btn('transparent'), color: C.muted, border: `1px solid ${C.border}` }} onClick={() => setMinted(null)}>Done</button>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Devices</div>
        {devices.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 14 }}>No devices registered for this center yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '6px 8px' }}>Device</th><th style={{ padding: '6px 8px' }}>Kind</th>
                <th style={{ padding: '6px 8px' }}>Room</th><th style={{ padding: '6px 8px' }}>Registered</th>
                <th style={{ padding: '6px 8px' }}>Status</th><th />
              </tr></thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.device_id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{d.label ?? '(no label)'}</td>
                    <td style={{ padding: '10px 8px' }}>{d.kind === 'driver' ? '🚌 driver' : '🏫 classroom'}</td>
                    <td style={{ padding: '10px 8px', color: C.muted }}>{d.classroom_name ?? '—'}</td>
                    <td style={{ padding: '10px 8px', color: C.muted }}>{new Date(d.registered_at).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: d.is_active ? C.green : C.muted }}>
                      {d.is_active ? 'active' : 'revoked'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {d.is_active && <button onClick={() => revoke(d)} style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}` }}>Revoke</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ ...{ background: C.amberDim, border: `1px solid ${C.amber}`, color: C.amber }, marginTop: 12, padding: '9px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}>
          ⓘ Last-seen, re-label and device history are not built yet — they come with the full
          Devices screen. What is here is enough to connect and to cut off a device.
        </div>
      </div>
    </div>
  )
}
