// แท็บ "เลขที่ยังไม่พบใน SAP" - ทางแก้เลขผิดหลังแจ้งผลกลับผู้ขอไปแล้ว
//
// ★ เทสต์ที่หน้าจอวัดแค่ "ส่งอะไรไป / โชว์อะไร" - ด่านจริง (แก้ได้เฉพาะเลขที่ SAP ยังไม่เห็น,
//   การรวมแถว) เทสต์ฝั่ง backend ที่ asset-renumber.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/shared/services/httpClient'
import UnmatchedNumberQueue from '../components/UnmatchedNumberQueue.vue'

const listUnmatchedNumbers = vi.fn()
const renumberAsset = vi.fn()
const getSapMatch = vi.fn()
const openAssetLabel = vi.fn()
const push = vi.fn()

vi.mock('@/shared/services/assetRequest.service', () => ({
  listUnmatchedNumbers: (...args: unknown[]) => listUnmatchedNumbers(...args),
  renumberAsset: (...args: unknown[]) => renumberAsset(...args),
  getSapMatch: (...args: unknown[]) => getSapMatch(...args),
}))
vi.mock('@/shared/services/asset.service', () => ({
  openAssetLabel: (...args: unknown[]) => openAssetLabel(...args),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const baseRow = {
  companyCode: 'UBA',
  description: 'โน้ตบุ๊ก',
  serialNumber: 'SN-1',
  acquisitionCost: 25_000,
  registeredAt: '2026-09-01T10:00:00Z',
  registeredByName: 'บัญชี',
  vendorName: 'ผู้ขาย',
}
const closedRow = { ...baseRow, assetId: 55, requestId: 7, assetNumber: 'COM-775-26-050', poNumber: 'PO-7', requestClosed: true }
const openRow = { ...baseRow, assetId: 56, requestId: 8, assetNumber: 'COM-775-26-051', poNumber: 'PO-8', requestClosed: false }

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

async function mountQueue() {
  wrapper = mount(UnmatchedNumberQueue, {
    global: { stubs: { Icon: true, AssetNumberInput: true, teleport: true } },
  })
  await flushPromises()
  return wrapper
}

function buttonByText(text: string) {
  return wrapper!.findAll('button').find((b) => b.text().includes(text))
}

/** เปิดกล่องของแถวที่ปิดงานแล้วแล้วพิมพ์เลข (AssetNumberInput ถูก stub - ตั้งค่าตรง ๆ) */
async function openAndType(assetNumber: string) {
  await buttonByText('แก้เลข')!.trigger('click')
  ;(wrapper!.vm as unknown as { newNumber: string }).newNumber = assetNumber
  await flushPromises()
}

beforeEach(() => {
  listUnmatchedNumbers.mockReset().mockResolvedValue({ data: [closedRow, openRow], total: 2, page: 1, limit: 10 })
  renumberAsset.mockReset()
  getSapMatch.mockReset()
  openAssetLabel.mockReset().mockResolvedValue(undefined)
  push.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('UnmatchedNumberQueue', () => {
  it('ใบที่ปิดงานแล้วมีปุ่มแก้เลข / ใบที่ยังอยู่ในคิวพาไปหน้าออกเลขแทน', async () => {
    await mountQueue()
    expect(wrapper!.emitted('loaded')?.[0]).toEqual([2])

    const rows = wrapper!.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('แก้เลข')
    expect(rows[1]!.text()).not.toContain('แก้เลข')

    await rows[1]!.find('button').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'AssetRequestForm', params: { requestId: '8' } })
  })

  it('บันทึกสำเร็จ = ค้างผลไว้ในกล่อง พร้อมปุ่มพิมพ์สติกเกอร์ใหม่ของชิ้นนี้', async () => {
    await mountQueue()
    await openAndType('COM-775-26-060')
    renumberAsset.mockResolvedValueOnce({
      asset: { id: 55, assetNumber: 'COM-775-26-060' },
      previousNumber: 'COM-775-26-050',
      adopted: false,
    })

    await buttonByText('บันทึกเลขใหม่')!.trigger('click')
    await flushPromises()

    expect(renumberAsset).toHaveBeenLastCalledWith(7, 55, 'COM-775-26-060', undefined)
    expect(wrapper!.text()).toContain('สติกเกอร์เดิมสแกนแล้วจะขึ้นว่าไม่พบ')
    await buttonByText('พิมพ์สติกเกอร์ใหม่')!.trigger('click')
    expect(openAssetLabel).toHaveBeenCalledWith(55)
  })

  it('เลขชนแถวจาก SAP = โชว์รายละเอียดให้เทียบ แล้วกดผูกโดยส่ง id ของแถวนั้นไป', async () => {
    await mountQueue()
    await openAndType('COM-775-26-053')
    renumberAsset.mockRejectedValueOnce(new ApiError('มีอยู่แล้วจากการ sync ของ SAP', 409))
    getSapMatch.mockResolvedValueOnce({ match: legacy })

    await buttonByText('บันทึกเลขใหม่')!.trigger('click')
    await flushPromises()

    expect(getSapMatch).toHaveBeenCalledWith(7, 55, 'COM-775-26-053')
    expect(wrapper!.text()).toContain('โน้ตบุ๊กจาก SAP')

    renumberAsset.mockResolvedValueOnce({
      asset: { id: 55, assetNumber: 'COM-775-26-053' },
      previousNumber: 'COM-775-26-050',
      adopted: true,
    })
    await buttonByText('ผูกกับรายการนี้')!.trigger('click')
    await flushPromises()
    expect(renumberAsset).toHaveBeenLastCalledWith(7, 55, 'COM-775-26-053', 900)
    expect(wrapper!.text()).toContain('รวมกับรายการที่ sync ดึงมาจาก SAP')
  })

  it('409 ที่ไม่ใช่เลขชน SAP (เช่นเลขเดิมถูกจับคู่แล้ว) = ขึ้นข้อความของ backend ตรง ๆ', async () => {
    await mountQueue()
    await openAndType('COM-775-26-061')
    renumberAsset.mockRejectedValueOnce(new ApiError('เลข COM-775-26-050 จับคู่กับข้อมูลใน SAP แล้ว', 409))
    getSapMatch.mockResolvedValueOnce({ match: null })

    await buttonByText('บันทึกเลขใหม่')!.trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain('จับคู่กับข้อมูลใน SAP แล้ว')
    expect(buttonByText('ผูกกับรายการนี้')).toBeUndefined()
  })
})
