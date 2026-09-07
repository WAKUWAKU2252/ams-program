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
          // <calendar-date> / <calendar-range> / <calendar-month> ของ cally เป็น custom element
          // ไม่บอก Vue ไว้ จะ warn "Failed to resolve component" ทุกครั้งที่เรนเดอร์ปฏิทิน
          isCustomElement: (tag) => tag.startsWith('calendar-'),
        },
      },
    }),
    vueJsx(),
    vueDevTools(), tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // ── กติกาที่ backend เป็นเจ้าของ แต่ frontend ต้องรู้เพื่อบอกผู้ใช้ก่อนกดบันทึก
      //
      // ชี้ "ไฟล์เดียว" ไม่ใช่ทั้งโฟลเดอร์ - จะได้ไม่มีใครเผลอ import service/db ของ backend
      // เข้ามาใน bundle ผ่านทางนี้ ไฟล์ปลายทางเป็นค่าคงที่ล้วน ไม่ import อะไรเลย
      //
      // ทำไมไม่ copy regex มาไว้ฝั่งนี้: สองก๊อปปี้จะ drift โดยไม่มีอะไรฟ้อง วันที่บริษัท
      // เปลี่ยนรูปแบบเลข ฝั่งหนึ่งจะรับ อีกฝั่งจะปฏิเสธ แล้วไล่หาสาเหตุยาก
      // ทำไมไม่ยิง API ถาม: pattern ไม่เคยเปลี่ยนระหว่าง runtime - ผูกตอน build ตรงกว่า
      // ถ้าวันหลังไฟล์นั้นเริ่ม import ของฝั่ง server build จะพังทันทีซึ่งดังกว่าการ drift เงียบ ๆ
      '@contract/asset-number': fileURLToPath(
        new URL('../ams-backend/src/common/asset-number.ts', import.meta.url),
      ),
    },
  },
  server: {
    fs: { allow: ['..'] },
    host: true,                    // ให้ฟังทุก interface ไม่ใช่แค่ localhost
    // host ของ tunnel ที่ใช้เปิดจากมือถือ - จุดนำหน้า = ครอบทุก subdomain
    // (Vite ปล่อย host ที่เป็น IP ผ่านเสมอ จึงไม่ต้องใส่ IP ในวง LAN)
    allowedHosts: ['.ngrok-free.dev', '.devtunnels.ms', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
   // จุดนำหน้า = ครอบทุก subdomain
  },
})
