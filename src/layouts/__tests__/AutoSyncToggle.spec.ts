// สวิตช์ sync อัตโนมัติบน Topbar - เทสต์ฝั่งจอวัดแค่ "ส่งอะไรไป / โชว์อะไร"
// ด่าน ADMIN และลำดับ route เฝ้าอยู่ฝั่ง backend ที่ test/sync-auto-toggle.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/shared/services/httpClient'
import AutoSyncToggle from '../components/AutoSyncToggle.vue'

const getAutoSync = vi.fn()
const setAutoSync = vi.fn()

vi.mock('@/shared/services/sync.service', () => ({
  getAutoSync: (...args: unknown[]) => getAutoSync(...args),
  setAutoSync: (...args: unknown[]) => setAutoSync(...args),
}))

const base = {
  enabled: true,
  intervalMinutes: 180,
  envDefault: true,
  canToggle: true,
  changedByName: null,
  changedAt: null,
}

let wrapper: ReturnType<typeof mount> | null = null

async function mountOpen() {
  wrapper = mount(AutoSyncToggle, { global: { stubs: { Icon: true } }, attachTo: document.body })
  await flushPromises()
  await wrapper.find('button').trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  getAutoSync.mockReset().mockResolvedValue(base)
  setAutoSync.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('AutoSyncToggle', () => {
  it('ปิดอยู่ = ปุ่มบน Topbar เป็นสีเตือน มองเห็นได้โดยไม่ต้องเปิดกล่อง', async () => {
    getAutoSync.mockResolvedValue({ ...base, enabled: false })
    wrapper = mount(AutoSyncToggle, { global: { stubs: { Icon: true } } })
    await flushPromises()

    expect(wrapper.find('button').classes()).toContain('text-warning')
  })

  it('กดปิด = ส่ง false แล้วโชว์ชื่อคนกด พร้อมบอกว่า restart แล้วกลับเป็นค่าใน .env', async () => {
    await mountOpen()
    setAutoSync.mockResolvedValueOnce({
      ...base,
      enabled: false,
      changedByName: 'แอดมิน',
      changedAt: '2026-09-25T10:00:00.000Z',
    })

    const input = wrapper!.find('input[type="checkbox"]')
    ;(input.element as HTMLInputElement).checked = false
    await input.trigger('change')
    await flushPromises()

    expect(setAutoSync).toHaveBeenCalledWith(false)
    expect(wrapper!.text()).toContain('ปิดอยู่')
    expect(wrapper!.text()).toContain('แอดมิน')
    expect(wrapper!.text()).toContain('restart backend แล้วจะกลับเป็น "เปิด"')
    expect((wrapper!.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
  })

  it('ส่งไม่ผ่าน = สวิตช์เด้งกลับตำแหน่งเดิม และโชว์ข้อความจาก backend', async () => {
    await mountOpen()
    setAutoSync.mockRejectedValueOnce(new ApiError('Forbidden', 403))

    const input = wrapper!.find('input[type="checkbox"]')
    ;(input.element as HTMLInputElement).checked = false
    await input.trigger('change')
    await flushPromises()

    expect((wrapper!.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper!.find('[role="alert"]').text()).toBe('Forbidden')
  })

  it('.env ตั้งรอบเป็น 0 = สวิตช์กดไม่ได้ พร้อมบอกเหตุผล', async () => {
    getAutoSync.mockResolvedValue({ ...base, enabled: false, canToggle: false, intervalMinutes: 0 })
    await mountOpen()

    expect(wrapper!.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(wrapper!.text()).toContain('SAP_SYNC_INTERVAL_MINUTES = 0')
  })
})
