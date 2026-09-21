// สเกลอายุคงเหลือต้องยึดกับโทเคนของธีมเสมอ
//
// อาการที่เทสต์นี้กันไว้: สีของกราฟค่อย ๆ หลุดจาก CI โดยไม่มีใครรู้ตัว ซึ่งเคยเกิดมาแล้วจริง -
// ชุดเดิมหยิบสีมือจาก Tailwind มา 7 ตัว โดย 4 ตัวเป็นโทเคนธีมที่เพี้ยนไปนิดเดียว
// (#ea9a0b ห่างจาก warning แค่ ΔEok 0.009) คือ "ความหมายซ้ำ แต่ค่าไม่ตรง" ซึ่งมองด้วยตา
// ไม่มีทางจับได้ ต้องวัดถึงจะเห็น
//
// ★ ทำไมไม่แปลง oklch เป็น hex ในเทสต์แล้วเทียบตรง ๆ
//   เพราะ warning อยู่นอกขอบเขต sRGB และเบราว์เซอร์ clip ช่องสี (#e89d00) ไม่ได้ลด chroma
//   ตามตำรา (#e49e24) - สูตรที่เขียนเองจะได้คนละค่ากับที่จอแสดงจริง เทสต์จึงตรึง "ค่า oklch
//   ในธีม" กับ "hex ที่ ramp ใช้" เป็นคู่ ๆ แทน: แก้ฝั่งใดฝั่งหนึ่งแล้วอีกฝั่งไม่ตาม = ล้มทันที
//   คนแก้ต้องไปอ่านค่าจริงจากเบราว์เซอร์มาใส่ ซึ่งเป็นขั้นตอนที่ตั้งใจให้ต้องทำ
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REMAINING_LIFE_RAMP } from '../chart-theme'

// อ่านจาก cwd ของ vitest (รากโปรเจกต์) - import.meta.url ใช้ไม่ได้ เพราะ vitest เสิร์ฟไฟล์
// ผ่าน transform pipeline ของ vite ทำให้ URL ไม่ใช่ scheme file
const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

/** ดึงบล็อกของธีมที่ระบุออกมา - ต้องเจาะจงชื่อ ไม่งั้นจะไปหยิบค่าของ amsdark มาปน */
function themeBlock(name: string): string {
  const start = css.indexOf(`name: "${name}";`)
  expect(start, `ไม่เจอธีม "${name}" ใน main.css`).toBeGreaterThan(-1)
  const end = css.indexOf('\n}', start)
  return css.slice(start, end)
}

const token = (theme: string, key: string): string => {
  const m = new RegExp(`--color-${key}:\\s*([^;]+);`).exec(themeBlock(theme))
  expect(m, `ธีม ${theme} ไม่มี --color-${key}`).not.toBeNull()
  return m![1]!.trim()
}

/**
 * คู่ที่ผูกกันไว้: ค่าในธีม ↔ hex ที่โค้ดใช้จริง
 *
 * แก้ฝั่งซ้ายเมื่อไหร่ ฝั่งขวาต้องตามทันที (ค่าที่ถูกต้องคือค่าที่เบราว์เซอร์เรนเดอร์ออกมา
 * ไม่ใช่ค่าที่แปลงเอง - ดูหมายเหตุหัวไฟล์)
 */
const ANCHORS = [
  { index: 0, key: 'error', oklch: 'oklch(60% 0.21 25)', hex: '#e23439' },
  { index: 1, key: 'warning', oklch: 'oklch(75% 0.16 75)', hex: '#e89d00' },
  { index: 5, key: 'success', oklch: 'oklch(62% 0.15 150)', hex: '#2e9e52' },
  { index: 6, key: 'secondary', oklch: 'oklch(60% 0.1 240)', hex: '#4188b6' },
] as const

describe('สเกลอายุคงเหลือผูกกับโทเคนของธีม', () => {
  it.each(ANCHORS)('ขั้นที่ $index = โทเคน $key ของธีม ams', ({ index, key, oklch, hex }) => {
    // ธีมยังประกาศค่าเดิมอยู่ไหม - ถ้าเปลี่ยน ข้อนี้ล้มก่อน แล้วค่อยไปแก้ ramp
    expect(token('ams', key)).toBe(oklch)
    // ramp ยังใช้ค่าที่ตรงกับโทเคนนั้นอยู่ไหม
    expect(REMAINING_LIFE_RAMP[index]).toBe(hex)
  })

  it('มี 7 ขั้น เท่าจำนวนถังที่ backend ส่งมา', () => {
    // backend คืน buckets 7 ใบตายตัว (หมดอายุแล้ว / ≤12 / 13–24 / 25–36 / 37–48 / 49–60 / >60)
    // ขาดหรือเกินแปลว่าแท่งท้าย ๆ จะไม่มีสี หรือมีสีที่ไม่มีแท่งรองรับ
    expect(REMAINING_LIFE_RAMP).toHaveLength(7)
  })

  it('ทุกขั้นเป็น hex 6 หลัก - Apex คำนวณเงา/gradient ต่อจากค่านี้', () => {
    // ★ ส่ง oklch หรือชื่อสีเข้า Apex จะได้ NaN ออกมาเงียบ ๆ (เหตุผลเต็มอยู่ใน chart-theme)
    for (const c of REMAINING_LIFE_RAMP) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('ไม่มีสีซ้ำกันสองขั้น', () => {
    expect(new Set(REMAINING_LIFE_RAMP).size).toBe(REMAINING_LIFE_RAMP.length)
  })
})
