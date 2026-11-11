import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

const GOOD_API_URL = process.env.VITE_GOOD_API_URL ?? 'http://localhost:8090'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' — never auto-reload. Volunteers may be showing a QR badge
      // when an update fires; UpdatePrompt.tsx gives them the manual button.
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // GET /api/ requests — NetworkFirst with 5s timeout and 7-day cache.
            // Excludes auth, OTP, and per-person endpoints so stale personal
            // data is never served after logout or a user switch.
            urlPattern: ({ url, request }) => {
              if (request.method !== 'GET') return false
              const apiOrigin = new URL(GOOD_API_URL).origin
              if (url.origin !== apiOrigin && !url.pathname.startsWith('/api/')) return false
              const path = url.pathname
              // Exclude auth + OTP
              if (path.includes('/auth/') || path.includes('/otp/')) return false
              // Exclude per-person endpoints
              if (path.includes('/my/') || path.includes('/switch-member')) return false
              return path.startsWith('/api/')
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-read-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
            },
          },
          {
            // Scan POSTs — NetworkOnly with BackgroundSync queue
            urlPattern: ({ url, request }) =>
              (url.origin === new URL(GOOD_API_URL).origin || url.pathname.startsWith('/api/')) &&
              url.pathname === '/api/meal/scan' &&
              request.method === 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'scan-queue',
                options: {
                  maxRetentionTime: 24 * 60, // retry for up to 24 hours
                },
              },
            },
          },
        ],
      },
      manifest: {
        id: '/',
        scope: '/',
        lang: 'zh-TW',
        name: 'Good Camp Scan',
        short_name: 'GoodScan',
        description: 'Volunteer meal & check-in scanner for Good Camp conference',
        theme_color: '#1e40af',
        background_color: '#1e3a8a',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: GOOD_API_URL,
        changeOrigin: true,
      },
    },
  },
})
