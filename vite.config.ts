import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = mode === 'production' ? '/pokemon/' : '/'

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        base,
        registerType: 'autoUpdate',
        includeAssets: ['static/wasmemulator.js', 'static/wasmemulator.wasm', 'static/webmelon.js'],
        manifest: {
          name: 'Platinum Web',
          short_name: 'Platinum',
          description: 'A mobile-first browser shell for Nintendo DS browser play.',
          theme_color: '#1a1d21',
          background_color: '#0e1014',
          display: 'standalone',
          start_url: base,
          scope: base,
          orientation: 'any',
          icons: [
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
            },
            {
              src: 'icon-maskable.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
  }
})
