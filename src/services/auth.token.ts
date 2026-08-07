const TOKEN_KEY = 'authToken'
let expiryTimer: ReturnType<typeof window.setTimeout> | undefined
let expiryMonitor: ReturnType<typeof window.setInterval> | undefined

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  scheduleTokenExpiry()
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer)
    expiryTimer = undefined
  }
}

// decode payload ของ JWT (base64url) — ใช้อ่าน exp ฝั่ง client
function decodePayload(token: string): { exp?: number } | null {
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
