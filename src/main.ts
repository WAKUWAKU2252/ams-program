import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import {
  initTabToken,
  scheduleTokenExpiry,
  startTokenExpiryMonitor,
} from './shared/services/auth.token'
import { initTheme } from './shared/utils/theme'
import './assets/main.css'


// ★ ต้องมาก่อน mount - ตั้ง data-theme ทีหลังจะเห็นจอสว่างวาบแล้วค่อยมืดทุกครั้งที่โหลดหน้า
initTheme()

const app = createApp(App)
const pinia = createPinia()

// ต้องมาก่อน app.use(router) - router install เริ่ม navigate ครั้งแรกทันทีแล้ว guard จะอ่าน token เลย
// ถ้า init ทีหลัง คนที่ค้าง login อยู่ด้วย token คีย์เก่าจะถูกเด้งไป /login ฟรี ๆ ตอน deploy
initTabToken()

app.use(pinia)
app.use(router)
scheduleTokenExpiry()
startTokenExpiryMonitor()

app.mount('#app')
