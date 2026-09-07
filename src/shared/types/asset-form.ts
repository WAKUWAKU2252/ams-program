// ชนิดข้อมูลที่ AssetFormDialog กับผู้เรียก (RequestTable) ใช้ร่วมกัน
// แยกออกมาไว้นอก .vue เพราะ <script setup> ประกาศ export ไม่ได้

// MasterOption / SubLocationOption ย้ายไป services/master.service.ts แล้ว - เป็นรูปที่ API
// คืนมา จึงควรอยู่ที่เดียวกับตัวที่ยิง API ไม่ใช่แยกไว้ที่นี่แล้วมีสองนิยามให้หลุดจากกัน

/** ช่องที่ถูกกด - RequestTable ประกอบ object นี้จาก item/round/slot แล้วส่งให้ dialog */
export interface AssetFormTarget {
  /** มีค่า = แก้ของเดิม, ไม่มี = สร้างชิ้นใหม่ในช่องนี้ */
  assetId?: number;
  /** เลขช่องที่ผู้ใช้เห็น (slot.index) */
  unitNo: number;
  poLine: number;
  grpoLineId: string;
  grpoNo: string;
  itemDescription: string;
  serialNumber?: string | null;
  acquisitionCost: number;

  // ── ร่องรอยการตีกลับ (มีค่าเฉพาะชิ้นที่ยังถูกตีกลับอยู่) ────────────────────
  // ผู้ขอเปิดฟอร์มนี้มาเพื่อ "แก้ตามที่ถูกตีกลับ" - ถ้าไม่เอาเหตุผลมาโชว์ในฟอร์มด้วย
  // เขาต้องปิดกล่องกลับไปอ่านในตารางแล้วเปิดใหม่ทุกครั้งที่ลืมว่าต้องแก้อะไร
  //
  // backend ล้างค่าพวกนี้ให้เองเมื่อผู้ขอแก้ (rejectedAt = null) แถบเตือนจึงหายไปเอง
  // ไม่ต้องมีใครมาปิด และไม่มีทางค้างโชว์เหตุผลของรอบที่แก้ไปแล้ว
  /** เหตุผลที่ถูกตีกลับ */
  rejectReason?: string | null;
  /** ชื่อคนที่กดตีกลับ */
  rejectedByName?: string | null;
  /** role ณ ตอนกด - MANAGER = ตีกลับทั้งใบ / FINANCE|ADMIN = ตีกลับรายชิ้น (แก้คนละแบบ) */
  rejectedRole?: string | null;
}
