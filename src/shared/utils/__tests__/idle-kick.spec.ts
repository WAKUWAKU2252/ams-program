// เตะคนที่ถือ lock ค้าง — และ "ห้าม" เตะคนที่รอคิว
//
// บั๊กที่เทสต์ชุดนี้เฝ้า: เดิมหน้า DraftForm/AssetRequestForm เริ่มจับเวลา idle ตั้งแต่โหลด
// ใบเสร็จโดยไม่ดูว่าคนนี้ถือ lock อยู่ไหม คนที่รอคิว (pending) จึงถูกเด้งออกไปด้วย
// ทั้งที่ยังไม่เคยได้แก้อะไรเลย แล้วคิวว่างเปล่าตอน holder ถูกเตะ
//
// ★ ทดสอบที่ composable ไม่ใช่ที่หน้า - ตรรกะอยู่ที่นี่ที่เดียวและสองหน้าใช้ร่วมกัน
//   ถ้าเทสต์ที่หน้า จะได้เทสต์ที่ผ่านเพราะ mock ไม่ใช่เพราะกติกาถูก
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { HEARTBEAT_INTERVAL_MS, IDLE_KICK_MS, useIdleKick } from '../idle-kick'

/** ห่อ composable ไว้ใน component จริง - onUnmounted ทำงานได้เฉพาะใน setup context */
function mountIdle(
  holding: ReturnType<typeof ref<boolean>>,
  onKick: () => void,
  onActive?: () => void,
) {
  return mount(
    defineComponent({
      setup() {
        useIdleKick(holding as unknown as import('vue').Ref<boolean>, onKick, onActive)
        return () => h('div')
      },
    }),
  )
}

let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe('เตะเมื่อ idle', () => {
  it('ถือ lock แล้วนั่งเฉยจนครบเวลา = ถูกเตะ', () => {
    const onKick = vi.fn()
    wrapper = mountIdle(ref(true), onKick)

    vi.advanceTimersByTime(IDLE_KICK_MS)
    expect(onKick).toHaveBeenCalledTimes(1)
  })

  it('ขยับเมาส์ระหว่างทาง = นับใหม่ ไม่ถูกเตะ', () => {
    const onKick = vi.fn()
    wrapper = mountIdle(ref(true), onKick)

    vi.advanceTimersByTime(IDLE_KICK_MS - 1000)
    window.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(IDLE_KICK_MS - 1000)

    expect(onKick).not.toHaveBeenCalled()
  })
})

describe('★ คนรอคิวต้องไม่ถูกเตะ (บั๊กที่แก้)', () => {
  it('ไม่ได้ถือ lock = ไม่มีการจับเวลาเลย', () => {
    const onKick = vi.fn()
    wrapper = mountIdle(ref(false), onKick)

    // ปล่อยให้เวลาผ่านไปสองเท่าของเพดาน - คนรอคิวนั่งรอนานแค่ไหนก็ไม่ได้ทำให้ใครเสียหาย
    vi.advanceTimersByTime(IDLE_KICK_MS * 2)
    expect(onKick).not.toHaveBeenCalled()
  })

  it('รอคิวนานแล้วเพิ่งได้ lock = ได้เวลาเต็ม ไม่ใช่ถูกเตะทันที', async () => {
    const onKick = vi.fn()
    const holding = ref(false)
    wrapper = mountIdle(holding, onKick)

    // รอคิวอยู่ 9 นาที (นาฬิกาต้องไม่เดินระหว่างนี้)
    vi.advanceTimersByTime(9 * 60 * 1000)
    holding.value = true
    await nextTick()

    // เพิ่งได้คิว - อีก 9 นาทีต้องยังไม่โดนเตะ เพราะนาฬิกาเริ่มนับใหม่ตอนได้ lock
    vi.advanceTimersByTime(9 * 60 * 1000)
    expect(onKick).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1 * 60 * 1000)
    expect(onKick).toHaveBeenCalledTimes(1)
  })

  it('เสีย lock ระหว่างทาง = หยุดจับเวลา ไม่เตะย้อนหลัง', async () => {
    const onKick = vi.fn()
    const holding = ref(true)
    wrapper = mountIdle(holding, onKick)

    vi.advanceTimersByTime(IDLE_KICK_MS - 1000)
    holding.value = false
    await nextTick()

    vi.advanceTimersByTime(IDLE_KICK_MS)
    expect(onKick).not.toHaveBeenCalled()
  })
})

describe('เก็บกวาด', () => {
  it('ออกจากหน้าแล้วไม่เตะตามไปทีหลัง', () => {
    const onKick = vi.fn()
    wrapper = mountIdle(ref(true), onKick)

    wrapper.unmount()
    wrapper = null
    vi.advanceTimersByTime(IDLE_KICK_MS * 2)

    expect(onKick).not.toHaveBeenCalled()
  })

  it('ได้ lock ซ้ำ (reconnect) ไม่ทำให้ listener ซ้อนจนถอดไม่ครบ', async () => {
    const onKick = vi.fn()
    const holding = ref(true)
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    wrapper = mountIdle(holding, onKick)

    holding.value = false
    await nextTick()
    holding.value = true
    await nextTick()

    const added = addSpy.mock.calls.filter(([e]) => e === 'mousemove').length
    const removed = removeSpy.mock.calls.filter(([e]) => e === 'mousemove').length

    wrapper.unmount()
    wrapper = null
    const removedAfter =
      removeSpy.mock.calls.filter(([e]) => e === 'mousemove').length - removed

    // ใส่กี่ครั้งต้องถอดได้ครบเท่านั้น (start() ถอดก่อนใส่เสมอ + onUnmounted ปิดท้าย)
    expect(removed + removedAfter).toBeGreaterThanOrEqual(added)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// heartbeat - บอก backend ว่า "ยังทำงานอยู่" เพื่อต่ออายุ lock
//
// บั๊กที่ตัวนี้ปิด: backend เคยนับอายุ lock จากตอนได้ lock (15 นาที) คนที่นั่งไล่ตรวจของ
// ทั้งใบโดยยังไม่กดบันทึกอะไร จะกดปุ่มแรกไม่ผ่านทั้งที่จอบอกว่าแก้ได้
describe('heartbeat ต่ออายุ lock', () => {
  it('ถือ lock แล้วขยับจอ = ส่ง heartbeat แต่ไม่ถี่กว่าหนึ่งครั้งต่อช่วง', () => {
    const onActive = vi.fn()
    wrapper = mountIdle(ref(true), vi.fn(), onActive)

    // เพิ่งได้ lock - backend เพิ่งตั้งเวลาให้แล้ว ยังไม่ต้องส่ง
    window.dispatchEvent(new Event('mousemove'))
    expect(onActive).not.toHaveBeenCalled()

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('mousemove'))
    expect(onActive).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    window.dispatchEvent(new Event('keydown'))
    expect(onActive).toHaveBeenCalledTimes(2)
  })

  it('รอคิวอยู่ (ไม่ได้ถือ lock) = ไม่ส่ง heartbeat', () => {
    const onActive = vi.fn()
    wrapper = mountIdle(ref(false), vi.fn(), onActive)

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2)
    window.dispatchEvent(new Event('mousemove'))
    expect(onActive).not.toHaveBeenCalled()
  })

  it('นั่งเฉยไม่แตะอะไร = ไม่ส่ง heartbeat (backend ต้องปล่อยให้หมดอายุได้)', () => {
    const onActive = vi.fn()
    wrapper = mountIdle(ref(true), vi.fn(), onActive)

    vi.advanceTimersByTime(IDLE_KICK_MS - 1000)
    expect(onActive).not.toHaveBeenCalled()
  })

  it('★ idle kick + ช่วง heartbeat ต้องสั้นกว่าอายุ lock ฝั่ง backend', () => {
    // HOLDER_TTL_MS ของ presence.service ฝั่ง backend - import ข้ามโปรเจกต์ไม่ได้จึงเขียนเลข
    // ถ้าแก้ฝั่งใดฝั่งหนึ่งแล้วเทสต์นี้ล้ม = backend จะตัดคนที่จอยังบอกว่าทำงานอยู่ (บั๊กเดิม)
    const BACKEND_HOLDER_TTL_MS = 15 * 60 * 1000
    expect(IDLE_KICK_MS + HEARTBEAT_INTERVAL_MS).toBeLessThan(BACKEND_HOLDER_TTL_MS)
  })
})
