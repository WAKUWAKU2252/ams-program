// เลข PO / GRPO ในกล่องรายละเอียดสินทรัพย์
//
// ★ สองกรณีต้องหน้าตาต่างกันชัด ๆ:
//   - ของที่ขึ้นทะเบียนผ่านใบคำขอใน AMS → เห็นเลข PO และเลข GRPO
//   - ของเก่าที่ดึงมาจาก SAP → ยังแยกสองแถว แต่ละแถวขึ้น "ไม่พบข้อมูล" แทน '-' ที่อ่านเหมือน "ลืมกรอก"
//     (ใน SAP สินทรัพย์ไม่มีลิงก์กลับไป PO - backend ส่ง null ทั้งคู่มา)
//
// ★ เฝ้าที่ข้อความใน DOM ไม่ใช่ที่ค่าใน component - สิ่งที่ผู้ใช้เห็นคือสิ่งที่ต้องถูก
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AppAssetDetail from '../AppAssetDetail.vue'
import type { AssetByNumberDetail } from '@/shared/services/asset.service'

vi.mock('@/shared/services/auth.token', () => ({
  getTokenRole: () => 'EMPLOYEE',
  getToken: () => 'test-token',
  getTokenUserId: () => 1,
  isTokenValid: () => true,
}))

const BASE = {
  id: 7,
  companyCode: 'UBA',
  assetNumber: 'COM-100-12-006',
  description: 'MONITOR',
  imageId: null,
  serialNumber: null,
  uom: null,
  assetClass: null,
  status: 'Active',
  lifecycle: 'REGISTERED',
  categoryName: null,
  locationName: 'สำนักงานใหญ่',
  subLocationName: null,
  locationOutPlan: false,
  subLocationId: null,
  planKey: null,
  floor: null,
  posX: null,
  posY: null,
  departmentName: null,
  employeeId: null,
  holderName: null,
  sapCreatedDate: null,
  acquisitionDate: null,
  acquisitionCost: null,
  warrantyStartDate: null,
  warrantyEndDate: null,
  accounting: null,
}

let current: AssetByNumberDetail

vi.mock('@/shared/services/asset.service', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAssetByNumber: () => Promise.resolve(current),
  openAssetLabel: vi.fn(),
  updateAssetLocation: vi.fn(),
}))
vi.mock('@/shared/services/master.service', () => ({ listFloorPlans: () => Promise.resolve([]) }))
vi.mock('@/shared/services/attachment.service', () => ({ fileBlobUrl: () => Promise.resolve('') }))

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mountWith(extra: Partial<AssetByNumberDetail>) {
  current = { ...BASE, ...extra } as unknown as AssetByNumberDetail
  wrapper = mount(AppAssetDetail, {
    props: { item: { companyCode: 'UBA', assetNumber: 'COM-100-12-006' } },
  })
  await flushPromises()
  return wrapper
}

/** ค่าของแถวที่หัวเป็นข้อความนี้ - อ่านจาก <dt>/<dd> คู่เดียวกัน */
function rowValue(w: VueWrapper, label: string): string | null {
  const dt = w.findAll('dt').find((d) => d.text() === label)
  return dt ? (dt.element.nextElementSibling?.textContent?.trim() ?? null) : null
}

describe('เลข PO / GRPO ในกล่องรายละเอียด', () => {
  it('ของที่ขึ้นทะเบียนผ่าน AMS → เห็นเลข PO และเลข GRPO', async () => {
    const w = await mountWith({ poNumber: 'APO-62605007', grpoNumber: 'AGP-62601012' })

    expect(rowValue(w, 'เลขที่ PO')).toBe('APO-62605007')
    expect(rowValue(w, 'เลขที่ GRPO')).toBe('AGP-62601012')
  })

  it('ของเก่าจาก SAP (null ทั้งคู่) → ยังแยกสองแถว แต่ละแถวขึ้น "ไม่พบข้อมูล" แทนขีด', async () => {
    const w = await mountWith({ poNumber: null, grpoNumber: null })

    // ข้อความตรงกับหมายเหตุท้าย TOR ข้อ 5.4 - เปลี่ยนที่ใดที่หนึ่งต้องเปลี่ยนอีกที่ด้วย
    expect(rowValue(w, 'เลขที่ PO')).toBe('ไม่พบข้อมูล')
    expect(rowValue(w, 'เลขที่ GRPO')).toBe('ไม่พบข้อมูล')
  })
})
