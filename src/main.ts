import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router/index.js'
import { scheduleTokenExpiry, startTokenExpiryMonitor } from './services/auth.token.js'
import './assets/main.css'   


const app = createApp(App)
const pinia = createPinia()



app.use(pinia)
app.use(router)
scheduleTokenExpiry()
startTokenExpiryMonitor()

app.mount('#app')
