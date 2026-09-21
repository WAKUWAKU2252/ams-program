<script setup lang="ts">
/**
 * กระดิ่งแจ้งเตือนบน Topbar
 *
 * ── ★ จังหวะการโหลด: ป้ายกับรายการแยกกัน
 *
 *   ป้ายตัวเลข  โหลดตอน mount + ทุกครั้งที่สาย SSE ส่งสัญญาณ (connection store เป็นคนยิง)
 *   รายการ      โหลดตอน "กดเปิด" เท่านั้น
 *
 * รวมกันเมื่อไหร่ ทุกสัญญาณจะดึงข้อความ 15 ใบมาทิ้งโดยไม่มีใครเปิดดู (เหตุผลเต็มอยู่ที่ store)
 *
 * ── ★★ เลิกใช้ <details> แล้ว - คุมด้วย v-if + <Transition> เหมือนกล่องโปรไฟล์ใน Sidebar
 *
 * <details> ให้ "กดแล้วสลับเปิด/ปิด" มาฟรีก็จริง แต่แลกมาด้วยสามอย่างที่ทำให้กล่องนี้
 * ไม่มีทางเคลื่อนไหวแบบเดียวกับกล่องโปรไฟล์ได้เลย:
 *
 *   1. เนื้อในถูกเบราว์เซอร์ซ่อนระดับ UA ทันทีที่ปิด - แอนิเมชันตอน "ปิด" จึงไม่มีวันได้เล่น
 *      (Vue ยังคา element ไว้ให้ก็จริง แต่มันอยู่ใน <details> ที่ปิดแล้ว = มองไม่เห็น)
 *   2. ไม่ได้ให้ "คลิกข้างนอกแล้วปิด" หรือ Esc มาด้วย ต้องต่อเองอยู่ดี (อยู่ข้างล่างนี้)
 *   3. daisyUI ผูก "สถานะมองเห็นได้" ของ .dropdown-content ไว้กับ :focus / :focus-within /
 *      .dropdown-open ไม่มีตัวไหนอิง [open] ของ <details> - ต้องเขียน CSS ทับเพื่อดึง
 *      สถานะกลับมาให้ตรงกับความจริง ซึ่งเป็นด่านที่ไม่มีใครเห็นตอนอ่านเทมเพลต
 *
 * v-if ตัดทั้งสามข้อทิ้ง: กล่องอยู่/ไม่อยู่ใน DOM ตาม `open` ตัวเดียว <Transition> จึงได้
 * เล่นทั้งขาเข้าและขาออก และไม่ต้องพึ่ง CSS ของ .dropdown อีกเลย (คลาสจัดตำแหน่งเขียนตรง ๆ)
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useNotificationStore } from '@/shared/stores/notification'
import type { NotificationItem, NotificationKind } from '@/shared/services/notification.service'
import { formatDateTime } from '@/shared/utils/date'

const router = useRouter()
const store = useNotificationStore()

const open = ref(false)
/** ปุ่ม + กล่อง - ใช้ตัดสินว่าคลิกที่เกิดขึ้น "อยู่นอก" หรือเปล่า */
const rootRef = ref<HTMLElement | null>(null)

onMounted(() => {
  void store.refreshUnread()
})

/** เกิน 99 ไม่แสดงเลขจริง - ป้ายกลมเล็กใส่สามหลักแล้วล้นทับไอคอน */
const badge = computed(() => (store.unread > 99 ? '99+' : String(store.unread)))

/**
 * ไอคอนต่อชนิด - กลุ่ม "ต้องทำอะไรต่อ" กับ "รับรู้เฉย ๆ" ต้องแยกออกจากกันด้วยสายตา
 *
 * ★ default ไม่ใช่การเผื่อเหนียว: เอนัมฝั่ง DB เพิ่มค่าได้โดยที่ไฟล์นี้ยังไม่รู้จัก
 *   ปล่อยให้เป็น undefined = ไอคอนหายทั้งแถวโดยไม่มีอะไรฟ้อง
 */
const ICONS: Record<NotificationKind, string> = {
  REQUEST_SUBMITTED_ACK: 'lucide:send',
  REQUEST_SUBMITTED_APPROVER: 'lucide:inbox',
  REQUEST_APPROVED: 'lucide:circle-check',
  REQUEST_REJECTED: 'lucide:circle-x',
  REQUEST_COMPLETED: 'lucide:badge-check',
  ASSET_PIECE_REJECTED: 'lucide:pencil-line',
  ASSET_PIECE_CANCELLED: 'lucide:ban',
  CHANGE_REQUEST_SUBMITTED: 'lucide:inbox',
  CHANGE_REQUEST_DONE: 'lucide:circle-check',
  CHANGE_REQUEST_REJECTED: 'lucide:circle-x',
  NOTIFY_FAILED: 'lucide:mail-warning',
}
const iconOf = (kind: NotificationKind) => ICONS[kind] ?? 'lucide:bell'

/** สีของไอคอน - เฉพาะที่เป็นข่าวร้ายจริง ๆ ไม่งั้นทั้งกล่องจะแดงจนไม่เหลือความหมาย */
const TONE: Partial<Record<NotificationKind, string>> = {
  REQUEST_REJECTED: 'text-error',
  ASSET_PIECE_REJECTED: 'text-warning',
  ASSET_PIECE_CANCELLED: 'text-error',
  CHANGE_REQUEST_REJECTED: 'text-error',
  NOTIFY_FAILED: 'text-warning',
  REQUEST_COMPLETED: 'text-success',
  CHANGE_REQUEST_DONE: 'text-success',
}

function close() {
  open.value = false
}

/**
 * ★ เปิดก่อน แล้วค่อยโหลด - ไม่ใช่รอโหลดเสร็จแล้วค่อยเปิด
 *
 * กล่องต้องเด้งออกมาทันทีที่กดพร้อม spinner ข้างใน ถ้ารอ await ก่อนค่อยสั่งเปิด คนที่เน็ตช้า
 * จะกดแล้วเหมือนปุ่มไม่ทำงานอยู่ครึ่งวินาที แล้วกดซ้ำ (ซึ่งกลายเป็นสั่งปิดพอดี)
 */
async function toggle() {
  open.value = !open.value
  if (!open.value) return

  await store.loadList()
  await store.markSeen()
}

// ── คลิกนอกกล่องแล้วปิด + Esc ────────────────────────────────────────────────────
//
// ★ pointerdown ไม่ใช่ click - click เกิดตอนปล่อยเมาส์ คนที่กดค้างแล้วลากไปปล่อยนอกกล่อง
//   (เช่น ลากเลือกข้อความในรายการ) จะทำให้กล่องหุบทั้งที่ไม่ได้ตั้งใจปิด
// ★ เทียบกับ rootRef ที่ครอบ "ปุ่ม + กล่อง" ไม่ใช่เฉพาะกล่อง - ไม่งั้นการกดปุ่มกระดิ่งตอน
//   เปิดอยู่จะนับเป็นคลิกข้างนอก ปิดไปหนึ่งที แล้ว toggle เปิดกลับมาอีกที = กล่องกะพริบ
// ★ ไม่ปิดเมื่อคลิก "ใน" กล่อง - ปุ่ม "อ่านทั้งหมด" อยู่ในนั้น กดแล้วกล่องต้องยังเปิดอยู่
//   ส่วนการกดรายการมี go() ปิดให้เองอยู่แล้ว
function onDocumentPointerDown(e: PointerEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return
  close()
  // ★ คืนโฟกัสให้ปุ่มกระดิ่งเฉพาะทาง Esc - ตอนนี้โฟกัสอาจอยู่ในกล่องที่กำลังจะหายไป
  //   ปล่อยไว้แล้วคนที่ใช้คีย์บอร์ดจะเด้งกลับไปเริ่มไล่ tab ใหม่จากต้นหน้า
  //   (ทางคลิกข้างนอกไม่ต้องคืน - โฟกัสควรไปอยู่ที่สิ่งที่เขาเพิ่งคลิก ไม่ใช่ถูกดึงกลับมา)
  rootRef.value?.querySelector<HTMLElement>('button')?.focus()
}

// ฟังเฉพาะตอนเปิด - listener ที่ค้างอยู่ตลอดอายุหน้าคือของที่ต้องไล่ตรวจทุกครั้งที่มีคนคลิก
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
})

function go(item: NotificationItem) {
  close()
  if (item.linkPath) void router.push(item.linkPath)
}
</script>

<template>
  <!-- ★ ไม่มีกระดิ่งเลยสำหรับ AUDIT ไม่ใช่กระดิ่งที่กดแล้วขึ้น error - ดู store.enabled
       (ปุ่มที่ยังอยู่แต่ใช้ไม่ได้แย่กว่าปุ่มที่ไม่มี: คนกดแล้วคิดว่าระบบพัง ไม่ใช่คิดว่า
        ตัวเองไม่มีสิทธิ์) -->
  <div v-if="store.enabled" ref="rootRef" class="relative">
    <button type="button" class="btn btn-ghost btn-square rounded-[4px] relative" :aria-expanded="open" aria-haspopup="true"
      :aria-label="store.unread > 0 ? `การแจ้งเตือน ${store.unread} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'"
      @click="toggle">
      <Icon icon="lucide:bell" class="text-xl" />
      <span v-if="store.unread > 0" class="badge badge-error badge-xs absolute right-1 top-1 px-1 font-medium">
        {{ badge }}
      </span>
    </button>

    <!-- ชุดคลาสเดียวกับกล่องโปรไฟล์ใน Sidebar.vue เป๊ะ ๆ - สองกล่องนี้เป็นเมนูที่ห้อยจาก
         ปุ่มเหมือนกัน ถ้าจังหวะต่างกันจะรู้สึกได้ทันทีว่าเป็นคนละแอป -->
    <Transition enter-active-class="transition-all 
    duration-200 ease-out" enter-from-class="opacity-0 -translate-y-8" enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4">


      <div v-if="open" role="menu"
        class="absolute right-0 top-full z-[60] mt-2 max-h-[60vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg">
        <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <span class="text-sm font-semibold">การแจ้งเตือน</span>
          <button v-if="store.unread > 0" type="button" class="btn btn-ghost btn-xs" @click="store.markAll()">
            อ่านทั้งหมด
          </button>
        </div>

        <div v-if="store.loading" class="px-4 py-6 text-center">
          <span class="loading loading-spinner loading-sm"></span>
        </div>

        <p v-else-if="store.loadError" role="alert" class="px-4 py-6 text-center text-sm text-error">
          {{ store.loadError }}
        </p>

        <p v-else-if="store.items.length === 0" class="px-4 py-8 text-center text-sm text-base-content/60">
          ยังไม่มีการแจ้งเตือน
        </p>

        <ul v-else class="divide-y divide-base-300">
          <li v-for="item in store.items" :key="item.id">
            <button type="button" class="flex w-full gap-3 px-4 py-3 text-left hover:bg-base-200"
              :class="item.readAt === null ? 'bg-base-200/60' : ''" @click="go(item)">
              <Icon :icon="iconOf(item.kind)" class="mt-0.5 shrink-0 text-lg"
                :class="TONE[item.kind] ?? 'text-base-content/60'" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm" :class="item.readAt === null ? 'font-medium' : ''">
                  {{ item.title }}
                </span>
                <span v-if="item.body" class="mt-0.5 block text-xs text-base-content/70">
                  {{ item.body }}
                </span>
                <span class="mt-1 block text-xs text-base-content/50">
                  {{ formatDateTime(item.createdAt) }}
                </span>
              </span>
              <!-- จุดของ "ยังไม่อ่าน" - อยู่ขวาสุดเพื่อให้สแกนคอลัมน์เดียวได้ว่าเหลืออะไรบ้าง -->
              <span v-if="item.readAt === null" class="mt-2 size-2 shrink-0 rounded-full bg-primary"></span>
            </button>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>
