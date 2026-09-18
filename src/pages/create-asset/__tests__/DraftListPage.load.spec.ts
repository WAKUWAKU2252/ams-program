// ═══ การโหลดลิสต์คำขอ: คิวรีต้องไม่แซงกัน และหน้าต้องไม่ค้างนอกขอบ ═══
//
// บั๊กที่เฝ้า (เจอ 2026-09-09):
//
// 1. loadDrafts() ไม่มีตัวกันคิวรีแซง ทั้งที่ยิงได้จากสามทางพร้อมกัน (หน่วงพิมพ์ค้น 350ms ·
//    สาย SSE 400ms · การกดตัวกรอง/เปลี่ยนหน้า) และ clearFilters() ทริกสองสายเสมอ
//    ผลคือผลลัพธ์ของเงื่อนไขเก่ามาทับของใหม่ได้ โดยไม่มีอะไรฟ้อง
//    ★ loadOwners() ในไฟล์เดียวกันมี ownerSeq กันไว้อยู่แล้ว — ตัวนี้แค่ถูกลืม
//
// 2. เอาใบออกจากลิสต์แล้วหน้าที่ดูอยู่หลุดขอบ (ลบใบสุดท้ายของหน้า 3 จาก 21 ใบ) ตารางว่าง
//    และแถบเลขหน้าเหลือ 1–2 = ไม่มีปุ่มของหน้า 3 ให้กดออก ต้องเดาว่าต้องกดเลขไหน
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DraftListPage from '../DraftListPage.vue'
import type { ListDraftsParams } from '@/shared/services/assetRequest.service'

const listDrafts = vi.fn()

vi.mock('@/shared/services/assetRequest.service', () => ({
  listDrafts: (...args: unknown[]) => listDrafts(...args),
  leaveRequest: vi.fn(() => Promise.resolve({ success: true })),
  listMyStuckNotifications: vi.fn(() => Promise.resolve([])),
  retryNotifyApprover: vi.fn(),
}))
vi.mock('@/shared/services/master.service', () => ({
  listEmployees: vi.fn(() => Promise.resolve({ data: [], total: 0 })),
}))
// auth store อ่านโทเคนตอนถูกสร้าง - ต้อง mock ให้ครบทุกตัวที่มันเรียก ไม่ใช่แค่ที่หน้านี้ใช้
vi.mock('@/shared/services/auth.token', () => ({
  getTokenRole: () => 'ADMIN',
  getToken: () => null,
  setToken: vi.fn(),
  clearToken: vi.fn(),
  isTokenValid: () => false,
}))

/** หนึ่งแถวในลิสต์ - เนื้อหาไม่สำคัญกับเทสต์ชุดนี้ ขอแค่มี id ให้ key ไม่ชนกัน */
const row = (id: number) => ({
  id,
  poNumber: `PO-${id}`,
  status: 'DRAFT' as const,
  createdBy: 1,
  createdByName: 'ผู้ทดสอบ',
  ownerPrName: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
})

let wrapper: ReturnType<typeof mount> | null = null

async function mountPage() {
  wrapper = mount(DraftListPage, {
    global: {
      stubs: {
        Icon: true,
        TopicCard: true,
        AppPagination: true,
        AppSortMenu: true,
        CreateRequestModal: true,
        AppConfirmDialog: true,
        RouterLink: true,
      },
      mocks: { $router: { push: vi.fn(), replace: vi.fn() } },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  listDrafts.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('คิวรีที่แซงกัน', () => {
  it('★ ผลลัพธ์ของคำขอเก่าที่กลับมาช้ากว่า ต้องไม่ทับผลของคำขอล่าสุด', async () => {
    // รอบแรกตอบช้า รอบสองตอบเร็ว — สภาพจริงตอนพิมพ์ค้นแล้วสายอื่นยิงตามมาติด ๆ
    // ตั้งต้นเป็นฟังก์ชันเปล่า ไม่ใช่ null - TS แคบชนิดเป็น never ถ้าค่าถูกใส่ในคอลแบ็ก
    let releaseFirst: () => void = () => {}
    listDrafts
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve({ data: [row(1)], total: 1 })
          }),
      )
      .mockResolvedValue({ data: [row(99)], total: 1 })

    await mountPage()
    // รอบแรกยังค้างอยู่ - ยิงรอบสองทับ แล้วค่อยปล่อยรอบแรกให้กลับมาทีหลัง
    const vm = wrapper!.vm as unknown as { loadDrafts: () => Promise<void> }
    const second = vm.loadDrafts()
    await flushPromises()
    releaseFirst()
    await flushPromises()
    await second

    // ★ กันเทสต์ผ่านแบบว่างเปล่า - ต้องยิงจริงสองรอบถึงจะมีอะไรให้แซงกัน
    expect(listDrafts).toHaveBeenCalledTimes(2)
    // ต้องเห็นแถวของรอบล่าสุด (#99) ไม่ใช่ของรอบแรกที่กลับมาทีหลัง (#1)
    expect(wrapper!.text()).toContain('#99')
    expect(wrapper!.text()).not.toContain('PO-1<')
  })
})

describe('หน้าที่หลุดขอบหลังลิสต์หดลง', () => {
  it('★ ได้ 0 แถวทั้งที่อยู่หน้า 3 ต้องถอยไปหน้าสุดท้ายที่มีของจริงแล้วโหลดใหม่', async () => {
    const pages: Record<number, { data: ReturnType<typeof row>[]; total: number }> = {
      // หน้า 1 ตอนเปิดหน้าจอ (21 ใบ)
      1: { data: [row(1)], total: 21 },
      // หน้า 3 หลังลิสต์หดเหลือ 20 ใบ = ว่าง
      3: { data: [], total: 20 },
      // ★ หน้าที่ระบบต้องถอยไปเอง
      2: { data: [row(11)], total: 20 },
    }
    listDrafts.mockImplementation((p: ListDraftsParams) => Promise.resolve(pages[p.page ?? 1]))

    await mountPage()
    const vm = wrapper!.vm as unknown as { page: number; loadDrafts: () => Promise<void> }
    vm.page = 3
    await vm.loadDrafts()
    await flushPromises()

    expect(vm.page).toBe(2)
    expect(wrapper!.text()).toContain('#11')
  })

  it('ลิสต์ว่างทั้งจริง ๆ ตอนอยู่หน้า 1 ต้องไม่วนโหลดซ้ำ', async () => {
    listDrafts.mockResolvedValue({ data: [], total: 0 })

    await mountPage()
    const vm = wrapper!.vm as unknown as { page: number }

    expect(vm.page).toBe(1)
    // เปิดหน้าครั้งเดียว = ยิงครั้งเดียว ถ้ามีการวนซ้ำตัวเลขนี้จะโตขึ้นเรื่อย ๆ
    expect(listDrafts).toHaveBeenCalledTimes(1)
  })
})
