// src/lib/mealMarkQueue.ts
// MenuMaker · Offline meal-count queue (PWA Ф2).
//
// Boevaya potrebnost: a center loses WiFi for a whole day and teachers still
// must mark meal counts. A tap updates the UI optimistically and is written to
// this durable IndexedDB queue; when connectivity returns we drain it into the
// single writer RPC menumaker.sync_meal_marks (grid merge + point-of-service
// audit log — see 20260710c_meal_count_marks_offline_pos.sql).
//
// Design guarantees mapped to the requirements:
//  1. Optimistic tap → enqueue (component owns the optimistic state).
//  2. marked_at = DEVICE time at tap (point-of-service), carried to the audit
//     log distinct from synced_at (server time).
//  3. Badge/cell state via an external store (getPendingKeys / getPendingCount).
//  4. Auto-sync on navigator.onLine + 'online' event + exponential backoff;
//     RPC upserts by (child, week, cell) / audit uuid → re-sync makes no dupes.
//  5. Durable across PWA/iPad restart — items live in IndexedDB, not memory.
//  6. Failures are never dropped: a failed drain leaves items queued (with the
//     error recorded) and reschedules; the badge keeps counting them.
//
// SCOPE: imported only by the meal-count marking surface. Every other module
// stays network-only and never touches this queue.

import localforage from 'localforage'
import { supabase } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface QueuedMark {
  /** Client-generated uuid — audit-log primary key / idempotency token. */
  id: string
  center_id: string
  classroom_id: string
  classroom: string        // classroom NAME (meal_week_records.classroom is NOT NULL)
  roster_id: string | null
  child_name: string       // identity/join key into meal_week_records
  monday_date: string      // yyyy-MM-dd
  day: string              // 'mon'..'fri'
  slot: string             // breakfast|am_snack|lunch|supper
  col: string              // physical grid column, e.g. 'mon_b'
  value: 0 | 1             // final state of the cell at point of service
  marked_at: string        // DEVICE point-of-service ISO time
  queued_at: string
  device_id: string
  attempts: number
  last_error?: string
}

/** Identity of a single grid cell — repeated taps of the same cell collapse. */
export function cellKey(classroom_id: string, child_name: string, monday_date: string, col: string) {
  return `${classroom_id}|${child_name}|${monday_date}|${col}`
}

// ─── Durable store (IndexedDB) ───────────────────────────────────────────────
// One localForage record per cell key → repeated taps overwrite (collapse) and
// the store survives reloads. Volume is tiny (one center × one week of cells).

const store = localforage.createInstance({
  name: 'menumaker',
  storeName: 'mealMarkQueue',
  description: 'Offline meal-count marks awaiting sync',
})

// Stable per-device id (for the audit log), persisted best-effort.
let DEVICE_ID = 'unknown'
try {
  const k = 'menumaker_device_id'
  let v = localStorage.getItem(k)
  if (!v) {
    v = genUuid()
    localStorage.setItem(k, v)
  }
  DEVICE_ID = v
} catch { /* localStorage may be blocked (iOS WebView) — audit device_id stays 'unknown' */ }

function genUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch { /* fall through */ }
  // RFC4122-ish fallback for old WebViews.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── External store for React (badge + per-cell state) ───────────────────────
// In-memory mirror of the pending cell keys, rebuilt from IndexedDB on init and
// kept in sync on every mutation. useSyncExternalStore reads getSnapshot().

const pendingKeys = new Set<string>()
let hasError = false
let snapshotVersion = 0
const listeners = new Set<() => void>()

function emit() {
  snapshotVersion++
  for (const l of listeners) l()
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Monotonic version — cheap, stable snapshot for useSyncExternalStore. */
export function getVersion() { return snapshotVersion }
export function getPendingCount() { return pendingKeys.size }
export function getHasError() { return hasError }
/** Read-only membership test for cell rendering. */
export function isCellPending(key: string) { return pendingKeys.has(key) }

// ─── Init: hydrate the in-memory mirror from IndexedDB ───────────────────────

let hydrated: Promise<void> | null = null
function hydrate(): Promise<void> {
  if (hydrated) return hydrated
  hydrated = (async () => {
    try {
      await store.iterate<QueuedMark, void>((v) => {
        if (v && v.attempts > 0 && v.last_error) hasError = true
        pendingKeys.add(cellKey(v.classroom_id, v.child_name, v.monday_date, v.col))
      })
    } catch (e) {
      console.error('[mealMarkQueue] hydrate failed', e)
    }
    emit()
  })()
  return hydrated
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

export interface EnqueueInput {
  center_id: string
  classroom_id: string
  classroom: string
  roster_id: string | null
  child_name: string
  monday_date: string
  day: string
  slot: string
  col: string
  value: 0 | 1
  /** Device point-of-service time; defaults to now. */
  marked_at?: string
}

/**
 * Persist a mark and kick a drain. Repeated taps of the same cell collapse to
 * the latest value (one queued record per cell, carrying the final state and
 * its point-of-service time). Returns once the write to IndexedDB is durable.
 */
export async function enqueueMark(input: EnqueueInput): Promise<void> {
  await hydrate()
  const now = new Date().toISOString()
  const key = cellKey(input.classroom_id, input.child_name, input.monday_date, input.col)
  const item: QueuedMark = {
    id: genUuid(),
    center_id: input.center_id,
    classroom_id: input.classroom_id,
    classroom: input.classroom,
    roster_id: input.roster_id,
    child_name: input.child_name,
    monday_date: input.monday_date,
    day: input.day,
    slot: input.slot,
    col: input.col,
    value: input.value,
    marked_at: input.marked_at ?? now,
    queued_at: now,
    device_id: DEVICE_ID,
    attempts: 0,
  }
  try {
    await store.setItem(key, item)
  } catch (e) {
    console.error('[mealMarkQueue] persist failed', e)
    throw e
  }
  pendingKeys.add(key)
  emit()
  // Fire-and-forget; drain guards its own concurrency and connectivity.
  void drain()
}

// ─── Drain (grid merge + audit append via one idempotent RPC) ────────────────

let draining = false
let backoffMs = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
const BACKOFF_BASE = 2000
const BACKOFF_MAX = 60000

function scheduleRetry() {
  if (retryTimer) return
  backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX) : BACKOFF_BASE
  retryTimer = setTimeout(() => { retryTimer = null; void drain() }, backoffMs)
}

/**
 * Drain the queue into menumaker.sync_meal_marks. All queued items go in one
 * transactional RPC (idempotent: grid upsert by cell, audit upsert by uuid).
 * On success the sent items are removed; on failure they remain queued with the
 * error recorded and a backoff retry is scheduled. No-op when offline.
 */
export async function drain(): Promise<void> {
  await hydrate()
  if (draining) return
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false
  if (offline()) return

  draining = true
  try {
    // Loop under the single `draining` guard so marks queued during an await are
    // picked up without spawning a second concurrent drain (re-entrancy safe).
    while (true) {
      const batch: Array<{ key: string; item: QueuedMark }> = []
      await store.iterate<QueuedMark, void>((v, k) => { batch.push({ key: k, item: v }) })
      if (!batch.length) { hasError = false; backoffMs = 0; emit(); break }

      const payload = batch.map(({ item }) => ({
        id: item.id,
        center_id: item.center_id,
        classroom_id: item.classroom_id,
        classroom: item.classroom,
        roster_id: item.roster_id,
        child_name: item.child_name,
        monday_date: item.monday_date,
        day: item.day,
        slot: item.slot,
        col: item.col,
        value: item.value,
        marked_at: item.marked_at,
        device_id: item.device_id,
        source: 'app_offline',
      }))

      const { error } = await supabase.schema('menumaker').rpc('sync_meal_marks', { _marks: payload })

      if (error) {
        // Keep everything queued; record the error and back off. Never drop.
        console.error('[mealMarkQueue] sync failed', error)
        hasError = true
        for (const { key, item } of batch) {
          item.attempts += 1
          item.last_error = error.message ?? String(error)
          try { await store.setItem(key, item) } catch { /* keep in-memory pending */ }
        }
        emit()
        scheduleRetry()
        break
      }

      // Success — remove exactly the items we sent (later taps stay queued and
      // are handled by the next loop iteration).
      for (const { key } of batch) {
        try { await store.removeItem(key) } catch { /* will retry-remove next drain */ }
        pendingKeys.delete(key)
      }
      hasError = false
      backoffMs = 0
      emit()

      if (offline()) break   // lost connectivity mid-drain — resume on 'online'
    }
  } catch (e) {
    console.error('[mealMarkQueue] drain error', e)
    hasError = true
    emit()
    scheduleRetry()
  } finally {
    draining = false
  }
}

// ─── Auto-sync wiring (called once from main.tsx) ────────────────────────────

let autoSyncStarted = false
export function startMealMarkAutoSync(): void {
  if (autoSyncStarted) return
  autoSyncStarted = true
  void hydrate()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      backoffMs = 0
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      void drain()
    })
    // Coming back to the tab is a good moment to retry, too.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void drain()
    })
  }
  if (typeof navigator === 'undefined' || navigator.onLine !== false) void drain()
}

/** Force a drain now (e.g. a manual "retry" affordance). */
export function syncNow(): void { void drain() }
