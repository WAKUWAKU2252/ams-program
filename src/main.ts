import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import {
  initTabToken,
  scheduleTokenExpiry,
  startTokenExpiryMonitor,
} from './shared/services/auth.token'
import './assets/main.css'   


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
