<script setup lang="ts">
// หน้าที่เปิดจากการสแกน QR บนสติกเกอร์ - /assets/:company/:assetNumber
//
// คนใช้จริงคือคนที่ยืนอยู่หน้าเครื่อง ถือมือถือ และมักไม่ใช่เจ้าของชิ้นนั้น (ช่าง/ผู้ตรวจนับ/
// เจ้าของห้อง) เปิดได้โดยไม่ต้องล็อกอิน - แถบชื่อระบบด้านบนมาจาก BlankLayout เหมือนเดิม
//
// ── เนื้อหน้าใช้ AppAssetDetail ตัวเดียวกับ modal ในแอป ────────────────────
//
// เดิมหน้านี้เขียน layout ของตัวเองแยกอีกชุด แล้วสองชุดนั้นเริ่มเพี้ยนจากกันจริง ๆ
// (หน้านี้ไม่มีผังที่ตั้ง ป้ายสถานะคนละสูตร ลำดับข้อมูลคนละแบบ) - ของชิ้นเดียวกันต้อง
// หน้าตาเดียวกันไม่ว่าคนจะเปิดมาจากตารางทะเบียนหรือจากสติกเกอร์บนเครื่อง
//
// ต่างจาก modal แค่สองอย่าง: ไม่มีปุ่มปิด/backdrop (ที่นี่คือหน้าเต็ม ไม่มีอะไรให้ปิดกลับ)
// และไม่ส่ง qrCode เข้าไป - คนที่มาถึงหน้านี้สแกน QR ไปแล้ว ไม่ต้องโชว์ให้สแกนซ้ำ
//
// ── เลขสินทรัพย์มาจาก path จึงต้องรับทุกอักขระ
//
// ของจริงมีเลขที่มี '/' (MAC-212-13-001/1) และมีตัวที่เป็นชื่อสินค้าภาษาไทยยาว 48 ตัว
// route จึงประกาศเป็น :company/:assetNumber(.*) และส่งต่อ backend ทาง query string
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppAssetDetail from '@/shared/components/AppAssetDetail.vue'
import type { AssetRef } from '@/shared/components/AppAssetDetail.vue'

const route = useRoute()

/** param เป็น (.*) จึงได้มาเป็น string เสมอ แต่ vue-router ยอมให้เป็น array ในทางชนิด */
const assetNumber = computed(() => {
  const raw = route.params.assetNumber
  return Array.isArray(raw) ? raw.join('/') : (raw ?? '')
})

/**
 * บริษัทเจ้าของชิ้น - มาจาก segment แรกของ path ที่ QR ฝังไว้
 *
 * จำเป็นเพราะเลขสินทรัพย์ซ้ำกันข้ามบริษัทจริง 24 ตัว เลขเปล่าจึงตอบไม่ได้ว่าชิ้นไหน
 * (ไม่เกี่ยวกับสิทธิ์ - หน้านี้ยังเปิดได้โดยไม่ต้องล็อกอินเหมือนเดิม)
 */
const companyCode = computed(() => {
  const raw = route.params.company
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
})

/**
 * ส่งเข้า AppAssetDetail แค่สองช่องที่ AssetRef บังคับ - ที่เหลือมันไปดึงเอง
 *
 * ★ เป็น computed ไม่ใช่ค่าคงที่: สแกนชิ้นถัดไปขณะเปิดหน้านี้ค้างอยู่ = เปลี่ยนแค่ route
 *   param component ไม่ถูกสร้างใหม่ ตัว detail watch prop นี้อยู่จึงโหลดชิ้นใหม่ให้เอง
 *   (เป็นเคสที่คนเดินตรวจนับเจอบ่อยที่สุด)
 */
const assetRef = computed<AssetRef | null>(() =>
  companyCode.value && assetNumber.value
    ? { companyCode: companyCode.value, assetNumber: assetNumber.value }
    : null,
)

// ปุ่ม "ลองใหม่" ของหน้านี้อยู่นอก AppAssetDetail จึงต้องสั่งผ่าน expose
const detailRef = ref<InstanceType<typeof AppAssetDetail> | null>(null)
</script>

<template>
  <!-- max-w-2xl ตามความกว้างของ BlankLayout - หน้านี้ถูกเปิดบนมือถือเป็นหลัก -->
  <div class="mx-auto w-full max-w-3xl px-4 py-6">
    <!-- layout="page" = หัวเรียงบนล่างเมื่อจอแคบ และผังลงไปเต็มความกว้างข้างล่าง
         (modal ในแอปยังเป็นค่าตั้งต้น 'modal' ผังอยู่ข้างรูปเหมือนเดิม) -->
    <AppAssetDetail ref="detailRef" :item="assetRef" layout="page" />
  </div>
</template>
