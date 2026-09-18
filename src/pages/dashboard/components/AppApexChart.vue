<script setup lang="ts">
// ครอบ apexcharts (ตัวไลบรารีดิบ) ให้เรียกใช้แบบคอมโพเนนต์ Vue ได้
//
// ★ ทำไมไม่ลง vue3-apexcharts: โปรเจกต์นี้ตรึง vue ไว้ที่ `rc` ผ่าน overrides ทั้งชุด
//   ตัว wrapper ทางการ peer-depend กับ vue เวอร์ชัน stable - ลงแล้วจะได้ทั้ง peer warning
//   และ runtime ที่ไม่มีใครรับประกัน แลกกับโค้ดไม่กี่สิบบรรทัดข้างล่างนี้ ไม่คุ้ม
//
// หน้าที่ของไฟล์นี้มีแค่ 4 อย่าง ไม่ต้องรู้จักข้อมูลของกราฟเลย:
//   สร้าง → อัปเดตเมื่อ options เปลี่ยน → ปรับขนาดตามกล่องที่อยู่ → ทำลายตอน unmount
//
// ★ ต้อง destroy() เสมอ - Apex ผูก resize listener ระดับ window ไว้ต่อกราฟหนึ่งตัว
//   ถ้าไม่ทำลาย ทุกครั้งที่เข้า-ออกหน้า Dashboard จะเหลือ listener ค้างเพิ่มขึ้นเรื่อย ๆ
//   ชี้ไปยัง DOM ที่ถูกถอดไปแล้ว
//
// ★ ResizeObserver ไม่ใช่ของแถม - Apex ฟังแค่ resize ของ window (เช็คแล้วใน v7:
//   ไม่มีคำว่า ResizeObserver ในตัวไลบรารีเลยสักที่) เวลาผู้ใช้พับ Sidebar ความกว้างของ
//   การ์ดเปลี่ยนแต่ window ไม่เปลี่ยน กราฟจะค้างความกว้างเดิมจนกว่าจะย่อ-ขยายหน้าต่าง
//
// ★ ตัวที่ทำให้ observer ข้างล่างมีผลจริงคือ "เรียก update() ไม่ใช่ updateOptions()" ไม่ใช่
//   ตัว observer เอง — Apex v7 memoize updateOptions ไว้ เหตุผลเต็มอยู่ที่ callback ของ observer
//   (ส่วน min-w-0 ที่การ์ดฝั่ง Dashboard เป็นแค่กันเหนียว วัดแล้วไม่ใช่สาเหตุของบั๊กนั้น)
import { onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import ApexCharts from 'apexcharts'

const props = defineProps({
  /** options ของ Apex ทั้งก้อน รวม series - ฝั่งผู้เรียกเป็นเจ้าของทั้งหมด */
  options: { type: Object as PropType<ApexCharts.ApexOptions>, required: true },
  /**
   * เล่นอนิเมชันตอนวาดครั้งแรกและตอนข้อมูลเปลี่ยนไหม
   *
   * ★ สวิตช์อยู่ที่นี่ที่เดียว - ค่าที่ผู้เรียกใส่มาใน options.chart.animations.enabled
   *   จะถูกทับด้วย prop นี้เสมอ (ดู withAnimation) ไม่งั้นจะมีสองที่ที่คุมเรื่องเดียวกัน
   *   แล้วต้องมานั่งไล่ว่าอันไหนชนะ
   *
   * ปิดเมื่อกราฟอัปเดตถี่ ๆ (อนิเมชันที่ยังเล่นไม่จบแล้วโดนสั่งใหม่จะดูเหมือนกราฟกระตุก)
   */
  animate: { type: Boolean, default: true },
})

/**
 * ประกอบ options ที่ส่งให้ Apex จริง
 *
 * ไม่แก้ props.options ตรง ๆ - มันเป็นของผู้เรียก การเขียนทับจะทำให้ computed ฝั่งโน้น
 * เห็นค่าที่ตัวเองไม่ได้ใส่ แล้วดีบั๊กยากมากเวลาค่าไม่ตรงกับที่เขียนไว้
 */
function withAnimation(options: ApexCharts.ApexOptions): ApexCharts.ApexOptions {
  return {
    ...options,
    chart: {
      ...(options.chart ?? {}),
      animations: { ...(options.chart?.animations ?? {}), enabled: props.animate },
    },
  }
}

const host = ref<HTMLDivElement | null>(null)

// ไม่เก็บใน ref โดยตั้งใจ - instance ของ Apex ถือ DOM/SVG ของตัวเองเป็นพันโหนด
// ถ้าให้ Vue ห่อ reactive proxy จะโดนไล่ทั้งต้นไม้โดยไม่ได้ประโยชน์อะไรเลย
let chart: ApexCharts | null = null
let observer: ResizeObserver | null = null
let disposed = false
/** ความกว้างที่วาดไว้ล่าสุด - ใช้กันไม่ให้วาดซ้ำตอน observer ดังโดยที่ขนาดไม่เปลี่ยน */
let lastWidth = 0

onMounted(() => {
  const el = host.value
  if (!el) return

  /**
   * ★ ห้ามสร้างกราฟจนกว่ากล่องจะมีความกว้างจริง
   *
   * Apex วัดความกว้างครั้งเดียวตอน render() แล้วจำไว้ ถ้าตอนนั้นกล่องยังกว้าง 0
   * (สไตล์มาช้ากว่า mount / อยู่ใน grid ที่ยัง layout ไม่เสร็จ) มันจะวาด svg width="0"
   * ออกมาแล้ว **ไม่ฟื้นเอง** - ผลคือการ์ดมีกรอบมีหัวข้อครบแต่ในกราฟว่างเปล่า ไม่มี error
   * ไม่มีอะไรฟ้องเลย เจอมาแล้วทั้งกราฟแท่งและโดนัท
   *
   * เคยลองแก้ด้วยการ "วาดแล้วค่อยเช็คว่าได้ 0 ไหม แล้วสั่งวาดใหม่" - ไม่พอ เพราะ
   * updateOptions ไม่ได้บังคับให้ Apex วัดกล่องใหม่ทุกกรณี รอให้กว้างก่อนแล้วค่อยสร้าง
   * เป็นทางเดียวที่จบ
   */
  const create = async (width: number) => {
    lastWidth = width
    chart = new ApexCharts(el, withAnimation(props.options))
    await chart.render()

    // ระหว่าง await ข้างบน คอมโพเนนต์อาจถูกถอดไปแล้ว (กดสลับหน้าเร็ว ๆ) -
    // onBeforeUnmount รอบนั้นเจอ chart เป็น null จึงยังไม่ได้ทำลายอะไร ต้องเก็บกวาดตรงนี้เอง
    if (disposed) {
      chart.destroy()
      chart = null
    }
  }

  /**
   * รอจนกล่องมีความกว้างแล้วค่อยสร้าง - ลองใหม่ทุกเฟรมจนกว่าจะได้
   *
   * ★ ห้ามไปรอ callback แรกของ ResizeObserver แทน - **มันไม่ยิงให้กล่องที่พื้นที่เป็นศูนย์**
   *   และก่อนมีกราฟ กล่องนี้คือ <div> เปล่าที่สูง 0 พอดี กลายเป็นวงกลม:
   *   ไม่มีกราฟ → ไม่มีความสูง → observer ไม่ดัง → ไม่มีกราฟ (เจอมาแล้ว หน้าเงียบสนิท
   *   ไม่มี error ให้ตามด้วย) rAF ไม่มีปัญหานี้เพราะไม่ได้ผูกกับขนาดของ element
   */
  const start = () => {
    if (disposed) return
    const width = el.clientWidth
    if (width > 0) {
      void create(width)
      return
    }
    requestAnimationFrame(start)
  }
  start()

  // ★ เทียบความกว้างก่อนสั่งวาดใหม่เสมอ ห้ามวาดทุกครั้งที่ observer ดัง - การวาดใหม่
  //   ทำให้ Apex เซ็ตความสูงของกล่องนี้เอง ซึ่งดัง observer ซ้ำ กลายเป็นวนไม่รู้จบ
  observer = new ResizeObserver(() => {
    const width = el.clientWidth
    // ยังไม่มีกราฟ = start() ยังทำงานอยู่ ปล่อยให้มันเป็นคนสร้าง จะได้ไม่สร้างซ้อนกันสองตัว
    if (width === 0 || !chart || width === lastWidth) return
    lastWidth = width
    /**
     * ★ **ต้องเป็น update() ห้ามเป็น updateOptions() ไม่ว่าจะส่งอะไรเข้าไป**
     *
     * สองเมธอดนี้ต่างกันตรงที่ updateOptions มี memo คั่นอยู่ ส่วน update() ไม่มี
     * (ดูซอร์ส: update ตรวจ memo เฉพาะเมื่อ `options` truthy - เรียกเปล่าจึงข้ามไปเลย)
     *
     * ★ ทำไมไม่ใช่ `updateOptions({})` — Apex v7 memoize ไว้: options ที่ shallowEqual
     *   กับรอบก่อนจะ `return Promise.resolve(this)` ทิ้งไปเฉย ๆ ไม่วาด ไม่ error
     *   และ `{}` เท่ากับ `{}` เสมอ = รอบแรกวาด รอบต่อ ๆ ไปเงียบสนิท
     *   (ตัวไลบรารีเองเขียนไว้ที่ refreshTokens() ว่า "updateOptions({}) is memoized away")
     *
     * ★ ทำไมไม่ใช่ `updateOptions({ chart: { width } })` — มันหนีจาก memo ได้ก็จริง
     *   แต่ **ฝัง width เป็นตัวเลข px ลง config ถาวร** (`chart.width` เปลี่ยนจาก "100%"
     *   เป็น 500) กราฟจึงหมดความเป็น responsive ของตัวเองทันที ผลคือรอบถัดไปที่ Apex
     *   วาดเองจาก window resize มันจะวาดที่ px ที่ค้างไว้ ไม่ใช่ขนาดกล่องจริง แล้วค่อยโดน
     *   observer ตัวนี้ตามมาแก้ = เห็นกราฟกระโดดสองจังหวะ (อาการ "กราฟแท่งวาร์ป")
     *
     * วัดจริงกับ apexcharts ที่ลงไว้ (กล่อง 800→500→300→650→300):
     *   updateOptions({})              500 แล้วค้างที่ 500
     *   updateOptions({chart:{width}}) ขนาดถูก แต่ cfg.chart.width กลายเป็น 500 (px)
     *                                  พอ window resize → วาดที่ 500 ทั้งที่กล่อง 300
     *   update()                       ขนาดถูกทุกรอบ และ cfg.chart.width ยังเป็น "100%"
     *
     * ★ ที่ต้อง cast เพราะ apexcharts.d.ts ที่มากับแพ็กเกจประกาศไว้แต่ updateOptions
     *   ไม่ได้ประกาศ update() ทั้งที่เมธอดมีอยู่จริง (ตรวจในซอร์ส + ทดสอบกับของจริงแล้ว
     *   ทั้งการวัดขนาดและค่า cfg.chart.width) ถ้าวันหลังอัปเกรดแล้วเมธอดหาย จะไม่มี
     *   TypeScript คอยเตือน - อาการที่จะเจอคือกราฟกลับไปค้างขนาดเดิมตอนพับเมนู
     */
    void (chart as unknown as { update: () => Promise<unknown> }).update()
  })
  observer.observe(el)
})

// ★ พารามิเตอร์ตัวที่ 3 ของ updateOptions คือ animate - ต้องตามค่า prop
//   ถ้าฝืนใส่ false ไว้ ต่อให้เปิด animations ใน options กราฟก็จะกระโดดตอนข้อมูลเปลี่ยนอยู่ดี
//   (คนละตัวกับ resize ข้างบนที่ต้องเป็น false เสมอ)
watch(
  () => props.options,
  (next) => {
    void chart?.updateOptions(withAnimation(next), true, props.animate)
  },
)

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  observer = null
  chart?.destroy()
  chart = null
})
</script>

<template>
  <div ref="host" />
</template>
