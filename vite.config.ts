import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Set base to './' for GitHub Pages subdirectory deployment.
// Override with VITE_BASE env var if deploying to a custom domain root.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Folio',
        short_name: 'Folio',
        description: 'Collaborative songbook and setlist web app.',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  base: process.env.VITE_BASE ?? '/',
  server: {
    allowedHosts: ['code.manriquez.no'],
  },
})
