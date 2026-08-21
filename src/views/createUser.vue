<script setup lang="ts">
// สร้างบัญชีผู้ใช้ — เฉพาะ ADMIN (route meta.roles + requireRole('ADMIN') ฝั่ง backend)
//
// ทางเข้าปกติของข้อมูลพนักงานคือสคริปต์ import จาก HR/SAP หน้านี้เป็นทางลัดสำหรับคนที่
// ยังไม่มีในต้นทาง — สร้าง employee + user ในคำสั่งเดียว (backend ห่อเป็น transaction
// ให้แล้ว ล้มกลางทางไม่เหลือพนักงานผีค้าง)
//
// ⚠️ ข้อมูลพนักงานที่กรอกที่นี่อาจถูก sync ทับทีหลังถ้าคนคนนั้นโผล่ใน SAP ด้วย ownerCode
// เดียวกัน — ถือเป็นของชั่วคราวจนกว่า HR จะส่งของจริงมา
import { reactive, ref, onMounted, computed } from 'vue'
import { userService, type CreateUserPayload } from '@/services/user.service'
import { listDepartments, listEmployees } from '@/services/master.service'
import type { DepartmentOption, EmployeeOption } from '@/services/master.service'
import { ApiError } from '@/services/httpClient'
import { Icon } from '@iconify/vue'

const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

/**
 * โหมดของช่องพนักงาน — backend รับได้อย่างใดอย่างหนึ่งเท่านั้น ส่งทั้งคู่ได้ 400
 *   new   สร้างพนักงานใหม่ไปพร้อมกัน (ค่าตั้งต้น — เป็นเหตุผลที่หน้านี้มีอยู่)
 *   link  ผูกกับพนักงานที่มีอยู่แล้วในระบบ
 *   none  ไม่ผูกใคร (service account) — จะไม่มีอีเมล ไม่มีชื่อจริง และรับแจ้งเตือนไม่ได้
 */
type EmployeeMode = 'new' | 'link' | 'none'
const mode = ref<EmployeeMode>('new')

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

async function searchEmployees() {
  const search = employeeSearch.value.trim()
  if (!search) {
    employeeResults.value = []
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
  }
}

const departments = ref<DepartmentOption[]>([])
onMounted(async () => {
  try {
    departments.value = await listDepartments()
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'โหลดรายชื่อแผนกไม่สำเร็จ'
  }
})

// ปุ่มกดได้เมื่อครบเงื่อนไขของโหมดที่เลือก — ปล่อยให้กดแล้วไปเจอ 422 คือเสียเที่ยวเปล่า
const canSubmit = computed(() => {
  if (submitting.value) return false
  if (!form.username.trim() || !form.displayName.trim() || form.password.length < 4) return false
  if (form.roleId <= 0) return false
  if (mode.value === 'new') return emp.firstName.trim().length > 0 && emp.departmentId > 0
  if (mode.value === 'link') return linkedEmployeeId.value > 0
  return true
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
        // ส่งเฉพาะช่องที่กรอกจริง — สตริงว่างที่หลุดไปจะกลายเป็น '' ในคอลัมน์ unique
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
    successMsg.value = `สร้างผู้ใช้ ${created.username} เรียบร้อย`
    // ล้างฟอร์มให้สร้างคนต่อไปได้ทันที (ยังไม่มีหน้ารายชื่อ user ให้เด้งไป)
    Object.assign(form, emptyUser())
    Object.assign(emp, emptyEmployee())
    linkedEmployeeId.value = 0
    employeeSearch.value = ''
    employeeResults.value = []
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : 'สร้างผู้ใช้ไม่สำเร็จ'
  } finally {
    submitting.value = false
  }
}

// id ต้องตรงกับตาราง role ใน DB ซึ่งสร้างจาก db:import:role (เรียง EMPLOYEE→MANAGER→FINANCE→ADMIN)
// TODO: ยังไม่มี GET /master/roles — พอมีแล้วให้ดึงมาแทนรายการฝังนี้ ไม่งั้น id เพี้ยนแล้วจะได้ 400 "ไม่พบ role id"
const roles = [
  { value: 'EMPLOYEE', roleId: 1 },
  { value: 'MANAGER', roleId: 2 },
  { value: 'FINANCE', roleId: 3 },
  { value: 'ADMIN', roleId: 4 },
]
</script>

<template>
  <div class="p-6">
    <div class="card w-full max-w-2xl bg-base-100 shadow-xl">
      <form class="card-body" @submit.prevent="onSubmit">
        <h1 class="card-title">Create User</h1>
        <p class="text-sm text-base-content/60">
          สร้างบัญชีผู้ใช้ใหม่ — เฉพาะผู้ดูแลระบบ (ADMIN)
        </p>

        <!-- ── บัญชีผู้ใช้ -->
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Username</legend>
          <input v-model="form.username" class="input w-full" placeholder="Username" required />

          <legend class="fieldset-legend">Display name</legend>
          <input v-model="form.displayName" class="input w-full" placeholder="Display name" required />
          <p class="label">ชื่อบัญชีที่ผู้ใช้ตั้งเอง — ชื่อที่โชว์ในเอกสาร/อีเมลใช้ชื่อพนักงานแทน</p>

          <legend class="fieldset-legend">Password</legend>
          <input v-model="form.password" type="password" class="input w-full" placeholder="Password"
            minlength="4" required />

          <legend class="fieldset-legend">Role</legend>
          <select v-model="form.roleId" class="select w-full" required>
            <option disabled :value="0">-- Select Role --</option>
            <option v-for="role in roles" :key="role.roleId" :value="role.roleId">
              {{ role.value }}
            </option>
          </select>
        </fieldset>

        <div class="divider">ข้อมูลพนักงาน</div>

        <!-- ── โหมด: สร้างใหม่ / ผูกคนเดิม / ไม่ผูก -->
        <div role="tablist" class="tabs tabs-box tabs-sm">
          <button type="button" role="tab" class="tab" :class="{ 'tab-active': mode === 'new' }"
            @click="mode = 'new'">
            สร้างพนักงานใหม่
          </button>
          <button type="button" role="tab" class="tab" :class="{ 'tab-active': mode === 'link' }"
            @click="mode = 'link'">
            ผูกพนักงานที่มีอยู่
          </button>
          <button type="button" role="tab" class="tab" :class="{ 'tab-active': mode === 'none' }"
            @click="mode = 'none'">
            ไม่ผูก
          </button>
        </div>

        <!-- โหมด new -->
        <fieldset v-if="mode === 'new'" class="fieldset">
          <div class="grid gap-x-4 sm:grid-cols-2">
            <div>
              <legend class="fieldset-legend">ชื่อ (ไทย) *</legend>
              <input v-model="emp.firstName" class="input w-full" placeholder="ณัฐดนัย" required />
            </div>
            <div>
              <legend class="fieldset-legend">นามสกุล (ไทย)</legend>
              <input v-model="emp.lastName" class="input w-full" placeholder="ศรีพล" />
            </div>
            <div>
              <legend class="fieldset-legend">First name (EN)</legend>
              <input v-model="emp.firstNameEn" class="input w-full" placeholder="Natdanai" />
            </div>
            <div>
              <legend class="fieldset-legend">Last name (EN)</legend>
              <input v-model="emp.lastNameEn" class="input w-full" placeholder="Sripol" />
            </div>
            <div>
              <legend class="fieldset-legend">รหัสพนักงาน (HR)</legend>
              <input v-model="emp.empId" class="input w-full" placeholder="0010001" />
              <p class="label">เป็นตัวอักษรผสมได้ เช่น KTP1 — ห้ามซ้ำกับคนอื่น</p>
            </div>
            <div>
              <legend class="fieldset-legend">OwnerCode (SAP)</legend>
              <input v-model="emp.ownerCode" type="number" class="input w-full" placeholder="ไม่รู้ก็เว้นไว้" />
              <p class="label">รหัสที่ SAP ใช้อ้างผู้ขอบน PO — ห้ามซ้ำ</p>
            </div>
          </div>

          <legend class="fieldset-legend">อีเมล</legend>
          <input v-model="emp.email" type="email" class="input w-full" placeholder="name@ubisasia.com" />
          <!-- ★ อีเมลของ "พนักงาน" คือแหล่งเดียวของทั้งระบบ (0005) ไม่มีก็สร้างได้
               แต่คนนั้นจะไม่ได้รับเมลแจ้งผลอะไรเลย และบัญชีจะปิดงานให้ไม่ได้ตามปกติ -->
          <p class="label">ไม่กรอกก็สร้างได้ แต่คนนี้จะไม่ได้รับอีเมลแจ้งผลจากระบบเลย</p>

          <legend class="fieldset-legend">แผนก *</legend>
          <select v-model="emp.departmentId" class="select w-full" required>
            <option disabled :value="0">-- เลือกแผนก --</option>
            <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </fieldset>

        <!-- โหมด link -->
        <fieldset v-else-if="mode === 'link'" class="fieldset">
          <legend class="fieldset-legend">ค้นหาพนักงาน</legend>
          <div class="join w-full">
            <input v-model="employeeSearch" class="input join-item w-full" placeholder="พิมพ์ชื่อหรือรหัสพนักงาน"
              @keyup.enter="searchEmployees" />
            <button type="button" class="btn join-item" :disabled="searching" @click="searchEmployees">
              <span v-if="searching" class="loading loading-spinner loading-xs" />
              <Icon v-else icon="lucide:search" />
            </button>
          </div>

          <select v-if="employeeResults.length" v-model="linkedEmployeeId" class="select mt-2 w-full" size="6">
            <option v-for="e in employeeResults" :key="e.id" :value="e.id">
              {{ e.name }}{{ e.empId ? ` · ${e.empId}` : '' }}
            </option>
          </select>
          <p v-else-if="employeeSearch && !searching" class="label">ไม่พบพนักงานที่ตรงกับคำค้น</p>
        </fieldset>

        <!-- โหมด none -->
        <div v-else role="alert" class="alert alert-warning alert-soft">
          <Icon icon="mdi:alert-outline" class="size-5" />
          <span class="text-sm">
            บัญชีนี้จะไม่ผูกกับพนักงาน — ไม่มีชื่อจริง ไม่มีอีเมล และจะไม่ได้รับแจ้งเตือนใด ๆ
            เหมาะกับ service account เท่านั้น
          </span>
        </div>

        <div v-if="errorMsg" role="alert" class="alert alert-error alert-soft">
          <span>{{ errorMsg }}</span>
        </div>

        <div v-if="successMsg" role="alert" class="alert alert-success alert-soft">
          <span>{{ successMsg }}</span>
        </div>

        <div class="card-actions mt-2 justify-end">
          <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
            <span v-if="submitting" class="loading loading-spinner loading-sm"></span>
            {{ submitting ? 'Saving...' : 'Create' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
