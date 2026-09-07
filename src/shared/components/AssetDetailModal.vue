<script setup lang="ts">
// เปลือก modal ของหน้ารายละเอียดสินทรัพย์ - เนื้อทั้งหมดอยู่ที่ AppAssetDetail.vue
//
// ── ทำไมเป็น modal ไม่ใช่การเด้งไปหน้าใหม่ ─────────────────────────────────
//
// หน้าทะเบียนคือหน้า "กวาดหา" - คนเปิดดูทีละหลายชิ้นเพื่อเทียบกัน การเด้งออกไป
// หน้ารายละเอียดทำให้เสียตำแหน่งหน้า คำค้น และตัวกรองทั้งหมด กลับมาต้องตั้งใหม่ทุกครั้ง
// (เส้น /assets/:company/:number ยังอยู่และยังเป็นปลายทางของ QR บนสติกเกอร์เหมือนเดิม
//  ตรงนั้นคือคนที่ยืนอยู่หน้าเครื่องจริง ซึ่งเป็นคนละพฤติกรรมกับคนที่นั่งไล่ทะเบียน
//  - และตอนนี้สองทางนั้นวาดด้วย AppAssetDetail ตัวเดียวกันแล้ว หน้าตาจึงตรงกันเสมอ)
//
// ★ ไฟล์นี้ต้องบางไว้: มีแค่ modal chrome (backdrop / ปุ่มปิด / Escape) อะไรที่เป็น
//   "เนื้อของสินทรัพย์" ต้องไปอยู่ที่ AppAssetDetail เท่านั้น ไม่งั้นหน้า QR จะไม่ได้ของนั้น
import { watch, onUnmounted } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import AppAssetDetail from './AppAssetDetail.vue'
import type { AssetRef } from './AppAssetDetail.vue'

// re-export ให้คนที่เคย import ชนิดนี้จากไฟล์นี้ยังใช้ได้เหมือนเดิม
export type { AssetRef }

const props = defineProps<{
  modelValue: boolean
  /** แถวที่ถูกกด - ใช้วาดหัวทันทีระหว่างรอผลจาก API */
  item: AssetRef | null
  /** URL ที่ฝังใน QR ของสติกเกอร์ชิ้นนี้ - ส่งมาเมื่อหน้านั้นมีค่านี้อยู่แล้ว (My asset) */
  qrCode?: string | null
  /**
   * เปิดปุ่มแก้ที่ตั้งบนผังในกล่องนี้ - ส่งผ่านตรง ๆ ไป AppAssetDetail
   *
   * ★ หน้า Audit ตั้งใจไม่ส่ง (ค่าตั้งต้น = ปิด) - เปิดกล่องดูได้แต่แก้ทะเบียนจากตรงนี้ไม่ได้
   */
  editableLocation?: boolean
  /** เปิดให้แนบ/เปลี่ยนรูปจากในกล่องนี้ - ส่งผ่านตรง ๆ ไป AppAssetDetail */
  editableImage?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** ที่ตั้งถูกบันทึกแล้ว - ส่งต่อจาก AppAssetDetail ให้หน้าที่วาดหมุดโหลดของตัวเองใหม่ */
  updated: []
}>()

/**
 * บนจอแคบใช้ผังหน้าแบบเดียวกับหน้า QR (layout="page") ไม่ใช่แบบ modal
 *
 * ── ทำไม modal ถึงใช้บนมือถือไม่ได้
 *
 * โหมด modal บังคับหัวเป็น "แถวนอนเสมอ" (items-start ไม่มี flex-col) และกล่องรูปเป็น
 * size-64 = 256px คงที่ - บนจอ 390px รูปกินไป 256px เหลือให้เลขสินทรัพย์ ชื่อ และป้าย
 * สถานะประมาณ 130px ทั้งหมดจึงตัดคำเป็นบรรทัดละไม่กี่ตัวอักษร
 *
 * โหมด page ออกแบบมาให้ยุบอยู่แล้ว: หัวเป็น flex-col แล้วค่อยเป็นแถวที่ sm ขึ้นไป
 * รูปเป็น h-48 w-full เต็มความกว้าง และผังลงไปเป็น section เต็มความกว้างข้างล่าง
 *
 * ★ lg ขึ้นไปยังเป็น 'modal' เหมือนเดิมทุกอย่าง - กล่องกว้าง 56rem มีที่พอให้ผังอยู่
 *   ข้างรูปในหัว ซึ่งอ่านได้เร็วกว่าเลื่อนลงไปหา
 *
 * ★ useMediaQuery ไม่ใช่การอ่าน innerWidth ครั้งเดียว - ผู้ใช้หมุนจอ/ย่อหน้าต่างระหว่าง
 *   เปิด modal ค้างอยู่ได้ ค่านี้เปลี่ยนตามเองโดยไม่ต้องปิดเปิดใหม่
 */
const isWide = useMediaQuery('(min-width: 1024px)')

const close = () => emit('update:modelValue', false)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

// ★ ถอด listener ตอนปิดด้วย ไม่ใช่แค่ตอน unmount - component นี้ mount ค้างอยู่ในทุกหน้า
//   ที่ใช้มัน ถ้าไม่ถอด กด Escape ตอน modal ปิดอยู่จะยิง emit ทิ้งเปล่า ๆ ทุกครั้ง
watch(
  () => props.modelValue,
  (open) => {
    if (open) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="modal backdrop-blur-sm" :class="{ 'modal-open': modelValue }" role="dialog" aria-modal="true">
      <!-- ── ความสูง: ต้องกำหนดเอง daisyUI ไม่ได้เว้นขอบให้ ───────────────────
           ★ `.modal-box` เปล่า ๆ ของ daisyUI 5 ตั้ง `max-height: 100vh` ไม่ใช่
             `calc(100vh - 5em)` อย่างที่เอกสารทำให้เข้าใจ - ค่านั้นมาพร้อม modifier
             ตำแหน่ง (.modal-middle / .modal-top / .modal-bottom) เท่านั้น
             พอเนื้อหาสูงกว่าจอ กล่องจึงยืดเต็ม 100vh แล้วชนขอบบน-ล่างพอดี

           ★ เติม .modal-middle แทนไม่ได้ - `.modal-middle > .modal-box` บังคับ
             `max-width: 32rem` ทับ max-w-4xl (specificity 0,2,0 ชนะ 0,1,0)
             กล่องจะหดจาก 56rem เหลือ 32rem ทันที

           dvh ไม่ใช่ vh - บนมือถือ vh นับรวมแถบเบราว์เซอร์ที่ยุบ/กางได้ กล่องจึงสูงเกิน
           ที่เห็นจริงแล้วขอบล่างหลุดใต้แถบที่อยู่

           ── ปุ่มปิดต้องไม่เลื่อนหาย
           เดิมทั้งกล่องเป็นตัวเลื่อน (.modal-box มี overflow-y:auto มาให้) ปุ่มปิดจึงอยู่
           ท้ายสุดของสิ่งที่เลื่อน - จอเตี้ยต้องเลื่อนผ่านรูป ผัง และตัวเลขบัญชีทั้งหมด
           ก่อนถึงปุ่ม แยกเป็น "พื้นที่เลื่อน + แถบล่างคงที่" แล้วปุ่มอยู่กับที่เสมอ
           (p-0 ที่กล่องแล้วไปใส่ padding ข้างในแทน - ระยะขอบเท่าเดิมทุกด้าน) -->
      <div class="modal-box flex max-h-[calc(100dvh-4rem)] max-w-4xl flex-col overflow-hidden p-0">
        <div class="min-h-0 flex-1 overflow-y-auto p-6">
          <!-- active ผูกกับ modelValue - ปิดอยู่ = ไม่ยิง API อะไรเลย -->
          <AppAssetDetail
            :item="item"
            :qr-code="qrCode"
            :active="modelValue"
            :layout="isWide ? 'modal' : 'page'"
            :editable-location="editableLocation"
            :editable-image="editableImage"
            @updated="emit('updated')"
          />
        </div>

        <div class="modal-action mt-0 shrink-0 border-t border-base-300 px-6 py-3">
          <button type="button" class="btn" @click="close">ปิด</button>
        </div>
      </div>

      <div class="modal-backdrop" @click="close"></div>
    </div>
  </Teleport>
</template>
