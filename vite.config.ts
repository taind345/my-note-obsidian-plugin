import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { localFileSystemPlugin } from './vite/plugin-local-fs.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localFileSystemPlugin()],
  resolve: {
    // Import tuyệt đối `@/...` → `src/...` để refactor/move file không vỡ relative path
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  // Giữ port cố định để Tauri devUrl luôn trỏ đúng
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
})
