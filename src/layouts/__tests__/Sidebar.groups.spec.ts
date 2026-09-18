// การจัดกลุ่มเมนูใน sidebar + เส้นคั่น
//
// อาการที่เทสต์นี้กันไว้: เส้นคั่นลอย — เส้นโผล่บนสุด ล่างสุด หรือสองเส้นติดกัน เมื่อ role
// นั้นเห็นเมนูไม่ครบทุกกลุ่ม (AUDIT เห็นหน้าเดียว ส่วน MANAGER/EMPLOYEE ไม่เห็นกลุ่ม
// restricted เลยสักตัว) ซึ่งเกิดทันทีถ้าใครเอา divider ไปแทรกเป็นไอเทมใน menuItems
// แทนที่จะประกอบกลุ่มหลังกรอง
//
// ★ เทสต์เฝ้าที่ DOM จริง ไม่ใช่ที่ menuGroups — จุดที่ผู้ใช้เห็นและจุดที่บั๊กโผล่คือที่
//   เดียวกัน ถ้าเฝ้าที่ computed วันหลังมีคนเปลี่ยน template ไปวาดเส้นท้ายทุกกลุ่ม
//   อาการจะกลับมาโดยเทสต์ยังเขียว
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import Sidebar from '../components/Sidebar.vue'

// Sidebar เรียก useRouter() เพื่อเฝ้า fullPath (ปิดกล่องโปรไฟล์เมื่อเปลี่ยนหน้า)
// ที่นี่ไม่ได้ติดตั้ง router จริง — ให้ ref นิ่ง ๆ ไปพอ เทสต์นี้ไม่ได้วัดการเปลี่ยนหน้า
vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: { value: { fullPath: '/dashboard' } }, push: vi.fn() }),
  useRoute: () => ({ path: '/dashboard', fullPath: '/dashboard' }),
}))

const getTokenRole = vi.fn<() => string | null>()

vi.mock('@/shared/services/auth.token', () => ({
  getTokenRole: () => getTokenRole(),
  getToken: () => 'test-token',
}))

// Sidebar เรียก authStore.getCurrentUser() ตอน mount — ตัดออกไม่ให้ยิง API จริง
vi.mock('@/shared/services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, name: 'ผู้ทดสอบ' }),
  },
}))

let wrapper: VueWrapper | null = null

beforeEach(() => {
  setActivePinia(createPinia())
  getTokenRole.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

/** เส้นคั่นคือ <li> ที่ไม่มีลิงก์ข้างใน — แยกจาก <li> ของเมนูด้วยการมี/ไม่มี <a> */
const SEPARATOR = 'li[aria-hidden="true"]'

async function mountAs(role: string) {
  getTokenRole.mockReturnValue(role)
  wrapper = mount(Sidebar, {
    global: {
      stubs: {
        Teleport: true,
        Icon: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
  await nextTick()
  return wrapper
}

/** ลำดับของ <li> ทั้งหมดในเมนู เป็น 'sep' หรือชื่อเมนู — เห็นรูปร่างจริงที่ผู้ใช้เห็น */
function menuShape(w: VueWrapper): string[] {
  return w
    .findAll('nav ul.menu > li')
    .map((li) => (li.attributes('aria-hidden') === 'true' ? 'sep' : (li.text() || 'item')))
}

describe('กลุ่มเมนูใน sidebar', () => {
  it('ADMIN เห็นครบ 3 กลุ่ม = 2 เส้น', async () => {
    const w = await mountAs('ADMIN')

    expect(w.findAll(SEPARATOR)).toHaveLength(2)
    expect(w.text()).toContain('Admin')
    expect(w.text()).toContain('Asset Summary')
  })

  it('FINANCE เห็น 3 กลุ่ม (restricted เหลือ Asset Summary ตัวเดียว) = 2 เส้น', async () => {
    const w = await mountAs('FINANCE')

    expect(w.findAll(SEPARATOR)).toHaveLength(2)
    expect(w.text()).toContain('Asset Summary')
    // Admin เป็นของ ADMIN เท่านั้น — กลุ่มยังอยู่เพราะ Asset Summary ยังเหลือ
    expect(w.text()).not.toContain('Admin')
  })

  /**
   * ★★ ข้อที่ห้ามล้ม — กลุ่มว่างต้องไม่กินเส้น
   *
   * EMPLOYEE ไม่เห็นทั้ง Asset Summary และ Admin กลุ่ม restricted จึงว่างทั้งกลุ่ม
   * ถ้าใครเปลี่ยนไปวาดเส้นท้ายทุกกลุ่ม จะได้เส้นห้อยใต้เมนูสุดท้ายโดยไม่มีอะไรตามมา
   */
  it('EMPLOYEE ไม่เห็นกลุ่ม restricted เลย → เหลือ 1 เส้น และไม่มีเส้นห้อยท้าย', async () => {
    const w = await mountAs('EMPLOYEE')

    expect(w.findAll(SEPARATOR)).toHaveLength(1)

    const shape = menuShape(w)
    expect(shape[0]).not.toBe('sep')
    expect(shape[shape.length - 1]).not.toBe('sep')
  })

  /**
   * ★★ AUDIT เห็นเมนูเดียว (/audit) — สองกลุ่มที่เหลือว่าง ต้องไม่มีเส้นสักเส้น
   *    เคสนี้คือเคสที่พังชัดที่สุดถ้า divider ถูกแทรกเป็นไอเทมใน menuItems
   */
  it('AUDIT เห็นเมนูเดียว → ไม่มีเส้นเลย', async () => {
    const w = await mountAs('AUDIT')

    expect(w.findAll(SEPARATOR)).toHaveLength(0)
    expect(menuShape(w)).toHaveLength(1)
    expect(w.text()).toContain('Audit')
  })

  it('ไม่มีเส้นสองเส้นติดกันในทุก role', async () => {
    for (const role of ['ADMIN', 'FINANCE', 'MANAGER', 'EMPLOYEE', 'AUDIT']) {
      const w = await mountAs(role)
      const shape = menuShape(w)

      for (let i = 1; i < shape.length; i += 1) {
        expect(`${role}: ${shape[i - 1]}/${shape[i]}`).not.toBe(`${role}: sep/sep`)
      }
      w.unmount()
      wrapper = null
    }
  })

  it('กลุ่มเรียงตาม MENU_GROUP_ORDER — work ก่อน registry ก่อน restricted', async () => {
    const w = await mountAs('ADMIN')
    const text = w.text()

    expect(text.indexOf('Dashboard')).toBeLessThan(text.indexOf('My Assets'))
    expect(text.indexOf('My Assets')).toBeLessThan(text.indexOf('Asset Summary'))
  })
})
