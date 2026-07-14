import { request } from './httpClient';

// Type ตรงกับ response ของ Elysia API (ams_db จริง): PK คือ poNumber ไม่มี id
export interface GrpoLine {
  id: string;
  grpoNo: string;
  grpoDate: string;
  poItemId: string;
  receivedQty: number;
}

export interface PurchaseOrderItem {
  id: string;
  poLine: number;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  poNumber: string;
  grpoLines: GrpoLine[];
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

export function listPurchaseOrders(
  params: ListPurchaseOrdersParams = {},
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
