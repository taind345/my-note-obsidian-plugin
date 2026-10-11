import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localFileSystemPlugin } from './vite/plugin-local-fs.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localFileSystemPlugin()],
  // Giữ port cố định để Tauri devUrl luôn trỏ đúng
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
})
