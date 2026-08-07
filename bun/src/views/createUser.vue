<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { userService, type CreateUserPayload } from '@/services/user.service'
import { ApiError } from '@/services/httpClient'

const router = useRouter()
const submitting = ref(false)
const errorMsg = ref('')

const form = reactive<CreateUserPayload>({
    username: '',
    email: '',
    displayName: '',
    firstName: '',
    lastName: '',
    password: '',
    roleId: 0,
    employeeId: null,
})

async function onSubmit() {
    errorMsg.value = ''
    submitting.value = true
    try {
        // ช่องที่ไม่บังคับ ถ้าเว้นว่างให้ส่ง undefined ไม่ใช่ '' — คอลัมน์ใน DB เป็น nullable
        // ส่ง '' ไปจะได้ user ที่ชื่อเป็นสตริงว่าง ซึ่งแยกไม่ออกจาก "ยังไม่กรอก"
        await userService.createUser({
            ...form,
            firstName: form.firstName?.trim() || undefined,
            lastName: form.lastName?.trim() || undefined,
        })
        router.push('/dashboard') // TODO: เปลี่ยนเป็นหน้ารายชื่อ user เมื่อมี
    } catch (e) {
        errorMsg.value = e instanceof ApiError ? e.message : 'สร้างผู้ใช้ไม่สำเร็จ'
    } finally {
        submitting.value = false
    }
}

const roles = [
    { value: 'EMPLOYEE', roleId: 1 },
    { value: 'MANAGER', roleId: 2 },
    { value: 'FINANCE', roleId: 3 },
    { value: 'ADMIN', roleId: 4 }
]
</script>

<template>
    <div class="flex flex-col items-center justify-center p-6 h-screen w-screen">
        <h1 class="text-xl font-semibold mb-4">Create User</h1>

        <form class="space-y-4" @submit.prevent="onSubmit">
            <input v-model="form.username" placeholder="Username" class="border rounded w-full p-2" required />
            <input v-model="form.email" type="email" placeholder="Email" class="border rounded w-full p-2" required />
            <input v-model="form.displayName" placeholder="Display name" class="border rounded w-full p-2" required />
            <!-- ไม่ required — คอลัมน์เป็น nullable ใน DB (บาง account เช่น service account ไม่มีชื่อจริง) -->
            <input v-model="form.firstName" placeholder="First name" class="border rounded w-full p-2" />
            <input v-model="form.lastName" placeholder="Last name" class="border rounded w-full p-2" />
            <input v-model="form.password" type="password" placeholder="Password" class="border rounded w-full p-2"
                required />
            <select v-model="form.roleId" class="border rounded w-full p-2" required>
                <option disabled :value="0">-- Select Role --</option>

                <option v-for="role in roles" 
                :key="role.roleId" 
                :value="role.roleId">
                    {{ role.value }}
                </option>
            </select>

            <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>

            <button type="submit" :disabled="submitting"
                class="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">
                {{ submitting ? 'Saving...' : 'Create' }}
            </button>
        </form>
    </div>
</template>