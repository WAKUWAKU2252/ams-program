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
 * ── ★★ ใช้ <details> ของ daisyUI ไม่ใช่ state เปิด/ปิดที่เขียนเอง
 *
 * dropdown ที่คุมด้วย ref เองต้องจัดการ "คลิกข้างนอกแล้วปิด" + Esc + โฟกัสกลับที่ปุ่ม
 * ด้วยมือทั้งหมด ซึ่งเป็นสามอย่างที่ลืมกันบ่อยที่สุดและจับไม่ได้จากการกดทดสอบเอง
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useNotificationStore } from '@/shared/stores/notification'
import type { NotificationItem, NotificationKind } from '@/shared/services/notification.service'
import { formatDateTime } from '@/shared/utils/date'

const router = useRouter()
const store = useNotificationStore()
const open = ref(false)

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

async function onToggle(e: Event) {
  open.value = (e.target as HTMLDetailsElement).open
  if (!open.value) return

  await store.loadList()
  await store.markSeen()
}

function go(item: NotificationItem) {
  open.value = false
  // ปิดกล่องด้วยมือ - <details> ไม่ปิดเองเมื่อ route เปลี่ยน
  const el = document.getElementById('ams-notification-dropdown') as HTMLDetailsElement | null
  if (el) el.open = false
  if (item.linkPath) void router.push(item.linkPath)
}
</script>

<template>
  <details id="ams-notification-dropdown" class="dropdown dropdown-end" @toggle="onToggle">
    <summary
      class="btn btn-ghost btn-square relative"
      :aria-label="store.unread > 0 ? `การแจ้งเตือน ${store.unread} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'"
    >
      <Icon icon="lucide:bell" class="text-xl" />
      <span
        v-if="store.unread > 0"
        class="badge badge-error badge-xs absolute right-1 top-1 px-1 font-medium"
      >
        {{ badge }}
      </span>
    </summary>

    <div
      class="dropdown-content z-[60] mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg"
    >
      <div class="flex items-center justify-between border-b border-base-300 px-4 py-3">
        <span class="text-sm font-semibold"><Icon icon="lucide:bell" class="text-xl" />การแจ้งเตือน</span>
        <button
          v-if="store.unread > 0"
          type="button"
          class="btn btn-ghost btn-xs"
          @click="store.markAll()"
        >
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
          <button
            type="button"
            class="flex w-full gap-3 px-4 py-3 text-left hover:bg-base-200"
            :class="item.readAt === null ? 'bg-base-200/60' : ''"
            @click="go(item)"
          >
            <Icon
              :icon="iconOf(item.kind)"
              class="mt-0.5 shrink-0 text-lg"
              :class="TONE[item.kind] ?? 'text-base-content/60'"
            />
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
  </details>
</template>
