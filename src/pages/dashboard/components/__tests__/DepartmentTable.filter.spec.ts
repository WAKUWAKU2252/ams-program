// ตัวกรองของตารางบน Dashboard - ที่ตั้ง / ผู้ครอบครอง / สถานะ
//
// ทดสอบว่า "สิ่งที่ผู้ใช้กดในแผง" กลายเป็น "พารามิเตอร์ที่ยิงไป backend" จริง เพราะเส้นทาง
// ระหว่างสองอย่างนี้ขาดได้เงียบ ๆ หลายจุด (ลืมใส่ช่องใน payload / ส่ง 0 แทน undefined /
// ไม่รีเซ็ตหน้ากลับ 1) แล้วหน้าจอจะดูเหมือนทำงานปกติทั้งที่ผลลัพธ์ไม่ได้ถูกกรอง
//
// ★ แกน "แผนก" ต้องไม่มีในแผงนี้ - แผนกมาจากช่องเลือกด้านบนของ Dashboard ที่ backend
//   ล็อกตาม role ไว้ ถ้ามีช่องซ้ำในตารางจะได้ตัวกรองสองตัวที่ทำงานคนละกฎบนหน้าเดียวกัน
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DepartmentTable from '../DepartmentTable.vue'

const getAssetInventory = vi.fn()
const listLocations = vi.fn()
const listEmployees = vi.fn()

// service ที่ component นี้ import - กันไม่ให้เทสต์ยิงเน็ตจริง
vi.mock('@/shared/services/asset.service', () => ({
  getAssetInventory: (...args: unknown[]) => getAssetInventory(...args),
}))
vi.mock('@/shared/services/master.service', () => ({
  listLocations: (...args: unknown[]) => listLocations(...args),
  listEmployees: (...args: unknown[]) => listEmployees(...args),
}))

const empty = { data: [], total: 0, page: 1, limit: 10 }

const LOCATIONS = [
  { id: 7, name: 'สำนักงานใหญ่' },
  { id: 9, name: 'โรงงาน 2' },
]

const EMPLOYEES = [
  { id: 21, name: 'สมชาย ใจดี', departmentId: 1, empId: 'EMP-021' },
  { id: 34, name: 'สมศรี มีสุข', departmentId: 1, empId: 'EMP-034' },
]

let wrapper: ReturnType<typeof mount> | null = null

/** เมานต์แล้วรอให้รอบโหลดแรก (watch immediate) กับ onMounted เดินจนจบ */
async function mountTable() {
  wrapper = mount(DepartmentTable, {
    props: { departmentId: '5', departmentName: 'บัญชี', companyCode: 'UBA' },
    global: {
      // สนใจเฉพาะแถบตัวกรอง - ตัวตาราง/แถบหน้า/modal ไม่เกี่ยวกับสิ่งที่เทสต์นี้เฝ้า
      stubs: { AssetTable: true, AppPagination: true, AssetDetailModal: true, Icon: true },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

/** พารามิเตอร์ของการเรียก getAssetInventory ครั้งล่าสุด */
function lastQuery() {
  // ไม่ใช้ .at(-1) - lib ของ tsconfig ชุดนี้ยังไม่ถึง ES2022 (vue-tsc จะฟ้อง TS2550)
  const calls = getAssetInventory.mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

/** กดปุ่ม "ตัวกรอง" แล้วกางหัวข้อที่ต้องการ (ลำดับเดียวกับที่ผู้ใช้ทำจริง) */
async function openField(label: string) {
  const toggle = wrapper!.findAll('button').find((b) => b.text().includes('ตัวกรอง'))!
  await toggle.trigger('click')
  const head = wrapper!.findAll('div.cursor-pointer').find((d) => d.text().includes(label))!
  await head.trigger('click')
  await nextTick()
}

beforeEach(() => {
  // jsdom ไม่มี scrollIntoView - onPageChange เรียกมันตอนเปลี่ยนหน้า (เลื่อนกลับหัวตาราง)
  Element.prototype.scrollIntoView = vi.fn()
  getAssetInventory.mockReset().mockResolvedValue(empty)
  listLocations.mockReset().mockResolvedValue(LOCATIONS)
  listEmployees.mockReset().mockResolvedValue({ data: EMPLOYEES, total: 2, page: 1, limit: 8 })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('แผงตัวกรองของตารางบน Dashboard', () => {
  it('ไม่มีแกน "แผนก" และ "บริษัท" ให้เลือกซ้ำ - สองอย่างนั้นเลือกจากด้านบนแล้ว', async () => {
    await mountTable()
    const toggle = wrapper!.findAll('button').find((b) => b.text().includes('ตัวกรอง'))!
    await toggle.trigger('click')

    const panelText = wrapper!.text()
    expect(panelText).toContain('ที่ตั้ง')
    expect(panelText).toContain('ผู้ครอบครอง')
    expect(panelText).toContain('สถานะ')
    expect(panelText).not.toContain('แผนก')
    expect(panelText).not.toContain('บริษัท')
  })

  it('เลือกที่ตั้งแล้วส่ง locationId ไปพร้อมแผนก/บริษัทเดิม', async () => {
    await mountTable()
    await openField('ที่ตั้ง')

    await wrapper!.findAll('button').find((b) => b.text().includes('โรงงาน 2'))!.trigger('click')
    await nextTick()

    expect(lastQuery()).toMatchObject({
      locationId: 9,
      departmentId: 5,
      companyCode: 'UBA',
      page: 1,
    })
  })

  it('กดที่ตั้งเดิมซ้ำ = ปลดตัวกรอง (ไม่ส่ง locationId)', async () => {
    await mountTable()
    await openField('ที่ตั้ง')

    const option = wrapper!.findAll('button').find((b) => b.text().includes('โรงงาน 2'))!
    await option.trigger('click')
    await nextTick()
    await option.trigger('click')
    await nextTick()

    expect(lastQuery().locationId).toBeUndefined()
  })

  it('เลือกผู้ครอบครองแล้วส่ง employeeId - ไม่ใช่ชื่อ', async () => {
    await mountTable()
    await openField('ผู้ครอบครอง')

    await wrapper!.findAll('button').find((b) => b.text().includes('สมชาย'))!.trigger('click')
    await nextTick()

    expect(lastQuery().employeeId).toBe(21)
  })

  it('รายชื่อพนักงานโหลดตอนกางหัวข้อ ไม่ใช่ตอนเปิดหน้า', async () => {
    await mountTable()
    expect(listEmployees).not.toHaveBeenCalled()

    await openField('ผู้ครอบครอง')
    expect(listEmployees).toHaveBeenCalled()
  })

  it('เลือกสถานะแล้วส่งค่าตาม enum ของ DB', async () => {
    await mountTable()
    await openField('สถานะ')

    // ★ เดิมเทสต์นี้เช็คว่าป้าย 'Missing' ส่งค่า 'Lost' (ป้ายกับค่าไม่ตรงกัน) - ถอดออกแล้ว
    //   พร้อมกับสถานะที่ SAP ไม่รู้จักทั้งสามค่า ตอนนี้เหลือ Active/Inactive ที่ป้ายตรงกับค่า
    //   เทสต์จึงเหลือหน้าที่เดียว: ยืนยันว่าค่าที่ส่งไป backend มาจากตัวเลือกจริง ไม่ใช่ค่าว่าง
    await wrapper!.findAll('button').find((b) => b.text().includes('Inactive'))!.trigger('click')
    await nextTick()

    expect(lastQuery().status).toBe('Inactive')
  })

  it('เปลี่ยนตัวกรองแล้วกลับไปหน้า 1 เสมอ', async () => {
    // ต้องมีของมากกว่าหนึ่งหน้า ไม่งั้นแถบเลขหน้าไม่ถูกเรนเดอร์ (v-if="total > LIMIT")
    getAssetInventory.mockResolvedValue({ ...empty, total: 45 })
    await mountTable()

    // จำลองว่าผู้ใช้อยู่หน้า 3 อยู่ก่อน
    wrapper!.findComponent({ name: 'AppPagination' }).vm.$emit('update:page', 3)
    await nextTick()
    expect(lastQuery().page).toBe(3)

    await openField('สถานะ')
    await wrapper!.findAll('button').find((b) => b.text().includes('Inactive'))!.trigger('click')
    await nextTick()

    expect(lastQuery().page).toBe(1)
  })

  it('ตัวกรองที่ติดอยู่ขึ้นเป็น chip และกดเพื่อปลดได้', async () => {
    await mountTable()
    await openField('ที่ตั้ง')
    await wrapper!.findAll('button').find((b) => b.text().includes('สำนักงานใหญ่'))!.trigger('click')
    await nextTick()

    const chip = wrapper!.findAll('button.badge').find((b) => b.text().includes('ที่ตั้ง:'))
    expect(chip?.text()).toContain('สำนักงานใหญ่')

    await chip!.trigger('click')
    await nextTick()
    expect(lastQuery().locationId).toBeUndefined()
  })
})
