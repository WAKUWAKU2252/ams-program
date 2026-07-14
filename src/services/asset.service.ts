// services/assetApi.ts
//
// ตัวอย่างว่าพอมี domain ใหม่ (Asset) เพิ่ม service ใหม่ก็ import
// http core ตัวเดียวกัน ไม่ต้องเขียน auth/error handling ซ้ำเลย
import { request } from './httpClient';

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  status: 'active' | 'in_repair' | 'disposed';
  grpoItemId: string;
}

export function getAssetById(assetId: string): Promise<Asset> {
  return request<Asset>(`/api/assets/${assetId}`, { method: 'GET' });
}

export function listAssetsByRequest(requestId: string): Promise<Asset[]> {
  return request<Asset[]>(`/api/requests/${requestId}/assets`, { method: 'GET' });
}

export function updateAssetStatus(assetId: string, status: Asset['status']): Promise<Asset> {
  return request<Asset>(`/api/assets/${assetId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}