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
  ManagerEmpId: number | null;
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

export interface ListEmployeesParams extends MasterListParams {
  departmentId?: number;
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
export function listDepartments(params: MasterListParams = {}): Promise<DepartmentOption[]> {
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

/** GET /master/locations - คืนครบทั้งชุด (สถานที่/อาคาร) */
export function listLocations(params: MasterListParams = {}): Promise<LocationOption[]> {
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
