// ── token แยกช่องเก็บ "ต่อแท็บ" ────────────────────────────────────────────────
//
// localStorage มี scope เป็น origin ไม่ใช่แท็บ - เก็บคีย์เดียวทั้งแอปเมื่อไหร่ การ login ที่
// แท็บที่สองจะทับ token ของแท็บแรกทันที แล้วแท็บแรกจะยิง request ในนามคนใหม่ทั้ง ๆ ที่หน้าจอ
// ยังโชว์คนเดิมอยู่ (pinia อยู่ใน memory ของแต่ละแท็บ ไม่มีอะไรไปบอกให้มันรู้) = บันทึกงานผิดคน
// แบบเงียบสนิท ซึ่งอันตรายกว่าการ "login สองคนไม่ได้" มาก
//
// จึงแยก namespace ด้วย tabId:
//   sessionStorage['authTabId']       → "แท็บนี้คือช่องไหน" (per-tab จริง + รอด reload)
//   localStorage['authToken:<tabId>'] → token ตัวจริงของแท็บนั้น
//
// ผลที่ได้: คนละแท็บ = คนละ user ได้จริง, logout/หมดอายุที่แท็บหนึ่งไม่เตะอีกแท็บออก
//
// ⚠️ ข้อจำกัดที่วิธีนี้แก้ไม่ได้: คำสั่ง "Duplicate tab" ของ browser จะ copy sessionStorage
//    ตามไปด้วย แท็บที่ก๊อปมาจึงถือ tabId เดียวกัน = ใช้ token ช่องเดียวกันกับต้นฉบับ
//    ถ้าจะสลับ user ให้เปิดแท็บใหม่ (Ctrl+T) แล้วเข้า URL เอง อย่าใช้ duplicate

const TOKEN_PREFIX = 'authToken:'
// คีย์ของเวอร์ชันก่อนแยกต่อแท็บ - ไม่ชนกับ TOKEN_PREFIX เพราะไม่มี ':' ต่อท้าย (ดู adoptLegacyToken)
const LEGACY_TOKEN_KEY = 'authToken'
const TAB_ID_KEY = 'authTabId'

// ระบุ number ตรง ๆ ไม่ใช้ ReturnType<typeof window.setTimeout> - ไฟล์นี้ถูกดึงเข้า tsconfig ของ
// vitest ด้วย (มี @types/node) แล้ว ReturnType จะกลายเป็น NodeJS.Timeout ทั้งที่ window.setTimeout
// ยังคืน number อยู่ ชนกันจน type-check ล้ม ส่วนในเบราว์เซอร์ค่าที่ได้เป็น number อยู่แล้ว
let expiryTimer: number | undefined
let expiryMonitor: number | undefined
let cachedTabId: string | null = null

// randomUUID มีเฉพาะใน secure context (https / localhost) แต่แอปนี้ถูกเสิร์ฟผ่าน http บน LAN ได้
// จึงต้องมีทางสำรอง - getRandomValues ใช้ได้ทุก context ส่วน Math.random ไว้ท้ายสุดพอ
// (ค่านี้ไม่ใช่ความลับ เป็นแค่ป้ายชื่อช่องเก็บ เดาถูกก็ไม่ได้อะไร ตัว token ต่างหากที่เป็นความลับ)
function createTabId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// id ของแท็บนี้ - ออกให้ตอนถูกถามครั้งแรก แล้วคาไว้ใน sessionStorage ตลอดอายุแท็บ
function getTabId(): string {
  if (cachedTabId) return cachedTabId

  let id = sessionStorage.getItem(TAB_ID_KEY)
  if (!id) {
    id = createTabId()
    sessionStorage.setItem(TAB_ID_KEY, id)
  }
  cachedTabId = id
  return id
}

function tokenKey(): string {
  return TOKEN_PREFIX + getTabId()
}

export function getToken(): string | null {
  return localStorage.getItem(tokenKey())
}

export function setToken(token: string): void {
  localStorage.setItem(tokenKey(), token)
  scheduleTokenExpiry()
}

export function clearToken(): void {
  // ลบเฉพาะช่องของแท็บนี้ - logout ที่นี่ต้องไม่ทำให้แท็บอื่นหลุดตาม
  localStorage.removeItem(tokenKey())
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer)
    expiryTimer = undefined
  }
}

/**
 * เรียกครั้งเดียวตอนบูตแอป และต้องเรียก "ก่อน" router guard จะอ่าน token (ดู main.ts)
 *
 * 1. รับช่วง token ของเวอร์ชันก่อนหน้า (คีย์ 'authToken' เฉย ๆ) มาเป็นของแท็บนี้ - คนที่ค้าง
 *    login อยู่ตอน deploy จะได้ไม่ถูกเตะออกพร้อมกันทั้งบริษัท แท็บแรกที่บูตได้ไป ที่เหลือไป /login
 * 2. เก็บกวาดช่องของแท็บที่ปิดไปแล้ว - tabId อยู่ใน sessionStorage ซึ่งตายพร้อมแท็บ ช่อง
 *    localStorage ของมันจึงไม่มีใครกลับมาอ่านอีก
 */
export function initTabToken(): void {
  adoptLegacyToken()
  pruneDeadTokens()
}

function adoptLegacyToken(): void {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY)
  if (legacy === null) return

  // ลบทิ้งก่อนเสมอ ไม่ว่าจะรับช่วงต่อหรือไม่ - ปล่อยค้างไว้แท็บอื่นจะมาหยิบซ้ำทีหลัง
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  if (isTokenValid(legacy) && localStorage.getItem(tokenKey()) === null) {
    localStorage.setItem(tokenKey(), legacy)
  }
}

// เกณฑ์ลบคือ "token หมดอายุ/เสีย" ไม่ใช่ heartbeat - แท็บที่ browser restore มาแบบยังไม่โหลด
// (Chrome ไม่โหลดแท็บพื้นหลังจนกว่าจะคลิก) จะไม่ได้เต้น heartbeat แล้วโดนลบทั้งที่ยังใช้ได้อยู่
// JWT อายุ 8h อยู่แล้ว ช่องที่ตกค้างจึงถูกกวาดเองภายในวันเดียว และมีได้มากสุดเท่าจำนวนแท็บที่เปิดใน 8h
function pruneDeadTokens(): void {
  // เดินถอยหลัง เพราะ removeItem ทำให้ index ที่เหลือเลื่อน
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (!key?.startsWith(TOKEN_PREFIX)) continue
    if (!isTokenValid(localStorage.getItem(key))) localStorage.removeItem(key)
  }
}

// decode payload ของ JWT (base64url) - ใช้อ่าน exp/role ฝั่ง client
// role ที่ได้จากที่นี่ใช้ตัดสินใจเรื่อง UI เท่านั้น (ซ่อนเมนู/กันเข้าหน้า) เพราะ client
// แก้ localStorage เองได้ - การบังคับสิทธิ์จริงอยู่ที่ requireRole(...) ฝั่ง backend
function decodePayload(token: string): { exp?: number; role?: string; sub?: string } | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null 

    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

// ชื่อ role จาก token ที่ยังไม่หมดอายุ (EMPLOYEE/MANAGER/FINANCE/ADMIN) - ไม่มี/หมดอายุ = null
export function getTokenRole(): string | null {
  const token = getToken()
  if (!isTokenValid(token)) return null
  return decodePayload(token)?.role ?? null
}

/**
 * id ของคนที่ล็อกอินอยู่ "ในแท็บนี้" (JWT.sub) - ไม่มี/หมดอายุ = null
 *
 * มีไว้ให้สาย SSE ทิ้งก้อน "สถานะเปลี่ยน" ที่ตัวเองเป็นคนทำ (ดู presence.service) ซึ่งเป็น
 * เรื่อง UI ล้วน ๆ จึงอ่านจาก token ได้ ไม่ต้องพึ่ง store - service ไม่ควรผูกกับ pinia
 * เพราะมันถูกเรียกจากที่ที่ store ยังไม่พร้อมได้
 */
export function getTokenUserId(): number | null {
  const token = getToken()
  if (!isTokenValid(token)) return null
  const sub = decodePayload(token)?.sub
  const id = sub ? Number(sub) : NaN
  return Number.isInteger(id) ? id : null
}

export function isTokenValid(token: string | null): token is string {
  if (!token) return false
  const payload = decodePayload(token)
  return Boolean(payload?.exp && Date.now() < payload.exp * 1000)
}

function redirectToLogin(): void {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

// Redirect even when the user remains on the current page until the token expires.
export function scheduleTokenExpiry(): void {
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer)
    expiryTimer = undefined
  }

  const token = getToken()
  if (!isTokenValid(token)) {
    if (token) clearToken()
    return
  }

  const expiresAt = decodePayload(token)!.exp! * 1000
  expiryTimer = window.setTimeout(() => {
    clearToken()
    redirectToLogin()
  }, Math.max(0, expiresAt - Date.now()))
}

// Fallback check for background-tab timer throttling and hot-reload lifecycle changes.
export function startTokenExpiryMonitor(): void {
  if (expiryMonitor !== undefined) return

  expiryMonitor = window.setInterval(() => {
    const token = getToken()
    if (token && !isTokenValid(token)) {
      clearToken()
      redirectToLogin()
    }
  }, 1000)
}
