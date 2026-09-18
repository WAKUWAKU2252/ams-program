// ตัวเลขในวงเล็บของช่องเลือก "บริษัท" บน Dashboard
//
// อาการที่เคยเกิด: เลือกแผนกแล้วช่องบริษัทกลายเป็น "UBA (12)" ส่วน UBP/MIG เป็น (0)
// ทั้งที่สองบริษัทนั้นมีของเป็นพันชิ้น — เพราะหน้าจอเอา byCompany ของ "รอบที่กรองแผนก"
// มาทำลิสต์ตัวเลือก ซึ่ง backend กรองด้วย scope.departmentId มาแล้ว (แผนกเป็นของบริษัท
// เดียว บริษัทอื่นจึงเหลือศูนย์เสมอ)
//
// ★ เทสต์เฝ้าที่ "ตัวหนังสือใน <option>" ไม่ใช่ที่ตัวแปรภายใน — จุดที่ผู้ใช้เห็นและจุดที่
//   บั๊กโผล่คือที่เดียวกัน ถ้าเฝ้าที่ตัวแปร วันหลังมีคนเปลี่ยน template ไปอ่านจาก
//   data.byCompany ตรง ๆ อาการเดิมจะกลับมาโดยเทสต์ยังเขียว
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DashboardPage from '../DashboardPage.vue'
import type { CompanySummary, DashboardOverview } from '@/shared/services/dashboard.service'

const getDashboardOverview = vi.fn()

vi.mock('@/shared/services/dashboard.service', () => ({
  getDashboardOverview: (...args: unknown[]) => getDashboardOverview(...args),
}))

// ช่องที่เทสต์นี้ไม่ได้สนใจ - มันตรวจแค่ว่า dropdown บริษัทแสดงตัวเลือกครบไหม
const money = {
  bookedCost: 0,
  accumulatedDepreciation: 0,
  netBookValue: 0,
  depreciable: 0,
  fullyDepreciated: 0,
}

/** ยอดจริงของทั้งเครือ — ตัวเลขชุดที่ dropdown ต้องแสดงเสมอ */
const ALL_COMPANIES: CompanySummary[] = [
  { companyCode: 'UBA', companyName: 'UBA', assets: 2700, active: 2000, ...money },
  { companyCode: 'UBP', companyName: 'UBP', assets: 800, active: 700, ...money },
]

/** ยอดเดียวกันแต่ถูกกรองด้วยแผนกของ UBA แล้ว — บริษัทอื่นเหลือศูนย์ตามธรรมชาติ */
const SCOPED_TO_DEPARTMENT: CompanySummary[] = [
  { companyCode: 'UBA', companyName: 'UBA', assets: 12, active: 10, ...money },
  { companyCode: 'UBP', companyName: 'UBP', assets: 0, active: 0, ...money },
]

function overview(opts: {
  departmentId: number | null
  companyCode: string | null
  byCompany: CompanySummary[]
}): DashboardOverview {
  return {
    scope: {
      kind: 'ALL',
      departmentId: opts.departmentId,
      departmentName: opts.departmentId === null ? null : 'ฝ่ายบัญชี',
      locked: false,
      companyCode: opts.companyCode,
      companyName: opts.companyCode,
      companyLocked: false,
    },
    // asOfDate* เป็น null = ยังไม่มีข้อมูลค่าเสื่อมรายงวด ป้าย "ณ วันที่" จะไม่ขึ้น
    // ซึ่งไม่กระทบสิ่งที่ไฟล์นี้ทดสอบ (ตัวเลือกบริษัทบน dropdown)
    totals: {
      assets: 0,
      valued: 0,
      unvalued: 0,
      unvaluedStale: 0,
      unvaluedMissing: 0,
      asOfDateOldest: null,
      asOfDateLatest: null,
      ...money,
    },
    freshness: { fiscalYear: 2026, currentYearCount: 0, staleCount: 0, noDataCount: 0 },
    status: {
      active: 0,
      inactive: 0,
      activePercent: null,
      inactivePercent: null,
      breakdown: [],
    },
    // ไฟล์นี้ทดสอบตัวเลือกบริษัทบน dropdown ซึ่งอ่านจาก byCompany - แกนชั้นบัญชี
    // ไม่เกี่ยว จึงปล่อยว่างไว้ (กราฟจะขึ้นข้อความ "ยังไม่มีสินทรัพย์ในขอบเขตนี้")
    byAssetClass: [],
    byDepartment: [
      {
        departmentId: 5,
        departmentName: 'ฝ่ายบัญชี',
        companyCode: 'UBA',
        assets: 12,
        active: 10,
        ...money,
      },
    ],
    byCompany: opts.byCompany,
    remainingLife: null,
    depreciationRunoff: null,
    depreciationTrend: null,
    previousTotals: null,
  }
}

let wrapper: ReturnType<typeof mount> | null = null

/** ตัวหนังสือของทุก <option> ในช่องเลือกบริษัท (ช่องแรกของหน้า) */
function companyOptionTexts(): string[] {
  const select = wrapper!.findAll('select')[0]!
  return select.findAll('option').map((o) => o.text())
}

async function selectDepartment(value: string) {
  const select = wrapper!.findAll('select')[1]!
  await select.setValue(value)
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  getDashboardOverview.mockReset()
  // รอบแรก: ยังไม่กรองอะไร → ได้ยอดเต็มของทั้งเครือ
  getDashboardOverview.mockResolvedValue(
    overview({ departmentId: null, companyCode: null, byCompany: ALL_COMPANIES }),
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

async function mountPage() {
  wrapper = mount(DashboardPage, {
    global: {
      // สนใจเฉพาะช่องเลือกด้านบน — กราฟ/ตารางไม่เกี่ยวกับสิ่งที่เทสต์นี้เฝ้า
      stubs: {
        Icon: true,
        AppPagination: true,
        CompanySharePie: true,
        CompanySummaryTable: true,
        CompanyDepreciationRunoffLine: true,
        CompanyDepreciationTrendLine: true,
        DepartmentTable: true,
        RemainingLifeChart: true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('ช่องเลือกบริษัทบน Dashboard', () => {
  it('รอบแรกแสดงยอดเต็มของทุกบริษัท', async () => {
    await mountPage()

    const texts = companyOptionTexts()
    expect(texts.some((t) => t.includes('UBA') && t.includes('2,700'))).toBe(true)
    expect(texts.some((t) => t.includes('UBP') && t.includes('800'))).toBe(true)
  })

  it('เลือกแผนกแล้ว ยอดในวงเล็บของบริษัทต้องไม่เปลี่ยน และบริษัทอื่นต้องไม่กลายเป็น (0)', async () => {
    await mountPage()

    // เลือกบริษัทก่อน (ช่องแผนกถูกล็อกจนกว่าจะเลือกบริษัท - ชื่อแผนกซ้ำข้ามบริษัท)
    getDashboardOverview.mockResolvedValue(
      overview({ departmentId: null, companyCode: 'UBA', byCompany: ALL_COMPANIES }),
    )
    await wrapper!.findAll('select')[0]!.setValue('UBA')
    await nextTick()
    await nextTick()

    // แล้วค่อยเลือกแผนก — รอบนี้ backend ส่ง byCompany ที่ถูกกรองด้วยแผนกกลับมา
    getDashboardOverview.mockResolvedValue(
      overview({ departmentId: 5, companyCode: 'UBA', byCompany: SCOPED_TO_DEPARTMENT }),
    )
    await selectDepartment('5')

    const texts = companyOptionTexts()
    expect(texts.some((t) => t.includes('UBA') && t.includes('2,700'))).toBe(true)
    expect(texts.some((t) => t.includes('UBP') && t.includes('800'))).toBe(true)
    // อาการเดิม: UBA กลายเป็น (12) เท่ากับยอดของแผนก และ UBP เป็น (0)
    expect(texts.some((t) => t.includes('(12)'))).toBe(false)
    expect(texts.some((t) => t.includes('(0)'))).toBe(false)
  })

  it('ล้างแผนกทิ้งแล้วยังเป็นยอดเต็มเหมือนเดิม', async () => {
    await mountPage()

    getDashboardOverview.mockResolvedValue(
      overview({ departmentId: null, companyCode: 'UBA', byCompany: ALL_COMPANIES }),
    )
    await wrapper!.findAll('select')[0]!.setValue('UBA')
    await nextTick()
    await nextTick()

    getDashboardOverview.mockResolvedValue(
      overview({ departmentId: 5, companyCode: 'UBA', byCompany: SCOPED_TO_DEPARTMENT }),
    )
    await selectDepartment('5')

    getDashboardOverview.mockResolvedValue(
      overview({ departmentId: null, companyCode: 'UBA', byCompany: ALL_COMPANIES }),
    )
    await selectDepartment('')

    const texts = companyOptionTexts()
    expect(texts.some((t) => t.includes('UBA') && t.includes('2,700'))).toBe(true)
    expect(texts.some((t) => t.includes('UBP') && t.includes('800'))).toBe(true)
  })
})
