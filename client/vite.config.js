import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  base: '/',
  plugins: [react()],
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
