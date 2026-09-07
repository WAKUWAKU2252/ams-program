// ปุ่มย้อนกลับ - ตรรกะทั้งหมดอยู่ที่ "มีที่ให้กลับหรือเปล่า"
//
// เคสที่ทำให้พังคือเคสที่ history ว่าง (เปิดลิงก์ตรง ๆ / กด F5 ค้างหน้านั้น) ซึ่งบนเครื่อง
// คนเขียนแทบไม่เจอเพราะกดเข้ามาจากเมนูตลอด - ถ้าไม่กันไว้ ปุ่มจะพาผู้ใช้ออกนอกแอป
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBackButton from '../AppBackButton.vue'

const back = vi.fn()
const push = vi.fn()

vi.mock('vue-router', () => ({ useRouter: () => ({ back, push }) }))

/** จำลองว่าเบราว์เซอร์มี/ไม่มีหน้าก่อนหน้าในแอป (vue-router เก็บไว้ที่ history.state.back) */
function setHistoryBack(value: string | null) {
  window.history.replaceState({ ...window.history.state, back: value }, '')
}

afterEach(() => {
  back.mockReset()
  push.mockReset()
})

describe('AppBackButton', () => {
  it('มีหน้าก่อนหน้า → ถอยด้วย history ไม่ใช่ push (สภาพตัวกรอง/หน้าเดิมจะได้ไม่หาย)', async () => {
    setHistoryBack('/dashboard')
    const w = mount(AppBackButton, { global: { stubs: { Icon: true } } })

    await w.find('button').trigger('click')

    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('ไม่มีหน้าก่อนหน้า → ไป fallback แทน ไม่หลุดออกนอกแอป', async () => {
    setHistoryBack(null)
    const w = mount(AppBackButton, {
      props: { fallback: '/create' },
      global: { stubs: { Icon: true } },
    })

    await w.find('button').trigger('click')

    expect(push).toHaveBeenCalledWith('/create')
    expect(back).not.toHaveBeenCalled()
  })

  it('ไม่ส่ง fallback มา → ใช้ /dashboard', async () => {
    setHistoryBack(null)
    const w = mount(AppBackButton, { global: { stubs: { Icon: true } } })

    await w.find('button').trigger('click')

    expect(push).toHaveBeenCalledWith('/dashboard')
  })
})
