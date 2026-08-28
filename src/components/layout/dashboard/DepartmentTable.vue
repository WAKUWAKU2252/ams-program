<script setup lang="ts">
// ตารางสินทรัพย์ของแผนกที่กำลังเลือกอยู่บน Dashboard — "แผนกนี้มีของชิ้นไหน ใครครอบครอง"
//
// ── ต่างจากหน้า Asset Inventory ตรงไหน ────────────────────────────────────────
//
// 1. **ไม่มีช่องเลือกแผนกของตัวเอง** — แผนกมาจาก prop ซึ่งผูกกับช่องเลือกของ Dashboard
//    ที่ backend ล็อกตาม role ไว้แล้ว ถ้าใส่ช่องเลือกซ้ำจะได้ช่อง "แผนก" สองช่องบนหน้า
//    เดียวกันที่ทำงานคนละกฎ (ช่องบนล็อก ช่องล่างไม่ล็อก) — อธิบายให้ผู้ใช้เข้าใจไม่ได้เลย
//
// 2. **หน้าละ 10 ไม่ใช่ 20** — ตารางนี้อยู่ท้าย Dashboard ที่มีการ์ดกับกราฟอยู่เหนือมัน
//    ยาวอยู่แล้ว ไม่ใช่หน้าที่เปิดมาเพื่อไล่อ่านทะเบียนทั้งบริษัท
//
// 3. **ชื่อแผนกรับมาเป็น prop ไม่ derive เอง** — Dashboard อ่านชื่อจาก scope ที่ backend
//    ตอบกลับมา (ไม่ใช่จาก id ที่ส่งไป) ที่นี่ต้องใช้ชื่อเดียวกันนั้น ไม่งั้นวันที่ backend
//    ทิ้งค่าที่ส่งไป หัวตารางจะเขียนชื่อแผนกหนึ่งทับรายการของอีกแผนกหนึ่ง
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppAsset from '@/components/common/AppAsset.vue'
import AppPagination from '@/components/common/AppPagination.vue'
import AssetTable from '@/components/common/AssetTable.vue'
import { getAssetInventory } from '@/services/asset.service'
import type { InventoryItem } from '@/services/asset.service'
import { ApiError } from '@/services/httpClient'

const props = defineProps<{
  /** id ของแผนกที่เลือกบน Dashboard — '' = ทุกแผนก (ตรงกับ scope.departmentId === null) */
  departmentId: string
  /** ชื่อที่จะขึ้นหัวตาราง มาจาก scope ของ backend */
  departmentName?: string
  /**
   * รหัสบริษัทที่เลือกบน Dashboard — '' = ทุกบริษัท
   *
   * ★ ต้องส่งต่อลง API ด้วย ไม่ใช่แค่โชว์ในหัวตาราง ไม่งั้นการ์ดสรุปข้างบนจะบอกยอดของ
   *   UBP แต่ตารางข้างล่างไล่ของ UBA มาให้ดู ซึ่งอ่านเป็นข้อมูลไม่ตรงกันทันที
   */
  companyCode?: string
  companyName?: string | null
}>()

const items = ref<InventoryItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref('')

const LIMIT = 10

/** ข้อความในช่องค้นหา — ยังไม่ใช่คำที่ยิงไปจริง (ดู debounce ข้างล่าง) */
const searchText = ref('')

/** หัวตาราง ใช้เป็นจุดเลื่อนกลับตอนเปลี่ยนหน้า */
const tableTop = ref<HTMLElement | null>(null)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getAssetInventory({
      page: page.value,
      limit: LIMIT,
      search: searchText.value,
      departmentId: props.departmentId ? Number(props.departmentId) : undefined,
      companyCode: props.companyCode || undefined,
    })
    items.value = res.data
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'โหลดรายการสินทรัพย์ไม่สำเร็จ'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * ★ ทุกทางที่เปลี่ยนเงื่อนไข ต้องรีเซ็ตกลับหน้า 1 เสมอ
 *
 * ค้างอยู่หน้า 4 แล้วสลับไปแผนกที่มีของ 6 ชิ้น จะได้ตารางว่างทั้งที่แผนกนั้นมีของ
 * และแถบเลขหน้าก็หายไปด้วย (เหลือหน้าเดียว) = ไม่มีปุ่มให้กดกลับ ผู้ใช้ติดอยู่ตรงนั้น
 */
watch(
  () => [props.departmentId, props.companyCode],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)

// หน่วงก่อนยิงตอนพิมพ์ค้น — ไม่งั้นพิมพ์ 10 ตัวอักษรได้ 10 request
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    page.value = 1
    void load()
  }, 350)
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function onPageChange(next: number) {
  page.value = next
  void load()
  // ตารางนี้อยู่ท้ายหน้า — เลื่อนกลับไปหัวตาราง ไม่ใช่หัวหน้า Dashboard
  // ไม่งั้นกดหน้า 2 แล้วโดนดีดขึ้นไปดูการ์ดสรุปใหม่ทุกครั้ง
  tableTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const heading = computed(() => {
  const scope = props.companyName ? ` · ${props.companyName}` : ''
  return `สินทรัพย์ของ${props.departmentName || 'ทุกแผนก'}${scope}`
})

/** ลำดับที่กำลังแสดง เช่น "11–20 จาก 143 ชิ้น" */
const range = computed(() => {
  if (total.value === 0) return ''
  const start = (page.value - 1) * LIMIT + 1
  return `${start}–${Math.min(start + LIMIT - 1, total.value)} จาก ${total.value.toLocaleString('th-TH')} ชิ้น`
})

// ── กดแถว = เปิด AppAsset ไม่ใช่เด้งออกไปหน้ารายละเอียด ──────────────────────
//
// ตารางนี้อยู่ท้าย Dashboard ที่มีการ์ดกับกราฟอยู่เหนือมัน การเด้งออกไปแล้วกดกลับ
// ทำให้เสียทั้งแผนก/บริษัทที่เลือกไว้ คำค้น และหน้าที่อยู่ ต้องตั้งใหม่หมดทุกครั้ง
//
// AppAsset เป็นตัวเดียวกับที่หน้าทะเบียนและ My asset ใช้ — ชิ้นเดียวกันต้องหน้าตา
// เหมือนกันทุกทางเข้า และ modal ไปดึงรายละเอียดเต็มจาก /assets/by-number เอง
//
// เส้น /assets/:company/:number ยังอยู่เหมือนเดิม — นั่นคือปลายทางของ QR บนสติกเกอร์
const selectedItem = ref<InventoryItem | null>(null)
const detailOpen = ref(false)

function openAsset(item: InventoryItem) {
  selectedItem.value = item
  detailOpen.value = true
}
</script>

<template>
  <section ref="tableTop">
    <div class="flex w-full items-center justify-between gap-4">

    <!-- Search -->
    <label class="form-control w-full max-w-xs text-left">
      <div class="input input-sm flex w-full items-center gap-2">
        <Icon
          icon="lucide:search"
          class="size-4 shrink-0 opacity-50"
        />

        <input
          v-model="searchText"
          type="search"
          class="grow"
          placeholder="เลขสินทรัพย์ / ชื่อของ / S/N"
        />

        <!-- Loading -->
        <span
          v-if="loading"
          class="loading loading-spinner loading-xs shrink-0"
        ></span>
      </div>
    </label>

    <!-- Range -->
    <p
      v-if="range"
      class="shrink-0 text-right text-sm text-base-content/60"
    >
      {{ range }}
    </p>

  </div>

    <div v-if="loadError" role="alert" class="alert alert-error alert-soft mt-3">
      <Icon icon="mdi:alert-circle-outline" class="size-5" />
      <span>{{ loadError }}</span>
      <button class="btn btn-sm" @click="load">ลองใหม่</button>
    </div>

    

    <AssetTable
      class="mt-2"
      :items="items"
      :loading="loading"
      :show-department="!departmentId"
      :min-rows="5"
      @select="openAsset"
    >
      <template #empty>
        <Icon icon="mdi:package-variant" class="mx-auto size-12 opacity-40" />
        <template v-if="searchText.trim()">
          <p class="mt-2">ไม่พบสินทรัพย์ที่ตรงกับคำค้น</p>
          <button class="btn btn-sm mt-3" @click="searchText = ''">ล้างคำค้น</button>
        </template>
        <p v-else class="mt-2">{{ heading }} ยังไม่มีรายการ</p>
      </template>
    </AssetTable>

    <AppPagination
      v-if="total > LIMIT"
      class="mt-4"
      :page="page"
      :total="total"
      :limit="LIMIT"
      @update:page="onPageChange"
    />

    <!-- Teleport ไป body อยู่แล้ว วางตรงไหนก็ได้ -->
    <AppAsset v-model="detailOpen" :item="selectedItem" />
  </section>
</template>
