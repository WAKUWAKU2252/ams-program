// ช่อง "ราคาทุนต่อชิ้น" ต้องโชว์ทศนิยม 2 ตำแหน่งเสมอ
//
// ทดสอบเฉพาะช่องนี้ ไม่ใช่ทั้งกล่อง - เคยพังมาแล้วสองแบบที่เทสต์ระดับนี้จับได้ทั้งคู่:
//   1. v-model ผูกกับผลลัพธ์ของฟังก์ชัน (เขียนกลับไม่ได้ ค่าที่พิมพ์หายทันที)
//   2. เก็บค่าเป็น string แล้วส่งเข้า payload ที่ประกาศเป็น number
//
// ⚠️ ห้าม stub Teleport: กล่องนี้ห่อด้วย <Teleport to="body"> ตัว stub ของ test-utils
//    เรนเดอร์ลูกครั้งแรกให้ แต่ไม่ส่งการอัปเดตรอบถัดไปลงไป - เทสต์จะเห็น DOM ค้างค่าเดิม
//    แล้วดูเหมือนโค้ดพัง ทั้งที่ state ข้างในเปลี่ยนถูกต้อง (เสียเวลาไล่มาแล้วรอบหนึ่ง)
//    เนื้อกล่องจึงไปอยู่ที่ document.body ต้องหา element จากตรงนั้น ไม่ใช่จาก wrapper
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AssetFormDialog from '../AssetFormDialog.vue'
import type { AssetFormTarget } from '@/shared/types/asset-form'

// service ที่กล่องนี้ import - กันไม่ให้เทสต์ยิงเน็ตจริง
vi.mock('@/shared/services/asset.service', () => ({
  createAsset: vi.fn(),
  getAsset: vi.fn(),
  updateAsset: vi.fn(),
}))
vi.mock('@/shared/services/attachment.service', () => ({
  uploadModuleFiles: vi.fn(),
  fileBlobUrl: vi.fn(() => ''),
  deleteUploadedFile: vi.fn(),
}))

const target: AssetFormTarget = {
  unitNo: 1,
  poLine: 1,
  grpoLineId: 'grpo-1',
  grpoNo: 'GRPO-001',
  itemDescription: 'เครื่องทดสอบ',
  acquisitionCost: 1500,
}

let wrapper: ReturnType<typeof mount> | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

/** เปิดกล่องแล้วคืน element ของช่องราคาทุน (ตัวเดียวที่เป็น inputmode="decimal") */
async function openDialog(t: AssetFormTarget = target): Promise<HTMLInputElement> {
  wrapper = mount(AssetFormDialog, {
    props: { open: true, requestId: 1, target: t },
    global: { stubs: { AppDatePicker: true, AppEmployeeSelect: true, Icon: true } },
  })
  await nextTick()
  await nextTick()
  const el = document.body.querySelector<HTMLInputElement>('input[inputmode="decimal"]')
  if (!el) throw new Error('ไม่พบช่องราคาทุน - เนื้อกล่องถูก teleport ไป body หรือเปล่า')
  return el
}

/** พิมพ์ลงช่องแบบเดียวกับที่ผู้ใช้พิมพ์ (v-model ฟัง event input) */
async function type(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
  await nextTick()
}

async function blur(el: HTMLInputElement) {
  el.dispatchEvent(new Event('blur'))
  await nextTick()
}

describe('AssetFormDialog - ช่องราคาทุน', () => {
  it('โชว์ค่าตั้งต้นจาก PO line เป็นทศนิยม 2 ตำแหน่ง', async () => {
    const el = await openDialog()
    expect(el.value).toBe('1500.00')
  })

  it('เลขที่มีเศษสตางค์ยังคงเศษไว้ครบ', async () => {
    const el = await openDialog({ ...target, acquisitionCost: 1234.5 })
    expect(el.value).toBe('1234.50')
  })

  it('พิมพ์ค่าใหม่แล้วเติม .00 ให้ตอนออกจากช่อง', async () => {
    const el = await openDialog()
    await type(el, '2999')
    // ระหว่างพิมพ์ต้องปล่อยตามที่พิมพ์ ไม่ไปยัด .00 กลางคัน (เคอร์เซอร์จะกระโดด)
    expect(el.value).toBe('2999')
    await blur(el)
    expect(el.value).toBe('2999.00')
  })

  it('พิมพ์ทศนิยมค้างไว้ ("1500.") ไม่พังและปัดให้ตอน blur', async () => {
    const el = await openDialog()
    await type(el, '1500.')
    expect(el.value).toBe('1500.')
    await blur(el)
    expect(el.value).toBe('1500.00')
  })

  it('เศษเกิน 2 ตำแหน่งถูกปัดให้เหลือ 2', async () => {
    const el = await openDialog()
    await type(el, '99.456')
    await blur(el)
    expect(el.value).toBe('99.46')
  })

  it('ลบจนว่างแล้วออกจากช่อง กลับเป็น 0.00 ไม่ใช่ค่าว่างหรือ NaN', async () => {
    const el = await openDialog()
    await type(el, '')
    await blur(el)
    expect(el.value).toBe('0.00')
  })

  it('รับค่าที่ก๊อปมาพร้อมคอมมาหลักพัน', async () => {
    const el = await openDialog()
    await type(el, '12,345.6')
    await blur(el)
    expect(el.value).toBe('12345.60')
  })
})
