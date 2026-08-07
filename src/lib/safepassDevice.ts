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

// ── teacher check-in (move 1 of the teacher entry) ───────────────────────────
// The tablet presents its TOKEN, the PIN identifies the person. Entering a shift is not
// signing a handoff, so the PIN stays here whatever the strict option is set to.
export type CheckedInTeacher = {
  staff_id: string
  name: string
  checked_in_at: string
  is_duty: boolean          // first check-in of the shift — ORDER only, never a gate
}

/** Who is in this room today. This is the source the name tiles will be built on. */
export async function fetchCheckedInToday(
  token: string, classroomId?: string,
): Promise<CheckedInTeacher[]> {
  const { data, error } = await mm().rpc('safepass_checked_in_today', {
    p_token: token, ...(classroomId ? { p_classroom: classroomId } : {}),
  })
  if (error) throw error
  return (data?.teachers ?? []) as CheckedInTeacher[]
}

/** classroomId is passed explicitly so a floater checking in on a shared centre pad lands
 *  in the room they actually work, not in the room the tablet belongs to. */
export async function staffCheckIn(
  token: string, pinHashHex: string, classroomId?: string, force = false,
): Promise<HandoffResult> {
  const { data, error } = await mm().rpc('safepass_staff_check_in', {
    p_token: token, p_pin_hash: pinHashHex, ...(classroomId ? { p_classroom: classroomId } : {}),
    ...(force ? { p_force: true } : {}),
  })
  if (error) {
    if (/invalid pin/i.test(error.message)) throw new InvalidPinError()
    throw error
  }
  return data as HandoffResult
}

// force = второй тап: человек уходит в чрезвычайной ситуации, система не задерживает
// его, а честно записывает исключение (note + отметка директору).
export async function staffCheckOut(token: string, pinHashHex: string, force = false): Promise<HandoffResult> {
  const { data, error } = await mm().rpc('safepass_staff_check_out', {
    p_token: token, p_pin_hash: pinHashHex, ...(force ? { p_force: true } : {}),
  })
  if (error) {
    if (/invalid pin/i.test(error.message)) throw new InvalidPinError()
    throw error
  }
  // 'not_checked_in' is an honest answer, not a failure: surface it as a non-ok result
  // rather than a thrown error the pad would read as a wrong PIN.
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

// ── driver arm (move 2-T) ────────────────────────────────────────────────────
// The driver's own phone is a registered DEVICE (device_kind='driver', no classroom); the PIN
// identifies the person on every call. Nothing here trusts the client with an identity.
export type DriverBoot = { org_id: string; center_id: string; center_name: string; device_label: string | null }
export type DriverRun = {
  run_id: string; run_type: string; vehicle: string | null; capacity: number
  status: string; started_at: string | null; aboard: number; alighted: number; listed: number
}
export type RunChild = {
  child_id: string; child_name: string; school_name: string | null
  status: 'pending' | 'boarded' | 'delivered' | 'absent'
  boarded_at: string | null; alighted_at: string | null; over_capacity: boolean
}

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await mm().rpc(fn, args)
  if (error) {
    if (/invalid pin/i.test(error.message)) throw new InvalidPinError()
    throw error
  }
  return data as any
}

/** Boot: the centre id is the PIN salt, so this runs before a PIN can even be asked. */
export async function driverBoot(token: string): Promise<DriverBoot> {
  const d = await call('safepass_driver_boot', { p_token: token })
  if (!d?.ok) throw new Error(d?.error ?? 'device_not_registered')
  return d as DriverBoot
}
export const driverRunsToday = (token: string, pin: string) =>
  call('safepass_driver_runs_today', { p_token: token, p_pin_hash: pin })
export const driverOpenRun = (token: string, pin: string, runType: string, vehicle: string, capacity: number) =>
  call('safepass_driver_open_run', { p_token: token, p_pin_hash: pin, p_run_type: runType, p_vehicle: vehicle, p_capacity: capacity })
export const driverRunChildren = (token: string, run: string) =>
  call('safepass_driver_run_children', { p_token: token, p_run: run })
export const driverAddChild = (token: string, pin: string, run: string, childId: string, childName: string, school: string) =>
  call('safepass_driver_add_child', { p_token: token, p_pin_hash: pin, p_run: run, p_child: childId, p_child_name: childName, p_school: school })
/** force=true only ever on a deliberate SECOND tap, after capacity_reached came back. */
export const driverTap = (token: string, pin: string, run: string, childId: string, kind: 'on_bus' | 'off', force = false) =>
  call('safepass_driver_tap', { p_token: token, p_pin_hash: pin, p_run: run, p_child: childId, p_kind: kind, p_force: force })
export const driverCompleteRun = (token: string, pin: string, run: string) =>
  call('safepass_driver_complete_run', { p_token: token, p_pin_hash: pin, p_run: run })
export const driverAttachSheet = (token: string, pin: string, run: string, photoPath: string) =>
  call('safepass_driver_attach_sheet', { p_token: token, p_pin_hash: pin, p_run: run, p_photo_path: photoPath })

/** Mini-Devices (tail of 2-T): mint a token for a classroom pad or a driver's phone.
 *  The raw token comes back ONCE — the database stores only its sha256. */
export async function registerDeviceKind(
  orgId: string, centerId: string, classroomId: string | null, label: string | null,
  kind: 'classroom' | 'driver',
): Promise<string> {
  const { data, error } = await mm().rpc('safepass_register_device', {
    p_org: orgId, p_center: centerId, p_classroom: classroomId, p_label: label, p_kind: kind,
  })
  if (error) throw error
  return data as string
}

// ── App учителя v1: вход в ОБОЛОЧКУ ──────────────────────────────────────────
// Опознание без действия. Открыть вкладку и отметить приход на работу — разные
// события; путать их значит врать в часах, поэтому check_in сюда не годится.
// Обе функции — миграция 20260807a.
export type TeacherIdentity = {
  staff_id: string
  staff_name: string
  position: string | null
  class_primary: string | null
  has_classroom: boolean
  center_id: string
  center_slug: string
  center_name: string
  classroom_id: string
  classroom_name: string
}

export async function identifyByPin(token: string, pinHashHex: string): Promise<TeacherIdentity> {
  const { data, error } = await mm().rpc('safepass_identify_by_pin', { p_token: token, p_pin_hash: pinHashHex })
  if (error) {
    if (/invalid pin/i.test(error.message)) throw new InvalidPinError()
    throw error
  }
  return data as TeacherIdentity
}

export type MyTime = {
  staff_id: string
  staff_name: string
  days: number
  events: { event_type: string; event_at: string; classroom_name: string | null; note: string | null }[]
}

/** Свои смены и только свои: чужие часы не видны даже коллеге за тем же планшетом. */
export async function fetchMyTime(token: string, pinHashHex: string, days = 7): Promise<MyTime> {
  const { data, error } = await mm().rpc('safepass_my_time', { p_token: token, p_pin_hash: pinHashHex, p_days: days })
  if (error) {
    if (/invalid pin/i.test(error.message)) throw new InvalidPinError()
    throw error
  }
  return data as MyTime
}
