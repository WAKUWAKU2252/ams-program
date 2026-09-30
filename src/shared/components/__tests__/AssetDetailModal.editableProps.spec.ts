// prop editable* ต้องเดินทางจากหน้า → AssetDetailModal → AppAssetDetail ครบทุกตัว
//
// ── อาการที่เทสต์นี้กันไว้ (เกิดจริงตอนเพิ่ม editableDepartment ใน 0027)
//
// หน้าต่าง ๆ เรียก AssetDetailModal ไม่ได้เรียก AppAssetDetail ตรง ๆ prop ที่เพิ่มใน
// AppAssetDetail แล้วลืมประกาศ/ส่งต่อที่ตัวกลาง จะกลายเป็น **fallthrough attribute**
// ไปเกาะ element รากของ modal เงียบ ๆ - ไม่มี error ไม่มี warning ไม่มีอะไรฟ้อง
// ปลายทางไม่เคยได้รับค่า ปุ่มจึงไม่ขึ้น ทั้งที่หน้าส่งมาแล้วและ typecheck ก็ผ่าน
//
// ★ เฝ้าที่ DOM ผ่าน "ตัวกลาง" ไม่ใช่ mount AppAssetDetail ตรง ๆ - ถ้า mount ตัวปลาย
//   เทสต์จะเขียวทั้งที่ตัวกลางไม่ได้ส่งต่อ ซึ่งคือรูปแบบของบั๊กเดิมพอดี
//
// ★ หาปุ่มด้วย aria-label ไม่ใช่ชื่อไอคอน - <Icon> ของ @iconify/vue เรนเดอร์เป็น <svg>
//   เปล่าที่ไม่มีชื่อไอคอนใน DOM (ดูคอมเมนต์เดียวกันที่ AppAssetDetail.print.spec.ts)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AssetDetailModal from '../AssetDetailModal.vue'
import type { AssetByNumberDetail } from '@/shared/services/asset.service'

vi.mock('@/shared/services/auth.token', () => ({
  getTokenRole: () => 'FINANCE',
  getToken: () => 'test-token',
  getTokenUserId: () => 1,
  isTokenValid: () => true,
}))

const DETAIL = {
  id: 7,
  companyCode: 'UBA',
  assetNumber: 'COM-220-22-001',
  description: 'HP LaserJet Pro',
  imageId: null,
  serialNumber: null,
  uom: null,
  assetClass: '1216401-1-220',
  status: 'Active',
  lifecycle: 'REGISTERED',
  categoryName: null,
  locationName: 'IT-โรงงาน',
  subLocationName: null,
  locationOutPlan: false,
  subLocationId: null,
  planKey: null,
  floor: null,
  posX: null,
  posY: null,
  // ทรงจริงหลังล้างค่าตั้งต้นทิ้ง: ไม่มีแผนก แต่มีศูนย์ต้นทุน
  departmentId: null,
  departmentName: null,
  costCenterName: 'ผลิตส่วนกลาง',
  employeeId: null,
  holderName: null,
  sapCreatedDate: null,
  acquisitionDate: null,
  acquisitionCost: null,
  warrantyStartDate: null,
  warrantyEndDate: null,
  accounting: null,
} as unknown as AssetByNumberDetail

vi.mock('@/shared/services/asset.service', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAssetByNumber: () => Promise.resolve(DETAIL),
  openAssetLabel: vi.fn(),
  updateAssetLocation: vi.fn(),
  updateAssetDepartment: vi.fn(),
}))

vi.mock('@/shared/services/master.service', () => ({
  listFloorPlans: () => Promise.resolve([]),
  listDepartments: () => Promise.resolve([]),
}))
vi.mock('@/shared/services/attachment.service', () => ({ fileBlobUrl: () => Promise.resolve('') }))

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/** teleport ไป body - ต้องค้นที่ document ไม่ใช่ใน wrapper */
const findByLabel = (label: string) =>
  document.body.querySelector(`button[aria-label="${label}"]`)

async function mountModal(props: Record<string, unknown>) {
  wrapper = mount(AssetDetailModal, {
    props: {
      modelValue: true,
      item: { companyCode: 'UBA', assetNumber: 'COM-220-22-001' },
      ...props,
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('AssetDetailModal ส่งต่อ prop editable* ไป AppAssetDetail', () => {
  it('editableDepartment=true → ปุ่มแก้แผนกขึ้น', async () => {
    await mountModal({ editableDepartment: true })
    expect(findByLabel('แก้แผนกที่ดูแล')).not.toBeNull()
  })

  it('ไม่ส่ง editableDepartment → ไม่มีปุ่ม (ค่าตั้งต้นต้องเป็นปิด)', async () => {
    await mountModal({})
    expect(findByLabel('แก้แผนกที่ดูแล')).toBeNull()
  })

  it('editableDepartment=false → ไม่มีปุ่ม (หน้า Audit ส่งค่าตาม role)', async () => {
    await mountModal({ editableDepartment: false })
    expect(findByLabel('แก้แผนกที่ดูแล')).toBeNull()
  })

  /**
   * ★ ศูนย์ต้นทุนต้องไม่มีปุ่มแก้ ไม่ว่าจะเปิด editableDepartment หรือไม่
   *
   * ค่านั้นมาจากท่อน 3 ของ AssetClass ที่ SAP ทับทุกรอบ sync - ปุ่มที่กดแล้วค่าหาย
   * รอบถัดไปคือปุ่มที่ไม่ควรมี (เหตุผลเดียวกับที่ PATCH /:id/holder เคยถูกถอด)
   */
  it('ไม่มีปุ่มแก้ศูนย์ต้นทุนแม้เปิดสิทธิ์แก้แผนก', async () => {
    await mountModal({ editableDepartment: true })
    expect(findByLabel('แก้ศูนย์ต้นทุน')).toBeNull()
    // ค่ายังต้องแสดงอยู่ - แค่แก้ไม่ได้ ไม่ใช่ซ่อน
    expect(document.body.textContent).toContain('ผลิตส่วนกลาง')
  })
})
