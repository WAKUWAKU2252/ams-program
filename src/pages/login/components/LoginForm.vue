<script setup lang="ts">
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: [{ username: string; password: string }]
  'clear-error': []
}>()

const username = ref('')
const password = ref('')
const showPassword = ref(false)

// แยก State สำหรับเก็บ Error แต่ละช่อง
const usernameError = ref('')
const passwordError = ref('')
const isShaking = ref(false)

function shake() {
  isShaking.value = true
  setTimeout(() => {
    isShaking.value = false
  }, 500)
}

// จับตาดูค่า error จาก Parent
watch(
  () => props.error,
  (newVal) => {
    if (newVal) shake()
  },
)

function submit() {
  // รีเซ็ต Error ท้องถิ่นก่อนตรวจสอบใหม่
  usernameError.value = ''
  passwordError.value = ''
  let hasLocalError = false

  // ตรวจสอบแยกแต่ละกรณี
  if (!username.value) {
    usernameError.value = 'กรุณากรอก Username'
    hasLocalError = true
  }

  if (!password.value) {
    passwordError.value = 'กรุณากรอก Password'
    hasLocalError = true
  }

  // หากมีช่องใดช่องหนึ่งว่าง ให้แสดงแอนิเมชันสั่นและหยุดทำงาน
  if (hasLocalError) {
    shake()
    return
  }

  emit('submit', {
    username: username.value,
    password: password.value,
  })
}

// รับ Parameter เพื่อเลือกลบ Error เฉพาะช่องที่กำลังพิมพ์
function clearError(field: 'username' | 'password') {
  if (field === 'username') usernameError.value = ''
  if (field === 'password') passwordError.value = ''

  emit('clear-error')
}
</script>

<template>
  <!-- novalidate: ปล่อยให้ submit() ตรวจเองแล้วโชว์ข้อความไทย แทน tooltip ของ browser
       (daisyUI validator ยังย้อมขอบแดงให้จาก :user-invalid ตามปกติ) -->
  <form class="w-full max-w-sm" novalidate @submit.prevent="submit">
    <h2 class="mb-1 text-2xl font-semibold">เข้าสู่ระบบ</h2>
    <p class="mb-6 text-sm text-base-content/60">กรอกบัญชีผู้ใช้ขององค์กรเพื่อเข้าใช้งาน</p>

    <fieldset class="fieldset">
      <!-- Username -->
      <legend class="fieldset-legend">Username</legend>
      <label
        class="input validator w-full"
        :class="[
          usernameError || error ? 'input-error' : '',
          (usernameError || error) && isShaking ? 'shake' : '',
        ]"
      >
        <Icon icon="lucide:user" class="opacity-50" />
        <input
          v-model="username"
          type="text"
          name="username"
          placeholder="Enter your username"
          required
          pattern="[A-Za-z][A-Za-z0-9\-]*"
          minlength="3"
          maxlength="30"
          title="Only letters, numbers or dash"
          @input="clearError('username')"
        />
      </label>
      <p v-if="usernameError" class="label text-error">{{ usernameError }}</p>
      <p v-else class="validator-hint">
        Must be 3 to 30 characters containing only letters, numbers or dash
      </p>

      <!-- Password -->
      <legend class="fieldset-legend">Password</legend>
      <label
        class="input validator w-full"
        :class="[
          passwordError || error ? 'input-error' : '',
          (passwordError || error) && isShaking ? 'shake' : '',
        ]"
      >
        <Icon icon="lucide:lock" class="opacity-50" />
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="password"
          placeholder="Enter your password"
          required
          minlength="4"
          @input="clearError('password')"
        />
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          :aria-label="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
          @click="showPassword = !showPassword"
        >
          <Icon :icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'" />
        </button>
      </label>
      <p v-if="passwordError" class="label text-error">{{ passwordError }}</p>
      <p v-else class="validator-hint">Must be at least 4 characters</p>
    </fieldset>

    <!-- Error จาก API (Parent) เช่น รหัสผ่านไม่ถูกต้อง -->
    <div v-if="error" role="alert" class="alert alert-error alert-soft mt-4">
      <Icon icon="lucide:circle-alert" />
      <span>{{ error }}</span>
    </div>

    <button type="submit" class="btn btn-primary btn-block mt-6" :disabled="loading">
      <span v-if="loading" class="loading loading-spinner loading-sm"></span>
      {{ loading ? 'กำลังเข้าสู่ระบบ...' : 'Login' }}
    </button>
  </form>
</template>
