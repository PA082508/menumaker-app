// src/hooks/useMealMarkQueue.ts
// React binding for the offline meal-count queue (src/lib/mealMarkQueue.ts).
//
// useSyncExternalStore keeps the badge and per-cell "queued" styling in sync
// with IndexedDB. getSnapshot returns the monotonic version so any change
// (enqueue / drain / error) re-renders subscribers; cells then read the live
// isCellPending(key) during render.

import { useSyncExternalStore } from 'react'
import {
  subscribe, getVersion, getPendingCount, getHasError, isCellPending, syncNow,
} from '@/lib/mealMarkQueue'

export function useMealMarkQueue() {
  // Version is the reactive trigger; the actual values are read fresh below.
  useSyncExternalStore(subscribe, getVersion, getVersion)
  return {
    pendingCount: getPendingCount(),
    hasError: getHasError(),
    /** True if this specific grid cell is still awaiting sync. */
    isCellPending,
    /** Manual retry affordance. */
    syncNow,
  }
}
