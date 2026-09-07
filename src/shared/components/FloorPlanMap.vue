<script setup lang="ts">
/**
 * แผนที่ผังชั้น - ภาพผังเป็น raster ส่วนขอบเขตห้องเป็น SVG ทับข้างบน
 *
 * ทำไมแยกสองชั้นแทนที่จะวาดห้องลงบนภาพไปเลย: ไฟล์ผังที่เสิร์ฟถูกย่อจากต้นฉบับ 9659px
 * เหลือ ~4800px เพื่อไม่ให้เบราว์เซอร์ decode 52 ล้านพิกเซล (RAM ~210 MB / Safari บน
 * iOS ทิ้งภาพไปเลย) พอซูมลึกลายเส้นผังจะเบลอ - แต่ขอบห้องกับป้ายชื่อเป็น vector/HTML
 * จึงคมทุกระดับซูม ซึ่งเป็นสองอย่างที่ผู้ใช้ต้องอ่านจริง ๆ ส่วนผังข้างหลังเป็นแค่ context
 *
 * ระบบพิกัด: polygon จาก backend เป็นสัดส่วน 0–1 ของภาพ → ใส่ลง viewBox="0 0 1 1"
 * ตรง ๆ ได้เลยโดยไม่ต้องรู้ขนาดภาพ ส่วน preserveAspectRatio="none" ทำให้กรอบ SVG
 * ทาบภาพพอดีเป๊ะแม้สัดส่วนไม่เท่ากัน (เส้นขอบใช้ vector-effect กันไม่ให้ยืดตาม)
 */
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useDraggable } from '@vueuse/core';
import { Icon } from '@iconify/vue';
import type { FloorPlanRoom } from '@/shared/services/master.service';
import { pointInPolygon, polygonBounds } from '@/shared/utils/polygon';

const props = defineProps<{
  /** URL ของภาพผัง - public/floorplans/<planKey>.png */
  src: string;
  rooms: FloorPlanRoom[];
  selectedId: number | null;
  /** เปิดที่จับสำหรับลากหมุด (มุมขวาบน ใต้ปุ่มซูม) - หน้าดูผังเฉย ๆ ไม่ต้องใช้ */
  pinnable?: boolean;
  /** หมุดที่ปักไว้แล้ว (สัดส่วน 0–1) - null = ยังไม่ได้ปัก */
  pin?: { x: number; y: number } | null;
  /**
   * หมุดของสินทรัพย์ที่ปักไว้ในห้อง - โหมดดูอย่างเดียว ลากไม่ได้
   *
   * คนละอันกับ pin ข้างบนซึ่งเป็น "หมุดที่กำลังจะบันทึก" ตัวนี้คือของที่บันทึกไว้แล้ว
   * จึงวาดเล็กกว่าและสีต่างกัน ไม่งั้นผู้ใช้แยกไม่ออกว่าอันไหนที่ตัวเองกำลังวาง
   */
  assetPins?: { id: number; x: number; y: number; label: string; icon: string }[];
  /**
   * หมุดของชิ้นที่ "กำลังโฟกัสอยู่" - หน้า Audit ใช้ตอนคลิกรายการฝั่งซ้าย
   *
   * ไม่ทำให้แผนที่เลื่อนเอง: การซูมยังคุมด้วย selectedId (ห้อง) เหมือนเดิม เพราะ
   * ck_asset_pos_needs_sub_location การันตีว่าชิ้นที่มีหมุดต้องมีห้องเสมอ ซูมไปที่ห้อง
   * จึงเห็นหมุดอยู่ในกรอบอยู่แล้ว - prop นี้มีหน้าที่เดียวคือ "ชี้ว่าอันไหน"
   * ในห้องที่มีของหลายชิ้น
   */
  activePinId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'select', id: number | null): void;
  /** วางหมุดลงในห้อง - roomId คือห้องที่จุดนั้นตกอยู่จริง ผู้เรียกเอาไปตั้งเป็นห้องที่เลือกได้เลย */
  (e: 'place', value: { x: number; y: number; roomId: number }): void;
  /** วางนอกห้องทุกห้อง - ให้ผู้เรียกตัดสินใจว่าจะเตือนยังไง */
  (e: 'place-outside'): void;
  /**
   * คลิกหมุดของสินทรัพย์ - ผู้เรียกเอาไปเลือกชิ้นนั้นในลิสต์ข้าง ๆ
   *
   * ★ ไม่ใช่ 'select' ที่เป็นของห้อง - คลิกหมุดต้องไม่เปลี่ยนห้องที่เลือกอยู่ (หมุดอยู่ใน
   *   ห้องที่เลือกอยู่แล้วเสมอ การส่ง select ซ้ำจะกลายเป็นสลับปิด/เปิดห้องทิ้ง)
   */
  (e: 'select-asset', id: number): void;
}>();

const viewport = ref<HTMLElement | null>(null);
/** ขนาดจริงของไฟล์ภาพ - รู้ได้หลัง onload เท่านั้น ก่อนหน้านั้นยังคำนวณ fit ไม่ได้ */
const nat = ref({ w: 0, h: 0 });
const tx = ref(0);
const ty = ref(0);
const k = ref(1);
/** ปิด transition ระหว่างลาก/หมุนล้อ ไม่งั้นภาพจะไล่ตามเมาส์แบบหน่วง ๆ */
const animate = ref(false);
const hoverId = ref<number | null>(null);

const MIN_K = 0.05;
const MAX_K = 40;
/** ซูมเกินนี้ค่อยโชว์ชื่อทุกห้อง - โชว์ตลอดตอนซูมออกสุดคือพรมตัวหนังสือทับกันจนอ่านไม่ออก */
const LABEL_K = 1.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const points = (polygon: [number, number][]) => polygon.map(([x, y]) => `${x},${y}`).join(' ');


/** ย่อทั้งผังให้พอดีกรอบ - ใช้ตอนเปิดหน้าและตอนกดปุ่มดูทั้งผัง */
function fit() {
  const el = viewport.value;
  if (!el || !nat.value.w) return;
  const scale = Math.min(el.clientWidth / nat.value.w, el.clientHeight / nat.value.h);
  k.value = scale;
  tx.value = (el.clientWidth - nat.value.w * scale) / 2;
  ty.value = (el.clientHeight - nat.value.h * scale) / 2;
}

/**
 * เลื่อน+ซูมไปหาห้อง ให้ห้องกินราว 55% ของกรอบ
 *
 * ไม่ซูมให้ห้องเต็มกรอบพอดี เพราะพอไม่เห็นอะไรรอบ ๆ เลยผู้ใช้จะไม่รู้ว่าห้องนี้อยู่ตรงไหน
 * ของตึก - เหลือขอบไว้ให้เห็นห้องข้างเคียงเป็นจุดอ้างอิง
 */
function zoomTo(room: FloorPlanRoom) {
  const el = viewport.value;
  if (!el || !nat.value.w) return;
  const b = polygonBounds(room.polygon);
  // ห้องที่ trace มาบางห้องแคบมากในแกนเดียว - กันหารศูนย์และกันซูมทะลุเพดาน
  const boxW = Math.max(b.w * nat.value.w, 1);
  const boxH = Math.max(b.h * nat.value.h, 1);
  const scale = clamp(Math.min(el.clientWidth / boxW, el.clientHeight / boxH) * 0.35, MIN_K, MAX_K);
  animate.value = true;
  k.value = scale;
  tx.value = el.clientWidth / 2 - b.cx * nat.value.w * scale;
  ty.value = el.clientHeight / 2 - b.cy * nat.value.h * scale;
}

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  nat.value = { w: img.naturalWidth, h: img.naturalHeight };
  const chosen = props.rooms.find((r) => r.id === props.selectedId);
  if (chosen) zoomTo(chosen);
  else fit();
}

// ── ลากเพื่อเลื่อน ──────────────────────────────────────────────────────────
const dragging = ref(false);
let last = { x: 0, y: 0 };
/** ลากแล้วขยับจริงหรือเปล่า - ใช้แยก "คลิกเลือกห้อง" ออกจาก "ลากจบพอดีบนห้อง" */
let moved = false;

// ⚠️ ห้ามใช้ setPointerCapture ที่ viewport - capture จะ retarget pointer event ทุกตัวมาที่
//    ตัวที่ capture ไว้ แล้วเบราว์เซอร์ยิง click ลงที่นั่นแทนตัวที่ผู้ใช้กดจริง ผลคือคลิก
//    <polygon> ไม่เลือกห้อง และปุ่ม +/−/ดูทั้งผัง กดไม่ติดสักปุ่ม (บั๊กที่เจอตอนใช้งานจริง)
//    ใช้ listener ที่ window ระหว่างลากแทน - ลากออกนอกกรอบแล้วยังตามต่อได้เหมือนกัน
/**
 * นิ้ว/เมาส์ที่กดค้างอยู่ตอนนี้ - key เป็น pointerId
 *
 * ★ จำเป็นสำหรับการซูมสองนิ้ว: ต้องรู้พิกัดของ "ทั้งสองนิ้ว" พร้อมกันถึงจะคิดระยะห่างได้
 *   ตัวแปร last ตัวเดียวเก็บได้แค่นิ้วเดียว
 *
 * ⚠️ viewport ตั้ง touch-none ไว้ (จำเป็น - ไม่งั้นเบราว์เซอร์กินการลากไปเลื่อนหน้าแทน)
 *    ซึ่งปิด pinch ของเบราว์เซอร์ไปด้วย บนมือถือจึงไม่มีทางซูมเลยถ้าไม่เขียนเอง
 *    (ก่อนแก้: เหลือแค่ลากกับปุ่ม +/− ส่วนล้อเมาส์มือถือไม่มี)
 */
const pointers = new Map<number, { x: number; y: number }>();
/** ระยะห่างสองนิ้วของเฟรมก่อน - null = ยังไม่ได้อยู่ในโหมดสองนิ้ว */
let pinchDist: number | null = null;

const centerOf = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const distOf = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function onPointerDown(e: PointerEvent) {
  // ปุ่มขวา/กลางไม่ใช่การลากแผนที่ ปล่อยให้เป็นหน้าที่ของเบราว์เซอร์
  if (e.button !== 0) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  dragging.value = true;
  moved = false;
  animate.value = false;
  last = { x: e.clientX, y: e.clientY };

  // นิ้วที่สองแตะลงมา = เข้าโหมดซูม ตั้งระยะฐานไว้เทียบเฟรมถัดไป
  // ★ ตั้ง moved = true ด้วย - การซูมไม่ใช่การเลือกห้อง ถ้าไม่ตั้ง พอยกนิ้วขึ้นบนห้อง
  //   จะกลายเป็นคลิกเลือกห้องนั้นทุกครั้งที่ซูมเสร็จ
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    pinchDist = distOf(a, b);
    moved = true;
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;

  // นิ้วที่ไม่ได้กดค้างอยู่ (เมาส์ที่แค่ลอยผ่าน) ไม่เกี่ยวกับการลาก
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // ── สองนิ้ว: ซูมตามระยะห่าง + เลื่อนตามจุดกึ่งกลาง ─────────────────────────
  //
  // ★ ซูมเข้าหา "จุดกึ่งกลางระหว่างสองนิ้ว" ไม่ใช่กลางจอ - หลักเดียวกับ onWheel
  //   ที่ซูมเข้าหาเคอร์เซอร์ ไม่งั้นจุดที่ผู้ใช้กำลังจับอยู่จะไหลหนีมือ
  if (pointers.size === 2) {
    const el = viewport.value;
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const dist = distOf(a, b);
    if (!el || pinchDist === null || pinchDist === 0) {
      pinchDist = dist || null;
      return;
    }

    const rect = el.getBoundingClientRect();
    const mid = centerOf(a, b);
    const px = mid.x - rect.left;
    const py = mid.y - rect.top;

    const next = clamp(k.value * (dist / pinchDist), MIN_K, MAX_K);
    const ratio = next / k.value;
    tx.value = px - (px - tx.value) * ratio;
    ty.value = py - (py - ty.value) * ratio;
    k.value = next;

    pinchDist = dist;
    moved = true;
    return;
  }

  // ── นิ้วเดียว/เมาส์: ลากเลื่อนเหมือนเดิมทุกบรรทัด ────────────────────────────
  const dx = e.clientX - last.x;
  const dy = e.clientY - last.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  tx.value += dx;
  ty.value += dy;
  last = { x: e.clientX, y: e.clientY };
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);

  // ★ ยกนิ้วเดียวจากสองนิ้ว = ยังลากต่อได้ด้วยนิ้วที่เหลือ ไม่ใช่จบการลาก
  //   ต้องรีเซ็ต last เป็นตำแหน่งของนิ้วที่เหลือ ไม่งั้นแผนที่จะกระโดดตามระยะที่ห่างกัน
  if (pointers.size === 1) {
    const [only] = [...pointers.values()] as [{ x: number; y: number }];
    last = { x: only.x, y: only.y };
    pinchDist = null;
    return;
  }
  if (pointers.size > 0) return;

  stopDragging();
  // ปล่อยให้ click ที่ตามมาอ่าน moved ได้ก่อน แล้วค่อยล้างสถานะในรอบถัดไป
  // (click ยิงหลัง pointerup เสมอ ถ้าล้างที่นี่เลย การลากจบบนห้องจะกลายเป็นการเลือกห้อง)
  setTimeout(() => {
    moved = false;
  }, 0);
}

/**
 * เลิกลาก + ถอด listener ที่ window — แยกจาก onPointerUp เพราะมีผู้เรียกสองแบบ
 *
 * onPointerUp ต้องรู้ว่านิ้วไหนยกขึ้น (รับ PointerEvent) ส่วนตอน unmount ไม่มี event
 * ให้ส่ง แต่ต้องเก็บกวาดให้หมดโดยไม่สนใจว่าเหลือกี่นิ้ว
 */
function stopDragging() {
  pointers.clear();
  pinchDist = null;
  dragging.value = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
}

/** ซูมเข้าหาตำแหน่งเคอร์เซอร์ ไม่ใช่กลางจอ - ไม่งั้นจุดที่กำลังดูอยู่จะไหลหนีมือ */
function onWheel(e: WheelEvent) {
  e.preventDefault();
  const el = viewport.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const next = clamp(k.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_K, MAX_K);
  const ratio = next / k.value;
  animate.value = false;
  tx.value = px - (px - tx.value) * ratio;
  ty.value = py - (py - ty.value) * ratio;
  k.value = next;
}

/** ปุ่ม +/- ซูมที่กลางกรอบ */
function zoomBy(factor: number) {
  const el = viewport.value;
  if (!el) return;
  const px = el.clientWidth / 2;
  const py = el.clientHeight / 2;
  const next = clamp(k.value * factor, MIN_K, MAX_K);
  const ratio = next / k.value;
  animate.value = true;
  tx.value = px - (px - tx.value) * ratio;
  ty.value = py - (py - ty.value) * ratio;
  k.value = next;
}

function onRoomClick(room: FloorPlanRoom) {
  if (moved) return;
  emit('select', room.id === props.selectedId ? null : room.id);
}

// ── หมุดที่ลากได้ (useDraggable ของ VueUse) ─────────────────────────────────
//
// กดปุ่ม = หมุดโผล่มาก่อน แล้วค่อยลากไปวางตรงที่ต้องการ ไม่ใช่ลากจากปุ่มทีเดียวจบ -
// แยกสองจังหวะแบบนี้ทำให้ลากพลาดแล้วลากซ้ำได้ ไม่ต้องเริ่มจากปุ่มใหม่ทุกครั้ง
//
// ★ แหล่งความจริงของตำแหน่งหมุดคือ "สัดส่วน 0–1" (props.pin) เสมอ ไม่ใช่พิกัดจอที่
//   useDraggable ถืออยู่ - ตำแหน่งบนจอ derive ออกมาจากสัดส่วนทุกครั้งที่เรนเดอร์
//
//   เคยทำกลับกัน (ดันพิกัดจอกลับเข้า x/y ของ useDraggable ทุกครั้งที่ transform เปลี่ยน)
//   แล้วพังสองอย่าง: ซูมเข้า-ออกหมุดเพี้ยนเพราะ transform ของแผนที่มี transition 300ms
//   แต่ค่าที่ดันเข้าไปเปลี่ยนทันที สองอย่างจึงวิ่งคนละจังหวะ; และหมุดที่เพิ่งกดปักจะโผล่
//   ผิดที่หนึ่งเฟรมเพราะ element เรนเดอร์ก่อนที่ค่าจะถูกดันเข้าไป
//
//   ใช้ x/y ของ useDraggable เฉพาะ "ระหว่างลาก" เท่านั้น พอปล่อยก็กลับไป derive เหมือนเดิม
const pinEl = useTemplateRef<HTMLElement>('pinEl');

/** ขนาดไอคอนหมุด - ต้องตรงกับคลาสใน template เพราะใช้คำนวณว่า "ปลายเข็ม" อยู่ตรงไหน */
const PIN_W = 32;
const PIN_H = 32;

const { x: pinX, y: pinY, isDragging } = useDraggable(pinEl, {
  preventDefault: true,
  stopPropagation: true,
  onEnd: onPinDrop,
});

/** แปลงพิกัดจอเป็นสัดส่วนของภาพ - ผกผันของ transform ที่ใช้เรนเดอร์ (screen = translate + base·k) */
function toFraction(clientX: number, clientY: number) {
  const el = viewport.value;
  if (!el || !nat.value.w) return null;
  const rect = el.getBoundingClientRect();
  const x = (clientX - rect.left - tx.value) / k.value / nat.value.w;
  const y = (clientY - rect.top - ty.value) / k.value / nat.value.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/**
 * มุมซ้ายบนของไอคอนหมุดตอนไม่ได้ลาก - คำนวณจากสัดส่วนล้วน ๆ
 *
 * derive แบบนี้ทำให้ซูม/เลื่อน/เปลี่ยนขนาดจอ หมุดตามไปเองโดยไม่มีโค้ด sync สักบรรทัด
 * (ตำแหน่ง absolute อิงกรอบแผนที่ ส่วนตอนลากเป็น fixed อิงจอ - ดู style ใน template)
 */
const pinAnchor = computed(() => {
  if (!props.pin || !nat.value.w) return null;
  return {
    left: tx.value + props.pin.x * nat.value.w * k.value - PIN_W / 2,
    top: ty.value + props.pin.y * nat.value.h * k.value - PIN_H,
  };
});

/**
 * ป้อนตำแหน่งจริงของหมุดให้ useDraggable ก่อนที่มันจะเริ่มจับการลาก
 *
 * ⚠️ จำเป็นเพราะตอนไม่ได้ลาก เราวาดหมุดเองจาก pinAnchor (absolute) - useDraggable
 *    จึงไม่เคยรู้ว่าหมุดอยู่ตรงไหน x/y ของมันยังค้างที่ 0 หรือค่าจากการลากรอบก่อน
 *    พอกดลาก มันคิดระยะจับ (grab offset) จากค่าที่ผิด หมุดเลยเด้งไปอยู่ใต้-ขวาของนิ้ว
 *    แทนที่จะอยู่ตรงจุดที่จับ
 *
 * ต้องเป็น capture เพื่อให้ทำงาน "ก่อน" listener ของ useDraggable ที่ผูกไว้ที่ element เดียวกัน
 */
function seedPinPosition() {
  const el = pinEl.value;
  const vp = viewport.value;
  if (!el || !vp) return;
  const r = el.getBoundingClientRect();
  const vr = vp.getBoundingClientRect();
  // จำมุมกรอบแผนที่ไว้ตอนเริ่มลาก ใช้แปลงพิกัดจอ -> พิกัดในกรอบตอนวาด (ดูคอมเมนต์ที่ pinDragStyle)
  // ระหว่างลากกรอบไม่ขยับ อ่านรอบเดียวพอ และไม่ต้องไปอ่าน rect ทุกเฟรม
  viewportOrigin.value = { left: vr.left, top: vr.top };
  pinX.value = r.left;
  pinY.value = r.top;
}

const viewportOrigin = ref({ left: 0, top: 0 });

/**
 * ตำแหน่งหมุดระหว่างลาก - absolute ในกรอบแผนที่ ไม่ใช่ fixed
 *
 * ⚠️ ห้ามใช้ position: fixed เด็ดขาด แม้ useDraggable จะให้พิกัดจอมา: กล่อง modal ของ
 *    daisyUI มี transform อยู่ ซึ่งทำให้ descendant ที่เป็น fixed ไปอิง "กล่อง" แทนที่จะ
 *    อิงจอ (กติกา containing block ของ CSS) หมุดเลยไปโผล่เยื้องขวาล่างจากมือเท่ากับระยะ
 *    ที่กล่องห่างจากมุมจอ - เห็นเฉพาะตอนเปิดในกล่อง ทดสอบบนหน้าเต็มจะไม่เจอ
 *
 *    แปลงเป็นพิกัดในกรอบเองแบบนี้ไม่ขึ้นกับว่ามี ancestor ตัวไหน transform อยู่หรือเปล่า
 */
const pinDragStyle = computed(() => ({
  left: `${pinX.value - viewportOrigin.value.left}px`,
  top: `${pinY.value - viewportOrigin.value.top}px`,
}));

function onPinDrop() {
  // ปลายเข็มอยู่กึ่งกลางแนวนอน ล่างสุดของไอคอน ไม่ใช่มุมซ้ายบนที่ useDraggable คืนมา
  // ไม่ต้องดีดกลับเองเมื่อวางไม่ผ่าน - ตำแหน่งที่วาดมาจาก props.pin ซึ่งไม่ได้เปลี่ยน
  // พอ isDragging กลับเป็น false มันก็กลับไปที่เดิมเอง
  const point = toFraction(pinX.value + PIN_W / 2, pinY.value + PIN_H);
  if (!point) return emit('place-outside');

  // ห้องที่ปลายเข็มตกอยู่จริง - ไม่ได้ยึดห้องที่เลือกไว้ก่อนหน้า การวางหมุดคือการบอกทั้ง
  // "ห้องไหน" และ "ตรงไหนในห้อง" พร้อมกัน
  const room = props.rooms.find((r) => pointInPolygon(r.polygon, point.x, point.y));
  if (!room) return emit('place-outside');
  emit('place', { ...point, roomId: room.id });
}

/**
 * จุดตั้งต้นของหมุดในห้อง - กึ่งกลางกรอบหุ้ม
 *
 * ห้องรูปตัว L กึ่งกลางกรอบหุ้มตกนอกตัวห้องได้ (เหตุผลเดียวกับที่ hit-test ใช้รูปจริง)
 * จึงมีทางถอยเป็นค่าเฉลี่ยของมุมทุกมุม แล้วค่อยไล่หาจุดในกริดถ้ายังไม่เข้า
 */
function insidePoint(room: FloorPlanRoom): { x: number; y: number } {
  const b = polygonBounds(room.polygon);
  if (pointInPolygon(room.polygon, b.cx, b.cy)) return { x: b.cx, y: b.cy };

  const avg = room.polygon.reduce(
    (a, [x, y]) => ({ x: a.x + x / room.polygon.length, y: a.y + y / room.polygon.length }),
    { x: 0, y: 0 },
  );
  if (pointInPolygon(room.polygon, avg.x, avg.y)) return avg;

  for (let i = 1; i < 5; i++) {
    for (let j = 1; j < 5; j++) {
      const p = { x: b.x0 + (b.w * i) / 5, y: b.y0 + (b.h * j) / 5 };
      if (pointInPolygon(room.polygon, p.x, p.y)) return p;
    }
  }
  return { x: b.cx, y: b.cy };
}

/** ปุ่ม "ปักหมุด" - ต้องเลือกห้องก่อน แล้วหมุดจะไปโผล่กลางห้องนั้นให้ลากต่อ */
function dropPinHere() {
  const room = props.rooms.find((r) => r.id === props.selectedId);
  if (!room || !nat.value.w) return;
  emit('place', { ...insidePoint(room), roomId: room.id });
}

/** ตำแหน่งหมุดบนจอ - คำนวณแบบเดียวกับป้ายชื่อ (อยู่นอก transform จึงขนาดคงที่) */
const pinScreen = computed(() => {
  if (!props.pin || !nat.value.w) return null;
  return {
    x: tx.value + props.pin.x * nat.value.w * k.value,
    y: ty.value + props.pin.y * nat.value.h * k.value,
  };
});

/** หมุดสินทรัพย์บนจอ - คำนวณแบบเดียวกับป้ายชื่อ (นอก transform จึงขนาดคงที่ทุกซูม) */
const assetMarkers = computed(() => {
  if (!nat.value.w) return [];
  return (props.assetPins ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    icon: a.icon,
    x: tx.value + a.x * nat.value.w * k.value,
    y: ty.value + a.y * nat.value.h * k.value,
  }));
});

/** หมุดสินทรัพย์ที่เมาส์ชี้อยู่ - ใช้ตัดสินว่าจะโชว์ป้ายชื่อของอันไหน */
const hoverAssetId = ref<number | null>(null);

/**
 * ป้ายของหมุดที่ชี้อยู่ - ทำเองแทน title ของเบราว์เซอร์
 *
 * title ขึ้นช้า (ต้องจ่อค้างเกือบวินาทีและห้ามขยับเมาส์) ซึ่งบนแผนที่ที่คนกวาดเมาส์หาของ
 * แปลว่า "ชี้แล้วไม่ติด" เกือบทุกครั้ง - ป้ายที่วาดเองขึ้นทันทีที่เมาส์เข้า
 *
 * ★ ตำแหน่งถูกบีบให้อยู่ในกรอบแผนที่เสมอ (กรอบเป็น overflow-hidden เพราะต้องคลิปตอนซูม)
 *   ไม่บีบแล้วหมุดที่อยู่ริมขอบจะโชว์ป้ายที่ถูกตัดครึ่งจนอ่านไม่ออก
 */
/**
 * หมุดที่ต้องโชว์ป้าย - เมาส์ชนะหมุดที่โฟกัสอยู่
 *
 * ตัวที่โฟกัสค้างป้ายไว้เองโดยไม่ต้องเอาเมาส์ไปจ่อ ไม่งั้นคนที่คลิกจากลิสต์ต้องไล่หา
 * ว่าหมุดไหนคือของที่เพิ่งคลิก ทั้งที่หน้านั้นมีไว้ตอบคำถามนี้ข้อเดียว
 */
const labelPinId = computed(() => hoverAssetId.value ?? props.activePinId ?? null);

const hoverLabel = computed(() => {
  const el = viewport.value;
  const marker = assetMarkers.value.find((m) => m.id === labelPinId.value);
  if (!el || !marker) return null;
  const MARGIN = 6;
  return {
    text: marker.label,
    x: clamp(marker.x, MARGIN, Math.max(MARGIN, el.clientWidth - MARGIN)),
    // วางไว้เหนือไอคอนหมวด (หมุด 20 + ไอคอน 20 + เว้น) ไม่บังตัวหมุดเอง
    y: Math.max(MARGIN, marker.y - 48),
  };
});

/** ป้ายชื่อวาดเป็น HTML นอก transform - จะได้ไม่ยืดตามและตัวอักษรคมทุกระดับซูม */
const labels = computed(() => {
  if (!nat.value.w) return [];
  const showAll = k.value >= LABEL_K;
  return props.rooms
    .filter((r) => showAll || r.id === props.selectedId || r.id === hoverId.value)
    .map((r) => {
      const b = polygonBounds(r.polygon);
      return {
        id: r.id,
        text: r.room || r.name,
        selected: r.id === props.selectedId,
        x: tx.value + b.cx * nat.value.w * k.value,
        y: ty.value + b.cy * nat.value.h * k.value,
      };
    });
});

// เลือกห้องจากลิสต์ข้าง ๆ ก็ต้องเลื่อนแผนที่ตามไปด้วย ไม่ใช่เฉพาะตอนคลิกบนแผนที่
watch(
  () => props.selectedId,
  (id) => {
    const room = props.rooms.find((r) => r.id === id);
    if (room) zoomTo(room);
  },
);

// สลับชั้น = คนละภาพคนละสัดส่วน ต้องรอ onload รอบใหม่ก่อนค่อยคำนวณ fit
watch(
  () => props.src,
  () => {
    nat.value = { w: 0, h: 0 };
  },
);

const onResize = () => fit();
window.addEventListener('resize', onResize);
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  // ถอด listener ของการลากด้วย - ถ้าผู้ใช้สลับหน้าไปทั้งที่ยังกดเมาส์ค้าง สองตัวนั้นจะค้างที่
  // window ตลอดอายุแท็บ แล้วขยับเมาส์ทีไรก็ไปเขียน tx/ty ของ component ที่ตายไปแล้ว
  stopDragging();
});

/**
 * เล็งกล้องไปที่ห้องหนึ่ง — ให้ผู้เรียกสั่งเองได้ ไม่ใช่รอให้ค่า prop เปลี่ยน
 *
 * ★ จำเป็นเพราะสองทางที่ component นี้เล็งกล้องเองครอบไม่ถึงเคส "เปิดกล่องเดิมซ้ำ":
 *
 *   1) onImageLoad — ยิงครั้งเดียวตลอดชีพของ element ตอนเปิดกล่องรอบสอง src เท่าเดิม
 *      และภาพอยู่ใน cache แล้ว เบราว์เซอร์จึงไม่ยิง load ซ้ำ
 *   2) watch(selectedId) — ไม่มี immediate และยิงเฉพาะตอนค่า "เปลี่ยน" เปิดกล่องเดิม
 *      ด้วยห้องเดิมค่าจึงเท่าเดิม ไม่ยิง
 *
 * ผลคือแผนที่ค้างอยู่มุมที่ผู้ใช้เลื่อนทิ้งไว้ครั้งก่อน หมุดที่บันทึกไว้ถูกวาดจริงแต่อยู่
 * นอกกรอบสายตา ซึ่งอ่านได้เป็น "ไม่แสดงจุดที่เลือกไว้" (FloorPlanPickerModal ไม่ถูก
 * unmount ตอนปิด — เป็น .modal ที่สลับคลาสเอา จึงเก็บ nat/k/tx/ty ข้ามรอบทั้งหมด)
 *
 * ไม่มีห้อง (id เป็น null) = ถอยไปดูทั้งผัง ซึ่งเป็นสถานะตั้งต้นที่ถูกต้องของกล่อง
 *
 * ★ ปลอดภัยเมื่อภาพยังโหลดไม่เสร็จ: zoomTo/fit เช็ค nat.w แล้วออกไปเอง จากนั้น
 *   onImageLoad จะเล็งให้อีกทีตอนภาพมาถึง — สองทางนี้ไม่ตีกัน
 */
function focus(id: number | null) {
  const room = id == null ? undefined : props.rooms.find((r) => r.id === id);
  if (room) zoomTo(room);
  else fit();
}

defineExpose({ fit, focus });
</script>

<template>
  <div
    ref="viewport"
    class="relative h-full w-full overflow-hidden rounded-box bg-base-200 touch-none select-none"
    :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
    @pointerdown="onPointerDown"
    @wheel="onWheel"
  >
    <!-- ชั้นภาพ+ขอบห้อง เลื่อน/ซูมพร้อมกันด้วย transform เดียว transform-origin ต้องเป็น 0 0
         ไม่งั้นสูตรคำนวณ tx/ty ข้างบนที่อิงมุมซ้ายบนจะเพี้ยนทั้งหมด -->
    <div
      class="absolute left-0 top-0 origin-top-left will-change-transform"
      :class="animate ? 'transition-transform duration-300 ease-out' : ''"
      :style="{
        width: nat.w ? nat.w + 'px' : '100%',
        height: nat.h ? nat.h + 'px' : '100%',
        transform: `translate(${tx}px, ${ty}px) scale(${k})`,
      }"
    >
      <img
        :src="src"
        alt="ผังชั้น"
        class="pointer-events-none block h-full w-full"
        draggable="false"
        @load="onImageLoad"
      />
      <svg
        v-if="nat.w"
        class="absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <polygon
          v-for="room in rooms"
          :key="room.id"
          :points="points(room.polygon)"
          vector-effect="non-scaling-stroke"
          class="transition-colors"
          :class="[
            isDragging ? 'pointer-events-none' : 'cursor-pointer',
            room.id === selectedId
              ? 'fill-primary/35 stroke-primary'
              : room.id === hoverId
                ? 'fill-primary/15 stroke-primary/70'
                : 'fill-base-content/10 stroke-base-content/60',
          ]"
          :stroke-width="room.id === selectedId ? 2.5 : 1.5"
          @pointerenter="hoverId = room.id"
          @pointerleave="hoverId = null"
          @click="onRoomClick(room)"
        />
      </svg>
    </div>

    <!-- หมุดตำแหน่ง (โหมด pinnable - ลากได้)
         absolute เกาะกรอบแผนที่เสมอ ทั้งตอนลากและไม่ลาก: ตอนไม่ลากอ่านจาก pinAnchor
         (derive จากสัดส่วน) ตอนลากอ่านจาก pinDragStyle (แปลงพิกัดจอของ useDraggable
         เป็นพิกัดในกรอบ) - ห้ามเปลี่ยนเป็น fixed ดูเหตุผลที่คอมเมนต์ของ pinDragStyle
         ขนาดต้องตรงกับ PIN_W/PIN_H ในสคริปต์ เพราะใช้คำนวณว่าปลายเข็มอยู่ตรงไหน -->
    <div
      v-if="pinnable && pin && nat.w && pinAnchor"
      ref="pinEl"
      class="absolute z-[1100] cursor-grab touch-none active:cursor-grabbing"
      :class="isDragging ? 'opacity-90' : ''"
      :style="
        isDragging
          ? pinDragStyle
          : { left: pinAnchor.left + 'px', top: pinAnchor.top + 'px' }
      "
      title="ลากเพื่อย้ายตำแหน่ง"
      @pointerdown.capture="seedPinPosition"
    >
      <svg viewBox="0 0 24 24" class="size-8 fill-error drop-shadow-lg" aria-hidden="true">
        <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" />
        <circle cx="12" cy="9" r="2.5" class="fill-base-100" />
      </svg>
    </div>

    <div
      v-else-if="pinScreen"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
      :style="{ left: pinScreen.x + 'px', top: pinScreen.y + 'px' }"
    >
      <svg viewBox="0 0 24 24" class="size-7 fill-error drop-shadow" aria-hidden="true">
        <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" />
        <circle cx="12" cy="9" r="2.5" class="fill-base-100" />
      </svg>
    </div>

    <!-- หมุดสินทรัพย์ที่บันทึกไว้แล้ว - ไอคอนหมวดอยู่บน ตัวหมุดอยู่ล่าง ปลายเข็มชี้จุดจริง
         สีกลาง (neutral) แยกจากหมุดสีแดงที่กำลังจะบันทึก ไม่งั้นผู้ใช้แยกไม่ออกว่าอันไหน
         คือของที่ตัวเองกำลังวาง

         ★ ชั้นครอบเป็น pointer-events-none แต่ตัวหมุดเปิดรับ event - ต้องเปิดถึงจะ hover
           ได้ แลกกับการที่คลิกตรงหมุดพอดีจะไม่ไปเลือกห้อง (คลิกข้าง ๆ ได้ตามปกติ)

         ★ px-3 pt-3 คือพื้นที่ชี้ที่มองไม่เห็น - ตัวหมุดกว้างแค่ 20px ชี้ติดยาก
           เพิ่ม padding เฉพาะซ้าย/ขวา/บน ห้ามเพิ่มด้านล่าง เพราะกล่องถูกดันขึ้นด้วย
           -translate-y-full ปลายเข็มจึงอยู่ที่ขอบล่างพอดี เพิ่มล่างเมื่อไหร่หมุดเลื่อนทันที

         ★ ป้ายชื่อทำเอง ไม่ใช้ title ของเบราว์เซอร์และไม่ใช้ tooltip ของ daisyUI -
           title ขึ้นช้าจนคนกวาดเมาส์หาของแล้วรู้สึกว่า "ชี้ไม่ติด" ส่วน tooltip ของ daisyUI
           วาดด้วย CSS ในกรอบที่ overflow-hidden จึงโดนตัดเมื่อหมุดอยู่ริมขอบ
           ตัวที่ทำเองขึ้นทันทีและถูกบีบให้อยู่ในกรอบเสมอ (ดู hoverLabel)

         ★ cursor-pointer ไม่ใช่ cursor-grab ที่สืบมาจากกรอบแผนที่ - หมุดของสินทรัพย์
           ลากไม่ได้แต่ "กดได้" (กดแล้วไปเลือกชิ้นนั้นในลิสต์) ถ้าปล่อยเป็นรูปมือจับ
           ผู้ใช้จะพยายามลากแล้วงงว่าทำไมไม่ขยับ

         ★ pointerdown.stop จำเป็น ไม่ใช่ของประดับ - กรอบแผนที่ผูก onPointerDown ไว้เริ่มลาก
           ปล่อยให้ bubble ขึ้นไปเมื่อไหร่ การกดหมุดจะกลายเป็นการเริ่มลากผัง แล้วขยับนิดเดียว
           ก็ตั้ง moved = true จนคลิกไม่ติด (หมุดกว้าง 20px ขยับ 1-2px ระหว่างกดเป็นเรื่องปกติ) -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        v-for="marker in assetMarkers"
        :key="marker.id"
        role="button"
        tabindex="0"
        class="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center px-3 pt-3"
        :class="labelPinId === marker.id ? 'z-20' : 'z-10'"
        :style="{ left: marker.x + 'px', top: marker.y + 'px' }"
        :aria-label="marker.label"
        @pointerenter="hoverAssetId = marker.id"
        @pointerleave="hoverAssetId = null"
        @pointerdown.stop
        @click.stop="emit('select-asset', marker.id)"
        @keydown.enter.prevent="emit('select-asset', marker.id)"
        @keydown.space.prevent="emit('select-asset', marker.id)"
      >
        <!-- หมุดที่โฟกัสอยู่เต้นค้างไว้ - ในห้องคลังที่หมุดอยู่ติด ๆ กัน สีอย่างเดียวแยกไม่ออก
             ว่าอันไหนคือชิ้นที่เพิ่งคลิก (ตัวที่แค่ hover ไม่ต้องเต้น เมาส์ชี้อยู่แล้วก็รู้ว่าอันไหน) -->
        <span
          class="mb-0.5 grid size-5 place-items-center rounded-full border bg-base-100 text-base-content shadow transition-colors"
          :class="[
            labelPinId === marker.id ? 'border-primary' : 'border-base-300',
            activePinId === marker.id ? 'ring-2 ring-primary/40' : '',
          ]"
        >
          <Icon :icon="marker.icon" class="size-3" />
        </span>
        <svg
          viewBox="0 0 24 24"
          class="size-5 drop-shadow transition-colors"
          :class="[
            labelPinId === marker.id ? 'fill-primary' : 'fill-neutral',
            activePinId === marker.id ? 'animate-bounce' : '',
          ]"
          aria-hidden="true"
        >
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" />
          <circle cx="12" cy="9" r="2.5" class="fill-base-100" />
        </svg>
      </div>

      <!-- ป้ายของหมุดที่ชี้อยู่ - วาดนอกลูป จะได้ทับหมุดตัวอื่นเสมอ ไม่โดนหมุดที่ซ้อนกันบัง -->
      <div
        v-if="hoverLabel"
        class="pointer-events-none absolute z-30 max-w-[16rem] -translate-x-1/2 truncate rounded bg-neutral px-2 py-1 text-xs text-neutral-content shadow-lg"
        :style="{ left: hoverLabel.x + 'px', top: hoverLabel.y + 'px' }"
      >
        {{ hoverLabel.text }}
      </div>
    </div>

    <!-- ป้ายชื่อห้อง: อยู่นอก transform จึงไม่ยืดและขนาดคงที่ทุกระดับซูม -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        v-for="label in labels"
        :key="label.id"
        class="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-xs shadow-sm"
        :class="label.selected ? 'bg-primary text-primary-content' : 'bg-base-100/85 text-base-content'"
        :style="{ left: label.x + 'px', top: label.y + 'px' }"
      >
        {{ label.text }}
      </span>
    </div>

    <!-- ปุ่มควบคุม - pointerdown.stop กันไม่ให้การกดปุ่มไปเริ่มลากแผนที่ไปด้วย -->
    <div class="absolute right-3 top-3 flex flex-col items-end gap-2" @pointerdown.stop>
      <div class="join join-vertical shadow">
        <button class="btn join-item btn-sm" title="ซูมเข้า" @click.stop="zoomBy(1.4)">+</button>
        <button class="btn join-item btn-sm" title="ซูมออก" @click.stop="zoomBy(1 / 1.4)">−</button>
        <button class="btn join-item btn-sm" title="ดูทั้งผัง" @click.stop="fit()">⤢</button>
      

      <!-- กดแล้วหมุดโผล่ก่อน ค่อยลากไปวางตรงที่ต้องการ -->
      <button
        v-if="pinnable && nat.w"
        type="button"
        class="btn btn-sm shadow"
        :class="pin ? '' : 'btn-primary'"
        :disabled="!selectedId"
        :title="!selectedId ? 'เลือกห้องก่อนถึงจะปักหมุดได้' : pin ? 'ย้ายหมุดกลับไปกลางห้อง' : 'วางหมุดกลางห้องแล้วลากไปตรงที่ต้องการ'"
        @click.stop="dropPinHere"
      >
        <svg viewBox="0 0 24 24" class="size-4 fill-current" aria-hidden="true">
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" />
        </svg>
        {{ pin ? '' : '' }}
      </button>
      </div>
    </div>

    <div
      v-if="!nat.w"
      class="absolute inset-0 flex items-center justify-center"
    >
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  </div>
</template>
