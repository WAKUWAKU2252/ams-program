// services/asset.service.ts
//
// เรียก endpoint asset จริงของ Elysia (prefix /assets)
// หน้าฟอร์มลงทะเบียนใช้ getAssetSlots() เส้นเดียวก็เรนเดอร์ได้ทั้งหน้า (ช่อง + สถานะ + grpoNo ต่อชิ้น)
import { request } from './httpClient';
import type { AssetRequestStatus } from './assetRequest.service';
// envelope เดียวกับที่ /master/employees ใช้ - { data, total, page, limit }
import type { Paginated } from './master.service';

// ไฟล์ invoice ที่แนบกับรอบ GRPO (มาจาก attachment) - null = ยังไม่แนบ
export interface InvoiceFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
}

// รอบรับของต่อ po_item - บอกว่ารอบนี้รับมากี่ชิ้น ลงทะเบียนไปแล้วกี่ชิ้น
export interface SlotGrpoLine {
  id: string;
  grpoId: number; // ใช้เรียก PATCH/DELETE /grpo/:id/invoice
  grpoNo: string;
  grpoDate: string;
  receivedQty: number;
  // จำนวนที่คนแจ้งเองสำหรับรอบนี้ (null = ใช้ receivedQty ของ SAP ตามปกติ)
  // ใช้กับ PO งานเหมาที่ 1 หน่วยของ SAP = ของหลายชิ้น
  declaredQty: number | null;
  declaredReason: string | null;
  registered: number;
  invoices: InvoiceFile[];
}

// หนึ่ง "ช่อง" = หนึ่งชิ้นที่หน้าฟอร์มต้องเรนเดอร์ (จำนวนช่อง = po_item.quantity)
// discriminated union ตาม status - assetId/serialNumber/grpoNo มีเฉพาะช่องที่ลงทะเบียนแล้ว
// (TS จะบังคับให้เช็ค status === 'registered' ก่อนถึงจะอ่าน slot.grpoNo ได้)
/**
 * ป้ายสถานะที่หน้าจอต้องแสดง - backend คำนวณมาให้แล้ว **ห้ามคำนวณใหม่เอง**
 *
 * มันรวมสามแกน (ช่อง/ใบ/ชิ้น) ที่ระบบเก็บแยกกัน และต้องอ่านจาก "ใบเจ้าของชิ้น" ไม่ใช่
 * "ใบที่กำลังเปิดดู" - สองอย่างนี้ต่างกันเสมอเมื่อ PO เดียวมีหลายรอบ ป้ายเดิมที่ frontend
 * derive เองพลาดตรงนี้ ทำให้ชิ้นที่อนุมัติแล้วขึ้น Saved
 */
export type SlotDisplayStatus =
  | 'noGrpo'
  | 'pendingCreation'
  | 'saved'
  | 'pendingManager'
  | 'rejected'
  | 'approved'
  | 'registered'
  | 'cancelled';

export type AssetSlot =
  | {
      /** ลำดับบนจอของ PO line นี้ (1..n) - คนละตัวกับ unitNo */
      index: number;
      status: 'registered';
      /** ★ ป้ายที่ต้องแสดง - ใช้ค่านี้ตรง ๆ */
      displayStatus: SlotDisplayStatus;
      assetId: number;
      /** เลขชิ้นจริงในตาราง (unique ต่อ PO line ข้ามใบคำขอ) */
      unitNo: number;
      /**
       * ใบคำขอที่เป็นเจ้าของชิ้นนี้ - ไม่เท่ากับใบที่กำลังเปิดอยู่ก็ได้
       *
       * PO เดียวเปิดคำขอได้หลายรอบ และ backend นับช่องข้ามใบ (ไม่งั้นของที่ลงในใบก่อน
       * จะโผล่เป็นช่องว่างให้กรอกซ้ำแล้วชน unique ตอนบันทึก) ของใบอื่น = อ่านได้อย่างเดียว
       */
      requestId: number;
      /**
       * ใครเป็นคนเปิดใบที่ชิ้นนี้สังกัด - null = ผู้ใช้ถูกลบไปแล้ว
       *
       * ★ ใช้บอกทางเมื่อชิ้นเป็นของใบอื่น: "อยู่ในคำขอ #12 · เปิดโดย สมชาย" ไม่งั้นคนที่
       *   เห็นชิ้นถูกตีกลับแล้วแก้ไม่ได้ จะไม่รู้ว่าต้องเปิดใบไหนหรือไปคุยกับใคร
       */
      requestCreatedByName: string | null;
      serialNumber: string | null;
      acquisitionCost: number; // ราคาจริงต่อชิ้น (ชิ้นที่แตกเพิ่ม = 0)
      lifecycle: 'DRAFT' | 'REGISTERED' | 'CANCELLED'; // ดิบ ๆ จากตาราง - ป้ายใช้ displayStatus แทน
      // id ของรูปที่แนบ (null = ยังไม่แนบ) - เป็น id ไม่ใช่ URL เพราะไฟล์อยู่หลัง authGuard
      // แปลงเป็นรูปที่แสดงได้ด้วย fileBlobUrl() ซึ่งแนบ token ให้
      imageId: string | null;
      /** ชื่อสถานที่ที่ของชิ้นนี้จะไปอยู่ (null = ยังไม่ระบุ) - ใช้ในใบแจ้งขออนุมัติ */
      locationName: string | null;
      /** ตำแหน่งย่อย (null = ไม่ได้ระบุ) - ต่อท้าย locationName ในใบแจ้งขออนุมัติ */
      subLocationName: string | null;

      // ── ที่ตั้งแบบชี้บนผังได้ - กล่องรายชิ้นของบัญชีใช้วาดผัง (ชุดเดียวกับ InventoryItem)
      /** true = สถานที่ของชิ้นนี้อยู่นอกผังของไซต์นี้ - คนละเรื่องกับ "ยังไม่ระบุห้อง" */
      locationOutPlan: boolean;
      /** null = ทะเบียนยังไม่ระบุว่าอยู่ห้องไหน */
      subLocationId: number | null;
      /** ผังชั้นที่ห้องอยู่ - null ได้ทั้งกรณีไม่ระบุห้อง และห้องที่ยังไม่ถูกตีขอบเขตลงผัง */
      planKey: string | null;
      /** หมุดบนผัง (สัดส่วน 0-1) - null = รู้ห้องแต่ยังไม่ได้ปักจุด */
      posX: number | null;
      posY: number | null;
      /** หมวด - ใช้เลือกไอคอนของหมุดเท่านั้น หน้านี้ไม่มีช่องหมวดให้แสดง */
      categoryName: string | null;

      grpoLineId: string;
      grpoNo: string; // ← ชิ้นนี้มาจากรอบไหน (asset.grpoLine.grpo.grpoNo) - committed
      /** ผู้ถือครอง (null = ของกลาง ไม่มีคนถือ) - สูตรชื่อเดียวกับ dropdown ในฟอร์ม */
      employeeName: string | null;
      /** แผนกที่สังกัด - คนละแกนกับผู้ถือครอง ของกลางไม่มีคนถือแต่มีแผนกได้ */
      departmentName: string | null;
      /** ระยะประกัน - ดิบทั้งคู่ ฝั่งนี้ประกอบเป็นข้อความเอง */
      warrantyStartDate: string | null;
      warrantyEndDate: string | null;

      // ── ใครตัดสินใจอะไรกับชิ้นนี้ (backend เลือกมาให้แล้วว่าเป็นระดับใบหรือระดับชิ้น)
      /** เลข SAP - มีเมื่อ displayStatus = 'registered' */
      assetNumber: string | null;
      /**
       * URL ที่ฝังอยู่ใน QR ของสติกเกอร์ชิ้นนี้ (null = ยังไม่มีเลข จึงยังไม่มี QR)
       *
       * วาดรูป QR จากค่านี้ตรง ๆ ห้ามประกอบ URL เองจาก assetNumber - ค่านี้คือสิ่งที่ถูก
       * เก็บไว้ตอนออกเลขและตรงกับที่พิมพ์ลงสติกเกอร์จริง ถ้าประกอบเองจะเห็นค่าที่ "ควรเป็น"
       * แล้วความไม่ตรงกันระหว่างจอกับของจริงจะไม่มีใครเห็น
       */
      qrCode: string | null;
      /** ผู้อนุมัติใบที่ชิ้นนี้สังกัด */
      approvedByName: string | null;
      /**
       * ใครออกเลขให้ชิ้นนี้ (null = ยังไม่มีเลข หรือเป็นชิ้นเก่าก่อน 0019 ที่ไม่ได้บันทึกไว้)
       * รายชิ้น ไม่ใช่ "คนกดปิดทั้งใบ" ซึ่งยังว่างตลอดช่วงที่บัญชีทยอยออกเลข
       */
      registeredByName: string | null;
      /** เหตุผลที่ถูกตีกลับ (ระดับชิ้นชนะระดับใบ) */
      rejectReason: string | null;
      rejectedByName: string | null;
      /** ตีกลับมาจากไหน - MANAGER (ทั้งใบ) หรือ FINANCE (รายชิ้น) */
      rejectedRole: string | null;
      /**
       * เคยถูกตีกลับและผู้ขอแก้กลับมาแล้ว แต่ยังไม่ได้ออกเลข
       *
       * ไม่ใช่สถานะใหม่ - ชิ้นนี้อยู่ในคิวออกเลขเหมือนชิ้นปกติทุกอย่าง เป็นแค่ป้ายบอกบัญชี
       * ว่า "ตัวนี้เคยสั่งให้แก้ไป ตรวจซ้ำก่อนออกเลข" (backend ล้างให้เองเมื่อออกเลข/ปิดถาวร/ตีกลับซ้ำ)
       */
      rejectFixed: boolean;
      cancelReason: string | null;
      cancelledByName: string | null;
    }
  | {
      index: number;
      status: 'pending'; // ของมาถึงแล้ว ยังไม่ลง - กรอกได้
      displayStatus: 'pendingCreation';
      /** เลขชิ้นที่ backend จองไว้ให้ช่องนี้ - ต้องส่งค่านี้กลับไปตอน POST /assets */
      unitNo: number;
      grpoLineId: string; // รอบที่คาดว่าจะไปผูก (allocate ตาม capacity) - pre-fill ตอนลงทะเบียน
      grpoNo: string;
    }
  | { index: number; status: 'noGrpo'; displayStatus: 'noGrpo' }; // ของยังมาไม่ถึง

export interface AssetSlotItem {
  poItemId: string;
  poLine: number;
  itemDescription: string;
  unitPrice: number;
  ordered: number; // = po_item.quantity
  received: number; // = Σ grpo_line.receivedQty
  registered: number; 
  planned: number;
  lineAmount: number; 
  registeredCost: number; // ยอดรวมราคาที่กรอกไปแล้ว
  isDeclared: boolean; // บรรทัดนี้มีการแจ้งจำนวนเองอย่างน้อยหนึ่งรอบ
  overQty: boolean; // จำนวนที่จะลงเกินที่ PO สั่ง
  overCost: boolean; // ยอดเงินที่กรอกเกินยอดบรรทัดใน PO
  grpoLines: SlotGrpoLine[];
  slots: AssetSlot[];
  lineTotal: number;
}

export interface AssetSlotsResponse {
  requestId: number;
  poNumber: string;
  status: AssetRequestStatus;
  /**
   * เหตุผลที่หัวหน้าตีกลับ - backend ส่งมาเฉพาะตอน status = 'REJECTED' เท่านั้น
   * (ใบที่ส่งใหม่แล้วจะได้ null คืนมา แม้คอลัมน์ใน DB ยังเก็บเหตุผลรอบก่อนไว้เป็นประวัติ)
   * null ตอน REJECTED ได้ด้วย - การ์ด Teams ส่ง comment ว่างมาได้
   */
  rejectReason: string | null;
  items: AssetSlotItem[];
}

// GET /assets?requestId= - คืนช่องทั้งหมดของใบคำขอ พร้อมสถานะ + grpoNo ต่อชิ้น
export function getAssetSlots(requestId: number): Promise<AssetSlotsResponse> {
  return request<AssetSlotsResponse>(`/assets?requestId=${requestId}`, { method: 'GET' });
}

// ── กรอก/แก้รายละเอียดสินทรัพย์รายชิ้น (ฟอร์มใน AssetFormDialog) ──────────
// ตรงกับ createAssetBody / updateAssetBody ของ backend เป๊ะ - ฟิลด์ไหน optional ที่นั่น
// ก็ optional ที่นี่ ส่ง undefined ไม่ใช่ '' เมื่อผู้ใช้เว้นว่าง (คอลัมน์เป็น nullable)
export interface AssetFormPayload {
  description?: string;
  /**
   * null = ลบเลขเครื่องที่เคยกรอกไว้ (ใช้ได้เฉพาะตอน PATCH)
   *
   * undefined = ไม่ได้แก้ช่องนี้ backend จะไม่แตะคอลัมน์ - ถ้าส่ง undefined ตอนผู้ใช้ลบช่อง
   * ค่าเดิมจะยังอยู่โดยไม่มีอะไรบอกว่าไม่ได้ลบ (หลักเดียวกับ imageId)
   * ฝั่ง POST รับ null ไม่ได้ - ไม่มีเลขเครื่องก็แค่ไม่ส่ง key มา
   */
  serialNumber?: string | null;
  assetClass?: string;
  categoryId?: number;
  /** string ไม่ใช่ id ตั้งแต่ 0012 - ตาราง uom ถูกถอด หน่วยนับมาจาก OITM.InvntryUom */
  uom?: string;
  locationId?: number;
  /** null = ล้างห้องที่เคยเลือกไว้ (PATCH เท่านั้น) / ไม่ส่ง key = ไม่แตะ - ทรงเดียวกับ posX */
  subLocationId?: number | null;
  /**
   * หมุดตำแหน่งบนผังชั้น - สัดส่วนของภาพ 0–1 ต้องมาคู่กันและต้องมี subLocationId ด้วย
   * null = ถอนหมุด (PATCH เท่านั้น) / ไม่ส่ง key = ไม่แตะ
   * ★ ย้ายห้องโดยไม่ส่งสองช่องนี้ = backend ล้างหมุดเก่าให้เอง ไม่ต้องส่ง null มา
   */
  posX?: number | null;
  posY?: number | null;
  departmentId?: number;
  employeeId?: number;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  acquisitionCost?: number;
  /**
   * null = ถอดรูปที่แนบไว้ออก (ใช้ได้เฉพาะตอน PATCH)
   *
   * undefined = ไม่ได้แก้ช่องนี้ backend จะไม่แตะคอลัมน์
   * ฝั่ง POST รับ null ไม่ได้ - ไม่มีรูปก็แค่ไม่ส่ง key มา
   */
  imageId?: string | null;
  brand?: string;
  model?: string;
}

export interface CreateAssetPayload extends AssetFormPayload {
  requestId: number;
  grpoLineId: string;
  // เลขช่องที่ผู้ใช้เห็นบนฟอร์ม - ส่งไปเพื่อให้ชิ้นที่บันทึกตรงกับช่องที่กด ไม่ใช่ต่อท้ายให้
  unitNo?: number;
  // ── ห้าช่องที่ create บังคับ (ตรงกับ createAssetBody ของ backend เป๊ะ) ──────────
  //
  // แคบกว่าตัวแม่ทั้งชุด: ตัวแม่เป็นชนิดของ PATCH ที่ทุกช่อง optional และบางช่องส่ง null
  // ได้ (= ลบค่า) ส่วน POST ส่ง null ไม่ได้เลยและสี่ช่องล่างขาดไม่ได้ - ประกาศไว้ให้
  // compiler จับตั้งแต่ตอนคอมไพล์ แทนที่จะไปเจอเป็น 422 ตอนผู้ใช้กดบันทึก
  //
  // ★ locationId เป็น FK NOT NULL ที่ DB มาแต่ไหนแต่ไร ส่วน subLocationId/posX/posY/imageId
  //   เพิ่งมาบังคับตอนสร้างตามกติกาใหม่ (ของที่ไม่มีห้อง+หมุดคือของที่ตรวจนับหาไม่เจอ
  //   ส่วนรูปคือสิ่งเดียวที่คนหน้างานใช้ยืนยันว่าของตรงหน้าคือชิ้นเดียวกับในทะเบียน)
  //   - ฝั่ง PATCH ยังปล่อยทั้งสี่ช่องเป็น optional เหมือนเดิม ของเก่าจึงยังแก้ช่องอื่นได้
  //
  // categoryId/uomId ไม่อยู่ในนี้เพราะถูกถอดออกจาก createAssetBody แล้วใน migration 0007
  // (คอลัมน์เป็น nullable แล้ว) - สองตัวนั้นอยู่ที่ OITM ของ SAP ไม่ได้อยู่บน PO
  // คนกรอกฟอร์มจึงไม่มีทางรู้ ต้องรอ job ที่ map จาก itemCode มาเติมทีหลัง
  locationId: number;
  // ★ สามช่องนี้ optional แล้ว - บังคับหรือไม่ขึ้นกับสถานที่ที่เลือก:
  //   สถานที่ที่ outPlan = true (ต่างประเทศ/สาขาอื่น) ไม่มีห้องอยู่บนผังของไซต์นี้ให้เลือก
  //   และไม่มีจุดให้ปัก ตัวบังคับจริงอยู่ที่ assertPlacementUsable ฝั่ง backend
  subLocationId?: number;
  posX?: number;
  posY?: number;
  imageId: string;
}

/**
 * รายละเอียดของชิ้นที่บันทึกไว้แล้ว - ใช้เติมฟอร์มตอนกดแก้ไข
 *
 * GET /assets/:id คืนทั้งแถวพร้อม relation (category/uom/location/employee/image)
 * ที่นี่ประกาศเฉพาะช่องที่ฟอร์มใช้ - ฟิลด์อื่นยังมาด้วยแต่ไม่ได้ประกาศไว้
 *
 * ⚠️ warrantyStartDate/EndDate เป็น ISO เต็ม ('2026-08-13T00:00:00.000Z') ไม่ใช่ 'YYYY-MM-DD'
 *    ที่ AppDatePicker ใช้ - ผู้เรียกต้องตัดเอง
 */
export interface AssetDetail {
  id: number;
  description: string | null;
  serialNumber: string | null;
  assetClass: string | null;
  acquisitionCost: number;
  locationId: number;
  subLocationId: number | null;
  posX: number | null;
  posY: number | null;
  /**
   * ห้องที่ผูกอยู่ - มาจาก relation ของ GET /assets/:id ใช้โชว์ ตึก/ชั้น/ห้อง โดยไม่ต้องยิงผังซ้ำ
   *
   * location ข้างในคือ "ตึก" (asset_location ที่ isPlanArea) คนละตัวกับ AssetDetail.locationId
   * ซึ่งเป็นสถานที่ทางบัญชี - สองแกนนี้ตั้งใจให้ไม่ตรงกัน (ดู 0022/0023)
   */
  subLocation: {
    id: number;
    code: string;
    floor: string | null;
    room: string | null;
    planKey: string | null;
    location: { id: number; name: string } | null;
  } | null;
  departmentId: number | null;
  employeeId: number | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  imageId: string | null;
  lifecycle: 'DRAFT' | 'REGISTERED';
}

/**
 * สินทรัพย์หนึ่งชิ้นที่ตั้งอยู่ในห้อง - หน้าแผนผังใช้
 *
 * รูปนี้เบากว่า InventoryItem เพราะไม่มีตัวเลขบัญชี: หน้าผังตอบ "ในห้องนี้มีอะไรบ้าง"
 * ไม่ใช่ "ชิ้นนี้มูลค่าเท่าไร" - ยัดยอดบัญชีมาด้วยคือ join ทิ้งทุกครั้งที่คลิกดูห้อง
 *
 * ★ เส้นนี้คืนเฉพาะของที่ลงทะเบียนแล้ว (REGISTERED) - ของที่ยังไม่ออกเลขกับของที่บัญชี
 *   ปิดถาวรแล้วไม่นับว่าอยู่ในห้อง จึงไม่มี lifecycle ในรูปนี้ (ทุกแถวค่าเดียวกันหมด)
 */
export interface RoomAsset {
  id: number;
  companyCode: string;
  /** ชนิดยังเป็น nullable ตามคอลัมน์จริง แต่มีค่าเสมอ - ของที่ REGISTERED ต้องมีเลขแล้ว */
  assetNumber: string | null;
  description: string | null;
  serialNumber: string | null;
  imageId: string | null;
  categoryName: string | null;
  departmentName: string | null;
  holderName: string | null;
  status: string;
  /** ตำแหน่งบนผัง - null = ระบุห้องแล้วแต่ยังไม่ได้ปักหมุด */
  posX: number | null;
  posY: number | null;
}

export interface RoomAssetsResponse {
  /** จำนวนทั้งหมดในห้อง - เป็นของทั้งห้อง ไม่ใช่ของหน้านี้ */
  total: number;
  /** เฉพาะของหน้านี้ ไม่เกิน pageSize - ผู้เรียกเป็นคนสะสมข้ามหน้าเอง */
  items: RoomAsset[];
  page: number;
  pageSize: number;
  /**
   * ยังมีหน้าถัดไปไหม
   *
   * ★ ใช้ค่านี้ตัดสินว่าจะโหลดต่อไหม ห้ามเทียบ `ที่สะสมไว้ < total` เอง - ถ้ามีคนย้ายของ
   *   เข้า/ออกห้องระหว่างที่ผู้ใช้เลื่อนอยู่ total ของสองรอบจะคนละค่า แล้วจะกลายเป็น
   *   ยิงไม่หยุดหรือหยุดก่อนของหมด (backend รู้ offset จริงจึงตอบได้ถูกกว่า)
   */
  hasMore: boolean;
}

/**
 * GET /assets/by-room/:subLocationId - ของที่ตั้งอยู่ในห้องนั้น (ไม่รวมชิ้นที่ปิดถาวรแล้ว)
 *
 * แบ่งหน้าทีละ 50 - ขนาดหน้าเป็นของ backend ส่งมาให้ใน pageSize ไม่ใช่ค่าที่หน้าจอตั้งเอง
 * (ทุกชิ้นที่ได้มาจะถูกวาดเป็นหมุดบนผังด้วย หน้าที่ใหญ่กว่านี้ = ดงหมุดทับกัน)
 */
export function listAssetsInRoom(subLocationId: number, page = 1): Promise<RoomAssetsResponse> {
  return request<RoomAssetsResponse>(`/assets/by-room/${subLocationId}?page=${page}`, {
    method: 'GET',
  });
}

/** GET /assets/:id - รายละเอียดรายชิ้น */
export function getAsset(id: number): Promise<AssetDetail> {
  return request<AssetDetail>(`/assets/${id}`, { method: 'GET' });
}

/** POST /assets - ลงทะเบียนชิ้นใหม่ในช่องที่ยังว่าง */
export function createAsset(payload: CreateAssetPayload): Promise<{ id: number }> {
  return request<{ id: number }>('/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** PATCH /assets/:id - แก้ชิ้นที่กรอกไว้แล้ว (ทุกฟิลด์ optional) */
export function updateAsset(id: number, payload: AssetFormPayload): Promise<{ id: number }> {
  return request<{ id: number }>(`/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /assets/:id/location - ย้ายที่ตั้งบนผังของชิ้นที่ "ลงทะเบียนแล้ว"
 *
 * ★ ห้ามใช้ updateAsset() แทน - เส้นนั้นปฏิเสธ lifecycle = REGISTERED ทั้งก้อนด้วยข้อความ
 *   "ออกเลขแล้ว แก้ที่นี่ไม่ได้ ต้องแก้ที่ SAP" ซึ่งครอบคลุมของแทบทั้งทะเบียน
 *   (วัด 2026-09-07: 3,518 จาก 3,521 ชิ้นที่มีเลข) เส้นนี้จึงเป็นทางเดียวที่ใช้ได้จริง
 *
 * ★ สามช่องต้องมาครบและห้ามเป็น null - backend ไม่รับรูป partial โดยตั้งใจ
 *   ตรงกับกล่องเลือกสถานที่ที่ยืนยันไม่ได้ถ้าไม่มีทั้งห้องและหมุด
 */
export function updateAssetLocation(
  id: number,
  payload: { subLocationId: number; posX: number; posY: number },
): Promise<{ id: number }> {
  return request<{ id: number }>(`/assets/${id}/location`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /assets/:id/image - เปลี่ยนรูปของชิ้นที่ "ลงทะเบียนแล้ว"
 *
 * ★ ห้ามใช้ updateAsset() แทน - เหตุผลเดียวกับ updateAssetLocation ข้างบน
 *   (เส้นนั้นปฏิเสธ REGISTERED ทั้งก้อน ซึ่งคือของแทบทั้งทะเบียน)
 *
 * ★ imageId ต้องมาจาก uploadModuleFiles('ASSET_IMG', ...) ก่อนเสมอ - เส้นนี้ไม่รับตัวไฟล์
 *   แค่ผูก id ที่อัปไว้แล้วเข้ากับชิ้นนั้น (แพทเทิร์นเดียวกับตอนสร้าง)
 *
 * ★ รูปเก่าไม่ต้องลบเอง - พอ PATCH ผ่าน มันจะไม่มีใครชี้ถึงแล้ว cleanupOrphans ฝั่ง
 *   backend กวาดให้ใน 24 ชม. (ลบเองแล้ว PATCH ล้มทีหลัง = รูปเดิมหายทั้งที่ยังต้องใช้)
 */
export function updateAssetImage(id: number, imageId: string): Promise<{ id: number }> {
  return request<{ id: number }>(`/assets/${id}/image`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId }),
  });
}

// ── หน้า My asset ───────────────────────────────────────────────────────────

/**
 * ชุดตัวเลขบัญชีที่ sync มาจาก SAP
 *
 * ⚠️ ทุกช่องเป็นตัวเลขของปี `fiscalYear` ไม่ใช่ปีปัจจุบันเสมอไป - ของที่ตัดจำหน่าย/หยุด
 * คิดค่าเสื่อมแล้วจะค้างที่ปีสุดท้ายของมัน (วัด 2026-08-20: 25% ของทะเบียนไม่ใช่ปีล่าสุด)
 * **ห้ามแสดงยอดโดยไม่แสดงปีกำกับ** และห้ามเอายอดข้ามปีมาบวกกันเป็นยอดรวม
 */
export interface MyAssetAccounting {
  fiscalYear: number;
  bookedCost: number | null;
  accumulatedDepreciation: number | null;
  /** backend คำนวณให้ (bookedCost − accumulatedDepreciation) - ห้ามลบเองที่นี่ */
  netBookValue: number | null;
  salvageValue: number | null;
  /** หน่วยเป็น **เดือน** ตามที่ SAP เก็บ - 0 ได้จริง เช่นที่ดินที่ไม่คิดค่าเสื่อม */
  usefulLifeMonths: number | null;
  remainingLifeMonths: number | null;
  depreciationMethod: string | null;
  depreciationStart: string | null;
  depreciationEnd: string | null;
  syncedAt: string;
}

export interface MyAssetItem {
  id: number;
  /**
   * บริษัทเจ้าของชิ้น - จำเป็นสำหรับเปิดรายละเอียดผ่าน AssetDetailModal (ยิง /assets/by-number)
   * ★ เลขสินทรัพย์ซ้ำกันข้ามบริษัทจริง 24 ตัว เลขเปล่าจึงชี้ได้สองชิ้น ต้องมาคู่กันเสมอ
   */
  companyCode: string;
  assetNumber: string | null;
  description: string | null;
  imageId: string | null;
  /**
   * URL ที่ฝังใน QR บนสติกเกอร์ - **วาดจากค่านี้เท่านั้น ห้ามประกอบเองจาก assetNumber**
   * ค่านี้คือค่าที่ตรงกับสติกเกอร์ที่พิมพ์แปะไปแล้ว ถ้าจอประกอบเอง วันที่โดเมนเปลี่ยน
   * จอจะโชว์ QR ที่ไม่ตรงกับของจริงบนเครื่องโดยไม่มีอะไรฟ้อง
   */
  qrCode: string | null;
  categoryName: string | null;
  locationName: string;
  subLocationName: string | null;
  acquisitionDate: string | null;
  /** ราคาที่เสนอ/ยอดใบกำกับ - คนละค่ากับ accounting.bookedCost (APC ทางบัญชี) */
  acquisitionCost: number | null;
  accounting: MyAssetAccounting | null;
}

export interface MyAssetsResponse {
  /** false = บัญชีผู้ใช้ยังไม่ผูกกับพนักงาน (คนละเรื่องกับ "ไม่มีสินทรัพย์") */
  linkedToEmployee: boolean;
  items: MyAssetItem[];
}

/** GET /assets/mine - สินทรัพย์ในความดูแลของคนที่ล็อกอินอยู่ (ยึดจาก token ไม่ส่ง id ไป) */
export function getMyAssets(): Promise<MyAssetsResponse> {
  return request<MyAssetsResponse>('/assets/mine', { method: 'GET' });
}

// ── หน้ารายละเอียดจากการสแกน QR ─────────────────────────────────────────────

export interface AssetByNumberDetail {
  id: number;
  /**
   * บริษัทเจ้าของชิ้น - อ่านจากค่านี้ ไม่ใช่จาก route param ที่หน้าจอส่งไปเอง
   *
   * ★ เลขสินทรัพย์ซ้ำกันข้ามบริษัทจริง 24 ตัว หน้าที่โชว์แต่เลขจึงกำกวมโดยตัวมันเอง
   *   โดยเฉพาะปลายทาง QR ที่คนสแกนมาถึงโดยไม่ได้เลือกบริษัทเอง
   */
  companyCode: string;
  assetNumber: string;
  description: string | null;
  imageId: string | null;
  serialNumber: string | null;
  uom: string | null;
  assetClass: string | null;
  status: string;
  lifecycle: string;
  categoryName: string | null;
  locationName: string;
  subLocationName: string | null;

  // ── ที่ตั้งแบบชี้บนผังได้ - ชุดเดียวกับที่ InventoryItem มี ──────────────
  /** true = สถานที่ของชิ้นนี้อยู่นอกผังของไซต์นี้ - คนละเรื่องกับ "ยังไม่ระบุห้อง" */
  locationOutPlan: boolean;
  /** null = ทะเบียนยังไม่ระบุว่าอยู่ห้องไหน */
  subLocationId: number | null;
  /** null ได้ทั้งกรณีไม่ระบุห้อง และห้องที่ยังไม่ถูกตีขอบเขตลงผัง */
  planKey: string | null;
  floor: string | null;
  /** หมุดบนผัง (สัดส่วน 0-1) - null = รู้ห้องแต่ยังไม่ได้ปักจุด */
  posX: number | null;
  posY: number | null;

  departmentName: string | null;
  /** null = ทะเบียนยังไม่ระบุผู้ถือครอง (ของเก่าส่วนใหญ่เป็นแบบนี้) */
  holderName: string | null;
  /** วันที่บัญชีคีย์รหัสสินทรัพย์เข้า SAP (OITM.CreateDate) = "วันที่ลงทะเบียน" บนจอ */
  sapCreatedDate: string | null;
  /** ยังรับไว้แม้หน้าจอเลิกโชว์แล้ว - ดูหมายเหตุที่ AppAssetDetail */
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  /**
   * ระยะประกัน - สอง nullable อิสระจากกัน มีครบ 4 กรณีจริง
   * (ไม่มีเลย / มีแต่วันเริ่ม / มีแต่วันจบ / มีทั้งคู่) ฝั่งแสดงผลต้องเขียนครบทุกกรณี
   */
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  accounting: MyAssetAccounting | null;
}

/**
 * GET /assets/by-number?company=...&number=... - ค้นด้วยเลขสินทรัพย์ที่สแกนมาจาก QR
 *
 * ส่งเป็น query ไม่ใช่ path เพราะเลขจริงบางตัวมี '/' (MAC-212-13-001/1) ซึ่ง %2F ใน path
 * จะถูก decode ก่อน match แล้ว 404 - ฝั่ง backend ก็รับเป็น query ด้วยเหตุผลเดียวกัน
 *
 * ★ ต้องส่งบริษัทไปด้วย - ไม่ใช่เรื่องสิทธิ์ แต่เป็นเรื่องความกำกวม: เลขสินทรัพย์
 *   ซ้ำกันข้ามบริษัทจริง 24 ตัว เลขเปล่าจึงตอบได้สองชิ้น ค่านี้มาจาก URL ที่ QR ฝังไว้
 *   (backend ประกอบ URL ให้ตอนออกเลข - ฝั่งนี้ไม่เคยประกอบเอง)
 */
export function getAssetByNumber(
  companyCode: string,
  assetNumber: string,
): Promise<AssetByNumberDetail> {
  const qs = new URLSearchParams({ company: companyCode, number: assetNumber });
  return request<AssetByNumberDetail>(`/assets/by-number?${qs}`, { method: 'GET' });
}

/** "เลขนี้เป็นของบริษัทไหนบ้าง" - คืนแค่รหัสบริษัท ไม่มีข้อมูลของชิ้นนั้น */
export interface AssetNumberMatch {
  companyCode: string
}

/**
 * GET /assets/resolve-number - กู้ QR รูปแบบเก่าที่ URL ไม่มีรหัสบริษัท
 *
 * ★ ห้ามใช้เป็นทางค้นด้วยเลขทั่วไป - เลขสินทรัพย์ซ้ำกันข้ามบริษัทจริง 24 ตัว เส้นนี้จึง
 *   ตอบเป็น array เสมอ หน้าที่ของมันคือพาไป /assets/:company/:assetNumber ที่ถูกต้อง
 *   ไม่ใช่ตอบว่าของชิ้นนั้นคืออะไร (นั่นเป็นงานของ getAssetByNumber ซึ่งบังคับระบุบริษัท)
 *
 * เปิดสาธารณะเหมือน by-number - คนที่สแกนสติกเกอร์เก่ายังไม่ได้ล็อกอินเหมือนกัน
 */
export function resolveAssetNumber(assetNumber: string): Promise<AssetNumberMatch[]> {
  const query = new URLSearchParams({ number: assetNumber })
  return request<AssetNumberMatch[]>(`/assets/resolve-number?${query.toString()}`, { method: 'GET' })
}

// ── หน้า Asset Inventory - ทะเบียนสินทรัพย์ทั้งบริษัท ───────────────────────

/** ยอดบัญชีแบบย่อสำหรับแถวในตาราง - รายละเอียดเต็มอยู่ในหน้าของชิ้นนั้น */
export interface InventoryAccounting {
  /**
   * ปีบัญชีของตัวเลขชุดนี้ - **ไม่ใช่ปีปัจจุบันเสมอไป**
   *
   * ของที่ตัดจำหน่าย/หยุดคิดค่าเสื่อมแล้วจะค้างที่ปีสุดท้ายของมัน ต้องติดป้ายปีคู่กับยอด
   * ทุกที่ที่แสดง ไม่งั้นคนจะอ่านเลขปี 2022 เป็นมูลค่าของวันนี้ (กติกาเดียวกับหน้า My asset)
   */
  fiscalYear: number
  /** null = คำนวณไม่ได้ (SAP ให้ตัวเลขมาไม่ครบ) - ต่างจาก 0 ที่แปลว่าตัดค่าเสื่อมครบแล้ว */
  netBookValue: number | null
  /**
   * อายุคงเหลือหน่วยเป็น**เดือน** ตามที่ SAP เก็บ (ITM7.RemainLife) - ใช้ formatMonths() แปลง
   *
   * 0 = คิดค่าเสื่อมครบแล้ว / null = SAP ยังไม่มีพารามิเตอร์ค่าเสื่อมให้ชิ้นนี้ คนละความหมายกัน
   * (กติกาเดียวกับ netBookValue ข้างบน)
   */
  remainingLifeMonths: number | null
}

export interface InventoryItem {
  id: number
  /** ใช้ประกอบลิงก์ /assets/:company/:assetNumber - เลขสินทรัพย์ซ้ำกันข้ามบริษัทได้ */
  companyCode: string
  assetNumber: string
  description: string | null
  serialNumber: string | null
  imageId: string | null
  categoryName: string | null
  departmentName: string | null
  locationName: string
  subLocationName: string | null
  /** null = ทะเบียนยังไม่ระบุผู้ถือครอง */
  holderName: string | null
  status: string
  /** วันที่ตั้งหนี้ = วันที่ใบกำกับซื้อใบแรก - **ไม่ใช่วันได้ของ** (ใบกำกับออกหลังรับของได้เป็นเดือน) */
  acquisitionDate: string | null
  /** วันที่ Finance ออกเลขสินทรัพย์ให้ใน SAP (OITM.CreateDate) = "ลงทะเบียนเมื่อ" ตัวจริง */
  sapCreatedDate: string | null
  /** null = SAP ยังไม่มียอดบัญชีให้ชิ้นนี้ */
  accounting: InventoryAccounting | null

  // ── ที่ตั้งแบบชี้บนผังได้ - หน้า Audit ใช้ ────────────────────────────────
  // subLocationName เป็นข้อความไว้อ่าน ส่วนสี่ตัวนี้คือของที่เอาไปชี้บนแผนที่ได้จริง
  /** null = ทะเบียนยังไม่ระบุว่าอยู่ห้องไหน */
  subLocationId: number | null
  /** ผังชั้นที่ห้องอยู่ - null ได้ทั้งกรณีไม่ระบุห้อง และห้องที่ยังไม่ถูกตีขอบเขตลงผัง */
  planKey: string | null
  floor: string | null
  /** หมุดบนผัง (สัดส่วน 0-1) - null = รู้ห้องแต่ยังไม่ได้ปักจุด */
  posX: number | null
  posY: number | null
}

export interface InventoryParams {
  page?: number
  limit?: number
  /** ค้นพร้อมกันสามช่อง: เลขสินทรัพย์ / รายละเอียด / เลขเครื่อง */
  search?: string
  departmentId?: number
  /** รหัสบริษัท เช่น 'UBA' - ตารางบน Dashboard ส่งมาให้ตรงกับการ์ดสรุปข้างบน */
  companyCode?: string
  locationId?: number
  /**
   * ผู้ถือครอง - id ของ **employee** ไม่ใช่ user (ผู้ถือครองเป็นตัวตนฝั่ง HR ซึ่งมีคนที่
   * ไม่มีบัญชีเข้าระบบรวมอยู่ด้วย) ตรงกับ assetInventoryQuery.employeeId ของ backend
   * ★ ส่ง 0 ไม่ได้ - backend บังคับ minimum: 1 และ 0 ไม่ได้แปลว่า "ยังไม่ระบุผู้ถือครอง"
   */
  employeeId?: number
  status?: string
  /**
   * ปีบัญชีของตัวเลขที่ sync มา - **ไม่ใช่ปีที่ซื้อ**
   * ★ กรองด้วยตัวนี้แล้ว ชิ้นที่ยังไม่มีตัวเลขบัญชีจะหายจากผลลัพธ์ (เทียบปีไม่ได้)
   */
  fiscalYear?: number
  /**
   * ช่วงมูลค่าคงเหลือ
   * ★ ชิ้นที่ SAP ให้ตัวเลขมาไม่ครบจะหายจากผลลัพธ์เช่นกัน - คำนวณ NBV ไม่ได้จึงเทียบไม่ได้
   */
  minNetBookValue?: number
  maxNetBookValue?: number
  /**
   * เรียงตามอะไร - ไม่ส่ง = เลขสินทรัพย์ (ค่าตั้งต้นของ backend)
   * ทุกตัวที่ไม่ใช่ค่าตั้งต้นเรียงมาก/ใหม่ -> น้อย/เก่า และดันชิ้นที่ไม่มีข้อมูลไปท้ายสุด
   */
  sort?: 'assetNumber' | 'registered' | 'netBookValue' | 'fiscalYear' | 'remainingLife'
  /** ทิศทาง - ไม่ส่ง = desc (มาก/ใหม่ก่อน) ชิ้นที่ไม่มีข้อมูลอยู่ท้ายสุดทั้งสองทิศ */
  sortDir?: 'asc' | 'desc'
  /**
   * เอาเฉพาะชิ้นที่ระบุห้องไว้แล้ว - หน้า Audit เปิดไว้เป็นค่าตั้งต้น
   * ★ ไม่ส่ง = เห็นครบทุกชิ้นเหมือนเดิม (หน้าทะเบียน/Dashboard ไม่ต้องแก้อะไร)
   */
  located?: boolean
  /**
   * สุ่มลำดับจาก "ผลที่กรองแล้ว" แทนการเรียงตามเลขสินทรัพย์ - หน้า Audit ใช้
   *
   * ★ ใช้คู่กับ page > 1 ไม่ได้ในทางความหมาย: ทุกคำขอสุ่มใหม่หมด หน้า 2 จึงไม่ใช่
   *   "ส่วนที่เหลือของหน้า 1" แต่ซ้ำกับหน้า 1 ได้ - backend บังคับ offset = 0 ให้แล้ว
   *   ฝั่งจอต้องซ่อนแถบเลขหน้าเอง ส่วนจำนวนที่สุ่มออกมาคุมด้วย limit
   */
  random?: boolean
}

/**
 * GET /assets/inventory - แบ่งหน้าเสมอ (ทะเบียนจริงมี 2,700+ ชิ้น)
 *
 * ไม่จำกัดตาม role และไม่ล็อกแผนกตามคนที่ล็อกอิน - ทุกคนค้นทะเบียนได้
 * (ต่างจาก /dashboard/overview ที่ล็อกแผนกไว้ เพราะอันนั้นเป็นมูลค่ารวมรายแผนก)
 */
export function getAssetInventory(params: InventoryParams = {}): Promise<Paginated<InventoryItem>> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const search = params.search?.trim()
  if (search) query.set('search', search)
  if (params.departmentId) query.set('departmentId', String(params.departmentId))
  if (params.companyCode) query.set('companyCode', params.companyCode)
  if (params.locationId) query.set('locationId', String(params.locationId))
  // 0 = ยังไม่ได้เลือก (AppEmployeeSelect ใช้ 0 แทน "ล้างค่า") จึงตกไปโดยไม่ต้องเช็คเพิ่ม
  if (params.employeeId) query.set('employeeId', String(params.employeeId))
  if (params.status) query.set('status', params.status)
  // '' = ค่าตั้งต้น ไม่ต้องส่ง key ไป (backend เรียงตามเลขสินทรัพย์ให้อยู่แล้ว)
  if (params.sort) query.set('sort', params.sort)
  // ทิศทางไม่มีความหมายถ้าไม่ได้บอกว่าเรียงตามอะไร - ส่งไปก็ถูกเมินอยู่ดี
  if (params.sort && params.sortDir) query.set('sortDir', params.sortDir)
  if (params.fiscalYear) query.set('fiscalYear', String(params.fiscalYear))
  // ★ เทียบกับ undefined ไม่ใช่ falsy - 0 เป็นค่าที่ใช้จริง ("ตัดค่าเสื่อมหมดแล้ว")
  //   ถ้าเขียน `if (params.minNetBookValue)` การกรอก 0 จะเงียบหายไปทั้งที่ผู้ใช้ตั้งใจ
  if (params.minNetBookValue !== undefined) {
    query.set('minNetBookValue', String(params.minNetBookValue))
  }
  if (params.maxNetBookValue !== undefined) {
    query.set('maxNetBookValue', String(params.maxNetBookValue))
  }
  // ส่งเฉพาะตอนเปิด - ฝั่ง backend default เป็น false อยู่แล้ว ส่ง 'false' ไปด้วยก็ได้ผลเท่ากัน
  // แต่ทำให้ URL ของหน้าทะเบียนเดิมมี query ที่ไม่เคยมีมาก่อนโดยไม่ได้เปลี่ยนพฤติกรรมอะไร
  if (params.located) query.set('located', 'true')
  if (params.random) query.set('random', 'true')

  const qs = query.toString()
  return request<Paginated<InventoryItem>>(`/assets/inventory${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}
