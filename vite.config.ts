import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/type-a-wish/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'type a wish',
        short_name: 'type a wish',
        description: 'A private place for the life you hope to live.',
        theme_color: '#f1e8d7',
        background_color: '#f1e8d7',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: 'favicon.svg', sizes: '64x64', type: 'image/svg+xml' },
          { src: 'favicon.svg', sizes: '192x192', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
})