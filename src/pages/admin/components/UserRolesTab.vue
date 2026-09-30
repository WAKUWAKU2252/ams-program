<script setup lang="ts">
// แท็บ "สิทธิ์ผู้ใช้" ของหน้า Admin
//
// ⚠️ เขียนลงฐานจริงสองเส้น ไม่มีปุ่ม undo ทั้งคู่:
//    PATCH /users/:id/role      เปลี่ยนสิทธิ์ของคนอื่น
//    PATCH /users/:id/password  ตั้งรหัสผ่านใหม่ให้คนที่ลืมรหัส
//    ต้องผ่านกล่องยืนยันที่บอกผลลัพธ์เป็นประโยคเสมอ ห้ามบันทึกจากการกดครั้งเดียว
//
// ★ โหลดข้อมูลของตัวเองทั้งหมด ไม่รับผ่าน props — แท็บถูก mount ใหม่ทุกครั้งที่สลับเข้ามา
//   (AdminPage ใช้ v-if ไม่ใช่ v-show) ข้อมูลจึงสดเสมอโดยไม่ต้องมีกลไก refresh ข้ามแท็บ
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import AppPagination from '@/shared/components/AppPagination.vue'
import { ApiError } from '@/shared/services/httpClient'
import { useAuthStore } from '@/shared/stores/auth'
import { isApproverRole, roleDetail } from '@/shared/utils/role-detail'
import {
  listUsers,
  resetUserPassword,
  updateUserRole,
  type UserListItem,
} from '@/shared/services/user.service'
import {
  listCompanies,
  listRoles,
  type CompanyOption,
  type RoleOption,
} from '@/shared/services/master.service'

const auth = useAuthStore()

const USERS_PAGE_SIZE = 20

/**
 * บริษัทตั้งต้น และ **ไม่มีตัวเลือก "ทุกบริษัท"**
 *
 * ★ ตั้งใจให้เลือกได้ทีละบริษัทเท่านั้น — ชื่อแผนกซ้ำกันข้ามบริษัทจริง 55 ชื่อ
 *   (MIG กับ UBA ตรงกันเป๊ะ 18 ชื่อ) ลิสต์รวมทุกบริษัทจึงมีแถวหน้าตาเหมือนกัน
 *   เรียงติดกันโดยที่คนกดแยกไม่ออกว่าอันไหนของใคร ซึ่งอันตรายเป็นพิเศษในหน้านี้
 *   เพราะสิ่งที่กดคือ "แจกสิทธิ์" กับ "ตั้งคนรับการ์ดอนุมัติ" ไม่ใช่แค่การดูข้อมูล
 *
 * ★ หยิบจากลิสต์จริง ไม่ฮาร์ดโค้ดรหัสลงไปตรง ๆ — ถ้าวันหนึ่งไม่มี UBA ในระบบ
 *   ให้ถอยไปบริษัทแรกในลิสต์ ไม่ใช่ค้างเป็นค่าว่างแล้วตารางโล่งโดยไม่มีอะไรบอก
 *   (กติกาเดียวกับ DEFAULT_COMPANY_CODE ของหน้า Asset summary)
 */
const DEFAULT_COMPANY_CODE = 'UBA'

/**
 * ค่าพิเศษในกล่องบริษัท = บัญชีที่ไม่ผูกพนักงาน (service account)
 *
 * ★ บัญชีกลุ่มนี้ไม่มีบริษัท และหน้านี้ไม่มี "ทุกบริษัท" - ถ้าไม่มีตัวเลือกนี้จะไม่โผล่ที่ไหนเลย
 *   แล้วเปลี่ยนสิทธิ์/ตั้งรหัสใหม่ให้ไม่ได้ ส่งไป backend เป็น unlinked=true ไม่ใช่เป็นรหัสบริษัท
 */
const UNLINKED = '__unlinked__'

const roles = ref<RoleOption[]>([])
const companies = ref<CompanyOption[]>([])
const users = ref<UserListItem[]>([])
const usersTotal = ref(0)
const usersPage = ref(1)
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const search = ref('')
const roleFilter = ref(0)
const companyFilter = ref('')

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listUsers({
      search: search.value,
      roleId: roleFilter.value || undefined,
      companyCode:
        companyFilter.value && companyFilter.value !== UNLINKED ? companyFilter.value : undefined,
      unlinked: companyFilter.value === UNLINKED,
      page: usersPage.value,
      limit: USERS_PAGE_SIZE,
    })
    users.value = res.data
    usersTotal.value = res.total
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ'
    users.value = []
    usersTotal.value = 0
  } finally {
    loading.value = false
  }
}

/**
 * กันโหลดซ้ำตอนเปิดแท็บ — การตั้งบริษัทตั้งต้นไปกระตุ้น watch ที่เฝ้าตัวกรองอยู่
 * ถ้าไม่กั้น จะยิง API สองครั้งต่อการเปิดหนึ่งครั้ง (กติกาเดียวกับ ready ของ Asset summary)
 */
const ready = ref(false)

onMounted(async () => {
  ;[roles.value, companies.value] = await Promise.all([
    listRoles().catch(() => [] as RoleOption[]),
    listCompanies().catch(() => [] as CompanyOption[]),
  ])

  const preferred = companies.value.find((c) => c.code === DEFAULT_COMPANY_CODE)
  companyFilter.value = (preferred ?? companies.value[0])?.code ?? ''

  await load()
  ready.value = true
})

// เปลี่ยนตัวกรอง = ชุดแถวคนละชุด ต้องกลับหน้า 1 ไม่งั้นค้างอยู่หน้าที่ชุดใหม่ไม่มี
watch([search, roleFilter, companyFilter], () => {
  if (!ready.value) return
  usersPage.value = 1
  void load()
})

function goPage(next: number) {
  usersPage.value = next
  void load()
}

// ── กล่องยืนยันเปลี่ยนสิทธิ์ ─────────────────────────────────────────────────
const dialog = ref<HTMLDialogElement | null>(null)
const target = ref<UserListItem | null>(null)
const nextRoleId = ref(0)
const saving = ref(false)
/** จำนวน ADMIN ที่เหลือ — นับตอนเปิดกล่องเท่านั้น (null = นับไม่ได้ จึงไม่เตือนข้อนั้น) */
const adminCount = ref<number | null>(null)

const nextRole = computed(() => roles.value.find((r) => r.id === nextRoleId.value) ?? null)

/**
 * คำเตือนของการเปลี่ยนครั้งนี้ — ตกลงกันว่า "เตือน ไม่ห้าม"
 *
 * ★ ทุกข้อเป็นผลที่เกิดจริงและไม่มีอะไรฟ้องทีหลัง ถ้าไม่บอกตรงนี้ก็ไม่มีที่ไหนบอกอีกเลย
 */
const warnings = computed(() => {
  const t = target.value
  const next = nextRole.value
  if (!t || !next) return [] as string[]

  const out: string[] = []

  if (auth.user?.id === t.id) {
    out.push(
      'นี่คือบัญชีของคุณเอง — เปลี่ยนเป็นสิทธิ์ที่ไม่ใช่ ADMIN แล้วคุณจะเข้าหน้านี้ไม่ได้อีก ต้องให้ ADMIN คนอื่นแก้คืนให้',
    )
  }

  if (t.roleName === 'ADMIN' && next.name !== 'ADMIN' && adminCount.value === 1) {
    out.push(
      'นี่คือ ADMIN คนสุดท้ายในระบบ — ลดสิทธิ์แล้วจะไม่มีใครสร้างผู้ใช้หรือแก้สิทธิ์ได้อีกเลย ต้องไปแก้ที่ฐานข้อมูลโดยตรง',
    )
  }

  if (t.isDepartmentManager && !isApproverRole(next.name)) {
    out.push(
      `${t.employeeName ?? t.username} เป็นหัวหน้าแผนกอยู่ — ลดเป็น ${next.name} แล้วใบคำขอของแผนกที่เขาคุมจะส่งไม่ออกทันที และจะไม่มีข้อความแจ้งเตือนใด ๆ`,
    )
  }

  return out
})

async function openDialog(row: UserListItem) {
  target.value = row
  nextRoleId.value = row.roleId
  adminCount.value = null
  dialog.value?.showModal()

  // นับ ADMIN ที่เหลือไว้ใช้เตือน — limit 1 พอ เพราะต้องการแค่ total
  try {
    const adminRole = roles.value.find((r) => r.name === 'ADMIN')
    if (adminRole) adminCount.value = (await listUsers({ roleId: adminRole.id, limit: 1 })).total
  } catch {
    // นับไม่ได้ = ไม่โชว์คำเตือนข้อนั้น แต่ยังเปลี่ยนสิทธิ์ได้ตามปกติ
    adminCount.value = null
  }
}

async function confirm() {
  const t = target.value
  if (!t || !nextRoleId.value || nextRoleId.value === t.roleId) return

  saving.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    await updateUserRole(t.id, nextRoleId.value)
    successMsg.value = `เปลี่ยนสิทธิ์ของ ${t.username} เป็น ${nextRole.value?.name} แล้ว`
    dialog.value?.close()
    await load()
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'เปลี่ยนสิทธิ์ไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

// ── กล่องตั้งรหัสผ่านใหม่ ──────────────────────────────────────────────────
//
// ทางเดียวของคนที่ลืมรหัส (ยังไม่มีรีเซ็ตด้วยตัวเอง) - ADMIN ตั้งให้แล้วแจ้งเจ้าตัวเอง
const pwDialog = ref<HTMLDialogElement | null>(null)
const pwTarget = ref<UserListItem | null>(null)
const newPassword = ref('')
/**
 * โชว์รหัสตั้งแต่เปิดกล่อง ไม่ซ่อนเป็นจุด - ADMIN ตั้งรหัสให้ "คนอื่น" แล้วต้องเอาไปบอกต่อ
 * พิมพ์ผิดแล้วไม่มีทางรู้จนกว่าเจ้าตัวจะล็อกอินไม่ได้แล้วโทรกลับมา (เหตุผลเดียวกับหน้า Create user)
 */
const showNewPassword = ref(true)
const pwSaving = ref(false)
const pwError = ref('')

/** ต้องตรงกับ passwordField ฝั่ง backend - ดักที่นี่เพื่อไม่ให้เสียรอบไป-กลับแล้วเจอ 422 */
const PASSWORD_MIN = 4

const pwWarnings = computed(() => {
  const t = pwTarget.value
  if (!t) return [] as string[]
  const out: string[] = []
  if (auth.user?.id === t.id) {
    out.push('นี่คือบัญชีของคุณเอง — ครั้งหน้าต้องล็อกอินด้วยรหัสใหม่นี้')
  }
  // backend ไม่เปิดบัญชีให้เอง (ดู resetUserPassword) - ไม่บอกตรงนี้ ADMIN จะนึกว่าตั้งรหัสแล้วเข้าได้
  if (!t.isActive) {
    out.push('บัญชีนี้ปิดใช้งานอยู่ — ตั้งรหัสใหม่แล้วก็ยังล็อกอินไม่ได้จนกว่าจะเปิดบัญชี')
  }
  return out
})

/**
 * สุ่มรหัสชั่วคราว - ตัดตัวที่อ่านสับสนทิ้ง (0/O, 1/l/I) เพราะรหัสนี้ต้องถูกอ่านออกเสียง
 * หรือพิมพ์ตามจากหน้าจอคนอื่น ใช้ crypto ไม่ใช่ Math.random ซึ่งเดาได้
 */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  newPassword.value = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  showNewPassword.value = true
}

function openPasswordDialog(row: UserListItem) {
  pwTarget.value = row
  newPassword.value = ''
  showNewPassword.value = true
  pwError.value = ''
  pwDialog.value?.showModal()
}

async function confirmPassword() {
  const t = pwTarget.value
  if (!t || newPassword.value.length < PASSWORD_MIN) return

  pwSaving.value = true
  pwError.value = ''
  errorMsg.value = ''
  successMsg.value = ''
  try {
    await resetUserPassword(t.id, newPassword.value)
    successMsg.value = `ตั้งรหัสผ่านใหม่ให้ ${t.username} แล้ว — แจ้งรหัสให้เจ้าตัวได้เลย`
    // ★ ล้างรหัสทิ้งทันที ไม่ค้างไว้ใน state ของหน้า - ADMIN เห็นแล้วตอนกดยืนยัน
    newPassword.value = ''
    pwDialog.value?.close()
  } catch (e) {
    // ★ ค้างกล่องไว้ ไม่ปิดหนี - รหัสที่พิมพ์ยังอยู่ แก้แล้วกดใหม่ได้เลย
    pwError.value = e instanceof ApiError ? e.message : 'ตั้งรหัสผ่านไม่สำเร็จ'
  } finally {
    pwSaving.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="errorMsg" role="alert" class="alert alert-error alert-soft mb-4">
      <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>
    <div v-if="successMsg" role="status" class="alert alert-success alert-soft mb-4">
      <Icon icon="lucide:circle-check" class="size-5 shrink-0" />
      <span>{{ successMsg }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <label class="input input-sm w-full max-w-xs">
        <Icon icon="lucide:search" class="size-4 opacity-50" />
        <input v-model="search" type="search" placeholder="ค้น username / ชื่อ / รหัสพนักงาน" />
        <span v-if="loading" class="loading loading-spinner loading-xs"></span>
      </label>

      <select v-model.number="roleFilter" class="select select-sm w-40">
        <option :value="0">ทุกสิทธิ์</option>
        <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
      </select>

      <!-- ★ กรองด้วยบริษัทที่สังกัดจริง (HR ก่อน แล้วค่อยแผนกหลัก) คนละหนึ่งบริษัท - กติกา
             เดียวกับที่ Dashboard ใช้ล็อก ไม่ใช่ทุกบริษัทที่เขามีรหัสใน SAP
           ★ ไม่มีตัวเลือก "ทุกบริษัท" โดยตั้งใจ (ดู DEFAULT_COMPANY_CODE) -->
      <select v-model="companyFilter" class="select select-sm w-40">
        <option v-for="c in companies" :key="c.code" :value="c.code">{{ c.name || c.code }}</option>
        <option :value="UNLINKED">ไม่ผูกพนักงาน</option>
      </select>

      <span class="ml-auto text-sm text-base-content/60">{{ usersTotal }} บัญชี</span>
    </div>




    <div class="mt-3 overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">
        <thead>
          <tr>
            <th scope="col">Username</th>
            <th scope="col">ชื่อพนักงาน</th>
            <th scope="col">แผนก</th>
            <th scope="col">สิทธิ์ปัจจุบัน</th>
            <th scope="col" class="text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" class="hover:bg-base-200">
            <td class="whitespace-nowrap font-medium">
              {{ u.username }}
              <span v-if="!u.isActive" class="badge badge-ghost badge-xs ml-1">ปิดใช้งาน</span>
            </td>
            <td class="max-w-56 truncate">{{ u.employeeName ?? '—' }}</td>
            <!-- แผนกในบริษัทที่สังกัด - ว่างแปลว่ายังไม่มีแผนกฝั่งบริษัทนั้น (ไม่มีรหัสในฐาน SAP
                 ของบริษัทนั้น) ต้องบอกตรง ๆ ไม่ใช่เอาแผนกของบริษัทอื่นมาแสดงแทน -->
            <td class="max-w-56 truncate text-base-content/70">
              <template v-if="u.departmentName">{{ u.departmentName }}</template>
              <span v-else-if="u.companyCode" class="text-warning">ยังไม่มีแผนกใน {{ u.companyCode }}</span>
              <template v-else>—</template>
              <span v-if="u.departmentName && u.companyCode" class="text-xs opacity-60">
                · {{ u.companyCode }}
              </span>
            </td>
            <td class="whitespace-nowrap">
              <span
                class="badge badge-sm"
                :class="u.roleName === 'ADMIN' ? 'badge-primary' : 'badge-ghost'"
              >
                {{ u.roleName }}
              </span>
              <!-- ★ ธงนี้คือสิ่งที่ทำให้ไม่เผลอลดสิทธิ์หัวหน้าแผนก — ต้องเห็นตั้งแต่ในตาราง
                   ไม่ใช่เห็นตอนเปิดกล่องยืนยันแล้ว -->
              <span
                v-if="u.isDepartmentManager"
                class="badge badge-sm badge-warning badge-soft ml-1 gap-1"
                title="เป็นหัวหน้าแผนกอยู่ ลดสิทธิ์แล้วใบของแผนกนั้นจะส่งไม่ออก"
              >
                <Icon icon="lucide:shield-check" class="size-3" />
                Manager
              </span>
            </td>
            <td class="whitespace-nowrap text-right">
              <button type="button" class="btn btn-ghost btn-xs" @click="openDialog(u)">
                Change Role
              </button>
              <button type="button" class="btn btn-ghost btn-xs" @click="openPasswordDialog(u)">
                Reset Password
              </button>
            </td>
          </tr>

          <tr v-if="!users.length && !loading">
            <td colspan="5" class="py-10 text-center text-base-content/70">
              ไม่พบบัญชีที่ตรงกับคำค้น
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex w-full min-w-0 justify-center">
      <AppPagination
        class="mt-2"
        :page="usersPage"
        :total="usersTotal"
        :limit="USERS_PAGE_SIZE"
        @update:page="goPage"
      />
    </div>

    <dialog ref="dialog" class="modal duration-150">
      <div class="modal-box max-h-[calc(100dvh-4rem)] max-w-lg duration-150">
        <h3 class="text-lg font-semibold">เปลี่ยนสิทธิ์ผู้ใช้</h3>
        <p class="mt-1 text-sm text-base-content/60">
          {{ target?.username }}
          <span v-if="target?.employeeName">· {{ target.employeeName }}</span>
        </p>

        <div class="mt-4 grid gap-2">
          <label
            v-for="r in roles"
            :key="r.id"
            class="flex cursor-pointer items-start gap-3 rounded-box border px-3 py-2.5 transition-colors"
            :class="
              nextRoleId === r.id ? 'border-primary bg-primary/5' : 'border-base-300 hover:bg-base-200'
            "
          >
            <input
              v-model="nextRoleId"
              type="radio"
              name="nextRole"
              class="radio radio-sm radio-primary mt-0.5 shrink-0"
              :value="r.id"
            />
            <span class="min-w-0">
              <span class="block text-sm font-medium">
                {{ r.name }}
                <span v-if="target?.roleId === r.id" class="badge badge-ghost badge-xs ml-1">
                  ปัจจุบัน
                </span>
              </span>
              <span class="block text-xs text-base-content/60">
                {{ roleDetail(r.name, r.description) }}
              </span>
            </span>
          </label>
        </div>

        <div
          v-for="warn in warnings"
          :key="warn"
          role="alert"
          class="alert alert-warning alert-soft mt-3 py-2 text-sm"
        >
          <Icon icon="lucide:triangle-alert" class="size-4 shrink-0" />
          <span>{{ warn }}</span>
        </div>

        <div class="modal-action">
          <form method="dialog">
            <button class="btn btn-sm" :disabled="saving">ยกเลิก</button>
          </form>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="saving || !target || nextRoleId === target.roleId"
            @click="confirm"
          >
            <span v-if="saving" class="loading loading-spinner loading-xs"></span>
            ยืนยันเปลี่ยนสิทธิ์
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>

    <dialog ref="pwDialog" class="modal duration-150">
      <div class="modal-box max-h-[calc(100dvh-4rem)] max-w-md duration-150">
        <h3 class="text-lg font-semibold">ตั้งรหัสผ่านใหม่</h3>
        <p class="mt-1 text-sm text-base-content/60">
          {{ pwTarget?.username }}
          <span v-if="pwTarget?.employeeName">· {{ pwTarget.employeeName }}</span>
        </p>

        <form class="mt-4" @submit.prevent="confirmPassword">
          <label class="label text-sm" for="reset-password">รหัสผ่านใหม่</label>
          <div class="flex gap-2">
            <label class="input group w-full">
              <Icon
                icon="lucide:key-round"
                class="size-4 text-base-content/40 transition-colors group-focus-within:text-primary"
              />
              <input
                id="reset-password"
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :minlength="PASSWORD_MIN"
                :placeholder="`อย่างน้อย ${PASSWORD_MIN} ตัวอักษร`"
                required
              />
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :aria-label="showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
                :aria-pressed="showNewPassword"
                tabindex="-1"
                @click="showNewPassword = !showNewPassword"
              >
                <Icon :icon="showNewPassword ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
              </button>
            </label>
            <button type="button" class="btn" @click="generatePassword">
              <Icon icon="lucide:dices" class="size-4" />
              สุ่ม
            </button>
          </div>
          <p class="mt-1.5 text-xs text-base-content/60">
            แจ้งรหัสนี้ให้เจ้าตัวเอง ระบบไม่ส่งให้ · ผู้ที่ล็อกอินค้างอยู่ยังใช้งานต่อได้จนเซสชันหมดอายุ
          </p>

          <div
            v-for="warn in pwWarnings"
            :key="warn"
            role="alert"
            class="alert alert-warning alert-soft mt-3 py-2 text-sm"
          >
            <Icon icon="lucide:triangle-alert" class="size-4 shrink-0" />
            <span>{{ warn }}</span>
          </div>

          <div v-if="pwError" role="alert" class="alert alert-error alert-soft mt-3 py-2 text-sm">
            <Icon icon="lucide:circle-alert" class="size-4 shrink-0" />
            <span>{{ pwError }}</span>
          </div>

          <div class="modal-action">
            <button type="button" class="btn btn-sm" :disabled="pwSaving" @click="pwDialog?.close()">
              ยกเลิก
            </button>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              :disabled="pwSaving || newPassword.length < PASSWORD_MIN"
            >
              <span v-if="pwSaving" class="loading loading-spinner loading-xs"></span>
              ยืนยันตั้งรหัสใหม่
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
  </div>
</template>
