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
import { IDLE_KICK_MS, useIdleKick } from '../idle-kick'

/** ห่อ composable ไว้ใน component จริง - onUnmounted ทำงานได้เฉพาะใน setup context */
function mountIdle(holding: ReturnType<typeof ref<boolean>>, onKick: () => void) {
  return mount(
    defineComponent({
      setup() {
        useIdleKick(holding as unknown as import('vue').Ref<boolean>, onKick)
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
