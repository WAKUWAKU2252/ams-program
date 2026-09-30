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
 * ALL       เลือกแผนกไหนก็ได้ในบริษัทที่ตัวเองเห็น - ทุก role ได้ค่านี้
 * UNLINKED  บัญชียังไม่ผูกกับข้อมูลพนักงาน จึงบอกไม่ได้ว่าอยู่ **บริษัท** ไหน = ไม่มีอะไรให้แสดง
 *
 * ★ เลิกล็อกแผนกแล้ว (2026-09-22) ค่า OWN_DEPARTMENT ถูกถอดทิ้ง - เหลือล็อกแค่บริษัท
 *   ซึ่งเป็นเส้นระหว่างนิติบุคคล (ดู companyLocked) เหตุผลเต็มอยู่ฝั่ง backend
 */
export type DashboardScopeKind = 'ALL' | 'UNLINKED'

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
 * ★ ไม่ถูกกรองด้วยบริษัทที่ "เลือกอยู่" (ต่างจาก byDepartment) ลิสต์จึงไม่ยุบเหลือตัวเดียว
 *   เวลาเลือกบริษัท
 *
 * ★ แต่ถูกกรองด้วยบริษัทที่ "ถูกล็อก" - scope.companyLocked = true เมื่อไหร่ ก้อนนี้จะ
 *   เหลือแถวเดียวเสมอ ซึ่งถูกแล้ว เพราะไม่มีตัวเลือกอื่นให้กดตั้งแต่แรก
 *
 * ★★ **ถูกกรองด้วยแผนกที่เลือกอยู่** (summarizeByCompany รับ scope.departmentId) จึง
 *    เอามาทำลิสต์ตัวเลือกตรง ๆ ทุกรอบไม่ได้ - รอบที่ส่ง departmentId ไป ทุกแถวที่ไม่ใช่
 *    บริษัทของแผนกนั้นจะเป็น assets: 0 (แผนกเป็นของบริษัทเดียว) หน้าจอต้องเก็บลิสต์จาก
 *    "รอบที่ไม่ได้กรองแผนก" ไว้ใช้แทน ดู companyOptions ใน DashboardPage.vue
 */
export interface CompanySummary {
  companyCode: string
  companyName: string
  assets: number
  active: number
  /** ชิ้นที่มีราคาทุนจริง - ตัวหารของ fullyDepreciated (ห้ามใช้ assets แทน ดู backend) */
  depreciable: number
  /** ตัดค่าเสื่อมครบแล้วกี่ชิ้น - มูลค่าคงเหลือลงมาถึงมูลค่าซากแล้ว */
  fullyDepreciated: number
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
}

export interface DashboardTotals {
  /** จำนวนชิ้นในทะเบียน (ออกเลขแล้วเท่านั้น ไม่รวม draft/ยกเลิก) */
  assets: number
  /** ชิ้นที่มีตัวเลขบัญชีครบ - ยอดเงินสามก้อนข้างล่างนับจากชุดนี้ชุดเดียวกันหมด */
  valued: number
  /** ชิ้นที่ไม่ถูกนับในยอดเงิน - เท่ากับ unvaluedStale + unvaluedMissing เสมอ */
  unvalued: number
  /**
   * ตัวเลขค้างปีเก่า - มีตัวเลขบัญชีอยู่ แต่เป็นของปีบัญชีก่อนหน้า
   * ★★ **ไม่ใช่งานค้าง** คือของที่ SAP เลิกส่งตัวเลขใหม่ (ส่วนใหญ่ตัดจำหน่ายไปแล้ว)
   *    ห้ามเขียนรวมกับ unvaluedMissing เป็นก้อนเดียว - คนอ่านจะนึกว่ามีงานค้างเป็นร้อย
   */
  unvaluedStale: number
  /** ยังไม่มีตัวเลขบัญชี - **อันนี้คืองานค้างจริง** รอ SAP ส่งตัวเลขมา */
  unvaluedMissing: number
  /** null = ไม่มีชิ้นไหนมีตัวเลขบัญชีเลย (ต่างจาก 0 ที่แปลว่ารวมแล้วได้ศูนย์จริง) */
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
  /**
   * ยอดเงินสามก้อนข้างบนเป็นของ ณ ช่วงวันไหน - 'YYYY-MM-DD' หรือ null ถ้ายังไม่มีข้อมูล
   *
   * **ต้องแสดงคู่กับยอดเสมอ** SAP ลงค่าเสื่อมเดือนละครั้งตอนปิดงวด ยอดจึงนิ่งทั้งเดือน
   * แล้วกระโดดทีเดียว ไม่บอกวันที่ = คนอ่านว่าระบบค้าง
   *
   * สองค่าต่างกันเมื่อดูรวมหลายบริษัทที่ปิดงวดไม่พร้อมกัน - เท่ากันเมื่อกรองบริษัทเดียว
   */
  asOfDateOldest: string | null
  asOfDateLatest: string | null
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

export interface AssetClassSummary {
  /** null = ชิ้นที่ยังไม่มีชั้นบัญชี (UBA มี 35 ชิ้น ล้วนเป็นของทดสอบ) */
  assetClass: string | null
  /**
   * ชื่อบัญชีจาก gl_account - null = ยังไม่ได้ import ชื่อของรหัสนี้ ให้หน้าจอโชว์รหัสดิบแทน
   *
   * ★ อย่าโชว์คำว่า "ไม่ระบุ" เมื่อ accountName เป็น null แต่ assetClass มีค่า - รหัสดิบ
   *   อ่านออกและเทียบกับรายงานของ finance ได้ ส่วน "ไม่ระบุ" ทำให้ดูเหมือนข้อมูลหาย
   */
  accountName: string | null
  assets: number
  active: number
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
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

/**
 * เส้นสะสม "ราคาทุนกี่ % ตัดค่าเสื่อมครบภายในอีก n ปี" แยกรายบริษัท
 *
 * points[n] = ราคาทุนของชิ้นที่ remainingLifeMonths ≤ n×12 ÷ ราคาทุนที่คิดค่าเสื่อมทั้งหมด
 * points[0] จึงคือ "ตัดครบไปแล้วกี่ %" คิดเป็นบาท (ต่างจากป้ายเดิมของแท่งซ้อนที่นับเป็นชิ้น)
 *
 * ★ เส้นต้องไต่ขึ้นอย่างเดียว ห้ามลด — เซตของปีที่ n ครอบเซตของปีก่อนอยู่แล้วโดยนิยาม
 *   เห็นเส้นลงเมื่อไหร่คือ backend คำนวณพัง ไม่ใช่ข้อมูลแปลก
 * ★ landCost อยู่ **นอกเส้น** ไม่ใช่จุดบนแกน — ที่ดินไม่มีวันตัดครบ
 */
export interface DepreciationRunoffCompany {
  companyCode: string
  companyName: string
  /** index = ปีนับจากนี้ (0 = ตัดครบไปแล้ว) ยาวเท่ากันทุกบริษัท */
  points: number[]
  /** ตัวหาร — ราคาทุนของชิ้นที่คิดค่าเสื่อมและมีข้อมูลครบ */
  depreciableCost: number
  /** ที่ดิน/ของที่ไม่คิดค่าเสื่อม — รายงานข้างกราฟ ห้ามวาดลงเส้น */
  landCost: number
  /** ชิ้นที่ตอบไม่ได้ (ไม่มีแถวบัญชี หรือ SAP ไม่ให้อายุ/ราคาทุนมา) */
  noDataPieces: number
}

export interface DashboardDepreciationRunoff {
  /** จุดสุดท้ายของแกน X — ปีที่ไกลกว่านี้ถูกยุบรวมเข้าจุดนี้ */
  horizonYears: number
  companies: DepreciationRunoffCompany[]
}

/**
 * เส้นค่าเสื่อมสะสมตั้งแต่ต้นปีบัญชี รายบริษัท — สลับกับ DashboardDepreciationRunoff บนการ์ดเดียวกัน
 *
 * ★ เป็นยอด "สะสม" ไม่ใช่รายงวด เพราะ SAP คิดค่าเสื่อมรายวัน ยอดรายงวดจึงแกว่งตาม
 *   จำนวนวันในเดือน (ก.พ. ต่ำกว่าเพื่อนราว 10% ทุกบริษัทพร้อมกัน) ซึ่งไม่ใช่สัญญาณ
 * ★ นับเฉพาะงวดที่ลงบัญชีแล้ว — งวดที่ยังไม่มีเลขใบสำคัญยังไม่อยู่ในสมุดรายวัน
 */
export interface DepreciationTrendCompany {
  companyCode: string
  companyName: string
  /**
   * ยาว 12 ช่องเสมอ — index 0 = งวด 1 … index 11 = งวด 12
   *
   * ★★ null = งวดนั้นยังไม่ลงบัญชี **ห้ามวาดเป็น 0** ต้องให้เส้นขาดตรงนั้น
   *    แกน X ตรึง 12 งวด เส้นที่หยุดกลางทางคือคำตอบว่าบริษัทไหนปิดงวดถึงไหนแล้ว
   */
  points: (number | null)[]
  /** งวดสุดท้ายที่นับได้ (ต่อเนื่องจากงวด 1 — เจอช่องว่างแล้วตัด ดูเหตุผลฝั่ง backend) */
  lastClosedPeriod: number
  /** วันสิ้นงวดของ lastClosedPeriod — เอาไปเขียนป้าย ห้ามเดาจากเลขงวด */
  lastToDate: string | null
}

export interface DashboardDepreciationTrend {
  fiscalYear: number
  /** เฉพาะบริษัทที่ลงบัญชีอย่างน้อยหนึ่งงวด */
  companies: DepreciationTrendCompany[]
}

/**
 * ยอดรวมของขอบเขตเดียวกันจาก snapshot เดือนล่าสุด — ฐานของส่วนต่างบนการ์ด KPI
 *
 * ★ null = ยังไม่มี snapshot ให้เทียบ (ระบบเพิ่งเปิดใช้) หน้าจอต้องเงียบ ไม่ใช่แสดง 0%
 *   เพราะ 0% อ่านว่า 'ไม่เปลี่ยนเลย' ซึ่งคนละคำตอบกับ 'ยังไม่รู้'
 * ★ periodMonth คือเดือนที่เทียบจริง ไม่ใช่ 'เดือนก่อน' เสมอไป — ต้องแสดงให้ผู้ใช้เห็น
 */
export interface DashboardTotalsBaseline {
  periodMonth: string
  assets: number
  valued: number
  bookedCost: number | null
  accumulatedDepreciation: number | null
}

export interface DashboardOverview {
  scope: DashboardScope
  /**
   * ลิสต์ตัวเลือกของ dropdown เลือกแผนก - ไม่ถูกกรองด้วยแผนกที่เลือกอยู่
   *
   * มีค่าเฉพาะรอบที่ backend ตั้งแผนกตั้งต้นให้เอง (ส่ง defaultOwnDepartment ไป) เพราะรอบนั้น
   * byDepartment เหลือแถวเดียว เติมตัวเลือกจากก้อนนั้นไม่ได้ - รอบอื่นเป็น null แล้วใช้
   * byDepartment ตามเดิม (ดู DashboardOverview.departmentOptions ฝั่ง backend)
   */
  departmentOptions: DepartmentSummary[] | null
  totals: DashboardTotals
  freshness: DashboardFreshness
  status: DashboardStatus
  byDepartment: DepartmentSummary[]
  /** สรุปรายชั้นบัญชี - แกนเดียวกับที่รายงานของ finance ใช้ (รหัสเต็ม ไม่ใช่ category) */
  byAssetClass: AssetClassSummary[]
  /** สรุปรายบริษัท - ไม่ถูกกรองด้วย "บริษัท" ที่เลือก แต่ถูกกรองด้วย "แผนก" (ดู CompanySummary) */
  byCompany: CompanySummary[]
  /** null = ยังไม่ได้เลือกแผนก จึงไม่มีข้อมูลชุดนี้ (ดู DashboardRemainingLife) */
  remainingLife: DashboardRemainingLife | null
  /** null = เลือกบริษัทหรือแผนกอยู่ กราฟนี้มีไว้เทียบบริษัท เหลือเส้นเดียวก็ไม่มีอะไรเทียบ */
  depreciationRunoff: DashboardDepreciationRunoff | null
  /** เส้นค่าเสื่อมสะสมของปีบัญชีล่าสุด - null ด้วยเงื่อนไขเดียวกับ depreciationRunoff (การ์ดเดียวกัน) */
  depreciationTrend: DashboardDepreciationTrend | null
  /** ฐานเปรียบเทียบของส่วนต่างบนการ์ด KPI - null = ยังเทียบไม่ได้ */
  previousTotals: DashboardTotalsBaseline | null
}

/** GET /dashboard/overview - ไม่ส่ง departmentId = ทุกแผนกเท่าที่ role นั้นเห็นได้ */
export function getDashboardOverview(
  params: {
    departmentId?: number
    companyCode?: string
    /**
     * "ยังไม่ได้เลือกแผนกเอง ตั้งให้ด้วย" - ส่งเฉพาะรอบแรกที่เปิดหน้าเท่านั้น
     *
     * backend จะตั้งแผนกของผู้ใช้ให้ **เฉพาะเมื่อแผนกนั้นมีของในบริษัทที่กำลังดู** ถ้าไม่มี
     * ก็คืน departmentId = null มาตามเดิม (ไม่งั้น 62% ของบัญชีจะเปิดมาเจอหน้าศูนย์ทุกช่อง
     * - ดู ownDepartmentDefault ฝั่ง backend) หน้าจอจึงอ่านผลจาก scope เหมือนเดิม
     * ห้ามเดาเองว่าแผนกไหนถูกตั้งให้
     */
    defaultOwnDepartment?: boolean
  } = {},
): Promise<DashboardOverview> {
  const query = new URLSearchParams()
  if (params.departmentId) query.set('departmentId', String(params.departmentId))
  if (params.companyCode) query.set('companyCode', params.companyCode)
  if (params.defaultOwnDepartment) query.set('defaultOwnDepartment', 'true')

  const qs = query.toString()
  return request<DashboardOverview>(`/dashboard/overview${qs ? `?${qs}` : ''}`, { method: 'GET' })
}

// ── รายงานสรุปรายชั้นบัญชี (ชีต Asset-สรุป / DEP-สรุป ของ finance) ───────────

/**
 * หนึ่งแถวของ Asset-สรุป
 *
 * ★ คอลัมน์ "ยอดคงเหลือ" กับ "ความเคลื่อนไหว" อ้างช่วงเวลาคนละแบบโดยตั้งใจ
 *   ยอดคงเหลือ = ณ สิ้นงวด toPeriod (สะสมจากงวด 1 เสมอ)
 *   ความเคลื่อนไหว = เฉพาะ fromPeriod..toPeriod
 *   ตอน fromPeriod = 1 (แบบที่ finance ใช้) สองอย่างนี้ตรงกันพอดี
 */
export interface AssetSummaryRow {
  /** Balance Account ในไฟล์ Excel */
  assetClass: string | null
  /** Account Name ในไฟล์ Excel - null = ยังไม่ import ชื่อ ให้โชว์รหัสดิบ ห้ามเขียน "ไม่ระบุ" */
  accountName: string | null
  /** ชื่อหมวดจากท่อนแรกของรหัสบัญชี - ใช้ทำตัวกรอง "Asset class" ที่คนอ่านออก */
  categoryName: string | null
  /** ชื่อแผนกจากท่อนที่ 3 (cost center) - ใช้ทำตัวกรอง "Department" */
  departmentName: string | null
  assets: number
  /** ชิ้นที่ SAP ยังไม่ส่งตัวเลขมา - ยอดเงินในแถวไม่ได้ครอบคลุมชิ้นพวกนี้ */
  assetsWithoutValue: number
  /**
   * ชิ้นที่ยังไม่ได้ซื้อ ณ งวดที่เลือก - นับใน `assets` แต่ใส่ 0 เข้ายอดเงิน
   *
   * คนละกลุ่มกับ `assetsWithoutValue` (ไม่ทับกัน) บวกกันได้ = ชิ้นที่ไม่ได้อยู่ในยอดเงินทั้งหมด
   * มีค่าเฉพาะตอนดูงวดย้อนหลังของปีที่มีการซื้อเข้ามา
   */
  assetsNotYetAcquired: number
  // ── ยอดคงเหลือ: ณ สิ้นงวด toPeriod (สะสมจากงวด 1 เสมอ) ──
  openingCost: number | null
  openingDepreciation: number | null
  /**
   * มูลค่ายกมาต้นงวด = openingCost − openingDepreciation
   *
   * รายงานของ finance บวกเทอม Accum. Write-Up on Start ด้วย แต่ AMS ไม่ได้เก็บคอลัมน์นั้น
   * (วัดแล้วเป็น 0 ทุกแถว และ connector error ถ้าเจอค่าที่ไม่ใช่ 0) ตัวเลขจึงตรงกันอยู่ดี
   */
  openingNetBookValue: number | null
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
  // ── ความเคลื่อนไหว: เฉพาะช่วง fromPeriod..toPeriod ──
  // ★ null = มีงวดในช่วงที่ยังไม่ได้ดึงข้อมูลมา ไม่ใช่ 0 - ห้ามวาดเป็นศูนย์
  capitalization: number | null
  retiredCost: number | null
  /** Retired NBV - มูลค่าคงเหลือของของที่ตัดจำหน่าย ณ วันตัด */
  retiredNetBookValue: number | null
  retiredDepreciation: number | null
  /** Transferred APC - วัดแล้วเป็น 0 ทุกแถว แต่เป็นค่าจริงจาก SAP ไม่ได้ฮาร์ดโค้ด */
  transferredCost: number | null
  transferredNetBookValue: number | null
  writeUp: number | null
  depreciationInPeriod: number | null
}

/** หนึ่งแถวของ DEP-สรุป = ชั้นบัญชี × งวด (ตรงกับใบสำคัญ 1 ใบ) */
export interface DepSummaryRow {
  assetClass: string | null
  accountName: string | null
  period: number
  fromDate: string
  toDate: string
  assets: number
  ordinaryDepreciation: number
  journalEntry: string | null
  /** ปกติ = 1 ถ้าไม่ใช่ แปลว่ามีใบกลับรายการหรือ SAP เปลี่ยนวิธีโพสต์ - ต้องเตือน */
  journalEntryCount: number
}

export interface ReportPeriodOption {
  fiscalYear: number
  minPeriod: number
  maxPeriod: number
  /** วันสิ้นงวดล่าสุดที่มีข้อมูลของปีนั้น */
  lastToDate: string
}

export interface AssetSummaryReport {
  scope: DashboardScope
  fiscalYear: number
  fromPeriod: number
  toPeriod: number
  /** งวดที่เลือกได้จริง - มาจากข้อมูล ไม่ใช่ปั้น 1-12 (MIG ปิดงวดถึงแค่ ม.ค. 2569) */
  periodOptions: ReportPeriodOption[]
  byAssetClass: AssetSummaryRow[]
  /** มาพร้อมกันในก้อนเดียว - ปุ่มสลับตารางจึงไม่ต้องยิง API ใหม่ */
  depreciationByPeriod: DepSummaryRow[]
}

/** GET /dashboard/asset-summary - ไม่ส่งงวดมา = ปีล่าสุด งวด 1 ถึงงวดที่บัญชีปิดล่าสุด */
export function getAssetSummary(
  params: {
    departmentId?: number
    companyCode?: string
    fiscalYear?: number
    fromPeriod?: number
    toPeriod?: number
  } = {},
): Promise<AssetSummaryReport> {
  const query = new URLSearchParams()
  if (params.departmentId) query.set('departmentId', String(params.departmentId))
  if (params.companyCode) query.set('companyCode', params.companyCode)
  if (params.fiscalYear) query.set('fiscalYear', String(params.fiscalYear))
  if (params.fromPeriod) query.set('fromPeriod', String(params.fromPeriod))
  if (params.toPeriod) query.set('toPeriod', String(params.toPeriod))

  const qs = query.toString()
  return request<AssetSummaryReport>(`/dashboard/asset-summary${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

/**
 * หนึ่งชิ้นในลิสต์ที่กดดูจากแถวของ Asset-สรุป
 *
 * ★★ ผลรวมของสามช่องเงินข้ามทุกชิ้น **เท่ากับแถวสรุปของบัญชีนั้นเป๊ะ** — backend คิดด้วย
 *    นิพจน์ชุดเดียวกับที่วาดแถวสรุป (assetValueExprs) ไม่ใช่สูตรคู่ขนาน
 *
 * ★ สามช่องเงินเป็น null พร้อมกันเสมอ = ชิ้นที่ SAP ยังให้ตัวเลขมาไม่ครบ ซึ่งแถวสรุปก็ไม่ได้
 *   นับเข้ายอดเงินเหมือนกัน - null ไม่ใช่ 0 ห้ามวาดเป็นศูนย์
 */
export interface AssetSummaryPiece {
  assetId: number
  /** ใช้ประกอบลิงก์ /assets/:company/:assetNumber - เลขซ้ำกันข้ามบริษัทได้จริง */
  companyCode: string
  assetNumber: string | null
  description: string | null
  status: string
  /** ปีบัญชีของตัวเลขชุดนี้ - ติดป้ายคู่กับยอดเสมอ */
  fiscalYear: number
  /** หน่วยเป็น**เดือน** · 0 = ตัดค่าเสื่อมครบแล้ว · null = SAP ไม่มีพารามิเตอร์ให้ชิ้นนี้ */
  remainingLifeMonths: number | null

  /**
   * ── ตั้งแต่ตรงนี้ลงไปคือคอลัมน์ชุดเดียวกับ AssetSummaryRow เป๊ะ
   *
   * ★ โมดัลวาดคอลัมน์ตาม "ชุดที่ผู้ใช้ติ๊กไว้ที่ตารางแม่" จึงต้องมีครบทุกช่อง
   *   ถ้าขาดช่องไหน คอลัมน์นั้นจะกลายเป็นขีดทั้งแถวโดยดูไม่ออกว่าเป็นเพราะ API ไม่ส่ง
   * ★ null = ชิ้นที่ SAP ให้ตัวเลขมาไม่ครบ (หรือมีงวดที่ยังไม่รู้) ซึ่งแถวสรุปก็ไม่นับ
   *   เข้ายอดเหมือนกัน - null ไม่ใช่ 0
   */
  /** = 1 เสมอ มีไว้ให้ผลรวมคอลัมน์ Assets ตรงกับแถวสรุป */
  assets: number
  openingCost: number | null
  openingDepreciation: number | null
  openingNetBookValue: number | null
  capitalization: number | null
  retiredCost: number | null
  retiredNetBookValue: number | null
  retiredDepreciation: number | null
  transferredCost: number | null
  transferredNetBookValue: number | null
  writeUp: number | null
  depreciationInPeriod: number | null
  bookedCost: number | null
  accumulatedDepreciation: number | null
  netBookValue: number | null
}

export interface AssetSummaryPiecesReport {
  /** null = กลุ่ม "ยังไม่ระบุชั้นบัญชี" ซึ่งเป็นแถวจริงในรายงาน */
  assetClass: string | null
  accountName: string | null
  fiscalYear: number
  fromPeriod: number
  toPeriod: number
  page: number
  limit: number
  /** จำนวนชิ้นทั้งหมดของบัญชีนี้ = คอลัมน์ "ชิ้น" ของแถวสรุป (ใช้คุมแถบแบ่งหน้า) */
  total: number
  /**
   * แถวรวมท้ายตาราง = **แถวสรุปของบัญชีนั้นทั้งแถว**
   *
   * ★ เป็น AssetSummaryRow เต็ม ๆ ไม่ใช่ชุดย่อย - โมดัลวาดคอลัมน์ตามที่ตารางแม่เปิดอยู่
   *   แถวรวมจึงต้องมีทุกคอลัมน์ให้หยิบ
   * ★ มาจากแถวสรุปของรายงานโดยตรง ไม่ได้บวกจากหน้าที่เปิดอยู่
   */
  totals: AssetSummaryRow
  rows: AssetSummaryPiece[]
}

/**
 * GET /dashboard/asset-summary/assets - รายชิ้นของชั้นบัญชีเดียว
 *
 * ★ ต้องส่งงวด/ขอบเขตชุดเดียวกับที่หน้ารายงานเลือกอยู่ไปด้วยทุกช่อง ไม่งั้นยอดในโมดัลจะเป็น
 *   ของคนละงวดกับแถวที่ผู้ใช้เพิ่งกด
 * ★ ไม่ส่ง assetClass = กลุ่ม "ยังไม่ระบุชั้นบัญชี" (เป็นแถวจริง ไม่ใช่คำขอผิดรูป)
 */
export function getAssetSummaryPieces(
  params: {
    assetClass?: string
    departmentId?: number
    companyCode?: string
    fiscalYear?: number
    fromPeriod?: number
    toPeriod?: number
    page?: number
    limit?: number
  } = {},
): Promise<AssetSummaryPiecesReport> {
  const query = new URLSearchParams()
  if (params.assetClass) query.set('assetClass', params.assetClass)
  if (params.departmentId) query.set('departmentId', String(params.departmentId))
  if (params.companyCode) query.set('companyCode', params.companyCode)
  if (params.fiscalYear) query.set('fiscalYear', String(params.fiscalYear))
  if (params.fromPeriod) query.set('fromPeriod', String(params.fromPeriod))
  if (params.toPeriod) query.set('toPeriod', String(params.toPeriod))
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const qs = query.toString()
  return request<AssetSummaryPiecesReport>(
    `/dashboard/asset-summary/assets${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}

// ── รายชิ้นของชีต DEP-สรุป (คนละชุดกับ AssetSummaryPiece) ───────────────────

/**
 * หนึ่งชิ้นในโมดัลของชีต DEP-สรุป — ตรงกับชีต **DEP-ละเอียด** ของ finance
 *
 * ★ ชีตนั้นมีแค่ Asset No. / Asset Description / Ordinary Depreciation ไม่มีคอลัมน์ยอด
 *   คงเหลือเลย คนที่กดจากแถว DEP ถามว่า "ใบสำคัญค่าเสื่อมใบนี้มาจากชิ้นไหนบ้าง"
 *   ไม่ได้ถามเรื่องราคาทุน/NBV — จึงเป็นคนละ type และคนละ endpoint กับ AssetSummaryPiece
 *
 * ★ ไม่มี Special Depreciation — ระบบไม่ได้เก็บ (SAP ให้มาเป็น 0 ทั้งฐาน connector จึง
 *   ไม่สร้างคอลัมน์ไว้ และมีด่านคอยเตือนถ้าวันหนึ่งไม่เป็น 0)
 */
export interface DepSummaryPiece {
  assetId: number
  companyCode: string
  assetNumber: string | null
  description: string | null
  /** NOT NULL ที่ DB - ไม่มีสถานะ "ยังไม่รู้" ไม่มีแถว = ไม่เสื่อม */
  ordinaryDepreciation: number
  journalEntry: string | null
  /** ปกติว่าง - มีค่าเมื่อไหร่แปลว่างวดนั้นถูกกลับรายการ ต้องโชว์ให้เห็น */
  cancellationJournalEntry: string | null
}

export interface DepSummaryPiecesReport {
  assetClass: string | null
  accountName: string | null
  fiscalYear: number
  /** งวดเดียว ไม่ใช่ช่วง - ชีต DEP เป็นภาพของงวดเดียว */
  period: number
  page: number
  limit: number
  total: number
  /** แถวรวม = แถวของ DEP-สรุป ที่กดมา · null = ไม่มีแถวสรุปในขอบเขตนี้ */
  totals: DepSummaryRow | null
  rows: DepSummaryPiece[]
}

/**
 * GET /dashboard/asset-summary/dep-assets - รายชิ้นค่าเสื่อมของชั้นบัญชีเดียว งวดเดียว
 *
 * ★ ใช้พารามิเตอร์ชุดเดียวกับ getAssetSummaryPieces (backend ใช้ schema เดียวกัน)
 *   แต่สนใจเฉพาะ toPeriod เพราะชีต DEP เป็นภาพของงวดเดียว
 */
export function getDepSummaryPieces(
  params: {
    assetClass?: string
    departmentId?: number
    companyCode?: string
    fiscalYear?: number
    fromPeriod?: number
    toPeriod?: number
    page?: number
    limit?: number
  } = {},
): Promise<DepSummaryPiecesReport> {
  const query = new URLSearchParams()
  if (params.assetClass) query.set('assetClass', params.assetClass)
  if (params.departmentId) query.set('departmentId', String(params.departmentId))
  if (params.companyCode) query.set('companyCode', params.companyCode)
  if (params.fiscalYear) query.set('fiscalYear', String(params.fiscalYear))
  if (params.fromPeriod) query.set('fromPeriod', String(params.fromPeriod))
  if (params.toPeriod) query.set('toPeriod', String(params.toPeriod))
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const qs = query.toString()
  return request<DepSummaryPiecesReport>(
    `/dashboard/asset-summary/dep-assets${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}
