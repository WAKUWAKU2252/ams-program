<script setup lang="ts">
// แท็บ "หัวหน้าแผนก" ของหน้า Admin
//
// ⚠️⚠️ เขียนลงฐานจริง: PATCH /master/departments/:id/manager
//      department.managerId คือ **ปลายทางของการ์ดขออนุมัติใน Teams** — เปลี่ยนเมื่อไหร่
//      ใบคำขอของแผนกนั้นทุกใบที่ส่งหลังจากนี้จะวิ่งไปหาคนใหม่ทันที ไม่มีขั้นตอนย้อนกลับ
//
// ★ ตัวเลือกหัวหน้ามีแต่คนที่ "อนุมัติได้จริง" — backend กรองด้วยเงื่อนไขชุดเดียวกับที่ระบบ
//   ใช้ตอนหาผู้อนุมัติจริง (บัญชี active + role ∈ APPROVER_ROLES ดู resolvePoApprovalTarget)
//   และตรวจซ้ำอีกรอบตอนบันทึก ไม่ได้เชื่อว่าหน้าจอกรองมาแล้ว
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/shared/services/httpClient'
import {
  listApprovers,
  listCompanies,
  listDepartments,
  setDepartmentManager,
  type ApproverOption,
  type CompanyOption,
  type DepartmentOption,
} from '@/shared/services/master.service'

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

const departments = ref<DepartmentOption[]>([])
const companies = ref<CompanyOption[]>([])
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const search = ref('')
const company = ref('')

/**
 * ชื่อหัวหน้าปัจจุบันของแต่ละแผนก
 *
 * ★ department ส่งมาแค่ managerId (employee.id) ไม่มีชื่อ — ใช้ลิสต์ approvers เป็นตัวแปลง
 *   ซึ่งครอบคลุมพอดี เพราะหัวหน้าที่ตั้งได้ต้องเป็น approver อยู่แล้ว
 *   แปลงไม่ออก = คนนั้นเสียคุณสมบัติไปแล้ว (บัญชีถูกปิด/ถูกลดสิทธิ์ทีหลัง) ซึ่งแปลว่า
 *   ใบของแผนกนั้นส่งไม่ออกอยู่ตอนนี้ — ต้องโชว์เป็นคำเตือน ไม่ใช่ปล่อยว่าง
 */
const approvers = ref<ApproverOption[]>([])
const approverById = computed(() => new Map(approvers.value.map((a) => [a.id, a])))

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return departments.value.filter((d) => {
    // company ว่างได้กรณีเดียว: โหลดลิสต์บริษัทไม่สำเร็จ — ตอนนั้นโชว์ทั้งหมดดีกว่าโชว์ว่าง
    if (company.value && d.companyCode !== company.value) return false
    if (!q) return true
    return d.name.toLowerCase().includes(q) || (d.departmentId ?? '').toLowerCase().includes(q)
  })
})

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    // โหลดพร้อมกัน — ลิสต์แผนกอย่างเดียวแปลงชื่อหัวหน้าไม่ได้ (ดูหมายเหตุที่ approverById)
    const [deps, apps, cos] = await Promise.all([
      listDepartments(),
      listApprovers(),
      listCompanies(),
    ])
    departments.value = deps
    approvers.value = apps
    companies.value = cos

    // ★ ตั้งค่าเริ่มต้นเฉพาะครั้งแรกที่ยังว่าง ห้ามตั้งทับทุกครั้งที่ load() —
    //   load() ถูกเรียกซ้ำหลังบันทึกเสร็จ ถ้าตั้งทับ บริษัทที่ผู้ใช้เพิ่งสลับไปจะเด้งกลับ UBA
    if (!company.value) {
      const preferred = cos.find((c) => c.code === DEFAULT_COMPANY_CODE)
      company.value = (preferred ?? cos[0])?.code ?? ''
    }
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'โหลดรายชื่อแผนกไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── กล่องยืนยันตั้งหัวหน้า ───────────────────────────────────────────────────
const dialog = ref<HTMLDialogElement | null>(null)
const target = ref<DepartmentOption | null>(null)
const nextManagerId = ref<number | null>(null)
const pickSearch = ref('')
const saving = ref(false)

/**
 * ตัวเลือกหัวหน้า — กรองด้วยบริษัทของแผนกนั้นเสมอ
 *
 * ★ ไม่ใช่แค่ความสะดวก: ชื่อแผนกซ้ำกันข้ามบริษัท 55 ชื่อ และการแยกแผนกตามบริษัทคือสิ่งที่
 *   0024 ตั้งใจทำ เพราะแผนกรหัสเดียวกันของสองบริษัทต้องมีหัวหน้าคนละคน
 */
const options = computed(() => {
  const q = pickSearch.value.trim().toLowerCase()
  const co = target.value?.companyCode
  return approvers.value.filter((a) => {
    if (co && a.companyCode && a.companyCode !== co) return false
    if (!q) return true
    return a.name.toLowerCase().includes(q) || (a.empId ?? '').toLowerCase().includes(q)
  })
})

const current = computed(() =>
  target.value?.managerId ? (approverById.value.get(target.value.managerId) ?? null) : null,
)

function openDialog(dept: DepartmentOption) {
  target.value = dept
  nextManagerId.value = dept.managerId
  pickSearch.value = ''
  dialog.value?.showModal()
}

async function confirm() {
  const dept = target.value
  if (!dept) return

  saving.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    await setDepartmentManager(dept.id, nextManagerId.value)
    const who = nextManagerId.value ? (approverById.value.get(nextManagerId.value)?.name ?? '') : ''
    successMsg.value = nextManagerId.value
      ? `ตั้ง ${who} เป็นหัวหน้าแผนก ${dept.name} แล้ว`
      : `ถอดหัวหน้าแผนก ${dept.name} ออกแล้ว`
    dialog.value?.close()
    await load()
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'ตั้งหัวหน้าแผนกไม่สำเร็จ'
  } finally {
    saving.value = false
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
        <input v-model="search" type="search" placeholder="ค้นชื่อแผนก / รหัสแผนก" />
        <span v-if="loading" class="loading loading-spinner loading-xs"></span>
      </label>

      <!-- ★ ตัวกรองบริษัทไม่ใช่ของแถม - 55 ชื่อแผนกซ้ำกันข้ามบริษัท ลิสต์รวมจะมีแถว
           หน้าตาเหมือนกันสองสามอันเรียงติดกันโดยแยกไม่ออกว่าอันไหนของใคร -->
      <!-- ★ ไม่มีตัวเลือก "ทุกบริษัท" โดยตั้งใจ (ดู DEFAULT_COMPANY_CODE) -->
      <select v-model="company" class="select select-sm w-40">
        <option v-for="c in companies" :key="c.code" :value="c.code">{{ c.name || c.code }}</option>
      </select>

      <span class="ml-auto text-sm text-base-content/60">{{ visible.length }} แผนก</span>
    </div>

    <div class="mt-3 overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">
        <thead>
          <tr>
            <th scope="col">แผนก</th>
            <th scope="col">บริษัท</th>
            <th scope="col">หัวหน้าปัจจุบัน</th>
            <th scope="col" class="text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in visible" :key="d.id" class="hover:bg-base-200">
            <td class="max-w-72 truncate font-medium">
              {{ d.name }}
              <span v-if="d.departmentId" class="ml-1 text-xs tabular-nums opacity-60">
                {{ d.departmentId }}
              </span>
            </td>
            <td class="whitespace-nowrap text-base-content/70">{{ d.companyCode }}</td>
            <td class="max-w-56 truncate">
              <template v-if="d.managerId && approverById.get(d.managerId)">
                {{ approverById.get(d.managerId)!.name }}
              </template>
              <!-- ★ ตั้งไว้แล้วแต่แปลงชื่อไม่ออก = ใบของแผนกนี้ส่งไม่ออกอยู่ตอนนี้ ต้องโชว์ -->
              <span v-else-if="d.managerId" class="flex items-center gap-1 text-warning">
                <Icon icon="lucide:triangle-alert" class="size-4 shrink-0" />
                ตั้งไว้แล้วแต่อนุมัติไม่ได้
              </span>
              <span v-else class="text-base-content/50">ยังไม่ได้ตั้ง</span>
            </td>
            <td class="text-right">
              <button type="button" class="btn btn-ghost btn-xs" @click="openDialog(d)">
                ตั้งหัวหน้า
              </button>
            </td>
          </tr>

          <tr v-if="!visible.length && !loading">
            <td colspan="4" class="py-10 text-center text-base-content/70">
              ไม่พบแผนกที่ตรงกับคำค้น
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <dialog ref="dialog" class="modal duration-150">
      <div class="modal-box max-h-[calc(100dvh-4rem)] max-w-lg duration-150">
        <h3 class="text-lg font-semibold">ตั้งหัวหน้าแผนก</h3>
        <p class="mt-1 text-sm text-base-content/60">
          {{ target?.name }} · {{ target?.companyCode }}
        </p>

        <div role="alert" class="alert alert-warning alert-soft mt-3 py-2 text-sm">
          <Icon icon="lucide:send" class="size-4 shrink-0" />
          <span>
            ใบคำขอของแผนกนี้ทุกใบที่ส่งหลังจากนี้ จะเด้งการ์ดขออนุมัติใน Teams
            ไปหาคนที่เลือกไว้ทันที
          </span>
        </div>

        <p class="mt-3 text-sm">
          ปัจจุบัน:
          <span v-if="current" class="font-medium">{{ current.name }}</span>
          <span v-else class="text-base-content/50">ยังไม่ได้ตั้ง</span>
        </p>

        <label class="input input-sm mt-3 w-full">
          <Icon icon="lucide:search" class="size-4 opacity-50" />
          <input v-model="pickSearch" type="search" placeholder="ค้นชื่อ / รหัสพนักงาน" />
        </label>

        <ul
          class="mt-2 max-h-56 divide-y divide-base-200 overflow-y-auto rounded-box border border-base-300"
        >
          <li>
            <label
              class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors"
              :class="nextManagerId === null ? 'bg-primary/10' : 'hover:bg-base-200'"
            >
              <input
                v-model="nextManagerId"
                type="radio"
                name="nextManager"
                class="radio radio-xs radio-primary shrink-0"
                :value="null"
              />
              <span class="text-base-content/60">ไม่มีหัวหน้า (ใบของแผนกนี้จะส่งไม่ได้)</span>
            </label>
          </li>
          <li v-for="a in options" :key="a.id">
            <label
              class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors"
              :class="nextManagerId === a.id ? 'bg-primary/10' : 'hover:bg-base-200'"
            >
              <input
                v-model="nextManagerId"
                type="radio"
                name="nextManager"
                class="radio radio-xs radio-primary shrink-0"
                :value="a.id"
              />
              <span class="min-w-0 flex-1 truncate">
                {{ a.name }}
                <span v-if="a.departmentName" class="text-xs opacity-60">
                  · {{ a.departmentName }}
                </span>
              </span>
              <span class="badge badge-ghost badge-sm shrink-0">{{ a.roleName }}</span>
            </label>
          </li>
          <li v-if="!options.length" class="px-3 py-6 text-center text-sm text-base-content/60">
            ไม่มีใครในบริษัทนี้ที่ตั้งเป็นหัวหน้าได้ ต้องมีบัญชีที่เปิดใช้อยู่และสิทธิ์
            MANAGER / FINANCE / ADMIN ก่อน
          </li>
        </ul>

        <div class="modal-action">
          <form method="dialog">
            <button class="btn btn-sm" :disabled="saving">ยกเลิก</button>
          </form>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="saving || nextManagerId === (target?.managerId ?? null)"
            @click="confirm"
          >
            <span v-if="saving" class="loading loading-spinner loading-xs"></span>
            ยืนยัน
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
  </div>
</template>
