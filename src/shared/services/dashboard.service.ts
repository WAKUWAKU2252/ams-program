// services/dashboard.service.ts
//
// ตรงกับ GET /dashboard/overview ของ backend (อ่านอย่างเดียว)
//
// ★ ขอบเขตที่เห็นเป็นของ backend ไม่ใช่ของหน้าจอ - หน้าจอส่ง departmentId ไปได้เสมอ
//   แต่ backend เป็นคนตัดสินว่าจะรับหรือทิ้ง แล้วบอกกลับมาใน `scope` ว่าตัวเลขที่ได้
//   เป็นของแผนกไหนจริง ๆ หน้าจอต้องอ่าน scope ที่ตอบกลับมา ห้ามเดาจากค่าที่ตัวเองส่งไป
//   (พนักงานทั่วไปที่แก้ URL เองจะได้ตัวเลขของแผนกตัวเองกลับมาเสมอ)
import { request } from './httpClient'

/**
 * ALL            เห็นได้ทุกแผนก - เลือกกรองเองได้
 * OWN_DEPARTMENT ถูกล็อกไว้ที่แผนกตัวเอง (พนักงานทั่วไป)
 * UNLINKED       บัญชียังไม่ผูกกับข้อมูลพนักงาน จึงบอกไม่ได้ว่าอยู่แผนกไหน = ไม่มีอะไรให้แสดง
 */
export type DashboardScopeKind = 'ALL' | 'OWN_DEPARTMENT' | 'UNLINKED'

/**
 * สถานะสินทรัพย์ - SAP เป็นเจ้าของ มีสองค่าเท่านั้น (ดูเหตุผลเต็มที่ shared/utils/asset-status.ts)
 * ห้ามเติมค่าที่ SAP ไม่รู้จักกลับมา - แถวที่ถือค่านั้นจะหลุดจาก SAP ถาวร
 */
export type AssetStatus = 'Active' | 'Inactive'

export interface DashboardScope {
  kind: DashboardScopeKind
  /** แผนกที่ตัวเลขชุดนี้นับมาจริง - null = รวมทุกแผนก */
  departmentId: number | null
  departmentName: string | null
  /** true = ต้องปิดช่องเลือกแผนก (เลือกไปก็ไม่มีผล) */
  locked: boolean
  /**
   * บริษัทที่ตัวเลขชุดนี้นับมา - null = รวมทุกบริษัท
   * ถูกล็อกตาม role เหมือนแผนกแล้ว (ดู companyLocked) ห้ามเดาจากค่าที่หน้าจอส่งไป
   */
  companyCode: string | null
  companyName: string | null
  /** true = ต้องปิดช่องเลือกบริษัท (เลือกไปก็ไม่มีผล backend ทิ้งค่าที่ส่งไปอยู่ดี) */
  companyLocked: boolean
}

/**
 * หนึ่งแถวต่อหนึ่งบริษัท - ใช้ทั้งเป็นตัวเลือกใน dropdown และตัวเลขเทียบรายบริษัท
 *
 * ★ ไม่ถูกกรองด้วยบริษัทที่ "เลือกอยู่" (ต่างจาก byDepartment) จึงเอามาทำลิสต์ตัวเลือก
 *   ได้ตรง ๆ โดยไม่ต้องระวังว่าลิสต์จะยุบเหลือตัวเดียวเหมือนของแผนก
 *
 * ★ แต่ถูกกรองด้วยบริษัทที่ "ถูกล็อก" - scope.companyLocked = true เมื่อไหร่ ก้อนนี้จะ
 *   เหลือแถวเดียวเสมอ ซึ่งถูกแล้ว เพราะไม่มีตัวเลือกอื่นให้กดตั้งแต่แรก
 */
export interface CompanySummary {
  companyCode: string
  companyName: string
  assets: number
  active: number
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
}

export interface DashboardTotals {
  /** จำนวนชิ้นในทะเบียน (ออกเลขแล้วเท่านั้น ไม่รวม draft/ยกเลิก) */
  assets: number
  /** ชิ้นที่มีตัวเลขบัญชีครบ - ยอดเงินสามก้อนข้างล่างนับจากชุดนี้ชุดเดียวกันหมด */
  valued: number
  /** ชิ้นที่ยังไม่มีตัวเลขบัญชีจาก SAP - ไม่ถูกนับในยอดเงิน */
  unvalued: number
  /** null = ไม่มีชิ้นไหนมีตัวเลขบัญชีเลย (ต่างจาก 0 ที่แปลว่ารวมแล้วได้ศูนย์จริง) */
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
}

export interface DashboardFreshness {
  fiscalYear: number
  currentYearCount: number
  /** มีตัวเลขบัญชี แต่เป็นของปีเก่า */
  staleCount: number
  noDataCount: number
}

export interface StatusCount {
  status: AssetStatus
  count: number
}

export interface DashboardStatus {
  active: number
  inactive: number
  /** null = ไม่มีชิ้นให้คิดเปอร์เซ็นต์ (ต่างจาก 0 ที่แปลว่าไม่มี Active สักชิ้น) */
  activePercent: number | null
  inactivePercent: number | null
  breakdown: StatusCount[]
}

export interface DepartmentSummary {
  /** null = ชิ้นที่ยังไม่ได้ระบุแผนก */
  departmentId: number | null
  departmentName: string | null
  /**
   * บริษัทเจ้าของแผนก - null เฉพาะแถว "ยังไม่ระบุแผนก" ที่ไม่ใช่แผนกจริง
   *
   * ★ ต้องแสดงกำกับเมื่อดู "ทุกบริษัท" - ชื่อแผนกซ้ำข้ามบริษัทจริง 55 ชื่อ บางชื่อโผล่ 3 ครั้ง
   *   เลือกบริษัทแล้ว backend กรองลิสต์ให้เหลือบริษัทเดียว จึงไม่ต้องแสดงซ้ำ
   */
  companyCode: string | null
  assets: number
  active: number
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
}

/**
 * การกระจายของอายุคงเหลือในแผนกที่เลือก - มีเฉพาะตอนเลือกแผนกเดียว
 *
 * ★ noDepreciation กับ noData แยกออกจาก buckets โดยตั้งใจ ห้ามเอาไปวาดรวมเป็นแท่ง
 *   บนแกนเวลา - "ไม่คิดค่าเสื่อม" (ที่ดิน) กับ "ไม่มีข้อมูล" ไม่ใช่ช่วงเวลา
 */
export interface DashboardRemainingLife {
  /** เรียงตามแกนเวลามาแล้วจาก backend - วาดตามลำดับนี้ได้เลย */
  buckets: { label: string; count: number }[]
  noDepreciation: number
  noData: number
}

export interface DashboardOverview {
  scope: DashboardScope
  totals: DashboardTotals
  freshness: DashboardFreshness
  status: DashboardStatus
  byDepartment: DepartmentSummary[]
  /** สรุปรายบริษัท - ไม่ถูกกรองด้วยบริษัทที่เลือก ใช้เป็นตัวเลือกใน dropdown ได้เลย */
  byCompany: CompanySummary[]
  /** null = ยังไม่ได้เลือกแผนก จึงไม่มีข้อมูลชุดนี้ (ดู DashboardRemainingLife) */
  remainingLife: DashboardRemainingLife | null
}

/** GET /dashboard/overview - ไม่ส่ง departmentId = ทุกแผนกเท่าที่ role นั้นเห็นได้ */
export function getDashboardOverview(
  params: { departmentId?: number; companyCode?: string } = {},
): Promise<DashboardOverview> {
  const query = new URLSearchParams()
  if (params.departmentId) query.set('departmentId', String(params.departmentId))
  if (params.companyCode) query.set('companyCode', params.companyCode)

  const qs = query.toString()
  return request<DashboardOverview>(`/dashboard/overview${qs ? `?${qs}` : ''}`, { method: 'GET' })
}
