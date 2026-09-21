// สี/ค่าคงที่กลางของกราฟบนหน้า Dashboard - ให้กราฟทุกตัวในหน้าอ่านเป็นชุดเดียวกัน
//
// ★ สีในไฟล์นี้มีสองพวก อย่าปนกัน
//
//   1) "สีของข้อมูล" (CATEGORY_COLORS / OTHER_COLOR / VALUE_COLOR) - คงที่ทุกธีม
//      เพราะมันคือตัวตนของก้อนข้อมูล ถ้าให้วิ่งตามธีมด้วย คนจะจำไม่ได้ว่าสีไหนคือบริษัทไหน
//      และภาพหน้าจอที่ส่งต่อกันข้ามธีมจะเทียบกันไม่ได้
//
//   2) "สีของกระดาษ" (ink / inkMuted / grid / surface) - ต้องวิ่งตามธีม เพราะมันคือ
//      ตัวหนังสือกับเส้นที่วางอยู่บนพื้นการ์ด ซึ่งพื้นการ์ดเปลี่ยนสีตามธีม
//
// ★ ชุดสีข้อมูลผ่านการตรวจแล้ว ห้ามสลับลำดับหรือเติมสีเองตามใจ
//   เกณฑ์ที่ผ่าน (พื้นขาว = base-100 ของธีม ams): ทุกคู่ที่อยู่ติดกันแยกออกจากกันได้
//   ทั้งสายตาปกติ (ΔE ต่ำสุด 19.6) และตาบอดสี (ΔE ต่ำสุด 9.1 แบบ protan)
//   ถ้าจะเปลี่ยนสี ต้องรันตรวจใหม่ทั้งชุด ไม่ใช่เปลี่ยนทีละสีด้วยสายตา
//
// ★ สามสีในชุดนี้ (เขียว/เหลือง/ชมพู) contrast กับพื้นขาวต่ำกว่า 3:1 - แปลว่า "ห้ามให้สี
//   เป็นตัวบอกความหมายเพียงอย่างเดียว" กราฟที่ใช้ชุดนี้จึงต้องมีป้ายกำกับที่อ่านเป็น
//   ตัวหนังสือได้เสมอ (legend ที่มีตัวเลข + ตารางสรุปรายแผนกใต้กราฟ) - มีอยู่แล้วทั้งคู่
//   (ตัวเลข ΔE ข้างบนวัดบนพื้นขาว ธีมมืดยังไม่ได้วัดซ้ำ - กติกา "ต้องมีป้ายตัวหนังสือ"
//    จึงยิ่งต้องคงไว้ ห้ามถอด)
import { computed, ref } from 'vue'

export const CATEGORY_COLORS = ['#0083ca', '#00beba', '#65e100', '#eda100', '#e87ba4'] as const

/** สีของก้อน "อื่น ๆ" - เทาโดยตั้งใจ เพราะมันไม่ใช่ตัวตนของแผนกไหน แค่ที่รวมส่วนที่เหลือ */
export const OTHER_COLOR = '#94a3b8'

/** กราฟค่าเดียว (ranking) ใช้สีเดียวทั้งกราฟ - ความยาวแท่งคือข้อมูล ไม่ใช่สี */
export const VALUE_COLOR = '#0083ca'

/** เอาสีตามลำดับสล็อต - เกินชุดแล้วถือเป็น "อื่น ๆ" (ผู้เรียกไม่ควรปล่อยให้เกินอยู่แล้ว) */
export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index] ?? OTHER_COLOR
}

/* ─────────────────── สเกลอายุคงเหลือ: เร่งด่วน → ปลอดภัย ───────────────────
 *
 * 7 ขั้นตรงกับถัง 7 ใบของ backend (หมดอายุแล้ว / ≤12 / 13–24 / 25–36 / 37–48 /
 * 49–60 / >60 เดือน) ใช้ที่ RemainingLifeChart ที่เดียว
 *
 * ★ เดิมชุดนี้ประกาศอยู่ใน RemainingLifeChart.vue เอง แล้วหยิบสีมือจาก Tailwind
 *   ซึ่งทำให้ 4 ใน 7 สีเป็น "โทเคนธีมที่เพี้ยนไปนิดเดียว" - ความหมายซ้ำแต่ค่าไม่ตรง
 *   (#ea9a0b ห่างจาก warning แค่ ΔEok 0.009 / #16a34a ห่างจาก success 0.021 /
 *    #dc2626 ห่างจาก error 0.025 / #0891b2 ห่างจาก secondary 0.036)
 *
 * ★ **สเกลนี้ต่างจาก CATEGORY_COLORS ข้างบนโดยธรรมชาติ ไม่ใช่ข้อยกเว้น**
 *   ข้างบนเป็น "สีประจำตัว" (แผนกไหน/บริษัทไหน) ซึ่งไม่มีลำดับ จึงต้องแยกกันให้ชัดทุกคู่
 *   ชุดนี้เป็น "ระดับความเร่งด่วน" ซึ่งมีลำดับในตัว - แดงคือต้องเปลี่ยนแล้ว เขียว/ฟ้าคือยังไกล
 *   ความหมายมันจึงผูกกับโทเคน error/warning/success อยู่แล้ว ไม่ควรไปคิดสีใหม่ขึ้นมาแข่ง
 *
 * ★ ที่มาของค่า: จุดยึด 4 ตัวเอาค่าจากโทเคนธีม ams ตรง ๆ ไม่ขยับสักหน่วย
 *
 *     index 0  error      oklch(60% 0.21 25)    #e23439
 *     index 1  warning    oklch(75% 0.16 75)    #e89d00
 *     index 5  success    oklch(62% 0.15 150)   #2e9e52
 *     index 6  secondary  oklch(60% 0.10 240)   #4188b6
 *
 *   ★ hex สี่ตัวนี้อ่านมาจากที่เบราว์เซอร์เรนเดอร์จริง ไม่ใช่แปลงสูตรเอง - warning อยู่นอก
 *     ขอบเขต sRGB (chroma 0.16 ที่ L 75% เกินไป) ซึ่งการ "ลด chroma จนเข้าขอบเขต" ตาม
 *     ตำราให้ #e49e24 แต่ Chrome clip ช่องสีตรง ๆ ได้ #e89d00 ซึ่งต่างกันจนเห็น
 *     ถ้าคำนวณเอาเองจะได้สีที่ไม่ตรงกับที่จอแสดงจริง
 *
 *   ส่วน index 2–4 ผสมระหว่าง warning กับ success ใน OKLCh (ไม่ใช่ sRGB - เดินตามส่วนโค้ง
 *   ของเฉดสี ไม่งั้นช่วงกลางจะตกไปเป็นสีโคลน) ที่อัตราส่วน 75% / 50% / 25%
 *
 *   ★ ถ้าแก้โทเคนในธีม ต้องมาแก้ชุดนี้ด้วย - chart-theme.ramp.spec.ts อ่าน main.css
 *     แล้วเทียบให้ ถ้าลืมมันจะล้มทันที ไม่ใช่เพี้ยนเงียบ ๆ แบบที่เคยเป็น
 *
 * ★ คงที่ทุกธีม ตามกติกาเดียวกับ CATEGORY_COLORS - ตรวจแล้วว่าใช้ได้ทั้งสองพื้น
 *   (พื้นมืดไม่มีขั้นไหนต่ำกว่า 3:1 เลย ส่วนพื้นสว่างมี 3 ขั้น ดูข้อถัดไป)
 *
 * ★ **ข้อแลกเปลี่ยนที่ยอมรับแล้ว: ขั้นที่ 1→2→3 แยกกันยากสำหรับตาบอดสีแบบ protan**
 *   (ΔEok 0.010 เทียบกับชุดเดิม 0.036) เพราะช่วงส้ม→เขียวมะกอกคือแกนที่ protan มองไม่เห็น
 *   ยอมรับได้เพราะสเกลนี้ไม่ได้ให้สีเป็นตัวระบุถัง - ทุกแท่งมีป้ายเดือนของตัวเองบนแกน X
 *   และสองคู่ที่ต้องแยกให้ออกจริง ๆ ยังห่างมาก: แท่ง "หมดอายุแล้ว" (0.247) กับ ">60 เดือน" (0.173)
 *   ★ กติกาที่ห้ามถอด: ป้ายบนแกน X ต้องอยู่ครบทุกแท่งเสมอ ถ้าวันหนึ่งซ่อนป้ายแล้วให้สี
 *     เป็นตัวบอกถัง ต้องกลับมาออกแบบสเกลนี้ใหม่ทั้งชุด
 */
export const REMAINING_LIFE_RAMP = [
  '#e23439', // หมดอายุแล้ว  = error      (สว่าง 4.39:1 · มืด 3.85:1)
  '#e89d00', // ≤12 เดือน    = warning    (สว่าง 2.27:1 · มืด 7.45:1)
  '#c3a10a', // 13–24 เดือน               (สว่าง 2.49:1 · มืด 6.78:1)
  '#9ca21e', // 25–36 เดือน               (สว่าง 2.76:1 · มืด 6.12:1)
  '#6ea232', // 37–48 เดือน               (สว่าง 3.05:1 · มืด 5.53:1)
  '#2e9e52', // 49–60 เดือน  = success    (สว่าง 3.43:1 · มืด 4.93:1)
  '#4188b6', // >60 เดือน    = secondary  (สว่าง 3.87:1 · มืด 4.36:1)
] as const

/* ───────────────────────── สีของกระดาษ: อ่านจากธีมที่ใช้อยู่จริง ─────────────────────────
 *
 * ★ ของเดิมฝังเป็นค่าคงที่ (#334155 / #64748b / #e2e8f0 / #ffffff) ตอนที่แอปล็อกธีม
 *   สว่างไว้ธีมเดียว พอเปิดให้สลับธีมได้ ค่าพวกนี้ไม่ขยับตาม ผลคือบนธีมมืด:
 *   ตัวหนังสือบนกราฟเป็นเทาเข้มทับพื้นการ์ดสีเข้ม = อ่านไม่ออก
 *   และเส้นคั่นชิ้นพายยังเป็นสีขาว = กลายเป็นขีดขาวพาดกลางกราฟ
 *
 * ★ ทำไมไม่ส่งค่า oklch ของ daisyUI เข้า Apex ตรง ๆ แต่ต้องแปลงเป็น hex ก่อน
 *   Apex ไม่ได้แค่เอาสีไปวาด - บางเส้นทาง (เงา/hover/gradient) เอาไปคำนวณต่อด้วย
 *   ตัวแยกสีของมันเองที่รู้จักแค่ hex/rgb ส่ง oklch เข้าไปจะได้ NaN ออกมาแบบเงียบ ๆ
 *   canvas fillStyle ใช้ตัวแยกสีของเบราว์เซอร์เอง จึงรับได้ทุกรูปแบบที่ CSS รับได้
 *   แล้วคืนเป็น hex เสมอ
 */

/** ตัวนับ "ธีมเพิ่งเปลี่ยน" - ค่าไม่มีความหมาย มีไว้ให้ computed ข้างล่างรู้ว่าต้องอ่านสีใหม่ */
const themeTick = ref(0)
let watching = false

function watchTheme(): void {
  if (watching || typeof document === 'undefined') return
  watching = true

  // ★ ปุ่มสลับธีมของ daisyUI (.theme-controller) เป็น CSS ล้วน - มันทำงานด้วย
  //   :root:has(input.theme-controller:checked) ไม่ได้แตะ attribute ไหนบน <html> เลย
  //   MutationObserver จึงไม่มีทางเห็น ต้องดักที่ event change ของ input เอง
  //   (capture: true เพราะปุ่มอยู่คนละที่กับกราฟ และอาจถูก stopPropagation ระหว่างทาง)
  document.addEventListener(
    'change',
    (e) => {
      const el = e.target as HTMLElement | null
      if (el?.classList?.contains('theme-controller')) themeTick.value++
    },
    true,
  )

  // อีกทางที่ธีมเปลี่ยนได้คือเซ็ต data-theme บน <html> ตรง ๆ
  new MutationObserver(() => {
    themeTick.value++
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

/** ctx ตัวเดียวใช้ซ้ำทั้งไฟล์ - undefined = ยังไม่เคยลองสร้าง, null = สร้างไม่ได้ (jsdom) */
let canvasCtx: CanvasRenderingContext2D | null | undefined

/**
 * แปลงสีอะไรก็ได้ที่ CSS รู้จัก → '#rrggbb' คืน null ถ้าแปลงไม่ได้
 *
 * ★ ต้อง "ระบายแล้วอ่านพิกเซลกลับมา" ไม่ใช่อ่าน ctx.fillStyle เฉย ๆ
 *   วัดจริงบน Chrome แล้ว: ป้อน oklch เข้าไป fillStyle คืนออกมาเป็น 'oklch(0.28 0.025 260)'
 *   ไม่ใช่ hex (มันคืน hex เฉพาะสีที่อยู่ใน sRGB รูปแบบเก่าเท่านั้น) ซึ่งเป็นรูปแบบเดียว
 *   กับที่รับเข้าไป = ไม่ได้แปลงอะไรเลย และ mixHex ข้างล่างก็จะ parse ไม่ผ่าน
 *   การระบายลงผืนผ้าใบบังคับให้เบราว์เซอร์คำนวณค่า RGB จริงออกมาให้ (คร็อปลง sRGB
 *   ให้ด้วยในตัว ซึ่งคือสิ่งที่ต้องการอยู่แล้วเพราะปลายทางคือ hex)
 */
function toHex(color: string): string | null {
  if (canvasCtx === undefined) {
    canvasCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  }
  const ctx = canvasCtx
  if (!ctx) return null

  // ★ ต้องพิสูจน์ก่อนว่าเบราว์เซอร์รู้จักสีนี้ - ถ้าไม่รู้จัก มันจะ "เมินการกำหนดค่า"
  //   เงียบ ๆ ไม่ throw เหลือค่าเดิมค้างไว้ แล้วเราจะได้สีก่อนหน้ากลับไปโดยไม่รู้ตัว
  //   ลองจากค่าตั้งต้นคนละตัวสองรอบ ผลตรงกัน = ค่านั้นมาจากสีที่ส่งไปจริง
  ctx.fillStyle = '#000000'
  ctx.fillStyle = color
  const first = ctx.fillStyle
  ctx.fillStyle = '#ffffff'
  ctx.fillStyle = color
  if (first !== ctx.fillStyle) return null

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`
}

function themeColor(cssVar: string, fallback: string): string {
  watchTheme()
  // อ่าน themeTick เพื่อผูก dependency - ค่าที่ได้ไม่ได้ใช้ทำอะไร
  void themeTick.value
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  if (!raw) return fallback
  return toHex(raw) ?? fallback
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = Number.parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** ผสมสองสีแบบทึบ - ไม่ใช้ alpha เพราะ Apex เอาสีไปคำนวณต่อ ต้องได้สีทึบเสมอ */
function mixHex(fg: string, bg: string, ratio: number): string | null {
  const a = parseHex(fg)
  const b = parseHex(bg)
  if (!a || !b) return null
  const parts = [0, 1, 2].map((i) =>
    Math.round(a[i]! * ratio + b[i]! * (1 - ratio))
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${parts.join('')}`
}

/** พื้นการ์ด - ใช้เป็น "ช่องว่าง 2px" คั่นชิ้นกราฟที่ติดกัน แทนการตีเส้นขอบรอบก้อน */
export const surface = computed(() => themeColor('--color-base-100', '#ffffff'))

/** สีตัวหนังสือบนกราฟ - โทนหมึกของธีม ไม่ใช่สีของข้อมูล */
export const ink = computed(() => themeColor('--color-base-content', '#334155'))

/** เส้นตารางจาง ๆ หลังกราฟ */
export const grid = computed(() => themeColor('--color-base-300', '#e2e8f0'))

/** ตัวหนังสือรอง (ป้ายแกน/คำอธิบาย) - หมึกจางลงบนพื้นการ์ด ไม่ใช่เทาตายตัว
 *  ผสมเองแทนการลด opacity เพราะ Apex ต้องได้สีทึบ */
export const inkMuted = computed(() => mixHex(ink.value, surface.value, 0.68) ?? '#64748b')

/**
 * ย่อจำนวนเงินให้พออ่านบนแกน/ปลายแท่ง - ใช้กับ "ป้ายบนกราฟ" เท่านั้น
 * ตัวเลขเต็มยังต้องหาได้จาก tooltip และตารางสรุปรายแผนก (ห้ามให้กราฟเป็นที่เดียวที่มีตัวเลข)
 *
 * ★ ย่อเฉพาะหลักล้านขึ้นไป ต่ำกว่านั้นเขียนเลขเต็ม - เคยย่อเป็น "พัน" ด้วย แล้วได้ป้าย
 *   อย่าง "990 พัน" ซึ่งไม่มีใครพูด และอ่านพลาดเป็น 990 ล้านได้ง่ายเพราะรูปคล้ายกัน
 *   ("990,000" ยาวกว่าไม่กี่พิกเซล แลกกับไม่ต้องตีความ)
 */
export function compactBaht(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} ล้าน`
  return Math.round(value).toLocaleString('th-TH')
}

/** ตัดชื่อแผนกยาว ๆ ให้พอดีแกน y - ชื่อเต็มยังอยู่ใน tooltip */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
