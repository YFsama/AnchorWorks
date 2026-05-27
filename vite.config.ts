import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Read package.json for the app version (injected via define below).
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version: string }

// Manual chunk grouping — keep heavy vendor libs out of the main entry chunk
// so the initial parse cost stays small.
const manualChunks = (id: string): string | undefined => {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('/fabric/')) return 'fabric'
  if (id.includes('/lucide-react/')) return 'lucide'
  if (
    id.includes('/react-dom/') ||
    id.includes('/react/') ||
    id.includes('/scheduler/') ||
    id.includes('/zustand/')
  )
    return 'react'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Progressive Web App — generates a service worker, web app manifest, and
    // a `virtual:pwa-register` module that the entry imports. With
    // `registerType: 'autoUpdate'` the SW picks up new builds in the
    // background; users get the next version on their next reload without a
    // prompt. Disabled in dev (default) so HMR keeps working.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'Anchorworks',
        short_name: 'Vector',
        description:
          'AI-assisted vector graphics editor — Illustrator-class tooling, multi-format export, and direct output to laser cutters, plotters, and printers. Works offline.',
        categories: ['design', 'graphics', 'productivity'],
        theme_color: '#15151a',
        background_color: '#15151a',
        // `window-controls-overlay` lets installed desktop PWAs reclaim the
        // title-bar area for app content (Chromium-only, gracefully ignored
        // elsewhere). `standalone` stays the baseline display mode.
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        scope: '/',
        start_url: '/',
        // OS associations: double-clicking an .svg / .vstudio.json (or
        // dragging onto the app icon) opens it directly in Anchorworks.
        // The `launch_handler` reuses the open window instead of spawning
        // duplicates on subsequent opens.
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        file_handlers: [
          {
            action: '/',
            accept: {
              'image/svg+xml': ['.svg'],
              'application/json': ['.json', '.vstudio.json'],
            },
          },
        ],
        // Custom protocol so external apps can deep-link into Anchorworks
        // via `web+vector:` URIs (e.g. file-shell handlers, automation
        // scripts). The token is appended to the launch URL.
        protocol_handlers: [
          { protocol: 'web+vector', url: '/?open=%s' },
        ],
        icons: [
          // SVG icons — accepted by Chromium / Safari / Firefox as install
          // icons. The `any maskable` purpose lets adaptive-icon shells
          // (Android, ChromeOS) crop without losing the brand mark.
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          // Pure-vector fallback — sized "any" so install banners can pick it
          // when no raster icon is provided.
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        // Cache every build artefact we ship. The jsPDF / fabric chunks can
        // be > 2 MB, so bump the per-file cap to 5 MB.
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Google Fonts stylesheet (CSS lives on `fonts.googleapis.com`).
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Inter stylesheet + font binaries (the `index.html` preconnects
            // to rsms.me for the Inter web font).
            urlPattern: ({ url }) => url.origin === 'https://rsms.me',
            handler: 'CacheFirst',
            options: {
              cacheName: 'rsms-inter',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Anthropic API — always prefer fresh, but tolerate offline by
            // falling back to no cached response (NetworkFirst with a tiny
            // timeout means the call resolves quickly on disconnect).
            urlPattern: ({ url }) => url.origin === 'https://api.anthropic.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'anthropic-api',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 0, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: { output: { manualChunks } },
    // Rolldown-backed Vite also exposes rolldownOptions; configure identically
    // so we get the same behavior under either backend.
    rolldownOptions: { output: { manualChunks } },
  } as unknown as Record<string, unknown>,
})
