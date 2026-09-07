<script setup lang="ts">
// ปลายทางของ QR **รูปแบบเก่า** - /assets/<เลข> ที่ไม่มีรหัสบริษัทใน URL
//
// ── ทำไมต้องมีหน้านี้ ───────────────────────────────────────────────────────
//
// qrCode ในทะเบียนถูกเขียนไว้ตั้งแต่ก่อน 0021 เป็นรูป <base>/assets/<เลข> ส่วน route
// ปัจจุบันคือ /assets/:company/:assetNumber - URL เก่าจึง match ไม่ติด แล้วตกไป catch-all
// ซึ่ง redirect ไป /dashboard ที่ต้องล็อกอิน ผลคือ "สแกน QR แล้วเด้งหน้า login"
// (นี่คืออาการที่เจอจริง ไม่ใช่ปัญหาสิทธิ์เลยสักนิด)
//
// ★ ต่อให้ backfill ค่าในทะเบียนครบแล้ว หน้านี้ก็ยังต้องอยู่ - ลิงก์เก่าที่ถูกแคป/จด/แชร์
//   ไปแล้วไม่มีทางตามไปแก้ได้ และนี่คือนโยบายที่ common/app-url.ts เขียนไว้เอง:
//   "ถ้าหน้าเว็บย้ายที่ ให้ทำ redirect จาก path เดิม แทนการแก้ตัวประกอบ URL"
//
// ★ ไม่แสดงข้อมูลสินทรัพย์เอง - replace ไปหน้าจริงเสมอ ใช้ replace ไม่ใช่ push เพราะ
//   หน้านี้ไม่ควรอยู่ใน history ให้กด back แล้ววนกลับมา resolve ใหม่ไม่รู้จบ
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { resolveAssetNumber, type AssetNumberMatch } from '@/shared/services/asset.service'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const matches = ref<AssetNumberMatch[]>([])
const failed = ref('')

/** param เป็น (.*) จึงได้ string เสมอ แต่ vue-router ยอมให้เป็น array ในทางชนิด */
const assetNumber = (() => {
  const raw = route.params.assetNumber
  return Array.isArray(raw) ? raw.join('/') : (raw ?? '')
})()

function goTo(companyCode: string) {
  router.replace({
    name: 'asset-by-number',
    params: { company: companyCode, assetNumber },
  })
}

onMounted(async () => {
  if (!assetNumber) {
    loading.value = false
    return
  }
  try {
    const found = await resolveAssetNumber(assetNumber)
    matches.value = found
    // เจอบริษัทเดียว = ไม่มีอะไรให้ถาม พาไปเลย (เคสปกติของเกือบทั้งทะเบียน)
    if (found.length === 1) return goTo(found[0]!.companyCode)
  } catch (e) {
    failed.value = e instanceof Error ? e.message : 'ตรวจสอบเลขสินทรัพย์ไม่สำเร็จ'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="px-4 py-10 text-center">
    <div v-if="loading" class="flex flex-col items-center gap-3">
      <span class="loading loading-spinner loading-lg"></span>
      <p class="text-sm text-base-content/60">กำลังค้นหา {{ assetNumber }}</p>
    </div>

    <div v-else-if="failed" role="alert" class="alert alert-error text-left">
      <Icon icon="lucide:triangle-alert" class="size-5 shrink-0" />
      <span>{{ failed }}</span>
    </div>

    <!-- เลขเดียวกันมีสองบริษัทจริง 24 ตัว - URL เก่าไม่ได้บอกว่าหมายถึงใบไหน
         ถามดีกว่าเดา: เดาผิดแล้วคนตรวจนับจะบันทึกสถานะลงชิ้นของอีกบริษัท -->
    <div v-else-if="matches.length > 1" class="mx-auto max-w-sm">
      <Icon icon="lucide:git-fork" class="mx-auto size-8 opacity-50" />
      <h1 class="mt-3 text-lg font-semibold">เลข {{ assetNumber }} มีอยู่หลายบริษัท</h1>
      <p class="mt-1 text-sm text-base-content/60">
        QR ใบนี้เป็นรูปแบบเก่าที่ไม่ได้ระบุบริษัทไว้ - เลือกบริษัทของเครื่องที่อยู่ตรงหน้า
      </p>
      <div class="mt-4 flex flex-col gap-2">
        <button
          v-for="m in matches"
          :key="m.companyCode"
          type="button"
          class="btn btn-primary btn-block"
          @click="goTo(m.companyCode)"
        >
          {{ m.companyCode }}
        </button>
      </div>
    </div>

    <div v-else class="mx-auto max-w-sm">
      <Icon icon="lucide:search-x" class="mx-auto size-8 opacity-50" />
      <h1 class="mt-3 text-lg font-semibold">ไม่พบเลข {{ assetNumber }} ในระบบ</h1>
      <p class="mt-1 text-sm text-base-content/60">
        สแกนติดแล้วแต่ไม่มีในทะเบียน - แจ้งฝ่ายบัญชีพร้อมเลขบนสติกเกอร์ได้เลย
      </p>
    </div>
  </div>
</template>
