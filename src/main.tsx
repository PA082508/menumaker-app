import '@tabler/icons-webfont/dist/tabler-icons.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { startMealMarkAutoSync } from '@/lib/mealMarkQueue'
import { startAppUpdateWatch } from '@/lib/appUpdate'

// Register the service worker (precached shell + Web Push) AND start watching for a
// newer build. autoUpdate activates a new build on next load without a prompt —
// but the browser only looks for one when the page registers, and a tablet left open
// in a classroom never re-registers. That is how Ridge stayed on a pre-10.07 bundle
// for weeks. startAppUpdateWatch owns the registration now so it can poll
// registration.update(), and cross-checks the served build against the running one.
// See src/lib/appUpdate.ts.
startAppUpdateWatch()

// Build marker for deploy checks: read `window.__build` (commit sha) in the console to
// confirm which build is live and rule out a stale cache.
;(window as any).__build = __BUILD_SHA__

// Resume draining meal-count marks that were queued offline in a previous
// session — fires now if already online, and again on every 'online' event.
startMealMarkAutoSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
// Sun Jun 28 17:51:38 EDT 2026
