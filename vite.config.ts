import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['static/wasmemulator.js', 'static/wasmemulator.wasm', 'static/webmelon.js'],
      manifest: {
        name: 'Platinum Web',
        short_name: 'Platinum',
        description: 'A mobile-first browser shell for playing your legally dumped Nintendo DS games.',
        theme_color: '#0d141d',
        background_color: '#081018',
        display: 'standalone',
        start_url: '/',
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
      },
    }),
  ],
})
