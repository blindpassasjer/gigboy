import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function resolveProxyUri() {
  const proxyUriTemplate = process.env.VSCODE_PROXY_URI
  if (!proxyUriTemplate) return null

  const devPort = process.env.PORT ?? '5173'
  return proxyUriTemplate.includes('{{port}}')
    ? proxyUriTemplate.replace('{{port}}', devPort)
    : proxyUriTemplate
}

function resolveDevBaseFromProxyUri() {
  const proxyUri = resolveProxyUri()
  if (!proxyUri) return null

  try {
    return new URL(proxyUri).pathname || '/'
  } catch {
    return null
  }
}

function resolveAllowedHostFromProxyUri() {
  const proxyUri = resolveProxyUri()
  if (!proxyUri) return null

  try {
    return new URL(proxyUri).host
  } catch {
    return null
  }
}

// Set base to './' for GitHub Pages subdirectory deployment.
// Override with VITE_BASE env var if deploying to a custom domain root.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-maskable-512.png',
      ],
      manifest: {
        name: 'Folio',
        short_name: 'Folio',
        description: 'Collaborative songbook and setlist web app.',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        scope: './',
        start_url: './',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
        ],
      },
      devOptions: {
        // Avoid noisy dev-only SW registration and no-op fetch warnings.
        enabled: false,
      },
    }),
  ],
  // In Docker + browser VS Code, dev URLs are commonly exposed via a proxy path.
  // Override with VITE_DEV_BASE if your proxy path differs.
  base:
    process.env.VITE_BASE ??
    (command === 'serve' ? (process.env.VITE_DEV_BASE ?? resolveDevBaseFromProxyUri() ?? '/') : '/'),
  server: {
    allowedHosts: Array.from(
      new Set([
        'localhost',
        '127.0.0.1',
        'code.manriquez.no',
        ...(process.env.VITE_DEV_HOST ? [process.env.VITE_DEV_HOST] : []),
        ...(resolveAllowedHostFromProxyUri() ? [resolveAllowedHostFromProxyUri() as string] : []),
      ]),
    ),
  },
}))
