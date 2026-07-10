import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Visible build marker (shown in the sidebar footer). Vercel sets
// VERCEL_GIT_COMMIT_SHA at build; fall back to BUILD_ID / 'dev' locally.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.BUILD_ID ||
  'dev'

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
