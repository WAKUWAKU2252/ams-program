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
  requesterName: string | null ;
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
