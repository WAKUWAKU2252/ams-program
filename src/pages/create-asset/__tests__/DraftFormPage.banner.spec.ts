// แถบแจ้งเตือนบนหัวหน้า DraftForm - เลขชิ้นต้องติดไปกับข้อความที่พูดถึงชิ้นเท่านั้น
//
// บั๊กที่เฝ้า: badge ของ rejectedPieces ถูกวนไว้ใน alert ของ lockBanner แบบไม่มีเงื่อนไข
// เลข "1.3" จึงโผล่ต่อท้าย "PO ใบนี้กำลังถูกใช้โดยผู้อื่น" ด้วย ซึ่งอ่านแล้วเหมือนบอกว่า
// ชิ้น 1.3 ถูกคนอื่นใช้อยู่ - คนละเรื่องกันสนิท
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import DraftFormPage from '../DraftFormPage.vue'

const getAssetRequest = vi.fn()

vi.mock('@/shared/services/assetRequest.service', () => ({
  getAssetRequest: (...args: unknown[]) => getAssetRequest(...args),
  submitRequest: vi.fn(),
}))

/** presence: คุมได้ว่าจะให้เป็น holder หรือรอคิว */
const presenceHandlers: { onState?: (s: unknown) => void } = {}
vi.mock('@/shared/services/presence.service', () => ({
  openPresence: (_id: number, handlers: { onState?: (s: unknown) => void }) => {
    presenceHandlers.onState = handlers.onState
    return { close: vi.fn() }
  },
  // หน้านี้ส่ง heartbeat ต่ออายุ lock ตอนผู้ใช้ขยับจอ (useIdleKick) - ไม่มีตัวนี้ใน mock
  // แล้ววันไหนเทสต์ยิง mousemove ขณะถือ lock จะพังด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่วัด
  sendPresenceHeartbeat: vi.fn(),
}))

const draft = {
  id: 42,
  poNumber: 'PO-1',
  status: 'APPROVED',
  createdBy: 1,
  createdByName: 'ผู้ทดสอบ',
  ownerPrName: 'ผู้ขอซื้อ',
  updatedAt: '2026-01-01T00:00:00.000Z',
  purchaseOrder: { poNumber: 'PO-1', items: [] },
}

let wrapper: ReturnType<typeof mount> | null = null

/**
 * เมานต์หน้าแล้วยัดสถานะ presence + รายชิ้นที่ถูกตีกลับเข้าไปตรง ๆ
 *
 * ★ stub RequestTable - เทสต์นี้วัดแถบบนหัว ไม่ใช่ตาราง แต่ต้องยิง event rejected-pieces
 *   แทนตารางจริง เพราะแถบอ่านเลขชิ้นจาก event นั้น
 */
async function mountPage(presenceState: 'editable' | 'pending') {
  wrapper = mount(DraftFormPage, {
    props: { requestId: '42' },
    global: {
      stubs: {
        Icon: true,
        RequestTable: true,
        FormActions: true,
        RouterLink: true,
      },
      mocks: { $router: { replace: vi.fn() } },
    },
  })
  await nextTick()
  await nextTick()
  await nextTick()

  presenceHandlers.onState?.({ state: presenceState, holder: 9, holderName: 'คนอื่น', position: 1 })
  wrapper.findComponent({ name: 'RequestTable' }).vm.$emit('rejected-pieces', [
    { poLine: 1, unitNo: 3 },
  ])
  await nextTick()
  return wrapper
}

beforeEach(() => {
  // หน้านี้ต่อสายสถานะของฝั่งผู้ขอผ่าน connection store (watch changeTick) เพื่อให้ใบที่
  // แก้ไม่ได้ - ซึ่งไม่มีสาย presence - ยังรู้ตัวเมื่อหัวหน้าอนุมัติ/ตีกลับ
  // ต้องมี pinia ตอน mount ไม่งั้น setup พังตั้งแต่บรรทัดแรก (ไม่เกี่ยวกับสิ่งที่เทสต์นี้วัด)
  setActivePinia(createPinia())
  getAssetRequest.mockReset().mockResolvedValue(draft)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('เลขชิ้นบนแถบแจ้งเตือน', () => {
  it('★ ข้อความ "ถูกใช้โดยผู้อื่น" ต้องไม่มีเลขชิ้นติดมา', async () => {
    await mountPage('pending')

    const text = wrapper!.text()
    expect(text).toContain('กำลังถูกใช้โดยผู้อื่น')
    // 1.3 ไม่เกี่ยวกับการที่ใบถูกคนอื่นถืออยู่
    expect(wrapper!.findAll('.badge').some((b) => b.text() === '1.3')).toBe(false)
  })

  it('ข้อความ "แก้ได้เฉพาะชิ้นที่บัญชีตีกลับ" ยังมีเลขชิ้นตามเดิม', async () => {
    await mountPage('editable')

    expect(wrapper!.text()).toContain('แก้ได้เฉพาะชิ้นที่บัญชีตีกลับ')
    expect(wrapper!.findAll('.badge').some((b) => b.text() === '1.3')).toBe(true)
  })
})
