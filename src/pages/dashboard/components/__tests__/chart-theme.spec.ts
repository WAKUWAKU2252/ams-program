// สีของกราฟต้องอ่านออกเสมอ ต่อให้อ่านธีมไม่ได้
//
// ★ เทสต์นี้ไม่ได้ตรวจว่า "แปลงสีจากธีมถูกไหม" - jsdom ไม่มี canvas ตัวแปลงจึงคืน null
//   ทุกครั้ง สิ่งที่ตรวจคือ **ทางหนีตอนแปลงไม่ได้** ซึ่งเป็นทางที่พังเงียบที่สุด:
//   ถ้าปล่อยให้หลุดเป็น '' หรือ null ไปถึง Apex กราฟจะไม่ error แต่ตัวหนังสือจะหายไป
//   ทั้งกราฟ (Apex เอาไปใส่ attribute fill ตรง ๆ) - ไม่มีอะไรฟ้องเลยนอกจากตาคน
//
//   ส่วนการแปลง oklch → hex ของจริงตรวจบนเบราว์เซอร์แล้ว (dim: base-content
//   #b2ccd6 บนพื้น #2a303c) ตรวจซ้ำใน jsdom ไม่ได้และไม่มีประโยชน์
import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, categoryColor, grid, ink, inkMuted, surface } from '../chart-theme'

const HEX = /^#[0-9a-f]{6}$/i

describe('สีกระดาษของกราฟ', () => {
  it('ทุกตัวคืน hex ที่ใช้ได้เสมอ แม้แปลงค่าจากธีมไม่ได้', () => {
    for (const [name, c] of [
      ['ink', ink],
      ['inkMuted', inkMuted],
      ['grid', grid],
      ['surface', surface],
    ] as const) {
      expect(c.value, name).toMatch(HEX)
    }
  })

  it('★ inkMuted ต้องไม่ใช่สีเดียวกับพื้น - ไม่งั้นป้ายแกนหายไปทั้งแถบ', () => {
    // เคสที่กลัว: mixHex parse ไม่ผ่านแล้วเผลอคืน surface หรือ '' ออกมา
    expect(inkMuted.value).not.toBe(surface.value)
    expect(inkMuted.value).not.toBe('')
  })

  it('สีของข้อมูลเป็นค่าคงที่ ไม่ขึ้นกับธีม', () => {
    // ตัวตนของก้อนข้อมูล - ถ้าวันหนึ่งมันกลายเป็น computed ตามธีม เทสต์นี้ต้องดัง
    expect(CATEGORY_COLORS.every((c) => HEX.test(c))).toBe(true)
    expect(categoryColor(0)).toBe(CATEGORY_COLORS[0])
    // เกินชุด = ตกไปเป็นสี "อื่น ๆ" ไม่ใช่ undefined
    expect(categoryColor(99)).toMatch(HEX)
  })
})
