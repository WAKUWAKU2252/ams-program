// services/asset.service.ts
//
// เรียก endpoint asset จริงของ Elysia (prefix /assets)
// หน้าฟอร์มลงทะเบียนใช้ getAssetSlots() เส้นเดียวก็เรนเดอร์ได้ทั้งหน้า (ช่อง + สถานะ + grpoNo ต่อชิ้น)
import { request } from './httpClient';
import type { AssetRequestStatus } from './assetRequest.service';

// รอบรับของต่อ po_item — บอกว่ารอบนี้รับมากี่ชิ้น ลงทะเบียนไปแล้วกี่ชิ้น
export interface SlotGrpoLine {
  id: string;
  grpoNo: string;
  grpoDate: string;
  receivedQty: number;
  // จำนวนที่คนแจ้งเองสำหรับรอบนี้ (null = ใช้ receivedQty ของ SAP ตามปกติ)
  // ใช้กับ PO งานเหมาที่ 1 หน่วยของ SAP = ของหลายชิ้น
  declaredQty: number | null;
  declaredReason: string | null;
  registered: number;
}

// หนึ่ง "ช่อง" = หนึ่งชิ้นที่หน้าฟอร์มต้องเรนเดอร์ (จำนวนช่อง = po_item.quantity)
// discriminated union ตาม status — assetId/serialNumber/grpoNo มีเฉพาะช่องที่ลงทะเบียนแล้ว
// (TS จะบังคับให้เช็ค status === 'registered' ก่อนถึงจะอ่าน slot.grpoNo ได้)
export type AssetSlot =
  | {
      index: number;
      status: 'registered';
      assetId: number;
      serialNumber: string | null;
      grpoLineId: string;
      grpoNo: string; // ← ชิ้นนี้มาจากรอบไหน (asset.grpoLine.grpo.grpoNo) — committed
    }
  | {
      index: number;
      status: 'pending'; // ของมาถึงแล้ว ยังไม่ลง — กรอกได้
      grpoLineId: string; // รอบที่คาดว่าจะไปผูก (allocate ตาม capacity) — pre-fill ตอนลงทะเบียน
      grpoNo: string;
    }
  | { index: number; status: 'noGrpo' }; // ของยังมาไม่ถึง

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
  items: AssetSlotItem[];
}

// GET /assets?requestId= — คืนช่องทั้งหมดของใบคำขอ พร้อมสถานะ + grpoNo ต่อชิ้น
export function getAssetSlots(requestId: number): Promise<AssetSlotsResponse> {
  return request<AssetSlotsResponse>(`/assets?requestId=${requestId}`, { method: 'GET' });
}
