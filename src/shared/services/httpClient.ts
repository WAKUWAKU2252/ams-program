// services/core/httpClient.ts
//
// จุดเดียวที่รู้เรื่อง base URL, auth token, error format ของ backend
// domain service ทุกตัว (attachmentApi, invoiceApi, assetApi, ...) import จากที่นี่ที่เดียว

import { getToken, clearToken } from './auth.token';

export const BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface ApiErrorBody {
  message?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

function handleUnauthorized() {
  clearToken();
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }


}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  /**
   * ── ★★ ใส่ Content-Type ให้เองเมื่อ body เป็นสตริง (คือ JSON.stringify มาแล้ว)
   *
   * เดิมผู้เรียกต้องใส่เองทุกครั้ง ซึ่งลืมได้ง่ายมากและ **อาการที่ได้ไม่บอกอะไรเลย**:
   * Elysia แกะ body ไม่ออก → ทุกฟิลด์ที่บังคับกลายเป็นขาด → ตกด่าน schema → ผู้ใช้เห็น
   * "ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่" ทั้งที่กรอกครบถูกทุกช่อง
   * (เจอจริงตอนต่อเส้นคำขอย้าย/เปลี่ยนผู้ครอบครอง - ไล่หาที่ฟอร์มอยู่นานเพราะข้อความ
   *  ชี้ไปที่ช่องกรอก ไม่ได้ชี้ว่า request ส่งออกไปผิดรูป)
   *
   * ★ เช็ค typeof body === 'string' ไม่ใช่ "มี body ไหม" - แนบไฟล์ส่ง FormData ซึ่ง
   *   **ห้ามตั้ง Content-Type เอง** เบราว์เซอร์ต้องเป็นคนใส่พร้อม boundary ของ multipart
   *   ตั้งเองเมื่อไหร่ฝั่ง server จะแยกส่วนของไฟล์ไม่ออก (ดู attachment/invoice service)
   *
   * ★ ...options.headers อยู่ทีหลัง - ผู้เรียกที่ใส่เองอยู่แล้วยังชนะเหมือนเดิม ไม่มีอะไรพัง
   */
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  let data: T | ApiErrorBody | null = null;
  try {
    data = await response.json();
  } catch {
  }

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }

    /**
     * ข้อความสำรองเมื่อ backend ไม่ได้ส่ง message มา
     *
     * ★ ของเดิมคือ `Request failed (500)` ซึ่งเป็นภาษาของ dev ล้วน ๆ — คนหน้าจออ่านแล้ว
     *   ไม่รู้ว่าเกิดอะไรและต้องทำอะไรต่อ ตัวเลขสถานะก็ไม่ได้ช่วยเขา
     * ★ ตัวเลขยังอยู่ใน ApiError.status ตามเดิม ฝั่งที่เรียกจึงยังแยกเคสได้ (401 เด้ง login)
     *   และยังลง console ให้คนดูแลระบบเห็น — แค่ไม่เอาไปแสดงบนหน้าจอ
     */
    const fromServer = (data as ApiErrorBody)?.message;
    if (!fromServer) {
      console.error(`[api] ${options.method ?? 'GET'} ${path} → ${response.status}`);
    }
    const message = fromServer || 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง';
    throw new ApiError(message, response.status);
  }

  return data as T;
}