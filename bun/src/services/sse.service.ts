import { BASE_URL } from './httpClient';
export type SseStatus = 'connecting' | 'connected' | 'disconnected';

export interface SseHandlers {
  onStatus?: (status: SseStatus) => void;
  onMessage?: (data: string) => void;
}

let eventSource: EventSource | null = null;
let handlers: SseHandlers = {};

export function connectSse(h: SseHandlers): void {
  if (eventSource) return; 
  handlers = h;
  handlers.onStatus?.('connecting');

  const es = new EventSource(`${BASE_URL}/events`);
  eventSource = es;

  es.onopen = () => handlers.onStatus?.('connected');
  es.onmessage = (e: MessageEvent<string>) => handlers.onMessage?.(e.data);
  es.onerror = () => handlers.onStatus?.('disconnected');
}

export function disconnectSse(): void {
  eventSource?.close();
  eventSource = null;
  handlers = {};
}
