<script setup lang="ts">
// แท็บ Create user ของหน้า Admin - เฉพาะ ADMIN (route meta.roles + requireRole('ADMIN'))
//
// ★ เป็น component ไม่ใช่ page แล้ว (ยุบสามแท็บมาไว้หน้าเดียว) จึงไม่มีกรอบนอก/TopicCard
//   ของตัวเอง - AdminPage เป็นคนวางให้ทั้งหมด
//
// ทางเข้าปกติของข้อมูลพนักงานคือสคริปต์ import จาก HR/SAP หน้านี้เป็นทางลัดสำหรับคนที่
// ยังไม่มีในต้นทาง - สร้าง employee + user ในคำสั่งเดียว (backend ห่อเป็น transaction
// ให้แล้ว ล้มกลางทางไม่เหลือพนักงานผีค้าง)
//
// ⚠️ ข้อมูลพนักงานที่กรอกที่นี่อาจถูก sync ทับทีหลังถ้าคนคนนั้นโผล่ใน SAP ด้วย ownerCode
// เดียวกัน - ถือเป็นของชั่วคราวจนกว่า HR จะส่งของจริงมา
import { reactive, ref, onMounted, computed } from 'vue'
import { userService, type CreateUserPayload } from '@/shared/services/user.service'
import { listDepartments, listEmployees, listRoles } from '@/shared/services/master.service'
import type { DepartmentOption, EmployeeOption, RoleOption } from '@/shared/services/master.service'
import { roleDetail } from '@/shared/utils/role-detail'
import { ApiError } from '@/shared/services/httpClient'
import { Icon } from '@iconify/vue'

const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const showPassword = ref(false)

/**
 * โหมดของช่องพนักงาน - backend รับได้อย่างใดอย่างหนึ่งเท่านั้น ส่งทั้งคู่ได้ 400
 *   new   สร้างพนักงานใหม่ไปพร้อมกัน (ค่าตั้งต้น - เป็นเหตุผลที่หน้านี้มีอยู่)
 *   link  ผูกกับพนักงานที่มีอยู่แล้ว
 *   none  ไม่ผูกใคร (service account) - จะไม่มีอีเมล ไม่มีชื่อจริง และรับแจ้งเตือนไม่ได้
 */
type EmployeeMode = 'new' | 'link' | 'none'
const mode = ref<EmployeeMode>('new')

/** คำอธิบายใต้แท็บ - โหมดพวกนี้ต่างกันที่ "ผลลัพธ์ในฐานข้อมูล" ซึ่งดูจากชื่อแท็บอย่างเดียวไม่ออก */
const MODES: { key: EmployeeMode; label: string; hint: string }[] = [
  {
    key: 'new',
    label: 'สร้างใหม่',
    hint: 'สร้างข้อมูลพนักงานใหม่ไปพร้อมกับบัญชี ',
  },
  {
    key: 'link',
    label: 'ผูกคนเดิม',
    hint: 'ผูกบัญชีเข้ากับพนักงานที่มีอยู่แล้ว เช่นคนที่ sync มาจาก HR/SAP',
  },
  {
    key: 'none',
    label: 'ไม่ผูก',
    hint: 'ไม่ผูกกับพนักงานคนใดเลย สำหรับ service account เท่านั้น',
  },
]

const modeHint = computed(() => MODES.find((m) => m.key === mode.value)?.hint ?? '')

const emptyUser = () => ({
  username: '',
  displayName: '',
  password: '',
  roleId: 0,
})

const emptyEmployee = () => ({
  firstName: '',
  lastName: '',
  firstNameEn: '',
  lastNameEn: '',
  empId: '',
  email: '',
  ownerCode: '' as string, // เก็บเป็น string เพราะ input type=number ว่าง ๆ ให้ '' ไม่ใช่ 0
  departmentId: 0,
})

const form = reactive(emptyUser())
const emp = reactive(emptyEmployee())

// ── พนักงานที่มีอยู่ (โหมด link) ────────────────────────────────────────────
const linkedEmployeeId = ref(0)
const employeeSearch = ref('')
const employeeResults = ref<EmployeeOption[]>([])
const searching = ref(false)
const searched = ref(false)

async function searchEmployees() {
  const search = employeeSearch.value.trim()
  if (!search) {
    employeeResults.value = []
    searched.value = false
    return
  }
  searching.value = true
  try {
    const res = await listEmployees({ search, limit: 20 })
    employeeResults.value = res.data
  } catch {
    employeeResults.value = []
  } finally {
    searching.value = false
    // ★ ต้องตั้งหลังค้นเสร็จเท่านั้น - ใช้แยก "ยังไม่เคยค้น" ออกจาก "ค้นแล้วไม่เจอ"
    //   สองอย่างนี้ต้องขึ้นข้อความคนละแบบ (เดิมเช็คจาก employeeSearch ซึ่งมีค่าตั้งแต่
    //   ตัวอักษรแรกที่พิมพ์ จึงขึ้น "ไม่พบพนักงาน" สีแดงใส่คนที่ยังพิมพ์ไม่จบด้วยซ้ำ)
    searched.value = true
  }
}

const departments = ref<DepartmentOption[]>([])
onMounted(async () => {
  try {
    // ยิงคู่กัน — ไม่ได้ใช้ผลของกันและกัน และหน้าจะกรอกไม่ได้ถ้าขาดอย่างใดอย่างหนึ่ง
    const [deps, rs] = await Promise.all([listDepartments(), listRoles()])
    departments.value = deps
    roles.value = rs
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'โหลดข้อมูลตั้งต้นไม่สำเร็จ'
  }
})

/**
 * รายการ role มาจากฐานข้อมูล ไม่ใช่ฝังไว้ในหน้าจอแล้ว (แก้ TODO เดิม)
 *
 * ★ เดิมเขียน { EMPLOYEE:1, MANAGER:2, ... } ไว้ตรงนี้ ซึ่ง id พวกนั้นมาจากลำดับที่
 *   db:import:role รันครั้งแรก ถ้าฐานไหน import คนละลำดับ หรือมีคนเพิ่ม role แทรก
 *   หน้าจอจะแจกสิทธิ์ผิดคนโดยไม่มีอะไรฟ้องเลย — เป็นเรื่องความถูกต้อง ไม่ใช่ความสะอาด
 *
 * ★ ส่วน "คำอธิบายว่าทำอะไรได้บ้าง" ยังอยู่ฝั่งจอ (roleDetail) เพราะ role.description
 *   ในฐานเก็บแค่ป้ายสั้น ๆ ("ผู้จัดการ") ซึ่งไม่ตอบคำถามของคนที่กำลังแจกสิทธิ์
 */
const roles = ref<RoleOption[]>([])

const selectedRole = computed(() => roles.value.find((r) => r.id === form.roleId) ?? null)

/**
 * ช่องที่ยังขาด - ใช้ทั้งปิดปุ่มและ "บอกว่าขาดอะไร"
 *
 * ★ ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผลคือทางตันของฟอร์มนี้ - มีช่องบังคับกระจายอยู่สองการ์ด
 *   และชุดที่บังคับยังเปลี่ยนตามโหมดที่เลือกอีก คนกรอกจึงมองไม่ออกเองว่าตกตรงไหน
 */
const missing = computed(() => {
  const out: string[] = []
  if (!form.username.trim()) out.push('Username')
  if (!form.displayName.trim()) out.push('ชื่อที่แสดง')
  if (form.password.length < 4) out.push('รหัสผ่าน (อย่างน้อย 4 ตัว)')
  if (form.roleId <= 0) out.push('สิทธิ์การใช้งาน')

  if (mode.value === 'new') {
    if (!emp.firstName.trim()) out.push('ชื่อพนักงาน')
    if (emp.departmentId <= 0) out.push('แผนก')
  }
  if (mode.value === 'link' && linkedEmployeeId.value <= 0) out.push('พนักงานที่จะผูก')

  return out
})

const canSubmit = computed(() => !submitting.value && missing.value.length === 0)

/**
 * สรุปสิ่งที่จะถูกสร้าง - อ่านก่อนกด
 *
 * ★ หน้านี้สร้างของ "สองอย่าง" ในคำสั่งเดียว (พนักงาน + บัญชี) ซึ่งเป็นสิ่งที่ฟอร์ม
 *   สองการ์ดไม่ได้บอกออกมาตรง ๆ เลย - บรรทัดนี้ทำให้คนเห็นผลลัพธ์ก่อนที่มันจะเกิดจริง
 */
const summary = computed(() => {
  const account = form.username.trim() ? `บัญชี ${form.username.trim()}` : 'บัญชีใหม่'
  const role = selectedRole.value ? ` · สิทธิ์ ${selectedRole.value.name}` : ''

  if (mode.value === 'new') {
    const who = [emp.firstName.trim(), emp.lastName.trim()].filter(Boolean).join(' ')
    const dep = departments.value.find((d) => d.id === emp.departmentId)?.name
    return `${account}${role} + พนักงานใหม่${who ? ` ${who}` : ''}${dep ? ` แผนก ${dep}` : ''}`
  }
  if (mode.value === 'link') {
    const who = employeeResults.value.find((e) => e.id === linkedEmployeeId.value)?.name
    return `${account}${role}${who ? ` · ผูกกับ ${who}` : ''}`
  }
  return `${account}${role} · ไม่ผูกพนักงาน`
})

async function onSubmit() {
  errorMsg.value = ''
  successMsg.value = ''
  submitting.value = true
  try {
    const payload: CreateUserPayload = { ...form }

    if (mode.value === 'link') {
      payload.employeeId = linkedEmployeeId.value
    } else if (mode.value === 'new') {
      payload.employee = {
        firstName: emp.firstName.trim(),
        // ส่งเฉพาะช่องที่กรอกจริง - สตริงว่างที่หลุดไปจะกลายเป็น '' ในคอลัมน์ unique
        // (empId/email) แล้วคนที่สองจะสร้างไม่ได้เลยเพราะ '' ชนกับ '' ต่างจาก NULL ที่ซ้ำได้
        ...(emp.lastName.trim() ? { lastName: emp.lastName.trim() } : {}),
        ...(emp.firstNameEn.trim() ? { firstNameEn: emp.firstNameEn.trim() } : {}),
        ...(emp.lastNameEn.trim() ? { lastNameEn: emp.lastNameEn.trim() } : {}),
        ...(emp.empId.trim() ? { empId: emp.empId.trim() } : {}),
        ...(emp.email.trim() ? { email: emp.email.trim() } : {}),
        ...(emp.ownerCode.trim() ? { ownerCode: Number(emp.ownerCode) } : {}),
        departmentId: emp.departmentId,
      }
    }

    const created = await userService.createUser(payload)
    successMsg.value = `สร้างผู้ใช้ ${created.username} เรียบร้อย — กรอกคนต่อไปได้เลย`
    // ล้างฟอร์มให้สร้างคนต่อไปได้ทันที (ยังไม่มีหน้ารายชื่อ user ให้เด้งไป)
    Object.assign(form, emptyUser())
    Object.assign(emp, emptyEmployee())
    linkedEmployeeId.value = 0
    employeeSearch.value = ''
    employeeResults.value = []
    searched.value = false
    showPassword.value = false
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'สร้างผู้ใช้ไม่สำเร็จ'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- ★ สองคอลัมน์บนจอกว้าง: บัญชีผู้ใช้ซ้าย · ข้อมูลพนักงานขวา

       ★ items-start ห้ามถอด — การ์ดสองใบสูงไม่เท่ากันมากและต่างกันตามโหมดที่เลือก
         (โหมด "ไม่ผูก" เหลือแค่กล่องเตือนบรรทัดเดียว) ถ้าปล่อยให้ยืดเท่ากันตามปกติของ
         grid จะได้การ์ดขวาที่ว่างเปล่าครึ่งใบ

       ★ แถบสรุป+ปุ่มยังอยู่นอกกริด เต็มความกว้างเหมือนเดิม — มันสรุปของทั้งสองการ์ด
         ถ้าดันเข้าไปอยู่ในคอลัมน์ใดคอลัมน์หนึ่งจะอ่านเหมือนเป็นปุ่มของการ์ดนั้น

       ★ จอต่ำกว่า lg ยุบเป็นคอลัมน์เดียวเรียงบน→ล่างตามลำดับการกรอก -->
  <form class="w-full max-w-6xl space-y-5" @submit.prevent="onSubmit">
    <div class="grid items-start gap-5 lg:grid-cols-2">
      <!-- ══ 1 · บัญชีผู้ใช้ ══════════════════════════════════════════════ -->
      <section class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4 p-5 sm:p-6">
          <div class="flex items-center gap-2">
            <span class="badge badge-neutral badge-sm">1</span>
            <h2 class="text-lg font-semibold">บัญชีผู้ใช้</h2>
          </div>

          <!-- ★ lg:grid-cols-1 ไม่ใช่การพิมพ์เกิน — ที่ lg พอดีเป๊ะ กริดนอกเพิ่งแตกเป็น
               สองคอลัมน์ (คอลัมน์ละ ~460px) แต่กริดในยังสองช่อง ช่องกรอกจึงเหลือ ~215px
               ซึ่งสั้นจนอ่าน placeholder ไม่จบ ยุบเป็นช่องเดียวเฉพาะช่วงนั้นแล้วแตกอีกทีที่ xl -->
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <!-- ★ label + for/id ไม่ใช่ <legend> ซ้อนกันหลายใบใน fieldset เดียวแบบของเดิม
                 fieldset มี legend ได้ใบเดียวและต้องเป็นลูกตัวแรก — ที่เกินมาเป็น HTML
                 ที่ไม่ถูกต้อง และ screen reader อ่านชื่อกลุ่มผิดไปทั้งกลุ่ม -->
            <div>
              <label class="label" for="u-username">
                Username <span class="text-error">*</span>
              </label>
              <input
                id="u-username"
                v-model="form.username"
                class="input w-full"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                placeholder="เช่น somchai.s"
                required
              />
            </div>

            <div>
              <label class="label" for="u-display">
                ชื่อที่แสดง <span class="text-error">*</span>
              </label>
              <input
                id="u-display"
                v-model="form.displayName"
                class="input w-full"
                placeholder="ชื่อที่ขึ้นในระบบ"
                required
              />
            </div>
          </div>

          <p class="text-xs text-base-content/60">
            ชื่อที่แสดงคือชื่อบัญชีที่ผู้ใช้ตั้งเอง 
          </p>

          <div>
            <label class="label" for="u-password">
              รหัสผ่านเริ่มต้น <span class="text-error">*</span>
            </label>
            <!-- ★ ต้องดูรหัสที่พิมพ์ได้ — คนกรอกหน้านี้ตั้งรหัสให้ "คนอื่น" แล้วต้องเอาไป
                 บอกต่อ พิมพ์ผิดแล้วไม่มีทางรู้จนกว่าเจ้าตัวจะล็อกอินไม่ได้แล้วโทรกลับมา -->
            <label class="input group w-full">
              <Icon
                icon="lucide:key-round"
                class="size-4 text-base-content/40 transition-colors group-focus-within:text-primary"
              />
              <input
                id="u-password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                minlength="4"
                placeholder="อย่างน้อย 4 ตัวอักษร"
                required
              />
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :aria-label="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
                :aria-pressed="showPassword"
                tabindex="-1"
                @click="showPassword = !showPassword"
              >
                <Icon :icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
              </button>
            </label>
          </div>

          <!-- ★ สิทธิ์เป็นช่องที่ "กรอกผิดแล้วเจ็บที่สุด" ในหน้านี้ จึงไม่ใช่ <select> แบบเดิม
               ที่เห็นทีละบรรทัดและไม่บอกว่าแต่ละอันแปลว่าอะไร - กางออกมาให้เทียบกันได้ -->
          <fieldset class="fieldset">
            <legend class="fieldset-legend">
              สิทธิ์การใช้งาน <span class="text-error">*</span>
            </legend>
            <div class="grid gap-2">
              <label
                v-for="r in roles"
                :key="r.id"
                class="flex cursor-pointer items-start gap-3 rounded-box border px-3 py-2.5 transition-colors"
                :class="
                  form.roleId === r.id
                    ? 'border-primary bg-primary/5'
                    : 'border-base-300 hover:bg-base-200'
                "
              >
                <input
                  v-model="form.roleId"
                  type="radio"
                  name="roleId"
                  class="radio radio-sm radio-primary mt-0.5 shrink-0"
                  :value="r.id"
                />
                <span class="min-w-0">
                  <span class="block text-sm font-medium">{{ r.name }}</span>
                  <span class="block text-xs leading-relaxed text-base-content/60">
                    {{ roleDetail(r.name, r.description) }}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        </div>
      </section>

      <!-- ══ 2 · ข้อมูลพนักงาน ════════════════════════════════════════════ -->
      <section class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4 p-5 sm:p-6">
          <div class="flex items-center gap-2">
            <span class="badge badge-neutral badge-sm">2</span>
            <h2 class="text-lg font-semibold">ข้อมูลพนักงาน</h2>
          </div>

          <div>
            <div role="tablist" class="tabs tabs-box tabs-sm">
              <button
                v-for="m in MODES"
                :key="m.key"
                type="button"
                role="tab"
                class="tab"
                :class="{ 'tab-active': mode === m.key }"
                :aria-selected="mode === m.key"
                @click="mode = m.key"
              >
                {{ m.label }}
              </button>
            </div>
            <!-- ★ คำอธิบายอยู่ "ใต้แท็บ" ไม่ใช่ในเนื้อแท็บ - คนต้องอ่านได้ว่าโหมดที่กำลัง
                 เลือกอยู่ทำอะไร โดยไม่ต้องกดสลับไปมาเพื่อเดา -->
            <p class="mt-2 text-xs text-base-content/60">{{ modeHint }}</p>
          </div>

          <!-- โหมด new -->
          <!-- เหตุผลของ lg:grid-cols-1 เหมือนการ์ดซ้าย (ดูหมายเหตุที่นั่น) -->
          <div v-if="mode === 'new'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <label class="label" for="e-first">ชื่อ (ไทย) <span class="text-error">*</span></label>
              <input id="e-first" v-model="emp.firstName" class="input w-full" required />
            </div>
            <div>
              <label class="label" for="e-last">นามสกุล (ไทย)</label>
              <input id="e-last" v-model="emp.lastName" class="input w-full" />
            </div>
            <div>
              <label class="label" for="e-firsten">First name (EN)</label>
              <input id="e-firsten" v-model="emp.firstNameEn" class="input w-full" />
            </div>
            <div>
              <label class="label" for="e-lasten">Last name (EN)</label>
              <input id="e-lasten" v-model="emp.lastNameEn" class="input w-full" />
            </div>

            <div>
              <label class="label" for="e-empid">รหัสพนักงาน (HR)</label>
              <input id="e-empid" v-model="emp.empId" class="input w-full" placeholder="0010001" />
              <p class="mt-1 text-xs text-base-content/60">ตัวอักษรผสมได้ · ห้ามซ้ำ</p>
            </div>
            <div>
              <label class="label" for="e-owner">OwnerCode (SAP)</label>
              <input
                id="e-owner"
                v-model="emp.ownerCode"
                type="number"
                class="input w-full"
                placeholder="ไม่รู้ก็เว้นไว้"
              />
              <p class="mt-1 text-xs text-base-content/60">ห้ามซ้ำ</p>
            </div>

            <div class="sm:col-span-2">
              <label class="label" for="e-email">อีเมล</label>
              <input
                id="e-email"
                v-model="emp.email"
                type="email"
                class="input w-full"
                placeholder="name@company.com"
              />
              <p class="mt-1 text-xs text-base-content/60">
                ไม่กรอกก็สร้างได้ แต่จะไม่ได้รับอีเมลแจ้งผลจากระบบ
              </p>
            </div>

            <div class="sm:col-span-2">
              <label class="label" for="e-dep">แผนก <span class="text-error">*</span></label>
              <select id="e-dep" v-model="emp.departmentId" class="select w-full" required>
                <option disabled :value="0">— เลือกแผนก —</option>
                <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </div>
          </div>

          <!-- โหมด link -->
          <div v-else-if="mode === 'link'">
            <label class="label" for="e-search">ค้นหาพนักงาน</label>
            <div class="join w-full">
              <input
                id="e-search"
                v-model="employeeSearch"
                class="input join-item w-full"
                placeholder="พิมพ์ชื่อหรือรหัสพนักงาน แล้วกด Enter"
                @keyup.enter="searchEmployees"
              />
              <button
                type="button"
                class="btn join-item"
                :disabled="searching || !employeeSearch.trim()"
                @click="searchEmployees"
              >
                <span v-if="searching" class="loading loading-spinner loading-xs"></span>
                <Icon v-else icon="lucide:search" class="size-4" />
                ค้นหา
              </button>
            </div>

            <!-- ★ ลิสต์ที่กดเลือกได้ ไม่ใช่ <select size="6"> แบบเดิม - ของเดิมเลือกแล้ว
                 ไม่เห็นว่าเลือกใครอยู่เมื่อเลื่อนพ้นตา และแสดงได้แค่บรรทัดข้อความเดียว -->
            <ul
              v-if="employeeResults.length"
              class="mt-2 max-h-60 divide-y divide-base-200 overflow-y-auto rounded-box border border-base-300"
            >
              <li v-for="e in employeeResults" :key="e.id">
                <label
                  class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors"
                  :class="linkedEmployeeId === e.id ? 'bg-primary/10' : 'hover:bg-base-200'"
                >
                  <input
                    v-model="linkedEmployeeId"
                    type="radio"
                    name="linkedEmployee"
                    class="radio radio-xs radio-primary shrink-0"
                    :value="e.id"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ e.name }}</span>
                  <span v-if="e.empId" class="badge badge-ghost badge-sm shrink-0 tabular-nums">
                    {{ e.empId }}
                  </span>
                </label>
              </li>
            </ul>

            <p
              v-else-if="searched && !searching"
              class="mt-2 flex items-center gap-1.5 text-sm text-base-content/60"
            >
              <Icon icon="lucide:search-x" class="size-4 shrink-0" />
              ไม่พบพนักงานที่ตรงกับคำค้น
            </p>
          </div>

          <!-- โหมด none -->
          <div v-else role="alert" class="alert alert-warning alert-soft">
            <Icon icon="lucide:triangle-alert" class="size-5 shrink-0" />
            <span class="text-sm">
              บัญชีนี้จะไม่ผูกกับพนักงาน ไม่มีชื่อจริง ไม่มีอีเมล และจะไม่ได้รับแจ้งเตือนใด ๆ
              เหมาะกับ service account เท่านั้น
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- ══ แถบสรุป + ปุ่มสร้าง ═══════════════════════════════════════════
         ★ อยู่ "นอกกริด" เต็มความกว้าง ไม่ใช่ท้ายคอลัมน์ใดคอลัมน์หนึ่ง — มันสรุปของทั้ง
           สองการ์ด (บัญชี + พนักงาน) ถ้าไปห้อยท้ายคอลัมน์ขวาแบบเวอร์ชันแรกสุด จะอ่าน
           เหมือนเป็นปุ่มของการ์ดนั้นใบเดียว และปุ่มจะไปลอยอยู่กลางหน้าในสายตาคนกรอก
         ★ กล่องแจ้งผลอยู่ติดกับปุ่ม - คนกดปุ่มแล้วสายตาอยู่ที่ปุ่ม ถ้า error ไปขึ้นที่อื่น
           จะไม่มีใครเห็น -->
    <section class="card border border-base-300 bg-base-200">
      <div class="card-body gap-3 p-5 sm:p-6">
        <div v-if="errorMsg" role="alert" class="alert alert-error alert-soft">
          <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>
        <div v-if="successMsg" role="alert" class="alert alert-success alert-soft">
          <Icon icon="lucide:circle-check" class="size-5 shrink-0" />
          <span>{{ successMsg }}</span>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0 text-sm">
            <template v-if="missing.length">
              <span class="text-base-content/60">ยังขาด:</span>
              <span class="ml-1">{{ missing.join(' · ') }}</span>
            </template>
            <template v-else>
              <span class="text-base-content/60">จะสร้าง:</span>
              <span class="ml-1 font-medium">{{ summary }}</span>
            </template>
          </div>

          <button
            type="submit"
            class="btn btn-primary w-full transition-transform active:scale-[0.98] sm:w-auto"
            :disabled="!canSubmit"
          >
            <span v-if="submitting" class="loading loading-spinner loading-sm"></span>
            <Icon v-else icon="lucide:user-plus" class="size-4" />
            {{ submitting ? 'กำลังสร้าง...' : 'สร้างบัญชี' }}
          </button>
        </div>
      </div>
    </section>
  </form>
</template>
