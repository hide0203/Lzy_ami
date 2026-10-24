import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/Lzy_ami/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    include: ['tesseract.js']
  }
}))
