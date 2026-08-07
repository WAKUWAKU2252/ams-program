<script setup lang="ts">
import { ref, watch } from 'vue'

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

// จับตาดูค่า error จาก Parent
watch(() => props.error, (newVal) => {
  if (newVal) {
    isShaking.value = true
    setTimeout(() => {
      isShaking.value = false
    }, 500)
  }
})

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
    isShaking.value = true;
    setTimeout(() => {
      isShaking.value = false;
    }, 500);
    return; 
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
  
  emit('clear-error'); 
}
</script>

<template>
  <section class="flex flex-col items-center">
    <div class="space-y-6 text-left w-[400px]">
      
      <!-- Username Field -->
      <div class="space-y-1"> <!-- เปลี่ยนจาก space-y-2 เป็น 1 เพื่อให้ Error อยู่ชิด Input -->
        <label class="block text-[15px] font-medium text-black" for="username">
          Username
        </label>
        <input 
          v-model="username"
          type="text" 
          name="username" 
          placeholder="Enter your username" 
          required 
          @input="clearError('username')"
          :class="[
            'w-full h-[45px] px-4 rounded-2xl bg-[#F8FAFC] text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--button-hover)] transition-all',
            (usernameError || error) ? 'border border-red-500' : 'border border-transparent', 
            ((usernameError || error) && isShaking) ? 'shake' : ''
          ]" 
        />
        <!-- แสดง Error เฉพาะช่อง Username -->
        <p v-if="usernameError" class="text-red-500 text-sm pl-2">
          {{ usernameError }}
        </p>
      </div>

      <!-- Password Field -->
      <div class="space-y-1">
        <label class="block text-[15px] font-medium text-black" for="password">
          Password
        </label>
        
        <!-- Wrap BOTH input and button inside the relative div -->
        <div class="relative">
          <input  
            v-model="password"
            :type="showPassword ? 'text' : 'password'" 
            name="password" 
            placeholder="Enter your password" 
            required 
            @input="clearError('password')"
            :class="[
              'w-full h-[45px] px-4 pr-12 rounded-2xl bg-[#F8FAFC] text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--button-hover)] transition-all', 
              (passwordError || error) ? 'border border-red-500' : 'border border-transparent',
              ((passwordError || error) && isShaking) ? 'shake' : ''
            ]"
          >
          
          <button
            type="button"
            @click="showPassword = !showPassword"
            class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black focus:outline-none"
          >
            <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.036 12.322a1.012 1.012 0 010-.644C3.399 8.049 7.21 5 12 5c4.79 0 8.601 3.049 9.964 6.678a1.012 1.012 0 010 .644C20.601 15.951 16.79 19 12 19c-4.79 0-8.601-3.049-9.964-6.678z" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"></path>
            </svg>
          </button>
        </div> <!-- End of relative div -->

        <!-- แสดง Error เฉพาะช่อง Password (ย้ายมาไว้ข้างนอก relative div) -->
        <p v-if="passwordError" class="text-red-500 text-sm pl-2">
          {{ passwordError }}
        </p>
      </div>

      <!-- แสดง Error จาก API (Parent) เช่น รหัสผ่านไม่ถูกต้อง -->
      <div v-if="error" class="text-red-500 text-sm font-medium text-center">
        {{ error }}
      </div>

      <button
        :disabled="loading"
        @click="submit"
        class="w-full h-[45px] bg-[var(--button-hover)] bg-blue-600 text-white font-medium rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all"
      >
        {{ loading ? 'กำลังเข้าสู่ระบบ...' : 'Login' }}
      </button>
    </div>
  </section>
</template>
