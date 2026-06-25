import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Pour GitHub Pages : définir BASE_PATH=/nom-du-repo/ avant le build
// Exemple : BASE_PATH=/App_stats-TS/ npm run build
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
