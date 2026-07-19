// safepassDevice.ts — client half of the DEVICE-scoped SafePass kiosk.
//
// The kiosk (public /safepass/kiosk, anon) never logs a teacher in. It boots from
// a device TOKEN minted by safepass_register_device and persisted here; all reads
// and writes go through the token-gated menumaker RPCs (no direct table access).
//
// PIN attribution: pinHash() reproduces menumaker._safepass_pin_hash EXACTLY —
// sha256(center_id + ':' + pin), hex — so a PIN can be verified offline against a
// cached hash and re-verified server-side on sync. Parity is pinned by a unit test
// (safepassDevice.test.ts) against the DB vector
//   sha256("881ef4ce-1a27-4d3b-aa60-59d2a307bf2b:1234") = a1c542df…e5c4
import { supabase } from '@/lib/supabase'

const TOKEN_KEY = 'sp_kiosk_token'
const mm = () => supabase.schema('menumaker')

// ── device token (survives reloads + offline) ────────────────────────────────
export function getDeviceToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setDeviceToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode — in-memory only */ }
}
export function clearDeviceToken(): void {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
}

/** Charging a tablet: the raw token arrives ONCE, as `?device_token=…` on the first
 *  open (a tablet has no console to paste into). Persist it, then strip it from the
 *  URL in the same tick — a token left in the address bar survives in history, in a
 *  screenshot, and in whatever the next person opens. Returns the adopted token, or
 *  the already-stored one when the param is absent. */
export function adoptDeviceTokenFromUrl(): string | null {
  try {
    const url = new URL(window.location.href)
    const fromUrl = url.searchParams.get('device_token')
    if (fromUrl) {
      setDeviceToken(fromUrl)
      url.searchParams.delete('device_token')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      return fromUrl
    }
  } catch { /* no window / bad URL — fall through to storage */ }
  return getDeviceToken()
}

// ── PIN hashing (MUST match menumaker._safepass_pin_hash) ─────────────────────
export async function pinHash(centerId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${centerId}:${pin}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── types ────────────────────────────────────────────────────────────────────
export type DeviceContext = {
  device_id: string
  org_id: string
  center_id: string          // also the PIN salt
  classroom_id: string
  classroom_name: string
  children: { roster_id: string; child_name: string }[]
}
export type KioskSession = {
  id: string
  child_id: string
  child_name: string
  parent_name: string | null
  trusted_person_name: string | null
  auth_method: string
  action_type: 'drop_off' | 'pick_up' | 'transfer'
  status: string
  person_initiated_at: string
  teacher_confirmed_at: string | null
}
export type HandoffResult = { ok: boolean; staff_id: string; staff_name: string; already?: boolean }

// Postgres raises 'invalid PIN' from safepass_confirm_handoff; surface that as a
// distinct signal so the PIN pad can count it toward the throttle (vs a network
// error, which must NOT burn an attempt).
export class InvalidPinError extends Error {
  constructor() { super('invalid PIN'); this.name = 'InvalidPinError' }
}

// ── RPC wrappers ──────────────────────────────────────────────────────────────

/** Boot context: classroom + that classroom's active roster. Throws if the token
 *  is unregistered/revoked → caller shows the "Register this device" screen. */
export async function fetchDeviceContext(token: string): Promise<DeviceContext> {
  const { data, error } = await mm().rpc('safepass_device_context', { p_token: token })
  if (error) throw error
  return data as DeviceContext
}

/** Today's sessions for the device's classroom (polled; anon can't read the table
 *  directly or via realtime — RLS has no anon policy). */
export async function fetchDeviceSessions(token: string): Promise<KioskSession[]> {
  const { data, error } = await mm().rpc('safepass_device_sessions', { p_token: token })
  if (error) throw error
  return (data ?? []) as KioskSession[]
}

/** Accept a drop_off / Release a pick_up. p_pin_hash is computed on-device.
 *  occurredAt is set only when replaying a queued offline event. */
export async function confirmHandoff(
  token: string, sessionId: string, pinHashHex: string, occurredAt?: string,
): Promise<HandoffResult> {
  const { data, error } = await mm().rpc('safepass_confirm_handoff', {
    p_token: token,
    p_session_id: sessionId,
    p_pin_hash: pinHashHex,
    ...(occurredAt ? { p_occurred_at: occurredAt } : {}),
  })
  if (error) {
    if (/invalid pin/i.test(error.message)) throw new InvalidPinError()
    throw error
  }
  return data as HandoffResult
}

/** Director-only (caller must be authenticated). Returns the raw token ONCE. */
export async function registerDevice(
  orgId: string, centerId: string, classroomId: string, label: string | null,
): Promise<string> {
  const { data, error } = await mm().rpc('safepass_register_device', {
    p_org: orgId, p_center: centerId, p_classroom: classroomId, p_label: label,
  })
  if (error) throw error
  return data as string
}
