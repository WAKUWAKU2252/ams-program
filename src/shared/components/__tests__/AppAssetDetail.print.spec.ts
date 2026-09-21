// ปุ่มพิมพ์สติกเกอร์ QR - ใครเห็นบ้าง
//
// อาการที่เทสต์นี้กันไว้: ผู้ตรวจภายนอก (AUDIT) เห็นปุ่มที่กดแล้วได้ 403 เสมอ เพราะเส้น
// GET /assets/:id/label ไม่อยู่ใน AUDIT_ALLOWED ของ auditScopeGuard (ฝั่ง backend มี
// audit-role-scope.test.ts เฝ้าข้อนั้นอยู่) - ปุ่มที่กดไม่ได้อยู่ดีไม่ควรขึ้นให้เห็นแต่แรก
//
// ★ เฝ้าที่ DOM ไม่ใช่ที่ canPrint - จุดที่ผู้ใช้เห็นกับจุดที่บั๊กโผล่คือที่เดียวกัน ถ้าเฝ้าที่
//   computed แล้ววันหลังมีคนเผลอเปลี่ยน v-if กลับไปผูกกับ props.printable ตรง ๆ อาการ
//   จะกลับมาโดยเทสต์ยังเขียว (ซึ่งคือรูปแบบของบั๊กเดิมพอดี)
//
// ★ ไม่ได้แปลว่าฝั่งจอเป็นด่านกันสิทธิ์ - ด่านจริงอยู่ที่ backend เสมอ ตัวนี้วัดแค่ว่า
//   หน้าจอไม่หลอกให้คนกดของที่กดไม่ได้
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AppAssetDetail from '../AppAssetDetail.vue'
import type { AssetByNumberDetail } from '@/shared/services/asset.service'

const getTokenRole = vi.fn<() => string | null>()

vi.mock('@/shared/services/auth.token', () => ({
  getTokenRole: () => getTokenRole(),
  getToken: () => 'test-token',
  getTokenUserId: () => 1,
  isTokenValid: () => true,
}))

// ชิ้นที่เปิดดูอยู่ - ปุ่มขึ้นต่อเมื่อโหลดรายละเอียดสำเร็จแล้ว (v-if="canPrint && detail")
// จึงต้องให้เส้นนี้ตอบของจริงมา ไม่งั้นเทสต์จะ "ผ่าน" เพราะไม่มี detail ไม่ใช่เพราะ role
const DETAIL = {
  id: 7,
  companyCode: 'UBA',
  assetNumber: 'COM-100-12-006',
  description: 'MONITOR LED 21" SUMSUNG',
  imageId: null,
  serialNumber: null,
  uom: null,
  assetClass: null,
  status: 'Active',
  lifecycle: 'IN_USE',
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
} as unknown as AssetByNumberDetail

const openAssetLabel = vi.fn()

vi.mock('@/shared/services/asset.service', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAssetByNumber: () => Promise.resolve(DETAIL),
  openAssetLabel: (...a: unknown[]) => openAssetLabel(...a),
  updateAssetLocation: vi.fn(),
}))

// ผังชั้นไม่เกี่ยวกับเทสต์นี้ แต่ watch ตัวเดียวกับที่โหลดรายละเอียดเรียกมันด้วย
vi.mock('@/shared/services/master.service', () => ({ listFloorPlans: () => Promise.resolve([]) }))
vi.mock('@/shared/services/attachment.service', () => ({ fileBlobUrl: () => Promise.resolve('') }))

let wrapper: VueWrapper | null = null

beforeEach(() => {
  getTokenRole.mockReset()
  openAssetLabel.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

/**
 * ปุ่มพิมพ์ - หาด้วยชื่อที่ผู้ใช้(และ screen reader) เห็นจริง
 *
 * ★ ห้ามกลับไปหาด้วยชื่อไอคอน: `<Icon>` ของ @iconify/vue เรนเดอร์เป็น <svg> เปล่าที่ไม่มี
 *   ชื่อไอคอนติดมาใน DOM เลย เทสต์ที่หาแบบนั้นจะ "ผ่าน" ทุกข้อที่คาดว่าปุ่มหายไป
 *   โดยไม่ได้วัดอะไรเลยสักข้อ (เจอมาแล้วตอนเขียนไฟล์นี้)
 */
const printButton = (w: VueWrapper) => w.find('button[aria-label="พิมพ์สติกเกอร์"]')

async function mountAs(role: string | null, printable = true) {
  getTokenRole.mockReturnValue(role)
  wrapper = mount(AppAssetDetail, {
    props: {
      item: { companyCode: 'UBA', assetNumber: 'COM-100-12-006' },
      printable,
    },
  })
  await flushPromises()
  return wrapper
}

describe('ปุ่มพิมพ์สติกเกอร์ในกล่องรายละเอียดสินทรัพย์', () => {
  it('AUDIT ไม่เห็นปุ่ม - เส้น label ตอบ 403 ให้ role นี้เสมอ', async () => {
    const w = await mountAs('AUDIT')
    expect(printButton(w).exists()).toBe(false)
  })

  it.each(['FINANCE', 'ADMIN', 'MANAGER', 'EMPLOYEE'])('%s เห็นปุ่มตามปกติ', async (role) => {
    const w = await mountAs(role)
    expect(printButton(w).exists()).toBe(true)
  })

  it('printable=false ยังปิดปุ่มได้เหมือนเดิม แม้ role จะพิมพ์ได้', async () => {
    // หน้า QR สาธารณะพึ่งข้อนี้ - เปิดได้โดยไม่ล็อกอิน ปุ่มที่นั่นจะกดแล้วได้ 401
    const w = await mountAs('FINANCE', false)
    expect(printButton(w).exists()).toBe(false)
  })

  it('ไม่มี token (ปลายทาง QR) → ไม่ใช่ AUDIT จึงไม่ถูกตัวนี้ปิด', async () => {
    // ★ ข้อนี้ระบุว่าใครเป็นคนปิดปุ่มบนหน้าสาธารณะ: เป็น printable=false ของหน้านั้น
    //   ไม่ใช่ canPrint - ถ้าวันหลังมีใครถอด :printable="false" ออกจาก AssetByNumberPage
    //   ปุ่มจะกลับมาโผล่ทันที และต้องเห็นจากข้อนี้ว่าตรงนี้ไม่ได้กันไว้ให้
    const w = await mountAs(null)
    expect(printButton(w).exists()).toBe(true)
  })
})
