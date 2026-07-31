import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { scheduleTokenExpiry, startTokenExpiryMonitor } from './services/auth.token'
import './assets/main.css'   


const app = createApp(App)
const pinia = createPinia()



app.use(pinia)
app.use(router)
scheduleTokenExpiry()
startTokenExpiryMonitor()

app.mount('#app')
