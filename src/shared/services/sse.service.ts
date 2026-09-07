// ═══ ท่อ SSE ของทั้งแอป — ตัวกลางที่ทุกสายใช้ร่วมกัน ═══
//
// ★ ต้องใช้ fetch ไม่ใช่ EventSource: EventSource ใส่ Authorization header ไม่ได้ และทุก
//   endpoint ฝั่งนี้อยู่หลัง authGuard (ของเดิมใช้ EventSource ยิง /events ที่ไม่มี auth
//   ซึ่งทำได้เพราะมันส่งแค่ ping — พอต้องส่งของจริงก็ไปต่อไม่ได้)
//
// ── เพดาน connection ของ browser คือเหตุผลที่ไฟล์นี้มีอยู่ ─────────────────────
// HTTP/1.1 เปิดได้ ~6 สายต่อ origin และสาย SSE กินโควตาแบบไม่คืน สายละ 1 ตลอดอายุแท็บ
//
// ★ โควตานั้นเป็นของทั้งเบราว์เซอร์ ไม่ใช่ของแต่ละแท็บ — 3 แท็บที่ค้างอยู่หน้าใบคำขอ/คิวบัญชี
//   ก็กิน 6 ช่องครบพอดี แล้วคำขอธรรมดาจะเข้าคิวค้างโดยไม่ error ไม่ timeout (เจอจริงมาแล้ว:
//   GET /pending-registration ค้าง 15 วิ ส่ง 0 ไบต์ พอปิดสายที่แท็บอื่นก็วิ่งต่อทันที)
//   ตัวกันคือ pauseWhenHidden — แท็บพื้นหลังปล่อยสายคืนให้แท็บที่ผู้ใช้มองอยู่
//   ทางแก้จริงคือ HTTP/2 ตอน deploy (multiplex สายเดียว เพดานหายทั้งใบ)
//
// ตอนนี้จึงมี 2 สายต่อแท็บเท่านั้น:
//   1. openAppChanges()  สายเดียวของทั้งแอป เปิดตั้งแต่ล็อกอิน — สถานะออนไลน์ + สัญญาณ
//                        ว่า "ลิสต์งานของคุณเปลี่ยนแล้ว"
//   2. presence/lobby    ตามหน้าที่เปิดอยู่ (ดู presence.service) สลับกัน ไม่ซ้อน
// ห้ามเพิ่มสายที่สามโดยไม่ยุบของเดิม — เต็มโควตาแล้ว request ธรรมดาจะค้างเข้าคิวเงียบ ๆ
// ไม่ error ไม่ timeout ซึ่งเป็นอาการที่ดีบักยากที่สุดแบบหนึ่ง
import { getToken } from './auth.token';
import { BASE_URL } from './httpClient';

export type SseStatus = 'connecting' | 'connected' | 'disconnected';

export interface StreamConnection {
  close: () => void;
}

export interface StreamHandlers {
  /**
   * สายติด/หลุด — เอาไปขึ้น banner สถานะ ไม่ต้องทำอะไรกับมันก็ได้
   *
   * ชื่อ onConnection ไม่ใช่ onStatus โดยตั้งใจ — สาย presence มี onStatus ที่หมายถึง
   * "สถานะของงานเปลี่ยน" ซึ่งเป็นคนละเรื่องกันคนละชั้น ใช้ชื่อซ้ำแล้วสองอันนี้จะสลับกันได้
   */
  onConnection?: (status: SseStatus) => void;
  onError?: (error: unknown) => void;
  /**
   * ปิดสายชั่วคราวตอนแท็บถูกซ่อน แล้วต่อคืนตอนกลับมาเห็น — คืนโควตา connection ให้แท็บที่
   * ผู้ใช้มองอยู่จริง (โควตา ~6 เป็นของทั้งเบราว์เซอร์ ไม่ใช่ของแต่ละแท็บ แท็บพื้นหลังที่
   * ถือสายค้างไว้จึงไปเบียดแท็บหน้าจนคำขอธรรมดาเข้าคิวค้าง ไม่ error ไม่ timeout)
   *
   * ★ ห้ามใช้กับสายที่ถือ lock (openPresence) — ปิดสาย = ปล่อย lock ให้คิวถัดไป คนที่แค่
   *   สลับไปดูอย่างอื่นแป๊บเดียวจะเสียสิทธิ์แก้ใบที่ยังกรอกค้างอยู่
   */
  pauseWhenHidden?: boolean;
  /**
   * กลับมาเห็นแท็บแล้วและกำลังต่อสายใหม่ — ช่วงที่ปิดไปอาจมีของเปลี่ยนโดยไม่มี event มาถึง
   * ผู้เรียกต้องโหลดข้อมูลหนึ่งรอบที่นี่ ไม่งั้นจอจะค้างของเก่าจนกว่าจะมี event ถัดไป
   */
  onResume?: () => void;
}

/** แกะ SSE หนึ่งก้อน (event: + data:) แล้วส่งต่อให้เฉพาะ event ที่สนใจ */
function parseEvent(raw: string): { event: string; data: string } {
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    const l = line.replace(/\r$/, '');
    if (l.startsWith('event:')) event = l.slice(6).trim();
    else if (l.startsWith('data:')) data += l.slice(5).trim();
  }
  return { event, data };
}

/**
 * เปิดสาย SSE ค้างไว้พร้อม retry แบบ backoff — ตัวกลางของทุกสายในแอป
 *
 * retry เองข้างในโดยไม่บอกใคร (นอกจาก onConnection/onError) — ผู้เรียกไม่ต้องจัดการการต่อใหม่
 * เพราะทุกสายที่ใช้ตัวนี้ "ต้องอยู่ตลอดอายุหน้า" ไม่มีเคสที่ขาดแล้วควรปล่อยขาด
 */
export function openStream(
  path: string,
  onEvent: (event: string, data: string) => void,
  handlers: StreamHandlers = {},
): StreamConnection {
  let closed = false;
  // ซ่อนอยู่ = หยุดชั่วคราว ต่างจาก closed ที่แปลว่าเลิกถาวร — ตัวแปรแยกกันเพราะ catch
  // ต้องแยกให้ออกว่า fetch ล้มเพราะเราสั่ง abort เอง (ไม่ใช่ error) หรือล้มจริง
  // เปิดในแท็บพื้นหลังตั้งแต่แรกได้จริง (Ctrl+click) — เริ่มที่ paused เลย อย่าเพิ่งไปจอง socket
  let paused = handlers.pauseWhenHidden === true && document.hidden;
  let delay = 1000;
  // controller ของ "ความพยายามครั้งนี้" ไม่ใช่ของทั้งสาย — pause ต้อง abort ได้โดยไม่ปิดสายถาวร
  let attempt: AbortController | null = null;
  // ตัวปลุกตอนนอนรอ (backoff หรือรอกลับมาเห็นแท็บ) ให้ตื่นทันทีแทนที่จะรอครบเวลา
  let wake: (() => void) | null = null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        window.clearTimeout(timer);
        wake = null;
        resolve();
      };
    });

  const waitUntilVisible = () =>
    new Promise<void>((resolve) => {
      wake = () => {
        wake = null;
        resolve();
      };
    });

  const onVisibility = () => {
    if (document.hidden) {
      paused = true;
      attempt?.abort();
      handlers.onConnection?.('disconnected');
      return;
    }
    paused = false;
    // ต่อคืนทันที ไม่ต้องรอ backoff ที่ค้างจากรอบก่อน — การหายไปครั้งนี้เราเป็นคนสั่งเอง
    // ไม่ใช่อาการของเซิร์ฟเวอร์ที่ควรถูกลงโทษด้วยการรอนานขึ้น
    delay = 1000;
    handlers.onResume?.();
    wake?.();
  };
  if (handlers.pauseWhenHidden) document.addEventListener('visibilitychange', onVisibility);

  (async () => {
    while (!closed) {
      if (paused) {
        await waitUntilVisible();
        continue;
      }
      attempt = new AbortController();
      try {
        handlers.onConnection?.('connecting');
        const token = getToken();
        const res = await fetch(`${BASE_URL}${path}`, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: attempt.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream ${path} failed (${res.status})`);

        // ต่อติดแล้วจริง = รีเซ็ต backoff ด้วย ไม่ใช่ให้มันโตค้างจากรอบที่หลุดไปก่อนหน้า
        handlers.onConnection?.('connected');
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
            const { event, data } = parseEvent(buffer.slice(0, idx));
            buffer = buffer.slice(idx + 2);
            onEvent(event, data);
          }
        }
      } catch (error) {
        if (closed) break;
        // abort ที่เราสั่งเองตอนแท็บถูกซ่อน ไม่ใช่ error ของสาย — ห้าม log ให้คนตกใจ
        if (paused) continue;
        handlers.onError?.(error);
      }
      if (closed) break;
      if (paused) continue;
      // มาถึงตรงนี้ = สายหลุด (error หรือ server ปิดสาย) ต้องรายงานก่อนนอนรอต่อใหม่
      // ไม่ใช่รายงานแค่ตอน error — server ปิดสายเฉย ๆ ก็คือหลุดเหมือนกัน
      handlers.onConnection?.('disconnected');
      // โตก่อนนอน ไม่ใช่หลังตื่น — ระหว่างนอนอยู่ onVisibility อาจรีเซ็ต delay เป็น 1000
      // ถ้าไปคูณสองหลังตื่นจะทับค่าที่มันเพิ่งตั้ง แล้วการกลับมาเห็นแท็บจะโดนหน่วงฟรี ๆ
      const wait = delay + Math.random() * 500;
      delay = Math.min(delay * 2, 10000);
      await sleep(wait);
    }
    if (handlers.pauseWhenHidden) document.removeEventListener('visibilitychange', onVisibility);
  })();

  return {
    close: () => {
      closed = true;
      attempt?.abort();
      // ปลุกให้หลุดจากการนอนรอทันที ไม่งั้น listener จะถูกถอดช้าไปได้ถึง 10 วินาที
      wake?.();
    },
  };
}

/**
 * สายเดียวของทั้งแอป — เปิดตั้งแต่ล็อกอินจนออกจากระบบ (ดู stores/connection)
 *
 * ทำสองหน้าที่ในสายเดียวเพราะโควตา connection ไม่พอให้แยก:
 *   1. สถานะออนไลน์ — จาก ping ที่ backend ส่งทุก 20 วิ (ผ่าน onConnection)
 *   2. "ลิสต์งานของคุณเปลี่ยนแล้ว" — event 'changed'
 *
 * ★ ก้อน 'changed' ไม่มี requestId และไม่มี actorId โดยตั้งใจ:
 *   สายนี้ถึงผู้ใช้ทุกคนที่ล็อกอินอยู่ กรองรายคนที่ backend ไม่ได้ (จะรู้ว่าใบไหนของใครต้อง
 *   คิวรี asset_request_opener ทุก event) เมื่อกรองไม่ได้ ทางที่เหลือคือไม่ส่งอะไรที่ต้องกรอง
 *   — client เอาสัญญาณไปโหลดลิสต์ "ของตัวเอง" ผ่าน API ที่มี authGuard ซึ่งกรองให้อยู่แล้ว
 *
 * ★ ไม่กรอง echo ของตัวเอง ต่างจากสาย presence/lobby — คนที่แก้ชิ้นที่ถูกตีกลับชิ้นสุดท้าย
 *   เสร็จ ต้องเห็นแถวของตัวเองหลุดออกจากลิสต์ทันที
 *
 * ★ ห้ามคาดหวัง requestId จากสายนี้ ถ้าวันหลังอยากรู้ว่าใบไหนเปลี่ยน ต้องไปกรองที่ backend
 *   ด้วย assetRequestOpener ก่อน แล้วค่อยส่งลงมา
 */
export function openAppChanges(
  handlers: StreamHandlers & { onChanged?: () => void },
): StreamConnection {
  return openStream(
    '/asset-requests/changes',
    (event) => {
      // ไม่แกะ data เลย — ในก้อนมีแค่ action ซึ่งเป็นบริบทที่ยังไม่มีใครใช้ และการโหลดใหม่
      // ไม่ได้ขึ้นอยู่กับมัน (connected / ping ไม่สนใจ ตัวออนไลน์ดูจาก onConnection)
      if (event === 'changed') handlers.onChanged?.();
    },
    handlers,
  );
}
