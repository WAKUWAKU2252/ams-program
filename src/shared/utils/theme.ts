/**
 * สลับธีมสว่าง/มืด — เขียน data-theme บน <html> ที่เดียว
 *
 * ★ ชื่อธีมต้องตรงกับที่นิยามไว้ใน assets/main.css เป๊ะ ('ams' / 'amsdark') พิมพ์ผิดเมื่อไหร่
 *   daisyUI จะไม่ error อะไรเลย แค่ตกกลับไปใช้ธีม default เงียบ ๆ
 *
 * ★ อ่าน/เขียน localStorage โดยตรงได้ที่นี่ ต่างจาก token ที่ต้องผ่าน auth.token.ts —
 *   ธีมเป็นค่าความชอบของเครื่อง ไม่ใช่ข้อมูลที่มีผลต่อสิทธิ์ และไม่ต้องแยกตามแท็บ
 *
 * ★ ไม่ตาม prefers-color-scheme ของเครื่อง: main.css ตั้ง prefersdark: false ไว้ทั้งสองธีม
 *   โดยตั้งใจ — ระบบนี้ใช้สว่างเป็นค่าเริ่มต้นเสมอ จนกว่าผู้ใช้จะกดสลับเอง
 */
const KEY = 'ams-theme'
const LIGHT = 'ams'
const DARK = 'amsdark'

export type ThemeName = typeof LIGHT | typeof DARK

function stored(): ThemeName | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === LIGHT || v === DARK ? v : null
  } catch {
    // โหมดส่วนตัว/ปิด storage ของบางเบราว์เซอร์ throw ตั้งแต่ตอนอ่าน - ธีมไม่ใช่ของที่
    // ต้องมีถึงจะใช้แอปได้ ถอยไปใช้ค่าเริ่มต้นเงียบ ๆ ดีกว่าทำให้ทั้งหน้าพัง
    return null
  }
}

export function currentTheme(): ThemeName {
  return document.documentElement.getAttribute('data-theme') === DARK ? DARK : LIGHT
}

export function isDark(): boolean {
  return currentTheme() === DARK
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // เขียนไม่ได้ = จำข้ามรอบไม่ได้ แต่ธีมของรอบนี้เปลี่ยนไปแล้ว ซึ่งเป็นสิ่งที่ผู้ใช้เพิ่งสั่ง
  }
}

export function toggleTheme(): ThemeName {
  const next = isDark() ? LIGHT : DARK
  applyTheme(next)
  return next
}

/**
 * เรียกครั้งเดียวตอนบูตแอป (main.ts) — ต้อง "ก่อน" mount ไม่งั้นจอจะสว่างวาบแล้วค่อยมืด
 * (flash of wrong theme) ในเสี้ยววินาทีแรกของทุกครั้งที่โหลดหน้า
 */
export function initTheme(): void {
  document.documentElement.setAttribute('data-theme', stored() ?? LIGHT)
}
