// services/master.service.ts
//
// ข้อมูลอ้างอิงสำหรับ dropdown ทั้งหมด — ตรงกับ /master/* ของ backend (อ่านอย่างเดียว ไม่มี POST)
// ทุกเส้นคืนรูปเดียวกัน { id, name } เพื่อให้ผูกเข้า dropdown ตัวเดียวกันได้ทุก master
//
// department/category/uom คืนครบทั้งชุด ไม่แบ่งหน้า — มีหลักสิบแถว และ dropdown ที่แบ่งหน้า
// จะทำให้ผู้ใช้เลือกตัวเลือกที่อยู่หน้า 2 ไม่ได้เลย
// employee เป็นข้อยกเว้นเพราะใหญ่ระดับทั้งบริษัท — แบ่งหน้า (ดู listEmployees)
import { request } from './httpClient';

export interface MasterOption {
  id: number;
  name: string;
}

export interface DepartmentOption extends MasterOption {
  /** ชื่อย่อไว้โชว์ในที่แคบ เช่น badge ในตาราง — HR ไม่ได้กรอกครบทุกแผนก */
  shortName: string | null;
  ManagerEmpId: number | null;
  departmentId: string | null;
}

export interface EmployeeOption extends MasterOption {
  departmentId: number;
  empId: string | null;
}

/**
 * ชั้น/ห้อง — name ถูกประกอบมาจาก floor + room ฝั่ง backend แล้ว (ตารางไม่มีคอลัมน์ name)
 * locationId มีไว้ให้กรองตามสถานที่ที่ผู้ใช้เลือกโดยไม่ต้องยิง API ซ้ำ
 */
export interface SubLocationOption extends MasterOption {
  locationId: number;
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
   * ตาราง master ใช้ isActive แทนการลบ — ฟอร์ม "สร้างใหม่" ต้องไม่เห็นของที่ปิดไปแล้ว
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
   * เดิมช่องนี้ชื่อ empId (รหัส HR) และ backend ไม่เคยรับ — Elysia ตัดทิ้งทุกครั้ง
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

/** GET /master/departments — คืนครบทั้งชุด */
export function listDepartments(params: MasterListParams = {}): Promise<DepartmentOption[]> {
  return request<DepartmentOption[]>(`/master/departments${toQuery({ ...params })}`, {
    method: 'GET',
  });
}

/** GET /master/categories — คืนครบทั้งชุด */
export function listCategories(params: MasterListParams = {}): Promise<MasterOption[]> {
  return request<MasterOption[]>(`/master/categories${toQuery({ ...params })}`, { method: 'GET' });
}

// ไม่มี listUoms แล้ว — /master/uoms ถูกถอดพร้อมตาราง uom ใน migration 0012
// หน่วยนับเป็น string ที่ sync มากับตัว asset จาก SAP (asset.uom) ไม่ใช่ตัวเลือกที่ผู้ใช้เลือกเอง

/** GET /master/locations — คืนครบทั้งชุด (สถานที่/อาคาร) */
export function listLocations(params: MasterListParams = {}): Promise<MasterOption[]> {
  return request<MasterOption[]>(`/master/locations${toQuery({ ...params })}`, { method: 'GET' });
}

/**
 * GET /master/sub-locations — คืนครบทุกสถานที่ในก้อนเดียว ไม่แยกตาม locationId
 * ผู้ใช้สลับสถานที่ไปมาระหว่างกรอกฟอร์มจะได้ไม่ต้องรอโหลดใหม่ทุกครั้ง
 */
export function listSubLocations(params: MasterListParams = {}): Promise<SubLocationOption[]> {
  return request<SubLocationOption[]>(`/master/sub-locations${toQuery({ ...params })}`, {
    method: 'GET',
  });
}

/**
 * GET /master/employees — แบ่งหน้า
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
