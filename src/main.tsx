import '@tabler/icons-webfont/dist/tabler-icons.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { startMealMarkAutoSync } from '@/lib/mealMarkQueue'

// Register the service worker (precached shell + Web Push). autoUpdate: a new
// build activates on next load without a prompt. `immediate` registers even
// before React hydrates so an offline reload always has the shell available.
registerSW({ immediate: true })

// Resume draining meal-count marks that were queued offline in a previous
// session — fires now if already online, and again on every 'online' event.
startMealMarkAutoSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
// Sun Jun 28 17:51:38 EDT 2026
