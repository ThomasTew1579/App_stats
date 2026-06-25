import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// Pour GitHub Pages : définir BASE_PATH=/nom-du-repo/ avant le build
// Exemple : BASE_PATH=/App_stats-TS/ npm run build
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
          vue: ['vue', 'pinia'],
        },
      },
    },
  },
})
