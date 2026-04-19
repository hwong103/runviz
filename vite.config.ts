import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = env.VITE_BASE_PATH || '/'
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.png',
          'apple-touch-icon.png',
          'mask-icon.svg',
        ],
        manifest: {
          name: 'RunViz',
          short_name: 'RunViz',
          description: 'Running stats and activity dashboard',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          start_url: normalizedBasePath,
          scope: normalizedBasePath,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,woff2}'],
          navigateFallback: `${normalizedBasePath}index.html`,
          runtimeCaching: [],
        },
      }),
    ],
    base: normalizedBasePath,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
