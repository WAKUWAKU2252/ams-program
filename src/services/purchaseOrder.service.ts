import { request } from './httpClient';

export interface GrpoLine {
  id: string;
  poItemId: string;
  receivedQty: number;      
  grpo: {                   
    grpoNo: string;
    grpoDate: string;
  };
}

export interface PurchaseOrderItem {
  id: string;
  poLine: number;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  poNumber: string;
  grpoLines: GrpoLine[];
  lineTotal: number
}

export type PurchaseOrderStatus = 'PENDING' | 'OPEN' | 'PARTIALLY_RECEIVED' | 'COMPLETED';

export interface PurchaseOrder {
  poNumber: string;
  vendorName: string | null;
  poDate: string | null;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
  // ผู้ขอซื้อ (OwnerPR) — คนที่เปิดใบขอซื้อฝั่ง SAP คนละคนกับ RequestBy (คนกดส่งใน AMS)
  ownerPrName: string | null;
  ownerPrId: number | null;
  departmentId: number | null;
  // หัวหน้าของผู้ขอซื้อ — มีเฉพาะใน GET /purchase-orders/:poNumber (findOneOrFail ไต่ให้)
  // list ไม่มีให้ และ GET /asset-requests/:id ก็ไม่มี ต้องดึงใบเต็มมาเติมเอง
  // null ได้ทุกช่อง: PO เก่าไม่มี ownerPrId / แผนกยังไม่ตั้งหัวหน้า / หัวหน้าไม่มีอีเมล
  managerId: number | null;
  managerFirstName: string | null;
  managerLastName: string | null;
  manageremail: string | null;
}

// list แบบเบา (GET /purchase-orders) ไม่มี items — ใช้ getPurchaseOrderByNumber ดึงรายละเอียดทีหลัง
export type PurchaseOrderSummary = Omit<PurchaseOrder, 'items'>;

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ListPurchaseOrdersParams {
  search?: string;
  page?: number;
  limit?: number;
}

export function listPurchaseOrders(params: ListPurchaseOrdersParams = {},
): Promise<Paginated<PurchaseOrderSummary>> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return request<Paginated<PurchaseOrderSummary>>(
    `/purchase-orders${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
}

export function getPurchaseOrderByNumber(poNumber: string): Promise<PurchaseOrder> {
  return request<PurchaseOrder>(`/purchase-orders/${poNumber}`, { method: 'GET' });
}

// getPoApprovers() ถูกถอดออกพร้อมการ rename เป็น OwnerPR — ไม่มีใครเรียก และยิงไป
// /purchase-orders/:poNumber/approvers ซึ่ง backend ไม่เคยมี route นี้ (ได้ 404 ถ้าเรียก)
// ข้อมูลผู้อนุมัติมาจาก GET /purchase-orders/:poNumber แล้ว (managerId/manageremail)