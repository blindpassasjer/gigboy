import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const VENDOR_CHUNK_RULES: Array<{ chunk: string; packages: string[] }> = [
  {
    chunk: 'vendor-react',
    packages: ['react', 'react-dom', 'react-router-dom'],
  },
  {
    chunk: 'vendor-firebase',
    packages: ['firebase'],
  },
  {
    chunk: 'vendor-editor',
    packages: ['@tiptap'],
  },
  {
    chunk: 'vendor-ui',
    packages: ['lucide-react', '@radix-ui'],
  },
  {
    chunk: 'vendor-audio',
    packages: ['tone', 'midi-writer-js'],
  },
  {
    chunk: 'vendor-utils',
    packages: ['jszip', 'pdf-lib'],
  },
]

function resolveManualChunk(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined

  const modulePath = id.split('/node_modules/')[1]
  if (!modulePath) return undefined

  for (const rule of VENDOR_CHUNK_RULES) {
    if (rule.packages.some((pkg) => id.includes(`/node_modules/${pkg}/`) || id.includes(`/node_modules/${pkg}`))) {
      return rule.chunk
    }
  }

  const pathSegments = modulePath.split('/')
  const packageName = pathSegments[0]?.startsWith('@')
    ? `${pathSegments[0]}/${pathSegments[1] ?? ''}`
    : pathSegments[0]

  if (!packageName) return undefined

  return `vendor-${packageName.replace('@', '').replace('/', '-')}`
}

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
        'icon.png',
      ],
      manifest: {
        name: 'GIGBOY',
        short_name: 'GIGBOY',
        description: 'Your songs. Your stage.',

        theme_color: '#1a6fc4',
        background_color: '#ffffff',
        display: 'standalone',
        scope: './',
        start_url: './',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon.png',
            sizes: '372x372',
            type: 'image/png',
            purpose: 'any',
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
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
}))
