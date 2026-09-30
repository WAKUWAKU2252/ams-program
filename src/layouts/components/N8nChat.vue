<script setup lang="ts">
// แชตผู้ช่วย (n8n Cloud) - วางไว้ใน MainLayout จึงขึ้นเฉพาะหน้าที่ล็อกอินแล้ว
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const WEBHOOK_URL =
  'https://natdanai1234.app.n8n.cloud/webhook/8c585f1a-8b43-4447-b758-0100659ddec3/chat'
const BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js'
const STYLE_URL = 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css'

const target = useTemplateRef<HTMLDivElement>('target')
let app: { unmount: () => void } | null = null
let alive = true

function ensureStyle() {
  if (document.querySelector(`link[href="${STYLE_URL}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = STYLE_URL
  document.head.appendChild(link)
}

onMounted(async () => {
  ensureStyle()
  try {
    const { createChat } = await import(/* @vite-ignore */ BUNDLE_URL)
    // ★ ออกจากระบบระหว่างรอโหลด bundle - mount ต่อเมื่อไหร่แชตจะค้างอยู่บนหน้า login
    if (!alive || !target.value) return
    app = createChat({
      webhookUrl: WEBHOOK_URL,
      target: target.value,
      mode: 'window',
      // ★ ต้องปิด - เครื่องเดียวกันเปลี่ยนคนล็อกอินแล้วจะโหลดแชตรอบก่อนของอีกคนขึ้นมา
      loadPreviousSession: false,
      initialMessages: ['สวัสดีครับ มีอะไรให้ช่วยไหม'],
      i18n: { en: { title: 'Asset Assistant', subtitle: '', inputPlaceholder: 'พิมพ์คำถาม...' } },
    })
  } catch (e) {
    console.error('โหลดแชตผู้ช่วยไม่สำเร็จ:', e)
  }
})

onBeforeUnmount(() => {
  alive = false
  app?.unmount()
  app = null
})
</script>

<template>
  <div ref="target" />
</template>
