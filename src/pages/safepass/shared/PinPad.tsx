// PinPad — 4-digit staff PIN modal for kiosk Accept/Release. Computes the hash
// on-device (parity with the server) and hands it to onVerify.
//
// Throttle (required): after MAX_ATTEMPTS wrong PINs in a row the pad locks for
// COOLDOWN_MS. The lock is persisted in localStorage so it survives a reload and
// works fully OFFLINE — only an InvalidPinError burns an attempt; a network error
// does not. Locking is per-device (the shared kiosk), which is the right scope: it
// slows PIN-guessing on that iPad without punishing a specific staff member.
import { useCallback, useEffect, useRef, useState } from 'react'
import { pinHash, InvalidPinError, type HandoffResult } from '@/lib/safepassDevice'

const MAX_ATTEMPTS = 4
const COOLDOWN_MS = 45_000
const LOCK_KEY = 'sp_pin_lock'

const C = {
  scrim: 'rgba(4,6,12,0.72)', surface: '#1a1d27', surface2: '#22263a', border: '#2e3350',
  text: '#f0f2ff', muted: '#7b82a6', green: '#00e896', red: '#ff4d6a', key: '#272c42',
}

const readLock = (): number => {
  try { return Number(localStorage.getItem(LOCK_KEY)) || 0 } catch { return 0 }
}
const writeLock = (until: number): void => {
  try { until ? localStorage.setItem(LOCK_KEY, String(until)) : localStorage.removeItem(LOCK_KEY) } catch { /* noop */ }
}

export default function PinPad({
  centerId, title, subtitle, onVerify, onSuccess, onCancel,
}: {
  centerId: string
  title: string
  subtitle?: string
  onVerify: (pinHashHex: string) => Promise<HandoffResult>
  onSuccess: (r: HandoffResult) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number>(() => readLock())
  const [now, setNow] = useState<number>(() => Date.now())
  const submitting = useRef(false)

  const locked = lockedUntil > now
  const secsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  // tick only while a lock is active
  useEffect(() => {
    if (!locked) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [locked])

  useEffect(() => {
    if (lockedUntil && lockedUntil <= now) { writeLock(0); setLockedUntil(0); setError(null) }
  }, [lockedUntil, now])

  const submit = useCallback(async (value: string) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setError(null)
    try {
      const hash = await pinHash(centerId, value)
      const result = await onVerify(hash)
      onSuccess(result)
    } catch (e) {
      if (e instanceof InvalidPinError) {
        const next = attempts + 1
        setPin('')
        if (next >= MAX_ATTEMPTS) {
          const until = Date.now() + COOLDOWN_MS
          writeLock(until); setLockedUntil(until); setAttempts(0)
          setError(`Too many wrong PINs — locked for ${Math.round(COOLDOWN_MS / 1000)}s`)
        } else {
          setAttempts(next)
          setError(`Wrong PIN — ${MAX_ATTEMPTS - next} ${MAX_ATTEMPTS - next === 1 ? 'try' : 'tries'} left`)
        }
      } else {
        // network / server error — do NOT burn an attempt
        setPin('')
        setError((e as Error)?.message || 'Could not verify — try again')
      }
    } finally {
      setBusy(false); submitting.current = false
    }
  }, [attempts, centerId, onVerify, onSuccess])

  const press = (d: string) => {
    if (locked || busy) return
    setError(null)
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) void submit(next)
  }
  const backspace = () => { if (!locked && !busy) setPin(p => p.slice(0, -1)) }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: C.scrim, zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 320, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20,
        padding: '22px 22px 18px', boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>{title}</div>
          {subtitle && <div style={{ color: C.muted, fontSize: 12.5, marginTop: 3 }}>{subtitle}</div>}
        </div>

        {/* PIN dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '18px 0 6px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < pin.length ? C.green : 'transparent',
              border: `2px solid ${i < pin.length ? C.green : C.border}`,
              transition: 'background 0.1s',
            }} />
          ))}
        </div>

        <div style={{ height: 20, textAlign: 'center', fontSize: 12.5, marginBottom: 10,
          color: locked ? C.red : error ? C.red : C.muted }}>
          {locked ? `Locked — try again in ${secsLeft}s` : (error ?? (busy ? 'Checking…' : 'Enter your 4-digit PIN'))}
        </div>

        {/* keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, opacity: locked ? 0.4 : 1 }}>
          {keys.map(k => (
            <button key={k} onClick={() => press(k)} disabled={locked || busy} style={keyStyle}>{k}</button>
          ))}
          <button onClick={onCancel} style={{ ...keyStyle, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600 }}>Cancel</button>
          <button onClick={() => press('0')} disabled={locked || busy} style={keyStyle}>0</button>
          <button onClick={backspace} disabled={locked || busy} style={{ ...keyStyle, background: 'transparent', color: C.muted, fontSize: 20 }}>⌫</button>
        </div>
      </div>
    </div>
  )
}

const keyStyle: React.CSSProperties = {
  height: 58, borderRadius: 14, border: '1px solid #2e3350', background: '#272c42',
  color: '#f0f2ff', fontSize: 22, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  WebkitUserSelect: 'none', userSelect: 'none',
}
