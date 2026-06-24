import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// iOS in-app WebViews and Private Browsing can throw a SecurityError the moment
// localStorage is touched. Supabase reads/writes localStorage to persist the
// session, so that throw crashes the whole script ("закрылся скрипт приложения").
// Probe storage once; if it's unusable, fall back to an in-memory shim.
function makeSafeStorage() {
  try {
    const probe = '__sb_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch (err) {
    console.error('[supabase] localStorage unavailable — using in-memory session store', err)
    const mem = new Map<string, string>()
    return {
      getItem: (key: string) => (mem.has(key) ? (mem.get(key) as string) : null),
      setItem: (key: string, value: string) => { mem.set(key, value) },
      removeItem: (key: string) => { mem.delete(key) },
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: makeSafeStorage(),
  },
})
