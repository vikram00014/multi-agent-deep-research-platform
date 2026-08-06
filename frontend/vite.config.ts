import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Bind IPv4 explicitly. Vite's default resolves to [::1] only, so a browser
    // that picks 127.0.0.1 for the /ws upgrade finds nothing listening and the
    // live feed silently degrades to polling.
    host: '127.0.0.1',
    proxy: {
      '/research': 'http://127.0.0.1:8000',
      '/upload': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
