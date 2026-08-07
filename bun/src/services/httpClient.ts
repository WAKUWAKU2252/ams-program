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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  let data: T | ApiErrorBody | null = null;
  try {
    data = await response.json();
  } catch {
  }

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }

    const message = (data as ApiErrorBody)?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}