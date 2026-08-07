import { getToken } from './auth.token';
import { BASE_URL } from './httpClient';


export interface PresenceState {
  state: 'editable' | 'pending';
  holder: number | null; 
  position: number; 
}

export interface PresenceHandlers {
  onState?: (state: PresenceState) => void;
  onError?: (error: unknown) => void;
}

export interface PresenceConnection {
  close: () => void;
}

function dispatch(raw: string, handlers: PresenceHandlers): void {
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    const l = line.replace(/\r$/, '');
    if (l.startsWith('event:')) event = l.slice(6).trim();
    else if (l.startsWith('data:')) data += l.slice(5).trim();
  }
  if (event !== 'presence') return; // connected / ping ไม่สนใจ
  try {
    handlers.onState?.(JSON.parse(data) as PresenceState);
  } catch {
  }
}

export function openPresence(requestId: number, handlers: PresenceHandlers): PresenceConnection {
  const controller = new AbortController();
  let closed = false;

  (async () => {
    let delay = 1000;
    while (!closed) {
      try {
        const token = getToken();
        const res = await fetch(`${BASE_URL}/asset-requests/${requestId}/presence`, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`presence failed (${res.status})`);

        delay = 1000; 
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break; 
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            dispatch(buffer.slice(0, idx), handlers);
            buffer = buffer.slice(idx + 2);
          }
        }
      } catch (error) {
        if (closed || controller.signal.aborted) break;
        handlers.onError?.(error);
      }
      if (closed) break;
      await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
      delay = Math.min(delay * 2, 10000);
    }
  })();

  return {
    close: () => {
      closed = true;
      controller.abort();
    },
  };
}
