// ตัวกรองของตารางบน Dashboard - ที่ตั้ง / ผู้ครอบครอง / สถานะ / Asset class / สามท่อนเลขสินทรัพย์
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
const listAssetClasses = vi.fn()
const listAssetPrefixes = vi.fn()
const listAssetNumberDepts = vi.fn()
const listAssetNumberYears = vi.fn()

// service ที่ component นี้ import - กันไม่ให้เทสต์ยิงเน็ตจริง
vi.mock('@/shared/services/asset.service', () => ({
  getAssetInventory: (...args: unknown[]) => getAssetInventory(...args),
}))
vi.mock('@/shared/services/master.service', () => ({
  listLocations: (...args: unknown[]) => listLocations(...args),
  listEmployees: (...args: unknown[]) => listEmployees(...args),
  listAssetClasses: (...args: unknown[]) => listAssetClasses(...args),
  listAssetPrefixes: (...args: unknown[]) => listAssetPrefixes(...args),
  listAssetNumberDepts: (...args: unknown[]) => listAssetNumberDepts(...args),
  listAssetNumberYears: (...args: unknown[]) => listAssetNumberYears(...args),
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
    props: { costCenterId: '5', departmentName: 'บัญชี', companyCode: 'UBA' },
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
  listAssetClasses.mockReset().mockResolvedValue([{ code: '1216401', name: 'เครื่องใช้สำนักงาน' }])
  listAssetPrefixes.mockReset().mockResolvedValue([{ code: 'COM', assets: 12 }])
  listAssetNumberDepts.mockReset().mockResolvedValue([{ dept: '775', assets: 12 }])
  listAssetNumberYears.mockReset().mockResolvedValue([{ year: '26', assets: 12 }])
})

/** เปิดแผงอย่างเดียว ไม่กางหัวข้อ - แถวสามท่อนเลขเลือกได้เลยโดยไม่ต้องกาง */
async function openPanel() {
  const toggle = wrapper!.findAll('button').find((b) => b.text().includes('ตัวกรอง'))!
  await toggle.trigger('click')
  await nextTick()
  await nextTick()
}

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
      // แกนของ dashboard คือศูนย์ต้นทุน ไม่ใช่แผนกที่ดูแล (0027 - ดู describe ท้ายไฟล์)
      costCenterId: 5,
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

  // ── รายชื่อผู้ครอบครองต้องเป็นของบริษัทที่กำลังดูอยู่ ──────────────────────
  //
  // อาการที่เคยเกิด: แผงเทชื่อคนทั้งเครือลงมา ทั้งที่ตารางข้างล่างมีแต่ของบริษัทเดียว
  // คนกดจึงต้องเดาว่าชื่อไหนเป็นของบริษัทที่กำลังดู
  describe('รายชื่อผู้ครอบครองผูกกับบริษัท', () => {
    it('ขอรายชื่อพร้อม companyCode ของหน้านั้น', async () => {
      await mountTable()
      await openField('ผู้ครอบครอง')

      const args = listEmployees.mock.calls[listEmployees.mock.calls.length - 1]![0] as Record<
        string,
        unknown
      >
      expect(args.companyCode).toBe('UBA')
    })

    it('ดู "ทุกบริษัท" = ไม่ส่ง companyCode (ลิสต์กลับไปเป็นทั้งเครือตามที่ตารางแสดง)', async () => {
      wrapper = mount(DepartmentTable, {
        props: { costCenterId: '', departmentName: '', companyCode: '' },
        global: {
          stubs: { AssetTable: true, AppPagination: true, AssetDetailModal: true, Icon: true },
        },
      })
      await nextTick()
      await nextTick()
      await openField('ผู้ครอบครอง')

      const args = listEmployees.mock.calls[listEmployees.mock.calls.length - 1]![0] as Record<
        string,
        unknown
      >
      expect(args.companyCode).toBeUndefined()
    })

    it('เปลี่ยนบริษัทแล้วโหลดรายชื่อใหม่ ไม่ใช้ชุดเดิมของบริษัทก่อนหน้า', async () => {
      await mountTable()
      await openField('ผู้ครอบครอง')
      expect(listEmployees).toHaveBeenCalledTimes(1)

      await wrapper!.setProps({ companyCode: 'UBP' })
      await nextTick()
      await nextTick()

      const args = listEmployees.mock.calls[listEmployees.mock.calls.length - 1]![0] as Record<
        string,
        unknown
      >
      expect(args.companyCode).toBe('UBP')
    })

    it('เปลี่ยนบริษัทแล้วปลดผู้ครอบครองที่เลือกไว้ - เขาอาจไม่มีตัวตนในบริษัทใหม่', async () => {
      await mountTable()
      await openField('ผู้ครอบครอง')
      await wrapper!.findAll('button').find((b) => b.text().includes('สมชาย'))!.trigger('click')
      await nextTick()
      expect(lastQuery().employeeId).toBe(21)

      await wrapper!.setProps({ companyCode: 'UBP' })
      await nextTick()
      await nextTick()

      expect(lastQuery().employeeId).toBeUndefined()
      expect(lastQuery().companyCode).toBe('UBP')
      // chip ต้องหายไปด้วย ไม่ใช่ค้างชื่อคนของบริษัทเก่าไว้บนหน้าจอ
      expect(wrapper!.findAll('button.badge').some((b) => b.text().includes('ผู้ครอบครอง:'))).toBe(
        false,
      )
    })
  })
})

// ── Asset class + สามท่อนเลขสินทรัพย์ (ชุดเดียวกับหน้า Asset Inventory) ──────────
describe('Asset class และ รหัสนำหน้า · Dept ID · ปี', () => {
  /**
   * ★ ลิสต์ตัวเลือกต้องแคบตามทั้งบริษัทและศูนย์ต้นทุนของ Dashboard - ไม่งั้นมีค่าที่ศูนย์นี้
   *   ไม่มีของ และจำนวนในวงเล็บเป็นของทั้งบริษัท ขัดกับตารางข้างล่าง
   * ★ โหลดตอนเปิดแผง ไม่ใช่ตอนเปิดหน้า - Dashboard เป็นหน้าแรกของทุกคน
   */
  it('โหลดตัวเลือกตอนเปิดแผง พร้อมบริษัทและศูนย์ต้นทุน', async () => {
    await mountTable()
    expect(listAssetPrefixes).not.toHaveBeenCalled()

    await openPanel()

    for (const fn of [listAssetClasses, listAssetPrefixes, listAssetNumberDepts, listAssetNumberYears]) {
      expect(fn).toHaveBeenCalledWith({ companyCode: 'UBA', costCenterId: 5 })
    }
  })

  it('เปิดแผงซ้ำในขอบเขตเดิมไม่ยิงซ้ำ แต่เปลี่ยนศูนย์ต้นทุนแล้วยิงใหม่', async () => {
    await mountTable()
    await openPanel()
    await openPanel() // ปิด
    await openPanel() // เปิดใหม่
    expect(listAssetPrefixes).toHaveBeenCalledTimes(1)

    await wrapper!.setProps({ costCenterId: '8' })
    await nextTick()
    expect(listAssetPrefixes).toHaveBeenCalledTimes(2)
    expect(listAssetPrefixes).toHaveBeenLastCalledWith({ companyCode: 'UBA', costCenterId: 8 })
  })

  it('เลือก Asset class แล้วส่งรหัสท่อนแรก และขึ้น chip', async () => {
    await mountTable()
    await openField('Asset class')

    await wrapper!.findAll('button').find((b) => b.text().includes('1216401'))!.trigger('click')
    await nextTick()

    expect(lastQuery()).toMatchObject({ assetClass: '1216401', costCenterId: 5, page: 1 })
    const chip = wrapper!.findAll('button.badge').find((b) => b.text().includes('Asset class:'))
    expect(chip?.text()).toContain('1216401 · เครื่องใช้สำนักงาน')
  })

  it('สาม dropdown ส่งสามพารามิเตอร์ต่อกันแบบ AND และขึ้น chip ครบ', async () => {
    await mountTable()
    await openPanel()

    const selects = wrapper!.findAll('select')
    await selects.find((s) => s.attributes('aria-label') === 'รหัสนำหน้า')!.setValue('COM')
    await selects.find((s) => s.attributes('aria-label') === 'Dept ID')!.setValue('775')
    await selects.find((s) => s.attributes('aria-label') === 'ปี')!.setValue('26')
    await nextTick()

    expect(lastQuery()).toMatchObject({
      assetPrefix: 'COM',
      assetNumberDept: '775',
      assetNumberYear: '26',
      costCenterId: 5,
    })
    const chips = wrapper!.findAll('button.badge').map((b) => b.text())
    expect(chips).toEqual(
      expect.arrayContaining([
        expect.stringContaining('รหัสนำหน้า: COM'),
        expect.stringContaining('Dept ID: 775'),
        expect.stringContaining('ปี: 26'),
      ]),
    )
  })

  it('เปลี่ยนบริษัทแล้วล้าง Asset class แต่สามท่อนเลขยังอยู่ (กติกาเดียวกับหน้า Asset Inventory)', async () => {
    await mountTable()
    await openField('Asset class')
    await wrapper!.findAll('button').find((b) => b.text().includes('1216401'))!.trigger('click')
    await wrapper!
      .findAll('select')
      .find((s) => s.attributes('aria-label') === 'ปี')!
      .setValue('26')
    await nextTick()

    await wrapper!.setProps({ companyCode: 'UBP' })
    await nextTick()
    await nextTick()

    expect(lastQuery().assetClass).toBeUndefined()
    expect(lastQuery().assetNumberYear).toBe('26')
    expect(lastQuery().companyCode).toBe('UBP')
  })
})

/**
 * แกนที่ตารางนี้ยิงต้องตรงกับแกนที่ตารางสรุปข้างบนใช้นับ (0027)
 *
 * ── อาการที่กันไว้ (เกิดจริงตอนย้าย dashboard ไป costCenterId)
 *
 * ตารางสรุปนับด้วย `asset.costCenterId` แต่ตารางนี้ยังส่ง `departmentId` ไปให้
 * GET /assets/inventory ซึ่งกรอง `asset.departmentId` - คอลัมน์นั้นเป็น NULL ทั้งทะเบียน
 * (รอคนกรอกตอนตรวจนับ) ผลคือกดศูนย์ต้นทุนที่ขึ้นว่ามีของ 116 ชิ้น แล้วได้
 * "ยังไม่มีรายการ" โดยไม่มี error ให้เห็นเลยสักตัว
 *
 * ★ เฝ้าที่ "พารามิเตอร์ที่ยิงออกไป" ไม่ใช่ที่ชื่อ prop - ชื่อ prop เปลี่ยนแล้ว typecheck
 *   จับได้เอง แต่การส่งค่าไปผิด key เป็นเรื่อง runtime ล้วน ๆ ที่ tsc มองไม่เห็น
 *   (ทั้งสอง key เป็น number ที่ optional เหมือนกันเป๊ะใน InventoryParams)
 */
describe('แกนที่ยิงไป API', () => {
  it('ส่ง costCenterId ไม่ใช่ departmentId', async () => {
    await mountTable()

    const q = lastQuery()
    expect(q.costCenterId).toBe(5)
    expect(q.departmentId).toBeUndefined()
  })

  it('ไม่เลือกศูนย์ต้นทุน = ไม่ส่งทั้งสอง key', async () => {
    wrapper = mount(DepartmentTable, {
      props: { costCenterId: '', departmentName: '', companyCode: 'UBA' },
      global: {
        stubs: { AssetTable: true, AppPagination: true, AssetDetailModal: true, Icon: true },
      },
    })
    await nextTick()
    await nextTick()

    const q = lastQuery()
    expect(q.costCenterId).toBeUndefined()
    expect(q.departmentId).toBeUndefined()
  })
})
