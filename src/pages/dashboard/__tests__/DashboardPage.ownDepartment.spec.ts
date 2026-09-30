// แผนกตั้งต้น = แผนกของผู้ใช้เอง และ "เปิดหน้าหนึ่งครั้ง = ยิง API ครั้งเดียว"
//
// ── สองอาการที่ไฟล์นี้เฝ้า (เคยเกิดจริงทั้งคู่)
//
// 1. **ยิงซ้ำตอนเปิดหน้า** - load() เขียน selectedCompanyCode/selectedDepartmentId ด้วยค่า
//    จาก scope ทุกรอบ รอบแรกจึงเป็นการเปลี่ยนค่าจริงเสมอ ('' → 'UBA') แล้วไปกระตุ้น watch
//    ให้ยิงซ้ำทั้งที่ผู้ใช้ยังไม่ได้แตะอะไร - load() ไม่มีตัวยกเลิกคำขอเก่า สองคำขอที่ซ้อนกัน
//    จึงเขียนทับกันสลับลำดับได้ (ดูคอมเมนต์ที่ ready ใน DashboardPage.vue)
//
// 2. **เลือก "ทุกศูนย์ต้นทุน" ไม่ได้** - ถ้าหน้าจอส่งธง defaultOwnDepartment ไปทุกรอบ
//    backend จะตั้งแผนกตัวเองให้ซ้ำทุกครั้ง ผู้ใช้จะถูกเด้งกลับจนเลือกไม่ได้เลย
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DashboardPage from '../DashboardPage.vue'
import type { DashboardOverview, DepartmentSummary } from '@/shared/services/dashboard.service'

const getDashboardOverview = vi.fn()

vi.mock('@/shared/services/dashboard.service', () => ({
  getDashboardOverview: (...args: unknown[]) => getDashboardOverview(...args),
}))

const money = {
  bookedCost: 0,
  accumulatedDepreciation: 0,
  netBookValue: 0,
  depreciable: 0,
  fullyDepreciated: 0,
}

/** ลิสต์แผนกเต็มของบริษัท - สิ่งที่ dropdown ต้องมีให้เลือกเสมอ */
const ALL_DEPARTMENTS: DepartmentSummary[] = [
  { departmentId: 35, departmentName: 'Information Technology', companyCode: 'UBA', assets: 54, active: 50, ...money },
  { departmentId: 7, departmentName: 'Human Resources', companyCode: 'UBA', assets: 3, active: 3, ...money },
]

/**
 * ผลลัพธ์ของรอบที่ backend ตั้งแผนกตั้งต้นให้เอง
 *
 * ★ byDepartment เหลือแถวเดียวโดยตั้งใจ - ถูกกรองตาม scope แล้ว ซึ่งเป็นเหตุผลที่ต้องมี
 *   departmentOptions แยกมาต่างหาก (ไม่งั้น dropdown จะมีแค่ "ทุกศูนย์ต้นทุน")
 */
function overview(opts: {
  departmentId: number | null
  departmentOptions?: DepartmentSummary[] | null
}): DashboardOverview {
  return {
    scope: {
      kind: 'ALL',
      departmentId: opts.departmentId,
      departmentName: opts.departmentId === null ? null : 'Information Technology',
      companyCode: 'UBA',
      companyName: 'UBA',
      companyLocked: true,
    },
    departmentOptions: opts.departmentOptions ?? null,
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
    status: { active: 0, inactive: 0, activePercent: null, inactivePercent: null, breakdown: [] },
    byAssetClass: [],
    byDepartment:
      opts.departmentId === null ? ALL_DEPARTMENTS : [ALL_DEPARTMENTS[0] as DepartmentSummary],
    byCompany: [{ companyCode: 'UBA', companyName: 'UBA', assets: 2700, active: 2000, ...money }],
    remainingLife: null,
    depreciationRunoff: null,
    depreciationTrend: null,
    previousTotals: null,
  }
}

let wrapper: ReturnType<typeof mount> | null = null

async function mountPage() {
  wrapper = mount(DashboardPage, {
    global: {
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
  await nextTick()
  return wrapper
}

/** ช่องเลือกศูนย์ต้นทุนคือ select ตัวที่สองของหน้า (ตัวแรกคือบริษัท) */
function departmentSelect() {
  return wrapper!.findAll('select')[1]!
}

beforeEach(() => {
  getDashboardOverview.mockReset()
  // backend ตั้งแผนก 35 ให้ตั้งแต่คำขอแรก พร้อมส่งลิสต์ตัวเลือกเต็มมาด้วย
  getDashboardOverview.mockResolvedValue(
    overview({ departmentId: 35, departmentOptions: ALL_DEPARTMENTS }),
  )
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('แผนกตั้งต้นของ Dashboard', () => {
  it('เปิดหน้าแล้วยิง API ครั้งเดียว ไม่ใช่สองครั้ง', async () => {
    await mountPage()

    expect(getDashboardOverview).toHaveBeenCalledTimes(1)
  })

  it('คำขอแรกขอค่าตั้งต้นไปด้วย และช่องเลือกเด้งไปที่แผนกที่ backend ตั้งให้', async () => {
    await mountPage()

    expect(getDashboardOverview).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOwnDepartment: true }),
    )
    expect(departmentSelect().element.value).toBe('35')
  })

  it('ยังเลือกแผนกอื่นได้ - dropdown ต้องมีตัวเลือกครบ ไม่ใช่เหลือแผนกเดียว', async () => {
    await mountPage()

    const texts = departmentSelect().findAll('option').map((o) => o.text())
    expect(texts.some((t) => t.includes('Information Technology'))).toBe(true)
    expect(texts.some((t) => t.includes('Human Resources'))).toBe(true)
    expect(texts.some((t) => t.includes('ทุกศูนย์ต้นทุน'))).toBe(true)
  })

  it('กดเลือก "ทุกศูนย์ต้นทุน" แล้วต้องไม่ถูกเด้งกลับไปแผนกตัวเอง', async () => {
    await mountPage()
    getDashboardOverview.mockResolvedValue(
      overview({ departmentId: null, departmentOptions: null }),
    )

    await departmentSelect().setValue('')
    await nextTick()
    await nextTick()

    expect(getDashboardOverview).toHaveBeenCalledTimes(2)
    // ★ รอบที่สองห้ามมีธงค่าตั้งต้นติดไป ไม่งั้น backend จะตั้งแผนกให้ใหม่ทุกครั้ง
    const calls = getDashboardOverview.mock.calls
    const lastCall = calls[calls.length - 1]![0]
    expect(lastCall.defaultOwnDepartment).toBeFalsy()
    expect(lastCall.departmentId).toBeUndefined()
    expect(departmentSelect().element.value).toBe('')
  })
})
