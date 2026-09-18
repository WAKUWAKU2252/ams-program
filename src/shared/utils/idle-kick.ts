// ═══════════════════════════════════════════════════════════════════════════
// เตะคนที่ถือ lock ค้างไว้โดยไม่ทำอะไร — ใช้ร่วมกันทั้งหน้า DraftForm (ผู้ขอ) และ
// AssetRequestForm (บัญชี)
//
// ── บั๊กที่ตัวนี้เกิดมาแก้
//
// เดิมสองหน้านั้นเรียก startIdleTimer() ตอนโหลดใบเสร็จ **โดยไม่ดูว่าคนนี้ถือ lock อยู่ไหม**
// ผลคือคนที่กำลัง "รอคิว" (state = pending) ถูกจับเวลา idle ไปด้วย แล้วถูกเด้งออกจากหน้า
// ทั้งที่ยังไม่เคยได้แก้อะไรเลยสักครั้ง — คิวจึงว่างเปล่าตอน holder ถูกเตะ และคนที่รอมา
// สิบนาทีต้องเดินกลับเข้ามาใหม่เอง
//
// ★ กติกาที่ถูก: **จับเวลาเฉพาะตอนถือ lock อยู่จริง**
//     ถือ lock อยู่ = กินทรัพยากรของคนอื่น (บล็อกทั้งคิว) นั่งเฉยนานไปต้องคืนให้คนถัดไป
//     รอคิวอยู่    = ไม่ได้กินอะไรของใคร นั่งรอนานแค่ไหนก็ไม่ได้ทำให้ใครเสียหาย
//
// ★ ต้องเริ่มจับเวลาใหม่ "ตอนได้ lock" ไม่ใช่ตอนเปิดหน้า — คนที่รอคิวอยู่ 9 นาทีแล้วเพิ่ง
//   ได้คิวต้องได้เวลาเต็มสิบนาที ไม่ใช่โดนเตะทันทีเพราะนาฬิกาเดินมาตั้งแต่ตอนเข้าคิว
//
// ★ backend มี TTL 15 นาทีเป็นตาข่ายอีกชั้น (holderStale ใน presence.service) เผื่อแท็บ
//   ถูกฆ่าทิ้งโดยไม่ได้ปิดสาย — ตัวนี้ไม่ได้แทนตัวนั้น
// ═══════════════════════════════════════════════════════════════════════════
import { watch, onUnmounted, type Ref } from 'vue'

/** สิบนาที — ต้องเท่ากันทั้งสองหน้า ไม่งั้นผู้ใช้เจอกติกาคนละแบบบนงานเดียวกัน */
export const IDLE_KICK_MS = 10 * 60 * 1000

/**
 * เหตุการณ์ที่นับว่า "ยังอยู่" — ไม่รวม focus/visibilitychange โดยตั้งใจ
 *
 * แท็บที่เปิดค้างไว้เฉย ๆ แล้วสลับกลับมาดูไม่ใช่การทำงาน ถ้านับด้วย คนที่เปิดใบทิ้งไว้
 * ข้ามวันแล้วสลับแท็บไปมาจะถือ lock ได้ไม่จำกัดเวลา ซึ่งเป็นสิ่งที่ตัวนี้มีไว้กัน
 */
const IDLE_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll']

/**
 * เริ่ม/หยุดจับเวลา idle ตามสถานะการถือ lock ให้อัตโนมัติ
 *
 * @param holdingLock true = ถือ lock อยู่ (presenceState.state === 'editable')
 * @param onKick      สิ่งที่ทำเมื่อหมดเวลา — ปกติคือปิดสาย presence แล้วเด้งกลับหน้าลิสต์
 */
export function useIdleKick(holdingLock: Ref<boolean>, onKick: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined

  function reset() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onKick()
    }, IDLE_KICK_MS)
  }

  function stop() {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    IDLE_EVENTS.forEach((e) => window.removeEventListener(e, reset))
  }

  function start() {
    // ★ ถอดก่อนใส่เสมอ — ได้ lock ซ้ำ (reconnect หลังสายหลุด) จะเรียก start() ซ้ำได้
    //   listener ที่ซ้อนกันไม่ทำให้พังทันที แต่จะถอดไม่ครบตอน stop() แล้วค้างบน window
    stop()
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, reset))
    reset()
  }

  // immediate: เผื่อได้ lock ตั้งแต่ event แรกที่ backend ส่งมา ก่อน watch จะถูกตั้ง
  watch(holdingLock, (holding) => (holding ? start() : stop()), { immediate: true })

  onUnmounted(stop)
}
