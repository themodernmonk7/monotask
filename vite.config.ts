import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // A hand-written worker (src/sw.ts) so it can receive Web Push; the
      // build still injects the precache manifest into it.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Only precache the built app shell (HTML/JS/CSS/icons) — app data
      // already has its own offline story (src/lib/localCache.ts), so the
      // service worker's job here is just "the app itself still opens
      // with no network", not caching API responses.
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Monotask',
        short_name: 'Monotask',
        description: 'Focus on one task at a time and track where your hours go.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wav}'],
      },
      // Offline navigation fallback to the cached shell lives in src/sw.ts.
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
