// services/master.service.ts
//
// ข้อมูลอ้างอิงสำหรับ dropdown ทั้งหมด - ตรงกับ /master/* ของ backend (อ่านอย่างเดียว ไม่มี POST)
// ทุกเส้นคืนรูปเดียวกัน { id, name } เพื่อให้ผูกเข้า dropdown ตัวเดียวกันได้ทุก master
//
// department/category/uom คืนครบทั้งชุด ไม่แบ่งหน้า - มีหลักสิบแถว และ dropdown ที่แบ่งหน้า
// จะทำให้ผู้ใช้เลือกตัวเลือกที่อยู่หน้า 2 ไม่ได้เลย
// employee เป็นข้อยกเว้นเพราะใหญ่ระดับทั้งบริษัท - แบ่งหน้า (ดู listEmployees)
import { request } from './httpClient';

export interface MasterOption {
  id: number;
  name: string;
}

export interface DepartmentOption extends MasterOption {
  /** ชื่อย่อไว้โชว์ในที่แคบ เช่น badge ในตาราง - HR ไม่ได้กรอกครบทุกแผนก */
  shortName: string | null;
  /**
   * หัวหน้าแผนกทุกคน = employee.id (ไม่ใช่ user.id) · ลิสต์ว่าง = ยังไม่ได้ตั้ง (0037)
   *
   * ★ ทุกคนในลิสต์คือปลายทางของการ์ดขออนุมัติใน Teams ของทั้งแผนก และอนุมัติได้เท่ากัน
   *   (ใครกดก่อนได้ก่อน) - เรียงตาม seq ที่ฝั่ง backend ตั้งไว้
   * ★ ลิสต์ว่างไม่ใช่ null - "ยังไม่มีหัวหน้า" กับ "ยังไม่ได้โหลด" ต้องแยกออกจากกัน
   *
   * ★ เดิมเป็น `managerId` เดี่ยว ๆ (ก่อน 0037) ถ้าเจอโค้ดที่ยังอ่านชื่อนั้นอยู่ที่ไหน
   *   แปลว่าตรงนั้นยังไม่ถูกแก้ - ค่าจะเป็น undefined เงียบ ๆ ไม่ใช่ error
   */
  managerIds: number[];
  departmentId: string | null;
  /**
   * บริษัทเจ้าของแผนก (0024) - backend ส่งมาให้ตั้งแต่แรก แต่ชนิดฝั่งนี้เคยไม่ประกาศไว้
   *
   * ★ ห้ามทำ dropdown แผนกที่โชว์แต่ชื่อ: วัด 2026-09-03 ได้ 151 แผนกจาก 3 บริษัท
   *   และ **55 ชื่อซ้ำกันข้ามบริษัท** ลิสต์ที่ไม่บอกบริษัทจะมีตัวเลือกหน้าตาเหมือนกัน
   *   สองสามอันเรียงติดกันโดยที่คนเลือกแยกไม่ออกว่าอันไหนของใคร
   *   ต้องกรองด้วยบริษัทที่เลือกไว้ หรือแสดงรหัสบริษัทกำกับ
   */
  companyCode: string;
}

/**
 * บริษัทในเครือ - คีย์คือ code ('UBA') ไม่ใช่ id ตัวเลข
 *
 * ทุกที่ที่อ้างบริษัทในระบบใช้ companyCode เป็น FK (asset / department / sap_*_sync)
 * จึงไม่ยัดให้เข้ารูป MasterOption { id, name } ซึ่งจะต้องแปลงกลับไปมาโดยไม่ได้อะไรเพิ่ม
 */
export interface CompanyOption {
  code: string;
  name: string;
}

export interface EmployeeOption extends MasterOption {
  /**
   * รหัสของคนนี้ใน OHEM ของบริษัทที่ถามมา - มีเฉพาะตอนส่ง companyCode ไปด้วย
   *
   * ★★ สามค่า สามความหมาย ห้ามยุบ:
   *     undefined  ไม่ได้ถามถึงบริษัทไหน -> ห้ามเอาไปตัดสินอะไร
   *     null       ถามแล้ว **ไม่มีรหัสในบริษัทนั้น** -> เลือกไม่ได้ บัญชีคีย์ที่ SAP ไม่ได้
   *     number     รหัสที่ใช้ได้จริง
   */
  sapOwnerCode?: number | null
  departmentId: number;
  empId: string | null;
}

/**
 * ชั้น/ห้อง - name ถูกประกอบมาจาก floor + room ฝั่ง backend แล้ว (ตารางไม่มีคอลัมน์ name)
 * locationId มีไว้ให้กรองตามสถานที่ที่ผู้ใช้เลือกโดยไม่ต้องยิง API ซ้ำ
 */
/**
 * สถานที่ทางบัญชีใน dropdown
 *
 * outPlan = true คือสถานที่ที่ของจริงอยู่นอกผังของไซต์นี้ (ต่างประเทศ/สาขาอื่น) ฟอร์มต้อง
 * รู้ตั้งแต่ตอนผู้ใช้เลือก เพื่อซ่อนบล็อก "ตำแหน่งบนผัง" ทิ้ง — ห้องบนผังนี้เป็นของไซต์นี้
 * ผูกของที่อยู่ต่างประเทศเข้าไปคือข้อมูลที่ผิดตั้งแต่ต้น (backend ปฏิเสธด้วย)
 */
export interface LocationOption extends MasterOption {
  outPlan: boolean;
  /**
   * บริษัทเจ้าของสถานที่ (0037) · null = ใช้ร่วมทุกบริษัท ('ยังไม่ระบุที่ตั้ง')
   *
   * ★ ชื่อซ้ำกันข้ามบริษัทได้ - วัด 2026-09-25: UBA/UBP ซ้ำกัน 14 ชื่อ (QA/QC/ผลิต ฯลฯ)
   *   ฟอร์มที่เขียนสถานที่ลงสินทรัพย์ต้องขอด้วย companyCode ของชิ้นเสมอ ส่วนหน้ากรองที่
   *   ยังไม่เลือกบริษัทให้แปะป้ายด้วย locationLabel() (utils/location.ts)
   */
  companyCode: string | null;
}

export interface SubLocationOption extends MasterOption {
  locationId: number;
}

/**
 * ห้องหนึ่งห้องบนผังชั้น พร้อมขอบเขตที่ trace ไว้
 *
 * polygon เป็น "สัดส่วนของภาพ" 0–1 ไม่ใช่ pixel - คูณกับขนาดที่เรนเดอร์จริงเอาเอง
 * ข้อดีคือย่อ/ขยายไฟล์ผังกี่ครั้งก็ยังตรง (ไฟล์ที่เสิร์ฟถูกย่อจากต้นฉบับ 9659px แล้ว)
 * ข้อเสียคือถ้าครอปผังใหม่ พิกัดทั้งชุดพังพร้อมกัน ต้อง trace ใหม่
 */
export interface FloorPlanRoom {
  id: number;
  code: string;
  /** ชื่อเต็มแบบเดียวกับ dropdown เช่น "ชั้น 2 / ห้อง ห้องแผนกบัญชี" */
  name: string;
  /** ชื่อห้องล้วน ๆ ไว้โชว์บนแผนที่ตอนซูมเข้า */
  room: string | null;
  /** ชั้นของห้องนี้ - ติดมากับห้องเพื่อให้ห้องเดี่ยว ๆ บอกชั้นตัวเองได้ ไม่ต้องย้อนหา plan */
  floor: string | null;
  locationId: number;
  /** ชื่อตึก - ตึกคือ asset_location คนละแถว (UBIS-ตึก 1/2/3, UBIS-นอกตึก) */
  locationName: string;
  polygon: [number, number][];
}

/** ผังหนึ่งใบ = หนึ่งชั้นของทั้งไซต์ ไฟล์ภาพอยู่ที่ public/floorplans/<planKey>.png */
export interface FloorPlan {
  planKey: string;
  floor: string | null;
  rooms: FloorPlanRoom[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface MasterListParams {
  search?: string;
  /**
   * true = เอาแถวที่ปิดใช้งานแล้วมาด้วย
   *
   * ตาราง master ใช้ isActive แทนการลบ - ฟอร์ม "สร้างใหม่" ต้องไม่เห็นของที่ปิดไปแล้ว
   * แต่ฟอร์ม "แก้ของเก่า" ต้องเปิดตัวนี้ ไม่งั้นค่าที่เคยเลือกไว้จะหายจาก dropdown
   * แล้วผู้ใช้จะเห็นเป็นช่องว่างทั้งที่ในฐานข้อมูลมีค่าอยู่
   */
  includeInactive?: boolean;
}

export interface ListDepartmentsParams extends MasterListParams {
  /**
   * เอาเฉพาะแผนกของบริษัทนี้ - ไม่ส่ง = ทุกบริษัท
   *
   * ★ ฟอร์มที่บันทึกลง asset ต้องส่งเสมอ: fk_asset_department ฝั่ง DB เป็น composite FK
   *   บน (departmentId, companyCode) แผนกข้ามบริษัทจึงบันทึกไม่ผ่าน ตัวเลือกที่เลือกแล้ว
   *   เซฟไม่ได้ต้องไม่โผล่ให้เลือกตั้งแต่แรก
   */
  companyCode?: string;
}

export interface ListEmployeesParams extends MasterListParams {
  departmentId?: number;
  /**
   * เอาเฉพาะคนที่มีตัวตนในบริษัทนี้ (employee_company) - ไม่ส่ง = ทุกบริษัท
   *
   * ★ คนคนเดียวสังกัดได้หลายบริษัท ลิสต์ของสองบริษัทจึงซ้อนกันได้ ไม่ใช่ตัดขาดจากกัน
   */
  companyCode?: string;
  page?: number;
  limit?: number;
  /**
   * ค้นคนเดียวด้วย id ของตาราง employee
   *
   * เดิมช่องนี้ชื่อ empId (รหัส HR) และ backend ไม่เคยรับ - Elysia ตัดทิ้งทุกครั้ง
   * จึงเป็นพารามิเตอร์ตายมาตลอด ใช้คู่กับ includeInactive ตอนแปลง employeeId
   * ที่บันทึกไว้กลับเป็นชื่อ (คนที่ลาออกแล้วก็ยังต้องรู้ว่าเคยถือครองอะไร)
   */
  id?: number;
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // ข้าม undefined/'' เพื่อไม่ส่ง key เปล่าไปให้ backend ตีความ
    if (value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** GET /master/departments - คืนครบทั้งชุด */
export function listDepartments(params: ListDepartmentsParams = {}): Promise<DepartmentOption[]> {
  return request<DepartmentOption[]>(`/master/departments${toQuery({ ...params })}`, {
    method: 'GET',
  });
}

/**
 * GET /master/companies - บริษัทที่เปิดใช้อยู่ คืนครบทั้งชุด (ทั้งเครือมีไม่กี่บริษัท)
 *
 * ไม่มีพารามิเตอร์ให้ค้น/กรอง - ลิสต์สั้นพอที่ dropdown จะโชว์ครบได้เสมอ
 */
export function listCompanies(): Promise<CompanyOption[]> {
  return request<CompanyOption[]>('/master/companies', { method: 'GET' });
}

/** GET /master/categories - คืนครบทั้งชุด */
export function listCategories(params: MasterListParams = {}): Promise<MasterOption[]> {
  return request<MasterOption[]>(`/master/categories${toQuery({ ...params })}`, { method: 'GET' });
}

// ไม่มี listUoms แล้ว - /master/uoms ถูกถอดพร้อมตาราง uom ใน migration 0012
// หน่วยนับเป็น string ที่ sync มากับตัว asset จาก SAP (asset.uom) ไม่ใช่ตัวเลือกที่ผู้ใช้เลือกเอง

/**
 * GET /master/locations - สถานที่ทางบัญชี
 *
 * ส่ง companyCode = ของบริษัทนั้น + แถวใช้ร่วม · ไม่ส่ง = ทั้งเครือ
 * ★ ฟอร์มที่บันทึกสถานที่ลงสินทรัพย์ต้องส่งเสมอ (ดู LocationOption.companyCode)
 */
export function listLocations(
  params: MasterListParams & { companyCode?: string } = {},
): Promise<LocationOption[]> {
  return request<LocationOption[]>(`/master/locations${toQuery({ ...params })}`, { method: 'GET' });
}

/**
 * GET /master/sub-locations - คืนครบทุกสถานที่ในก้อนเดียว ไม่แยกตาม locationId
 * ผู้ใช้สลับสถานที่ไปมาระหว่างกรอกฟอร์มจะได้ไม่ต้องรอโหลดใหม่ทุกครั้ง
 */
export function listSubLocations(params: MasterListParams = {}): Promise<SubLocationOption[]> {
  return request<SubLocationOption[]>(`/master/sub-locations${toQuery({ ...params })}`, {
    method: 'GET',
  });
}

/**
 * GET /master/floor-plans - ผังชั้นทั้งหมดพร้อมขอบเขตห้อง
 *
 * แยกจาก listSubLocations คนละเส้น: polygon หลายจุดคูณ 57 ห้องหนักกว่า payload ของ
 * dropdown มาก และฟอร์มที่ใช้ dropdown ไม่เคยต้องใช้ขอบเขตห้องเลย
 *
 * คืนเฉพาะห้องที่ trace แล้ว - ห้องที่ยังไม่มี polygon วาดบนแผนที่ไม่ได้อยู่ดี
 */
export function listFloorPlans(): Promise<FloorPlan[]> {
  return request<FloorPlan[]>('/master/floor-plans', { method: 'GET' });
}

/**
 * GET /master/employees - แบ่งหน้า
 *
 * UI เป็นลิสต์ให้เลื่อนดูพร้อมพิมพ์ค้น จึงต้องรู้ total เพื่อทำ pagination
 * ไม่ส่ง page/limit = ใช้ default ของ backend (page 1, limit 20)
 */
export function listEmployees(params: ListEmployeesParams = {}): Promise<Paginated<EmployeeOption>> {
  return request<Paginated<EmployeeOption>>(
    `/master/employees${toQuery({
      search: params.search?.trim(),
      departmentId: params.departmentId,
      companyCode: params.companyCode,
      includeInactive: params.includeInactive,
      id: params.id,
      page: params.page,
      limit: params.limit,
    })}`,
    { method: 'GET' },
  );
}

/**
 * GET /master/fiscal-years - ปีบัญชีที่มีอยู่จริงในทะเบียน เรียงจากใหม่ไปเก่า
 *
 * อ่านจากข้อมูลจริง ไม่ใช่ไล่ช่วงปีเอาเองฝั่งจอ - ตัวเลขที่ sync มาค้างที่ปีเก่าได้จริง
 * และค้างไม่เท่ากัน ถ้าไล่ช่วงเองจะมีตัวเลือกที่กดแล้วว่างปนอยู่
 */
export function listFiscalYears(): Promise<number[]> {
  return request<number[]>('/master/fiscal-years', { method: 'GET' });
}

/**
 * หมวดสินทรัพย์จากท่อนที่ 1 ของรหัสบัญชี - ตัวเลือกตัวกรองหน้าทะเบียน
 *
 *   '1216301-1-228' = <หมวด 7 หลัก>-<ที่ตั้ง>-<รหัส cost center>
 *
 * ★ แกนเดียวกับตัวกรอง "Asset class" ของหน้า Asset summary - สองหน้าต้องแบ่งด้วยท่อน
 *   เดียวกัน ไม่งั้นกรองหมวดเดียวกันสองที่แล้วได้จำนวนชิ้นไม่ตรงกันโดยไม่มีอะไรอธิบาย
 * ★ code เป็นคีย์ ไม่ใช่ id (รูปเดียวกับ CompanyOption)
 */
export interface AssetClassOption {
  /** รหัสหมวด 7 หลัก เช่น '1216301' */
  code: string
  /**
   * ชื่อหมวด - null = ยังไม่ได้ import ชื่อของรหัสนี้
   * ★ หน้าจอโชว์รหัสดิบแทน **ห้ามเขียน "ไม่ระบุ"** - รหัสอ่านออกและเทียบกับรายงานของ
   *   finance ได้ ส่วน "ไม่ระบุ" ทำให้ดูเหมือนข้อมูลหาย
   */
  name: string | null
}

export interface ListAssetClassesParams {
  search?: string
  /** ไม่ส่ง = ทุกบริษัท - หน้าทะเบียนส่งบริษัทที่เลือกอยู่มาเพื่อตัดรหัสที่ไม่มีของทิ้ง */
  companyCode?: string
  /**
   * ไม่ส่ง = ทุกศูนย์ต้นทุน - ตารางบน Dashboard ส่งศูนย์ที่เลือกอยู่ (department.id)
   * ตัวเลือกกับจำนวนชิ้นจะได้แคบตามตารางข้างล่าง (ใช้กับลิสต์สามท่อนเลขด้วย)
   */
  costCenterId?: number
}

/** ขอบเขตของลิสต์สามท่อนเลขสินทรัพย์ - เหมือน ListAssetClassesParams แต่ไม่มี search */
export type AssetNumberOptionParams = Pick<ListAssetClassesParams, 'companyCode' | 'costCenterId'>

/**
 * GET /master/asset-classes
 *
 * อ่านจากทะเบียนจริง ไม่ใช่จากตาราง category - category มีหมวดที่ยังไม่มีของอยู่จริงปนอยู่
 * ตัวเลือกที่กดแล้วได้ตารางว่างเสมอไม่ควรอยู่ในลิสต์ (หลักเดียวกับ listFiscalYears)
 */
export function listAssetClasses(
  params: ListAssetClassesParams = {},
): Promise<AssetClassOption[]> {
  return request<AssetClassOption[]>(
    `/master/asset-classes${toQuery({
      search: params.search?.trim(),
      companyCode: params.companyCode,
      costCenterId: params.costCenterId,
    })}`,
    { method: 'GET' },
  )
}

/**
 * รหัสนำหน้าเลขสินทรัพย์ 3 ตัว (COM / FUR / MAC / …) ที่มีอยู่จริงในทะเบียน
 *
 * ── ★★★ เป็นแกน "รหัส" เท่านั้น ไม่ใช่แผนกและไม่ใช่หมวดบัญชี
 *
 * รหัสเข้ารหัส **ไซต์ + ประเภทของ** ตามวิธีที่ของถูก capitalize ไม่ใช่ตามคนที่ดูแล
 * วัดจริง 2026-09-22: COM 846 ชิ้นกระจาย 19 ศูนย์ต้นทุน อยู่ที่ IT แค่ 13% ·
 * CCTV ที่ IT ดูแลได้รหัส FAB แล้วไปกองที่ศูนย์ต้นทุนโรงงาน 98%
 *
 * ⚠️ **ป้ายบนหน้าจอต้องเขียนว่า "รหัส" เท่านั้น** ห้ามเขียนให้อ่านเป็นประเภท/แผนก -
 *    ความเข้าใจผิดนี้เคยทำให้ลิสต์ที่ Finance ส่งให้ IT เกินจริง 7 เท่าและขาด CCTV ทั้งกอง
 *
 * ★ ไม่มีชื่อไทยมาให้ - ไม่มีตารางไหนเป็นเจ้าของความหมายของรหัส ('COM = คอมพิวเตอร์'
 *   เป็นการเดาจากคำบรรยาย) หน้าจอโชว์รหัสดิบคู่จำนวนชิ้น อย่าเติมชื่อที่เดาเองลงไป
 */
export interface AssetPrefixOption {
  /** รหัส 3 ตัวพิมพ์ใหญ่ เช่น 'COM' */
  code: string
  /** จำนวนชิ้นในทะเบียน - ต้องโชว์คู่รหัสเสมอ รหัสล้วน ๆ บอกไม่ได้ว่าอันไหนเป็นตัวหลัก */
  assets: number
}

export function listAssetPrefixes(
  params: AssetNumberOptionParams = {},
): Promise<AssetPrefixOption[]> {
  return request<AssetPrefixOption[]>(
    `/master/asset-prefixes${toQuery({ ...params })}`,
    { method: 'GET' },
  )
}

/**
 * Dept ID ในเลขสินทรัพย์ (ท่อนที่ 2 เช่น '775' ใน COM-775-26-001)
 *
 * ★ เป็นรหัสตอนออกเลข ไม่ใช่แผนกปัจจุบันของชิ้น - ของย้ายแผนกแล้วเลขไม่เปลี่ยน
 *   ไม่มีชื่อแผนกมาให้โดยตั้งใจ (ชุดเก่าที่ยุบไปแล้วยังอยู่ในเลขเดิม) หน้าจอโชว์รหัสดิบคู่จำนวนชิ้น
 */
export interface AssetNumberDeptOption {
  /** สามหลัก เช่น '775' */
  dept: string
  assets: number
}

export function listAssetNumberDepts(
  params: AssetNumberOptionParams = {},
): Promise<AssetNumberDeptOption[]> {
  return request<AssetNumberDeptOption[]>(
    `/master/asset-number-depts${toQuery({ ...params })}`,
    { method: 'GET' },
  )
}

/**
 * ปีในเลขสินทรัพย์ (ท่อนที่ 3 เช่น '26' ใน COM-775-26-001) = ปีที่ออกเลข
 *
 * ★ คนละแกนกับปีบัญชี (fiscalYear) - backend ส่งสองหลักตามที่อยู่ในเลข การแปลงเป็น 2026
 *   เป็นเรื่องของการแสดงผลเท่านั้น ค่าที่ส่งกลับไปกรองต้องเป็นสองหลักเหมือนเดิม
 */
export interface AssetNumberYearOption {
  /** สองหลัก เช่น '26' */
  year: string
  assets: number
}

export function listAssetNumberYears(
  params: AssetNumberOptionParams = {},
): Promise<AssetNumberYearOption[]> {
  return request<AssetNumberYearOption[]>(
    `/master/asset-number-years${toQuery({ ...params })}`,
    { method: 'GET' },
  )
}

// ── role / หัวหน้าแผนก (หน้า Manage role - ADMIN เท่านั้น) ──────────────────

export interface RoleOption {
  id: number;
  name: string;
  description: string | null;
}

/**
 * GET /master/roles - role ทั้งหมดที่แจกได้ (id จริงจากฐาน)
 *
 * ★ ต้องใช้แทนการฝัง { EMPLOYEE:1, MANAGER:2, ... } ไว้ในหน้าจอ - id พวกนั้นมาจากลำดับที่
 *   db:import:role รันครั้งแรก ถ้าฐานไหน import คนละลำดับ หน้าจอจะแจกสิทธิ์ผิดคนเงียบ ๆ
 */
export function listRoles(): Promise<RoleOption[]> {
  return request<RoleOption[]>('/master/roles', { method: 'GET' });
}

/**
 * พนักงานที่ตั้งเป็นหัวหน้าแผนกแล้ว "อนุมัติได้จริง"
 *
 * ★ ไม่ใช่รายชื่อพนักงานทั้งหมด - backend กรองเหลือเฉพาะคนที่มีบัญชี AMS ที่เปิดใช้อยู่
 *   และ role อยู่ใน MANAGER/FINANCE/ADMIN เพราะเส้นทางอนุมัติบังคับไว้แบบนั้น
 *   (ตั้งคนที่ไม่เข้าเงื่อนไข = ใบของทั้งแผนกส่งไม่ออกโดยไม่มี error ตอนตั้ง)
 */
export interface ApproverOption {
  /** employee.id - ค่าที่ลง department_manager.employeeId ไม่ใช่ user.id */
  id: number;
  name: string;
  empId: string | null;
  departmentName: string | null;
  companyCode: string | null;
  /** role ที่ทำให้เขาอนุมัติได้ - โชว์ให้คนเลือกเห็นว่าอนุมัติได้ด้วยสิทธิ์อะไร */
  roleName: string;
}

/** GET /master/approvers */
export function listApprovers(
  params: { search?: string; companyCode?: string } = {},
): Promise<ApproverOption[]> {
  return request<ApproverOption[]>(`/master/approvers${toQuery({ ...params })}`, { method: 'GET' });
}

/**
 * PATCH /master/departments/:id/manager - ตั้ง/ถอดหัวหน้าแผนก (null = ถอด)
 *
 * ⚠️⚠️ เขียนลงฐานจริง และ **เปลี่ยนปลายทางของการ์ดขออนุมัติใน Teams ทันที** - ใบคำขอของ
 *      แผนกนี้ทุกใบที่ส่งหลังจากนี้จะวิ่งไปหาคนใหม่ ไม่มีขั้นตอนย้อนกลับอัตโนมัติ
 *      ห้ามเรียกโดยไม่ให้ผู้ใช้ยืนยันก่อน
 */
export function setDepartmentManagers(
  departmentId: number,
  managerEmployeeIds: number[],
): Promise<DepartmentOption> {
  return request<DepartmentOption>(`/master/departments/${departmentId}/manager`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ managerEmployeeIds }),
  });
}
