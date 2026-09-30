import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('calendar-'),
        },
      },
    }),
    vueJsx(),
    // vueDevTools(), 
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),

      '@contract/asset-number': fileURLToPath(
        new URL('../ams-backend/src/common/asset-number.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 4001,
    strictPort: true,              
    fs: { allow: ['..'] },
    host: true,                    
    allowedHosts: ['.ngrok-free.dev', '.devtunnels.ms', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
