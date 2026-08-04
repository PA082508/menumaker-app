// src/components/sound/MuteToggle.tsx
// MenuMaker · Тумблер «тихий час» — один тап глушит все ярусы звука устройства.
//
// ЖИВЁТ НА САМОМ УСТРОЙСТВЕ, а не в настройках центра: заглушают конкретную
// комнату на конкретный час, и человек, который это делает, стоит рядом с
// планшетом, а не сидит в офисе.
//
// ЗНАЧОК «БЕЗЗВУЧНО» ВИДЕН ВСЕГДА, пока тишина длится, и несёт ЧАС начала.
// Молчащий планшет без видимой причины через день читают как сломанный — и
// перестают верить звуку вообще.

import { useEffect, useState } from 'react'
import { isMuted, muteLog, mutedSinceHHMM, setMuted, subscribeMute } from '@/lib/soundMute'

export function useMuteState() {
  const [tick, setTick] = useState(0)
  useEffect(() => subscribeMute(() => setTick(v => v + 1)), [])
  // tick участвует в вычислении нарочно: без него React не перечитает localStorage.
  return {
    muted: (() => { void tick; return isMuted() })(),
    since: (() => { void tick; return mutedSinceHHMM() })(),
    log: (() => { void tick; return muteLog() })(),
  }
}

export default function MuteToggle({ device, dark = false }: {
  /** Как устройство назовётся в журнале: метка планшета, иначе комната. */
  device: string
  /** Тёмная оболочка (SafePass) против светлой (экран счёта). */
  dark?: boolean
}) {
  const { muted, since, log } = useMuteState()
  const [open, setOpen] = useState(false)

  const bg = muted ? '#b45309' : (dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.15)')
  const fg = dark && !muted ? '#cbd5e1' : '#fff'

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setMuted(!muted, device)}
        onDoubleClick={() => setOpen(v => !v)}
        title={muted
          ? `Sound muted since ${since ?? '—'}. Tap to unmute. Double-tap for the log.`
          : 'Mute every sound on this device (quiet hour)'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${muted ? '#f59e0b' : 'rgba(255,255,255,0.45)'}`,
          background: bg, color: fg, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {muted ? `🔇 Muted since ${since ?? '—'}` : '🔊 Sound on'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, minWidth: 240,
          background: '#fff', color: '#333', border: '1px solid #e4e8e4', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: '10px 12px', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#0a3320' }}>Quiet-hour log · {device}</div>
          {log.length === 0
            ? <div style={{ color: '#888' }}>Nothing has been muted yet.</div>
            : log.slice(0, 12).map((e, i) => (
              <div key={`${e.at}_${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0' }}>
                <span>{e.on ? '🔇 muted' : '🔊 unmuted'}</span>
                <span style={{ color: '#888' }}>{new Date(e.at).toLocaleString()}</span>
              </div>
            ))}
          <div style={{ marginTop: 8, color: '#888', lineHeight: 1.4 }}>
            The pulsing banner and the 15-minute director alert keep working while muted.
          </div>
        </div>
      )}
    </span>
  )
}
