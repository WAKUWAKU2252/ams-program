import { beforeEach, describe, expect, it, vi } from 'vitest'

// เทสต์ชุดนี้เฝ้าเรื่องเดียว: "เปิดหลายแท็บใน browser เดียวกัน ต้องเป็นคนละ user ได้"
// เคยพังมาแล้วเพราะ token เก็บ localStorage คีย์เดียวทั้งแอป - แท็บที่สอง login ทับแท็บแรก
// แล้วแท็บแรกยิงงานในนามคนใหม่ทั้งที่หน้าจอยังโชว์คนเดิม

// frontend ไม่ verify ลายเซ็น อ่านแค่ payload - JWT ปลอมที่ decode ได้จึงพอสำหรับเทสต์
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (part: object) =>
    btoa(JSON.stringify(part)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.notarealsignature`
}

const liveToken = (sub: string, role = 'EMPLOYEE') =>
  fakeJwt({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 })

const deadToken = (sub: string) =>
  fakeJwt({ sub, role: 'EMPLOYEE', exp: Math.floor(Date.now() / 1000) - 10 })

/**
 * จำลอง "เปิดแท็บใหม่" - โมดูลชุดใหม่ (tabId ที่ cache ไว้หายไป) + sessionStorage ว่าง
 * ส่วน localStorage ยังแชร์กันเหมือน browser จริง ซึ่งคือจุดที่เคยพัง
 */
async function openTab() {
  vi.resetModules()
  sessionStorage.clear()
  return import('../auth.token')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('token แยกต่อแท็บ', () => {
  it('แท็บที่สอง login แล้วไม่ทับ token ของแท็บแรก', async () => {
    const tabA = await openTab()
    tabA.setToken(liveToken('11'))

    const tabB = await openTab()
    tabB.setToken(liveToken('22'))

    expect(tabA.getTokenUserId()).toBe(11)
    expect(tabB.getTokenUserId()).toBe(22)
  })

  it('logout ที่แท็บหนึ่งไม่เตะอีกแท็บออก', async () => {
    const tabA = await openTab()
    tabA.setToken(liveToken('11'))

    const tabB = await openTab()
    tabB.setToken(liveToken('22'))
    tabB.clearToken()

    expect(tabB.getToken()).toBeNull()
    expect(tabA.getTokenUserId()).toBe(11)
  })

  it('reload แท็บเดิม (sessionStorage ยังอยู่) ยังเป็น user คนเดิม', async () => {
    const tabA = await openTab()
    tabA.setToken(liveToken('11'))
    const tabId = sessionStorage.getItem('authTabId')

    // reload = โมดูลเกิดใหม่ แต่ sessionStorage รอด
    vi.resetModules()
    const reloaded = await import('../auth.token')

    expect(sessionStorage.getItem('authTabId')).toBe(tabId)
    expect(reloaded.getTokenUserId()).toBe(11)
  })
})

describe('initTabToken', () => {
  it('รับช่วง token คีย์เก่า มาเป็นของแท็บที่บูตก่อน แล้วลบคีย์เก่าทิ้ง', async () => {
    const legacy = liveToken('7')
    localStorage.setItem('authToken', legacy)

    const tabA = await openTab()
    tabA.initTabToken()

    expect(tabA.getToken()).toBe(legacy)
    expect(localStorage.getItem('authToken')).toBeNull()

    // แท็บถัดไปไม่ได้ token ของคนอื่นติดมาด้วย
    const tabB = await openTab()
    tabB.initTabToken()
    expect(tabB.getToken()).toBeNull()
  })

  it('กวาดช่องของแท็บที่ปิดไปแล้ว (token หมดอายุ) แต่ไม่แตะช่องที่ยังใช้ได้', async () => {
    localStorage.setItem('authToken:ghost-tab', deadToken('99'))

    const tabA = await openTab()
    tabA.setToken(liveToken('11'))
    tabA.initTabToken()

    expect(localStorage.getItem('authToken:ghost-tab')).toBeNull()
    expect(tabA.getTokenUserId()).toBe(11)
  })
})
