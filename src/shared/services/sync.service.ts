// สั่งดึงข้อมูลจาก SAP + อ่านว่าดึงล่าสุดเมื่อไหร่ - ปุ่มบน TopBar ใช้ไฟล์นี้ไฟล์เดียว
//
// ── สิ่งที่ต้องรู้ก่อนแก้ไฟล์นี้ ─────────────────────────────────────────────
//
// ★ กลไกกันยิงซ้ำอยู่ฝั่ง backend ทั้งหมด ไม่ใช่ที่นี่ (sync.engine.ts มีสามชั้น:
//   advisory lock กันรันซ้อน / cooldown กันกดถี่ / เทียบ updatedAt ในทรานแซกชัน)
//   อะไรที่เขียนฝั่งนี้เป็นแค่ UX ลดคำขอที่รู้อยู่แล้วว่าไร้ผล — กันจริงไม่ได้และไม่ต้องกัน
//   เพราะคนละแท็บ/คนละเครื่อง/คนละคน ฝั่ง client มองไม่เห็นกันอยู่แล้ว
//
// ★ 'SKIPPED' ไม่ใช่ error — แปลว่า "ไม่ต้องดึง เพราะเพิ่งดึงไป หรือมีรอบอื่นกำลังทำอยู่"
//   ซึ่งผลลัพธ์ที่ผู้ใช้ต้องการ (ข้อมูลสด) เกิดขึ้นแล้วจริง ๆ ต้องแสดงเป็นข้อความบวก
//   ห้ามขึ้นเป็น alert แดง ไม่งั้นคนจะสรุปว่าปุ่มพังแล้วกดซ้ำหนักกว่าเดิม
import { request } from './httpClient';

/** entity ที่ปุ่มบนหน้าจอสั่งได้ - ตรงกับ SYNC_DOCUMENT_ENTITIES ฝั่ง backend */
export const SYNC_DOCUMENT_ENTITIES = ['purchase_order', 'grpo'] as const;
export type SyncDocumentEntity = (typeof SYNC_DOCUMENT_ENTITIES)[number];

/** แถวสถานะของ (entity x company) หนึ่งคู่ - null = ยังไม่เคยรันเลย ไม่ใช่ error */
export interface SyncStateRow {
  companyCode: string;
  /** เวลาที่รอบล่าสุด "จบ" ทั้งทางสำเร็จและทางพัง - ฐานของ cooldown และของเวลาบนจอ */
  lastRunAt: string | null;
  lastStatus: 'SUCCESS' | 'FAILED' | null;
  lastError: string | null;
}

/** GET /sync/status - ทุกบริษัท ทุก entity (asset ติดมาด้วย แต่ปุ่มนี้ไม่ได้ใช้) */
export type SyncStatus = Record<
  string,
  Record<'purchase_order' | 'grpo' | 'asset', SyncStateRow | null>
>;

export function getSyncStatus(): Promise<SyncStatus> {
  return request<SyncStatus>('/sync/status', { method: 'GET' });
}

/**
 * GET /sync/scope - "ฉันสั่ง sync อะไรได้บ้าง"
 *
 * ★ ถามฝั่ง backend ไม่คิดเอง - กติกาว่า role ไหนข้ามบริษัทได้เป็นของ backend
 *   ถ้าก๊อปมาไว้ฝั่งนี้ด้วย วันที่กติกาเปลี่ยน สองชุดจะเพี้ยนจากกันโดยไม่มีอะไรฟ้อง
 *   (ตัวบังคับจริงอยู่ที่ตอนกดอยู่แล้ว ค่านี้ใช้แค่ตัดสินว่าจะวาดปุ่มยังไง)
 */
export interface SyncScope {
  /**
   * cooldown ที่ engine ใช้จริง (วินาที) - มาจาก env ฝั่ง backend
   *
   * ★ ห้าม hardcode ฝั่งนี้ - เป็นค่าที่แก้ได้โดยไม่ต้อง deploy วันที่คนปรับเป็น 600
   *   แล้วจอยังนับ 300 ปุ่มจะกลับมากดได้ตอนที่ยังกดไม่ได้จริง แล้วผู้ใช้เจอ SKIPPED
   *   ทั้งที่นับถอยหลังจนครบไปแล้ว
   */
  cooldownSeconds: number;
  /** true = เลือกบริษัทไหนก็ได้ (FINANCE/ADMIN/MANAGER) */
  unrestricted: boolean;
  /** บริษัทที่สังกัด - null เมื่อ unrestricted หรือเมื่อบัญชีไม่มีสังกัด */
  ownCompany: string | null;
  /** บริษัทที่กดได้จริง - ว่าง = ปุ่มต้องจาง แล้วอ่าน reason มาบอกเหตุผล */
  companies: string[];
  /** เหตุผลที่กดไม่ได้ - null = กดได้ (ข้อความพร้อมโชว์ ไม่ต้องแปลอีกชั้น) */
  reason: string | null;
}

export function getSyncScope(): Promise<SyncScope> {
  return request<SyncScope>('/sync/scope', { method: 'GET' });
}

/** ผลของ entity หนึ่งตัว - SKIPPED มี reason / FAILED มี error / SUCCESS มีตัวเลขแถว */
export type SyncEntityResult =
  | { status: 'SKIPPED'; reason: string }
  | { status: 'FAILED'; error: string }
  | { status: 'SUCCESS'; rowsHeader: number; rowsLine: number; rowsSkipped: number };

export type SyncDocumentsResult = Record<SyncDocumentEntity, SyncEntityResult>;

/**
 * POST /sync/company/:company/documents - ดึง PO แล้ว GRPO ของบริษัทนั้น
 *
 * ★ ยิงเส้นเดียว ไม่ใช่สองเส้นเรียงกัน - ลำดับ po -> grpo เป็นกติกาของข้อมูล
 *   (grpo อ้าง po line ที่ต้องมีอยู่ก่อน) ปล่อยให้หน้าจอคุมลำดับคือฝากกติกาไว้ผิดที่
 *
 * ★ ตัวหนึ่งพังไม่ทำให้ทั้งคำขอพัง - จะได้ผลกลับมาครบสองตัวเสมอ ตัวที่พังมี status FAILED
 *   อยู่ในก้อน ไม่ใช่ HTTP error ฝั่งนี้จึงต้องอ่านทีละตัว ไม่ใช่ดูแค่ว่า request ผ่านไหม
 */
export function syncDocuments(companyCode: string): Promise<SyncDocumentsResult> {
  return request<SyncDocumentsResult>(
    `/sync/company/${encodeURIComponent(companyCode)}/documents`,
    { method: 'POST' },
  );
}

/**
 * เวลาที่ "ข้อมูลสดถึง" ของบริษัทหนึ่ง - เอาตัวที่ **เก่ากว่า** ระหว่าง PO กับ GRPO
 *
 * ★ ห้ามใช้ตัวใหม่กว่า: ถ้า PO ดึงสำเร็จเมื่อ 1 นาทีที่แล้วแต่ GRPO ค้างมาตั้งแต่เมื่อวาน
 *   การโชว์ "1 นาทีที่แล้ว" คือการโม้ - ขอบเขตความสดจริงถูกกำหนดโดยตัวที่ล้าหลังที่สุด
 *
 * null = ยังไม่เคยรันเลยสักตัว (หรือรันไม่ครบ) - จอต้องเขียนว่า "ยังไม่เคย sync"
 * ไม่ใช่โชว์ค่าว่างเงียบ ๆ ซึ่งอ่านเหมือนระบบพัง
 */
export function documentsSyncedAt(status: SyncStatus, companyCode: string): string | null {
  const rows = status[companyCode];
  if (!rows) return null;

  const times = SYNC_DOCUMENT_ENTITIES.map((e) => rows[e]?.lastRunAt ?? null);
  // ตัวไหนยังไม่เคยรัน = ยังตอบไม่ได้ว่าสดถึงไหน ต้องเป็น null ไม่ใช่ข้ามตัวนั้นไป
  if (times.some((t) => t === null)) return null;
  return times.reduce((oldest, t) => (t! < oldest! ? t : oldest))!;
}
