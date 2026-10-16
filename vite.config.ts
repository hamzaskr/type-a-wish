import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
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
      icons: [],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], runtimeCaching: [] },
  })],
})
