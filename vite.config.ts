import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const GOOD_API_URL = process.env.VITE_GOOD_API_URL ?? 'http://localhost:8090'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache GET requests from good-api (profiles, meals) — stale-while-revalidate
            urlPattern: ({ url }) =>
              url.origin === new URL(GOOD_API_URL).origin &&
              url.pathname.startsWith('/api/meal'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-read-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 30 }, // 30 min
            },
          },
          {
            // Scan POSTs — NetworkOnly with BackgroundSync queue
            urlPattern: ({ url, request }) =>
              url.origin === new URL(GOOD_API_URL).origin &&
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
        name: 'Good Camp Scan',
        short_name: 'GoodScan',
        description: 'Volunteer meal & check-in scanner for Good Camp conference',
        theme_color: '#1e40af',
        background_color: '#1e3a8a',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: GOOD_API_URL,
        changeOrigin: true,
      },
    },
  },
})
