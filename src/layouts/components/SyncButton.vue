<script setup lang="ts">
/**
 * ปุ่มดึงข้อมูล PO/GRPO จาก SAP - อยู่บน TopBar จึงโผล่ทุกหน้าที่ล็อกอิน
 *
 * ── สิ่งที่ปุ่มนี้ "ไม่ได้" ทำ ─────────────────────────────────────────────
 *
 * ★ ไม่ได้กันการยิงซ้ำ กันไม่ได้ และไม่ต้องกัน
 *
 * ตัวกันจริงอยู่ฝั่ง backend สามชั้น (advisory lock กันรันซ้อน / cooldown กันกดถี่ /
 * เทียบ updatedAt ในทรานแซกชัน) ทั้งหมดผ่าน ams_db จึงคุมข้ามคน ข้ามเครื่อง ข้าม process
 * ได้จริง ส่วนอะไรที่เขียนในไฟล์นี้กันได้แค่ "แท็บตัวเอง" ซึ่งไม่ใช่เคสที่ต้องกลัว
 *
 * หน้าที่ของไฟล์นี้จึงมีอย่างเดียว: **ลดจำนวนคำขอที่รู้อยู่แล้วว่าจะถูกปฏิเสธ**
 * เดาผิดได้ ไม่ต้องแม่น - เดาผิดแล้วเสียแค่ 1 คำขอที่ตอบกลับมาว่า "ยังไม่ถึงเวลา"
 *
 * ★ ห้ามยิง sync เองอัตโนมัติตอน countdown หมด
 *
 * 20 จอที่นับถอยหลังพร้อมกันจะยิงพร้อมกันทุกครั้งที่ครบเวลา กลายเป็น scheduler เถื่อน
 * ที่มีจำนวนเท่าคนที่เปิดหน้าค้างไว้ - countdown หมด = **ปุ่มกลับมากดได้** เท่านั้น
 * ต้องมีคนกดจริงเสมอ
 *
 * ── การอ่านผลลัพธ์ ────────────────────────────────────────────────────────
 *
 * ★ SKIPPED ไม่ใช่ error ต้องขึ้นเป็นข้อความบวก
 *
 * เมื่อทุกคนกดได้ คนที่ 2-50 ที่กดจะได้ SKIPPED ทั้งที่ข้อมูลสดแล้วจริง ๆ (คนแรกดึงไปแล้ว)
 * ถ้าโชว์เป็นสีแดง คนจะสรุปว่าปุ่มพังแล้วกดซ้ำหนักกว่าเดิม - ผลลัพธ์ที่เขาต้องการเกิดขึ้นแล้ว
 * แค่ไม่ใช่เพราะเขาเป็นคนกด
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/shared/services/httpClient'
import { parseServerTime } from '@/shared/utils/date'
import {
  documentsSyncedAt,
  getSyncScope,
  getSyncStatus,
  syncDocuments,
  SYNC_DOCUMENT_ENTITIES,
  type SyncDocumentsResult,
  type SyncScope,
  type SyncStatus,
} from '@/shared/services/sync.service'

const scope = ref<SyncScope | null>(null)
const status = ref<SyncStatus | null>(null)
const company = ref<string | null>(null)
const busy = ref(false)
const loading = ref(true)

/** ข้อความผลลัพธ์ใต้ปุ่ม - tone แยกจากข้อความเพราะ SKIPPED ต้องไม่ใช่สีของ error */
const note = ref<{ text: string; tone: 'ok' | 'info' | 'error' } | null>(null)
let noteTimer: ReturnType<typeof setTimeout> | undefined

function say(text: string, tone: 'ok' | 'info' | 'error') {
  note.value = { text, tone }
  clearTimeout(noteTimer)
  // ทางพังค้างนานกว่า - คนต้องมีเวลาอ่านว่าพังเพราะอะไรก่อนมันหาย
  noteTimer = setTimeout(() => (note.value = null), tone === 'error' ? 12_000 : 6_000)
}

/**
 * นาฬิกาเดินวินาทีละครั้ง - ใช้ทั้งนับถอยหลังและข้อความ "เมื่อ N นาทีที่แล้ว"
 *
 * ตัวเดียวจบ ไม่ตั้ง timer แยกต่ออย่าง: component นี้ mount ค้างอยู่ทุกหน้าที่ล็อกอิน
 * timer ที่งอกทีละตัวจะอยู่ยาวไปกับมันด้วย
 */
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined

/** บริษัทที่กดไม่ได้เลย = ไม่มีตัวเลือก (บัญชีไม่มีสังกัด / บริษัทไม่มีฐาน SAP) */
const canPick = computed(() => (scope.value?.companies.length ?? 0) > 0)

/** เวลาที่ข้อมูลสดถึง - เอาตัวเก่ากว่าระหว่าง PO กับ GRPO (ดูเหตุผลที่ documentsSyncedAt) */
const syncedAt = computed(() =>
  status.value && company.value ? documentsSyncedAt(status.value, company.value) : null,
)

/**
 * วินาทีที่เหลือของ cooldown - 0 = กดได้
 *
 * ★ ต้องผ่าน parseServerTime ห้ามใช้ new Date(at) ตรง ๆ - backend เก็บเวลาแบบ
 *   "wall clock แปะ Z" ซึ่งไม่ใช่ UTC จริง (เหตุผลเต็มอยู่ที่ utils/date.ts)
 *   เคยพลาดมาแล้ว: ตัวนับขึ้น 25,200 วินาที = 7 ชม.พอดี = offset ของโซนไทย
 */
const cooldownLeft = computed(() => {
  const at = parseServerTime(syncedAt.value)
  const secs = scope.value?.cooldownSeconds ?? 0
  if (at === null || secs <= 0) return 0
  const left = Math.ceil((at + secs * 1000 - now.value) / 1000)
  // ติดลบได้ถ้านาฬิกาเครื่องเดินไม่ตรงกับ server - ปัดเป็น 0 ปล่อยให้ backend ตัดสินเอง
  return left > 0 ? left : 0
})

/** นับถอยหลังรูปแบบ นาที.วินาที - 300 -> "5.00", 247 -> "4.07", 9 -> "0.09" */
const cooldownText = computed(() => {
  const s = cooldownLeft.value
  return `${Math.floor(s / 60)}.${String(s % 60).padStart(2, '0')}`
})

const disabled = computed(() => busy.value || loading.value || !canPick.value || cooldownLeft.value > 0)

/** ข้อความบนปุ่ม/tooltip ที่บอกว่าทำไมกดไม่ได้ - ปุ่มจางเฉย ๆ คือที่มาของคำถามทุกครั้ง */
const hint = computed(() => {
  if (loading.value) return 'กำลังโหลดสถานะ'
  if (!canPick.value) return scope.value?.reason ?? 'สั่ง sync ไม่ได้'
  if (busy.value) return 'กำลังดึงข้อมูลจาก SAP'
  if (cooldownLeft.value > 0) return `เพิ่งดึงไป - กดได้อีกครั้งในอีก ${cooldownText.value} นาที`
  return `ดึง PO และ GRPO ของ ${company.value} จาก SAP`
})

/** "5 นาทีที่แล้ว" - ไม่ใช้ Intl.RelativeTimeFormat เพราะต้องการคำไทยสั้น ๆ ที่คุมเองได้ */
const syncedText = computed(() => {
  const at = parseServerTime(syncedAt.value)
  if (at === null) return 'ยังไม่เคย sync'
  const sec = Math.max(0, Math.floor((now.value - at) / 1000))
  if (sec < 60) return 'sync เมื่อสักครู่'
  const min = Math.floor(sec / 60)
  if (min < 60) return `sync เมื่อ ${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `sync เมื่อ ${hr} ชม.ที่แล้ว`
  return `sync เมื่อ ${Math.floor(hr / 24)} วันที่แล้ว`
})

async function loadState() {
  try {
    const [sc, st] = await Promise.all([getSyncScope(), getSyncStatus()])
    scope.value = sc
    status.value = st
    // ★ เลือกบริษัทเป้าหมายจากคำตอบของ backend เท่านั้น ห้ามตกไปใช้ค่าตั้งต้นเอง -
    //   คนที่บัญชีไม่มีสังกัดต้องกดไม่ได้ ไม่ใช่ถูกจับยัดให้บริษัทแรกในลิสต์
    if (!company.value || !sc.companies.includes(company.value)) {
      company.value = sc.companies[0] ?? null
    }
  } catch (e) {
    // โหลดสถานะไม่ได้ไม่ควรทำให้ TopBar พัง - ปุ่มจางไว้แล้วบอกเหตุผลก็พอ
    scope.value = null
    say(e instanceof ApiError ? e.message : 'อ่านสถานะ sync ไม่สำเร็จ', 'error')
  } finally {
    loading.value = false
  }
}

/**
 * ยุบผลของสอง entity ให้เหลือข้อความเดียว
 *
 * ลำดับความสำคัญ: พังมาก่อน (ต้องเห็นแน่ ๆ) แล้วสำเร็จ แล้วค่อยถูกข้าม
 * - พังตัวใดตัวหนึ่ง = ต้องรู้ ต่อให้อีกตัวสำเร็จ ไม่งั้นข้อมูลจะไม่ครบโดยไม่มีใครรู้
 * - ถูกข้ามทั้งคู่ = ข้อมูลสดอยู่แล้ว เป็นข่าวดี ไม่ใช่ข่าวร้าย
 */
function reportResult(res: SyncDocumentsResult) {
  const parts = SYNC_DOCUMENT_ENTITIES.map((e) => res[e])

  const failed = parts.find((r) => r.status === 'FAILED')
  if (failed && failed.status === 'FAILED') {
    say(`ดึงข้อมูลไม่สำเร็จ: ${failed.error}`, 'error')
    return
  }

  const rows = parts.reduce(
    (sum, r) => sum + (r.status === 'SUCCESS' ? r.rowsHeader + r.rowsLine : 0),
    0,
  )
  if (parts.some((r) => r.status === 'SUCCESS')) {
    say(rows > 0 ? `อัปเดตแล้ว ${rows} รายการ` : 'ดึงแล้ว ไม่มีรายการใหม่', 'ok')
    return
  }

  // ทั้งคู่ SKIPPED - เหตุผลของสองตัวมักเหมือนกัน (cooldown ร่วมกัน) หยิบตัวแรกพอ
  const skipped = parts.find((r) => r.status === 'SKIPPED')
  say(
    skipped && skipped.status === 'SKIPPED'
      ? `ข้อมูลเป็นล่าสุดอยู่แล้ว (${skipped.reason})`
      : 'ข้อมูลเป็นล่าสุดอยู่แล้ว',
    'info',
  )
}

async function run() {
  const target = company.value
  if (!target || disabled.value) return

  busy.value = true
  note.value = null
  try {
    reportResult(await syncDocuments(target))
  } catch (e) {
    // 403 จากด่านบริษัทมาทางนี้ - ข้อความจาก backend อ่านรู้เรื่องอยู่แล้ว ส่งต่อตรง ๆ
    say(e instanceof ApiError ? e.message : 'สั่ง sync ไม่สำเร็จ', 'error')
  } finally {
    busy.value = false
    // โหลดสถานะใหม่เสมอ ทั้งทางสำเร็จและทางพัง - lastRunAt ถูกเขียนทั้งสองทาง
    // (ถ้าไม่โหลด ตัวนับถอยหลังจะยังอิงเวลาเก่าแล้วปุ่มกลับมากดได้เร็วกว่าความจริง)
    try {
      status.value = await getSyncStatus()
    } catch {
      /* อ่านสถานะไม่ได้ไม่ควรกลบข้อความผลลัพธ์ที่เพิ่งบอกไป */
    }
  }
}

onMounted(() => {
  void loadState()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})

onUnmounted(() => {
  clearInterval(clock)
  clearTimeout(noteTimer)
})
</script>

<template>
  <!-- ★ ไม่ขึ้นเลยตอนโหลดสถานะไม่ผ่าน/ไม่มีบริษัทให้กด? ไม่ - ยังขึ้นแต่จาง
       ปุ่มที่หายไปทำให้คนคิดว่าระบบไม่มีฟีเจอร์นี้ ปุ่มที่จางพร้อมเหตุผลบอกได้ว่า
       "มีอยู่ แต่คุณกดไม่ได้เพราะอะไร" ซึ่งพาไปแก้ถูกที่ (ไปหาผู้ดูแลให้ผูกบริษัทให้) -->
  <div class="flex items-center gap-2">
    <!-- ข้อความผลลัพธ์ - ซ่อนบนจอแคบ (navbar ไม่มีที่) แต่ยังอ่านได้จาก tooltip ของปุ่ม -->
    <span
      v-if="note"
      class="hidden max-w-[22rem] truncate text-xs lg:inline"
      :class="{
        'text-success': note.tone === 'ok',
        'text-base-content/70': note.tone === 'info',
        'text-error': note.tone === 'error',
      }"
      :title="note.text"
    >
      {{ note.text }}
    </span>

    <!-- เวลา sync ล่าสุด อยู่ "ข้าง ๆ ปุ่ม" ตามที่ตกลง - บอกความสดโดยไม่ต้องกดอะไร
         ★ ตัวนี้แหละที่ทำให้คนไม่ต้องกดปุ่ม ถ้าไม่มี ทุกคนจะกดเพื่อ "เช็คว่าสดไหม" -->
    <span class="hidden text-xs text-base-content/60 sm:inline" :title="syncedAt ?? ''">
      {{ syncedText }}
    </span>

    <!-- ตัวเลือกบริษัท - เฉพาะคนที่เลือกได้ (FINANCE/ADMIN/MANAGER)
         คนทั่วไปเห็นเป็นป้ายเฉย ๆ ในปุ่ม ไม่ใช่ dropdown ที่กดแล้วมีตัวเลือกเดียว -->
    <div v-if="scope?.unrestricted && canPick" class="dropdown dropdown-end">
      <button
        type="button"
        tabindex="0"
        class="btn btn-ghost btn-xs gap-1 font-mono"
        :disabled="busy"
        aria-label="เลือกบริษัทที่จะ sync"
      >
        {{ company }}
        <Icon icon="lucide:chevron-down" class="size-3" />
      </button>
      <ul tabindex="0" class="dropdown-content menu z-[1] w-32 rounded-box bg-base-100 p-1 shadow">
        <li v-for="code in scope.companies" :key="code">
          <button
            type="button"
            class="font-mono text-sm"
            :class="code === company ? 'menu-active' : ''"
            @click="company = code"
          >
            {{ code }}
          </button>
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="btn btn-ghost btn-sm gap-1.5"
      :disabled="disabled"
      :title="hint"
      :aria-label="hint"
      @click="run"
    >
      <span v-if="busy" class="loading loading-spinner loading-xs" />
      <Icon v-else icon="lucide:refresh-cw" class="size-4" />

      <span class="hidden sm:inline">
        <!-- นับถอยหลังอยู่บนปุ่มเลย ไม่ใช่แค่ใน tooltip - คนต้องเห็นว่า "อีกนานแค่ไหน"
             โดยไม่ต้องเอาเมาส์ไปจ่อ (บนมือถือไม่มี hover ให้จ่อด้วย) -->
        {{ cooldownLeft > 0 ? `Sync ${cooldownText}` : 'Sync' }}
      </span>
      <!-- คนที่ล็อกบริษัทเห็นรหัสบริษัทตัวเองติดกับปุ่ม จะได้รู้ว่ากำลังจะดึงของใคร

           ★ ห้ามใส่ text-xs ตรงนี้ (เคยใส่แล้วตัวหนังสือดูลอย)
             .btn ของ daisyUI เป็น inline-flex + align-items:center → ลูกถูกจัดกึ่งกลาง
             "ตามกล่อง" ไม่ใช่ตามเส้นฐาน ตัวอักษรที่เล็กกว่าป้ายข้าง ๆ จะมีเส้นฐานสูงกว่า
             ทุกครั้ง ไม่ว่าจะเติม self-center หรือ leading-none ก็ไม่ช่วย เพราะสองอันนั้น
             แก้เรื่องกล่อง ไม่ได้แก้เรื่องเส้นฐาน
             ขนาดเท่ากันเมื่อไหร่ กึ่งกลางกล่องกับเส้นฐานจะตรงกันเอง — ความเป็นข้อมูลรอง
             สื่อด้วย opacity แทนการย่อขนาด

           ★ เขียน {{ company }} ชิดแท็กบรรทัดเดียว ไม่ขึ้นบรรทัดใหม่ - ช่องว่างรอบ
             interpolation กลายเป็นช่องว่างจริงหน้าข้อความ ทำให้ระยะไม่เท่ากับ gap ของปุ่ม -->
      <span
        v-if="company && !scope?.unrestricted"
        class="hidden font-mono opacity-60 md:inline"
      >{{ company }}</span>
    </button>
  </div>
</template>
