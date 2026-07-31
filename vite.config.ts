import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Visible build marker (shown in the sidebar footer). Vercel sets
// VERCEL_GIT_COMMIT_SHA at build; fall back to BUILD_ID / 'dev' locally.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.BUILD_ID ||
  'dev'

export default defineConfig({
  plugins: [
    react(),
    // ── PWA / offline shell ────────────────────────────────────────────────
    // Why: one center loses WiFi for a full day and teachers still need to mark
    // meal counts. The generated service worker precaches the app shell so the
    // SPA boots with no network; the offline meal-count queue (localForage,
    // src/lib/mealMarkQueue.ts) holds marks until connectivity returns.
    //
    // strategy = generateSW: Workbox owns install/activate/precache/update.
    // The existing Web Push handlers live in public/push-sw.js and are layered
    // in via `importScripts` (they must NOT re-register install/activate).
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: null,   // we register manually in main.tsx (immediate)
      manifest: false,        // keep the hand-authored public/manifest.webmanifest
      workbox: {
        // Precache the built shell so the app opens with zero network.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // 🔴 2026-07-30: the build had been FAILING on this. Workbox refuses to precache
        // a file over 2 MiB by default and then throws, so `npm run build` exited 1 and
        // no deploy could succeed. The main bundle had simply grown past the line
        // (2.1 MB) through ordinary feature work — no single commit caused it.
        //
        // Raising the limit RESTORES the previous behaviour rather than changing intent:
        // that bundle IS the app shell this whole block exists to precache. Excluding it
        // instead would have kept the build green while quietly breaking the promise in
        // the comment above — a center loses WiFi and the meal-count screen no longer
        // opens. Headroom to 4 MiB so ordinary growth does not break the build again;
        // when it approaches that, the answer is code-splitting, not a bigger number.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Deep links (e.g. /meal-count) resolve to the SPA shell when offline…
        navigateFallback: '/index.html',
        // …but never hijack Supabase / API calls as navigations.
        navigateFallbackDenylist: [/^\/api\//, /supabase\.co/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Layer the Web Push service worker on top of the generated SW.
        importScripts: ['push-sw.js'],
        // Supabase is NETWORK-ONLY: data must never be served stale from cache.
        // Reads/writes simply fail while offline (the queue absorbs meal marks).
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
      // No SW in `vite dev` — avoids stale-cache confusion during development.
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    // commit sha for deploy checks (Vercel sets VERCEL_GIT_COMMIT_SHA at build; 'dev' locally)
    __BUILD_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
