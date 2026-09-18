// ชั่วคราวสำหรับ /impeccable critique — mount DashboardPage จริง โดย stub fetch ด้วย
// payload จริงที่ dump มาจาก backend (ไม่ต้องล็อกอิน)
import { createApp } from 'vue'
import './assets/main.css'
import { initTheme } from './shared/utils/theme'
import DashboardPage from './pages/dashboard/DashboardPage.vue'

initTheme()

const real = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.includes('/dashboard/overview')) {
    const q = new URL(url, location.origin).searchParams
    const name = q.get('departmentId') ? 'dept' : q.get('companyCode') ? 'uba' : 'all'
    const body = await (await real(`/_critique/${name}.json`)).text()
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return real(input as RequestInfo, init)
}) as typeof window.fetch

createApp(DashboardPage).mount('#app')
