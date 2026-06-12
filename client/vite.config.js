import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'
const appEnv = String(process.env.VITE_APP_ENV || process.env.APP_ENV || '').trim().toLowerCase()
const isStage = appEnv === 'stage' || appEnv === 'staging'
const pwaAppName = process.env.VITE_PWA_APP_NAME || (isStage ? 'Stage FinalRep' : 'FinalRep')

function finalRepEnvironmentPlugin() {
  return {
    name: 'finalrep-environment',
    transformIndexHtml(html) {
      return html
        .replace(/<meta name="application-name" content="[^"]*" \/>/, `<meta name="application-name" content="${pwaAppName}" />`)
        .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*" \/>/, `<meta name="apple-mobile-web-app-title" content="${pwaAppName}" />`)
        .replace(/<title>[^<]*<\/title>/, `<title>${pwaAppName}</title>`)
        .replace(
          /<link rel="manifest" href="[^"]*" \/>/,
          `<link rel="manifest" href="${isStage ? '/manifest.stage.webmanifest' : '/manifest.webmanifest'}" />`,
        )
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), finalRepEnvironmentPlugin()],
  build: {
    sourcemap: false,
    reportCompressedSize: false,
    modulePreload: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
          if (id.includes('react-router')) return 'router-vendor'
          if (id.includes('lucide-react')) return 'icons-vendor'
          if (id.includes('axios')) return 'http-vendor'
          if (id.includes('country-state-city')) return 'locations-vendor'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
  },
})
