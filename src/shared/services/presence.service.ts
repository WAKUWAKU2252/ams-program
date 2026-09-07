import { getTokenUserId } from './auth.token';
import { openStream, type StreamConnection } from './sse.service';

// ── สองสายที่คนละหน้าที่กันชัดเจน ────────────────────────────────────────────
//   openPresence()          เปิดค้างไว้ = "ฉันกำลังแก้ใบนี้อยู่" → ได้ lock หรือได้คิว
//   openRegistrationLobby() ฟังอย่างเดียว = "ใบไหนใครแก้อยู่บ้าง" → ไม่ถือ lock ของใคร
//
// ★ หน้าตารางต้องใช้ lobby เท่านั้น ห้ามเปิด openPresence ให้ทุกแถว - นอกจากจะเปลืองสาย
//   (browser จำกัดจำนวน connection ต่อ origin) คนที่แค่เปิดดูตารางจะกลายเป็นสมาชิกทุกห้อง
//   แล้วไปแย่งคิวคนที่ตั้งใจจะแก้จริง

/**
 * ห้อง presence แยกตามขั้นของงาน ใบเดียวกันมีสองห้องได้ - ผู้ขอแก้ชิ้นที่ถูกตีกลับ (draft)
 * กับบัญชีออกเลข (registration) ทำพร้อมกันได้โดยไม่ต้องรอกัน
 */
export type PresenceScope = 'draft' | 'registration';

export interface PresenceState {
  state: 'editable' | 'pending';
  holder: number | null;
  /** ชื่อคนที่ถือ lock อยู่ - เอาไปขึ้น banner ว่ารอใครอยู่ */
  holderName: string | null;
  position: number;
}

/** ใบหนึ่งกำลังถูกใครแก้อยู่ - holderUserId = null แปลว่าใบนี้ว่าง */
export interface HolderState {
  requestId: number;
  holderUserId: number | null;
  holderName: string | null;
}

/**
 * "ใบนี้/ชิ้นนี้เปลี่ยนแล้ว" - ไหลมาบนสายเดียวกับ presence/holder ไม่ได้เปิดสายที่สาม
 *
 * ตั้งใจให้บางแบบนี้: ก้อนนี้ไม่ใช่ข้อมูล มันคือสัญญาณให้ไปโหลดของจริงผ่าน API ที่มีด่านสิทธิ์
 * ★ ห้ามเอา action ไป patch state เอง - สถานะรายชิ้นที่แสดงบนจอ (displayStatus) backend
 *   คำนวณมาให้ ถ้าคำนวณซ้ำฝั่งนี้จะมีสูตรสองชุดที่เพี้ยนกันได้โดยไม่มีอะไรฟ้อง
 *   ใช้ได้แค่เป็นบริบทของข้อความ/toast เท่านั้น
 */
export type StatusAction =
  | 'request-submitted'
  | 'request-approved'
  | 'request-rejected'
  | 'registration-confirmed'
  | 'asset-created'
  | 'asset-updated'
  | 'asset-deleted'
  | 'asset-numbered'
  | 'asset-rejected'
  | 'asset-cancelled'
  | 'asset-uncancelled'
  | 'line-declared'
  | 'line-reverted';

export interface StatusChange {
  requestId: number;
  action: StatusAction;
  /**
   * สถานะใบ ณ ตอนที่เปลี่ยน - backend ใช้ค่านี้กรองว่าก้อนไหนควรถึงสาย lobby (ส่งเฉพาะ
   * APPROVED เพราะคิวบัญชีมีแค่ใบนั้น) สาย presence ของหน้าฟอร์มได้ทุกสถานะตามปกติ
   */
  requestStatus: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  /** ชิ้นที่เปลี่ยน - null = เปลี่ยนที่ระดับใบ/รอบ ให้โหลดทั้งหน้า */
  assetId: number | null;
  actorId: number;
}

export interface PresenceHandlers {
  onState?: (state: PresenceState) => void;
  /** ใบนี้เปลี่ยนแล้ว → ไปโหลดของจริงใหม่ (ก้อนที่ตัวเองเป็นคนทำถูกกรองออกให้แล้ว) */
  onStatus?: (change: StatusChange) => void;
  onError?: (error: unknown) => void;
}

export interface LobbyHandlers {
  onHolder?: (holder: HolderState) => void;
  /** ใบใดใบหนึ่งในคิวเปลี่ยนแล้ว - ตารางต้องโหลดใหม่ (ได้ทุกก้อน รวมของตัวเอง) */
  onStatus?: (change: StatusChange) => void;
  onError?: (error: unknown) => void;
  /**
   * ปิดสายตอนแท็บถูกซ่อน (ดู StreamHandlers) - lobby ทำได้เพราะไม่ถือ lock ของใคร
   * ★ PresenceHandlers ไม่มีสองตัวนี้โดยตั้งใจ สายนั้นถือ lock ปิดแล้วเสียคิว
   */
  pauseWhenHidden?: boolean;
  onResume?: () => void;
}

/** ชื่อเดิมของสายที่ปิดได้ - คงไว้เพราะหน้าที่ใช้อยู่ import ชื่อนี้ (ตัวจริงอยู่ที่ sse.service) */
export type PresenceConnection = StreamConnection;

/**
 * แกะก้อน 'status' แล้วส่งต่อ
 *
 * skipOwn = ทิ้งก้อนที่ตัวเองเป็นคนทำ - เปิดเฉพาะสายของ "หน้าฟอร์ม" ที่มีกล่องกรอก
 *
 * ★ เปิดที่หน้าฟอร์ม: คนกดปุ่มโหลดข้อมูลใหม่เองอยู่แล้วหลังได้ response และตอนได้ echo
 *   กลับมาเขาอาจเปิดกล่องถัดไปแล้ว โหลดทับรอบสองจะล้างสิ่งที่พิมพ์ค้าง - อาการ "พิมพ์แล้วหาย"
 *
 * ★ ปิดที่หน้าตาราง (lobby): ตารางไม่มีอะไรให้ล้าง และการกรองทำให้พังเคสที่เจอจริง -
 *   คนคนเดียวเปิดสองแท็บ (อนุมัติในแท็บหนึ่ง ดูคิวในอีกแท็บ) หรือทีมที่ user คนเดียวมีทั้ง
 *   role อนุมัติและ role บัญชี (APPROVER_ROLES มี FINANCE/ADMIN อยู่ด้วย) → actorId ตรงกับ
 *   คนที่กำลังดูคิว แล้วแถวใหม่ไม่ขึ้นเองทั้งที่ backend ส่งมาแล้ว
 *
 * getTokenUserId() คืน null ได้ (token หมดอายุ) - ตอนนั้นไม่กรองอะไร ยอมโหลดเกินดีกว่า
 * ทิ้งอัปเดตของคนอื่น เพราะอีกเดี๋ยว interceptor ก็เด้งไปหน้า login อยู่ดี
 */
function emitStatus(
  data: string,
  onStatus: ((change: StatusChange) => void) | undefined,
  skipOwn: boolean,
): void {
  if (!onStatus) return;
  try {
    const change = JSON.parse(data) as StatusChange;
    if (skipOwn && change.actorId === getTokenUserId()) return;
    onStatus(change);
  } catch {
    // ก้อนที่แกะไม่ออกทิ้งไปเงียบ ๆ - สายยังดีอยู่ ก้อนถัดไปจะมาแทน
  }
}

/**
 * เปิดสายถือ lock ของใบหนึ่ง - ปิดสายเมื่อไหร่ = ปล่อย lock ให้คิวถัดไป
 *
 * scope ต้องตรงกับหน้าที่เปิด: หน้าผู้ขอใช้ 'draft' หน้าบัญชีใช้ 'registration'
 * (คนละ endpoint กัน ฝั่ง backend ไม่ได้รับ scope จาก client เพื่อไม่ให้ปลอมห้องได้)
 */
export function openPresence(
  requestId: number,
  handlers: PresenceHandlers,
  scope: PresenceScope = 'draft',
): PresenceConnection {
  const path =
    scope === 'registration'
      ? `/asset-requests/${requestId}/registration-presence`
      : `/asset-requests/${requestId}/presence`;

  return openStream(
    path,
    (event, data) => {
      // หน้าฟอร์มมีกล่องกรอก - ทิ้ง echo ของตัวเอง (skipOwn = true)
      if (event === 'status') return emitStatus(data, handlers.onStatus, true);
      if (event !== 'presence') return; // connected / ping ไม่สนใจ
      try {
        handlers.onState?.(JSON.parse(data) as PresenceState);
      } catch {
        // ก้อนที่แกะไม่ออกทิ้งไปเงียบ ๆ - สายยังดีอยู่ ก้อนถัดไปจะมาแทน
      }
    },
    handlers,
  );
}

/**
 * สายของหน้าตารางฝั่งบัญชี - สายเดียวครอบทุกใบ ไม่เข้าห้องไหน จึงไม่ถือ lock ของใคร
 * ตอนเปิดจะได้ snapshot ของใบที่มีคนถืออยู่ก่อน แล้วค่อยได้ event ตอนมีคนเข้า/ออก
 */
export function openRegistrationLobby(handlers: LobbyHandlers): PresenceConnection {
  return openStream(
    '/asset-requests/registration-presence',
    (event, data) => {
      // หน้าตารางไม่มีกล่องกรอก - ต้องได้ echo ของตัวเองด้วย ไม่งั้นคนที่อนุมัติในอีกแท็บ
      // (หรือ user ที่มีทั้ง role อนุมัติและบัญชี) จะไม่เห็นแถวใหม่ขึ้นเอง
      if (event === 'status') return emitStatus(data, handlers.onStatus, false);
      if (event !== 'holder') return;
      try {
        handlers.onHolder?.(JSON.parse(data) as HolderState);
      } catch {
        // เหมือนกับ openPresence - ก้อนเสียหนึ่งก้อนไม่ควรทำให้ทั้งสายตาย
      }
    },
    handlers,
  );
}
