// กล่องออกเลขรายชิ้น: เลขชนกับแถวที่ sync ดึงมาจาก SAP ไปก่อน
//
// ทางตันเดิม: บัญชีกรอกเลขแล้วได้ "ถูกใช้แล้ว (ดึงมาจาก SAP)" สีแดง โดยไม่มีทางไปต่อ
// ตอนนี้ต้องได้รายละเอียดของแถวนั้นมาให้ตัดสิน แล้วกด "ผูกกับรายการนี้" ได้ในกล่องเดิม
//
// ★ เทสต์ที่หน้าจอวัดแค่ "ส่งอะไรไป / โชว์อะไร" - การรวมแถวจริงเทสต์ฝั่ง backend
//   (sap-legacy-adopt.test.ts) หน้าจอห้ามตัดสินเองว่าผูกได้ไหม
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/shared/services/httpClient'
import AssetRequestFormPage from '../AssetRequestFormPage.vue'

const assignAssetNumber = vi.fn()
const getSapMatch = vi.fn()

vi.mock('@/shared/services/assetRequest.service', () => ({
  getPendingRegistration: vi.fn().mockResolvedValue({
    requestId: 7,
    poNumber: 'PO-7',
    submittedAt: null,
    approvedAt: null,
    submittedByName: null,
    approvedByName: null,
    vendorName: null,
    ownerPrName: null,
    departmentName: null,
    poDate: null,
    totalAssets: 1,
    pendingAssets: 1,
    rejectedAssets: 0,
    fixedAssets: 0,
  }),
  assignAssetNumber: (...args: unknown[]) => assignAssetNumber(...args),
  getSapMatch: (...args: unknown[]) => getSapMatch(...args),
  confirmRegistration: vi.fn(),
  rejectAsset: vi.fn(),
  cancelAsset: vi.fn(),
  uncancelAsset: vi.fn(),
  declareLine: vi.fn(),
}))

vi.mock('@/shared/services/asset.service', () => ({
  getAssetSlots: vi.fn().mockResolvedValue({ items: [] }),
}))

/** ถือ lock ขั้นบัญชีอยู่ตั้งแต่เปิดสาย - ไม่งั้นปุ่มในกล่องกดไม่ได้ */
vi.mock('@/shared/services/presence.service', () => ({
  openPresence: (_id: number, handlers: { onState?: (s: unknown) => void }) => {
    handlers.onState?.({ state: 'editable', holder: 1, holderName: 'บัญชี', position: 0 })
    return { close: vi.fn() }
  },
  sendPresenceHeartbeat: vi.fn(),
}))

vi.mock('@/shared/services/master.service', () => ({ listFloorPlans: vi.fn().mockResolvedValue([]) }))
vi.mock('@/shared/services/attachment.service', () => ({ fileBlobUrl: vi.fn() }))
vi.mock('@/shared/services/invoice.service', () => ({ invoiceBlobUrl: vi.fn() }))
vi.mock('apexcharts', () => ({ default: class {} }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))

const slot = {
  assetId: 55,
  poLine: 1,
  unitNo: 1,
  description: 'โน้ตบุ๊ก',
  serialNumber: 'SN-1',
  acquisitionCost: 25_000,
  location: 'IT',
  imageId: null,
  lifecycle: 'DRAFT',
  employeeName: null,
  departmentName: null,
  warranty: '-',
  displayStatus: 'approved',
  assetNumber: null,
  qrCode: null,
  rejectFixed: false,
  rejectReason: null,
  cancelReason: null,
  locationOutPlan: false,
  subLocationId: null,
  planKey: null,
  posX: null,
  posY: null,
  categoryName: null,
}
const round = { grpoNo: 'GR-7', grpoId: 1, invoices: [], declared: [], slots: [slot] }

const legacy = {
  assetId: 900,
  assetNumber: 'COM-775-26-053',
  description: 'โน้ตบุ๊กจาก SAP',
  sapCreatedDate: '2026-09-21',
  status: 'Active',
  sapCost: 24_500,
  adoptable: true,
  blockedReason: null,
  warning: null,
}

let wrapper: ReturnType<typeof mount> | null = null

/** เปิดกล่องของชิ้นแล้วพิมพ์เลข - เปิดผ่านฟังก์ชันเดียวกับที่ปุ่มในตารางเรียก */
async function openAndType(assetNumber: string) {
  wrapper = mount(AssetRequestFormPage, {
    props: { requestId: '7' },
    global: {
      stubs: { Icon: true, AppAssetLocationMap: true, InvoiceModal: true, AssetNumberInput: true },
    },
  })
  await flushPromises()
  const vm = wrapper.vm as unknown as {
    openSlotAction: (r: unknown, s: unknown) => void
    assetNumber: string
  }
  vm.openSlotAction(round, slot)
  vm.assetNumber = assetNumber
  await flushPromises()
}

/** ปุ่มยืนยันในแถบล่างของกล่อง (ปุ่มสุดท้ายของกล่อง) */
function confirmButton() {
  const buttons = wrapper!.findAll('.modal-box button')
  return buttons[buttons.length - 1]!
}

beforeEach(() => {
  assignAssetNumber.mockReset()
  getSapMatch.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('เลขชนกับแถวจาก SAP', () => {
  it('ได้ 409 แล้วชนกับแถวจาก SAP = โชว์รายละเอียดแทน error สีแดง และปุ่มเปลี่ยนเป็น "ผูกกับรายการนี้"', async () => {
    assignAssetNumber.mockRejectedValueOnce(new ApiError('มีอยู่แล้วจากการ sync ของ SAP', 409))
    getSapMatch.mockResolvedValueOnce({ match: legacy })
    await openAndType('COM-775-26-053')

    await confirmButton().trigger('click')
    await flushPromises()

    const text = wrapper!.text()
    expect(text).toContain('มีอยู่แล้วจากการ sync ของ SAP')
    expect(text).toContain('โน้ตบุ๊กจาก SAP')
    expect(wrapper!.find('.alert-error').exists()).toBe(false)
    expect(confirmButton().text()).toContain('ผูกกับรายการนี้')
  })

  it('กดยืนยันผูก = ส่ง id ของแถวที่เห็นไปด้วย', async () => {
    assignAssetNumber.mockRejectedValueOnce(new ApiError('มีอยู่แล้วจากการ sync ของ SAP', 409))
    getSapMatch.mockResolvedValueOnce({ match: legacy })
    await openAndType('COM-775-26-053')
    await confirmButton().trigger('click')
    await flushPromises()

    assignAssetNumber.mockResolvedValueOnce({ asset: {}, remaining: 0 })
    await confirmButton().trigger('click')
    await flushPromises()

    expect(assignAssetNumber).toHaveBeenLastCalledWith(7, 55, 'COM-775-26-053', 900)
  })

  it('แก้เลขหลังเห็นรายละเอียด = ล้างทิ้ง กลับเป็นปุ่มออกเลขธรรมดา (ไม่ส่ง id ของเลขเก่าไปกับเลขใหม่)', async () => {
    assignAssetNumber.mockRejectedValueOnce(new ApiError('มีอยู่แล้วจากการ sync ของ SAP', 409))
    getSapMatch.mockResolvedValueOnce({ match: legacy })
    await openAndType('COM-775-26-053')
    await confirmButton().trigger('click')
    await flushPromises()

    ;(wrapper!.vm as unknown as { assetNumber: string }).assetNumber = 'COM-775-26-054'
    await flushPromises()
    expect(confirmButton().text()).not.toContain('ผูกกับรายการนี้')

    assignAssetNumber.mockResolvedValueOnce({ asset: {}, remaining: 0 })
    await confirmButton().trigger('click')
    await flushPromises()
    expect(assignAssetNumber).toHaveBeenLastCalledWith(7, 55, 'COM-775-26-054', undefined)
  })

  it('แถวจาก SAP ที่ผูกไม่ได้ = โชว์เหตุผล และกดยืนยันไม่ได้จนกว่าจะแก้เลข', async () => {
    assignAssetNumber.mockRejectedValueOnce(new ApiError('มีอยู่แล้วจากการ sync ของ SAP', 409))
    getSapMatch.mockResolvedValueOnce({
      match: { ...legacy, adoptable: false, blockedReason: 'มีคนแก้ข้อมูลของเลขนี้ใน AMS ไปแล้ว' },
    })
    await openAndType('COM-775-26-053')
    await confirmButton().trigger('click')
    await flushPromises()

    expect(wrapper!.text()).toContain('มีคนแก้ข้อมูลของเลขนี้ใน AMS ไปแล้ว')
    expect(confirmButton().attributes('disabled')).toBeDefined()
  })

  it('409 ที่ไม่ได้ชนกับแถวจาก SAP = ขึ้นข้อความเดิมของ backend เหมือนก่อน', async () => {
    assignAssetNumber.mockRejectedValueOnce(new ApiError('ใบนี้กำลังถูกผู้อื่นแก้ไขอยู่', 409))
    getSapMatch.mockResolvedValueOnce({ match: null })
    await openAndType('COM-775-26-053')
    await confirmButton().trigger('click')
    await flushPromises()

    expect(wrapper!.find('.alert-error').text()).toContain('ใบนี้กำลังถูกผู้อื่นแก้ไขอยู่')
  })
})
