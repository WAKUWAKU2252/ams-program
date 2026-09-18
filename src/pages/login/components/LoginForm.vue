<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import ubisLogo from '@/assets/UBIS.png'

const props = defineProps<{
  loading: boolean
  error: string
  /** ล็อกอินผ่านแล้ว กำลังรอ redirect - ใช้สลับปุ่มเป็นสถานะสำเร็จ */
  success: boolean
  /** ข้อความบอกสาเหตุที่ถูกพามาหน้านี้ (เช่น เซสชันหมดอายุ) - ไม่ใช่ error */
  notice: string
}>()

const emit = defineEmits<{
  submit: [{ username: string; password: string }]
  'clear-error': []
}>()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const remember = ref(false)

// แยก State สำหรับเก็บ Error แต่ละช่อง
const usernameError = ref('')
const passwordError = ref('')
const isShaking = ref(false)

// ตรวจตอน blur เฉพาะ "หลังกดปุ่มไปแล้วอย่างน้อยหนึ่งครั้ง" - ถ้าตรวจตั้งแต่ blur แรก
// คนที่กด Tab ผ่านช่องไปดูอย่างอื่นก่อนจะโดนขึ้นแดงใส่ทั้งที่ยังไม่ได้ทำอะไรผิด
const hasSubmitted = ref(false)

const usernameInput = ref<HTMLInputElement | null>(null)
const passwordInput = ref<HTMLInputElement | null>(null)
const forgotDialog = ref<HTMLDialogElement | null>(null)

const year = new Date().getFullYear()

// ── จำชื่อผู้ใช้ (ไม่ใช่รหัสผ่าน) ────────────────────────────────────────────
//
// ★ เก็บ "ชื่อผู้ใช้" อย่างเดียวเท่านั้น ห้ามเพิ่มรหัสผ่านลงช่องนี้ไม่ว่ากรณีใด -
//   localStorage อ่านได้ด้วย JS ทุกตัวใน origin เดียวกัน คนละชั้นความปลอดภัยกับ
//   password manager ของเบราว์เซอร์ (ซึ่งเป็นตัวที่ควรจำรหัสให้ - ดู autocomplete ข้างล่าง)
//
// ★ เขียนตอน "ล็อกอินสำเร็จ" ไม่ใช่ตอนกดปุ่ม - พิมพ์ชื่อผิดแล้วกดส่งไม่ควรถูกจำไว้
//   ให้ผิดซ้ำรอบหน้า
const REMEMBER_KEY = 'ams-last-username'

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    // โหมดส่วนตัว/ปิด storage ของบางเบราว์เซอร์ throw ตั้งแต่ตอนอ่าน - จำไม่ได้ไม่เป็นไร
    // แต่ฟอร์มต้องใช้งานได้ต่อ (เหตุผลเดียวกับ theme.ts)
    return ''
  }
}

function persistRemembered(): void {
  try {
    if (remember.value && username.value) {
      localStorage.setItem(REMEMBER_KEY, username.value)
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }
  } catch {
    // เขียนไม่ได้ = รอบหน้าไม่มีชื่อขึ้นให้ ซึ่งไม่กระทบการเข้าใช้งาน
  }
}

// ── สถานะเน็ต ───────────────────────────────────────────────────────────────
//
// ★ ใช้เตือนเฉย ๆ ห้ามเอาไปปิดปุ่ม - navigator.onLine บอกได้แค่ว่า "มีสายต่ออยู่"
//   ไม่ได้แปลว่าออกไปถึง backend ได้จริง และให้ค่าบวกหลอกได้บน VPN/พร็อกซีบางตัว
//   ถ้าเอาไปปิดปุ่มเมื่อไหร่ จะมีคนกดล็อกอินไม่ได้ทั้งที่เน็ตใช้ได้ปกติ
const online = ref(true)

function syncOnline(): void {
  online.value = navigator.onLine
}

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
    if (!newVal) return
    shake()
    // รหัสผิด = สิ่งที่ต้องแก้คือช่องรหัสผ่านเกือบทุกครั้ง - เลือกข้อความเดิมค้างไว้ให้
    // พิมพ์ทับได้เลย ไม่ต้องเอื้อมไปลบเองก่อน
    passwordInput.value?.select()
  },
)

// ล็อกอินผ่านแล้วค่อยจำชื่อ (ดูเหตุผลที่ REMEMBER_KEY)
watch(
  () => props.success,
  (ok) => {
    if (ok) persistRemembered()
  },
)

onMounted(() => {
  syncOnline()
  window.addEventListener('online', syncOnline)
  window.addEventListener('offline', syncOnline)

  const saved = readRemembered()
  if (saved) {
    username.value = saved
    remember.value = true
    // มีชื่ออยู่แล้ว สิ่งที่เหลือให้ทำคือรหัสผ่าน - เคอร์เซอร์ควรรออยู่ตรงนั้น
    passwordInput.value?.focus()
  } else {
    usernameInput.value?.focus()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('online', syncOnline)
  window.removeEventListener('offline', syncOnline)
})

// ── Caps Lock ───────────────────────────────────────────────────────────────
//
// สาเหตุอันดับหนึ่งของ "รหัสถูกแต่เข้าไม่ได้" ที่ผู้ใช้มองไม่เห็นเอง เพราะช่องรหัสผ่าน
// แสดงเป็นจุดทึบหมด
//
// ★ ต้องอ่านจาก event ไม่ใช่เก็บสถานะเอง - ไม่มี API ไหนบอกสถานะ Caps Lock ตอน focus
//   ได้ ต้องรอปุ่มแรกที่กดเสมอ (ซึ่งเพียงพอ: เตือนก่อนเขากดส่ง)
const capsLockOn = ref(false)

function trackCapsLock(event: KeyboardEvent): void {
  capsLockOn.value = event.getModifierState?.('CapsLock') ?? false
}

function validate(): boolean {
  usernameError.value = username.value.trim() ? '' : 'กรุณากรอก Username'
  passwordError.value = password.value ? '' : 'กรุณากรอก Password'
  return !usernameError.value && !passwordError.value
}

function submit() {
  hasSubmitted.value = true

  // หากมีช่องใดช่องหนึ่งว่าง ให้แสดงแอนิเมชันสั่น พาเคอร์เซอร์ไปช่องแรกที่ผิด แล้วหยุด
  if (!validate()) {
    shake()
    if (usernameError.value) usernameInput.value?.focus()
    else passwordInput.value?.focus()
    return
  }

  emit('submit', {
    username: username.value.trim(),
    password: password.value,
  })
}

// รับ Parameter เพื่อเลือกลบ Error เฉพาะช่องที่กำลังพิมพ์
function clearError(field: 'username' | 'password') {
  if (field === 'username') usernameError.value = ''
  if (field === 'password') passwordError.value = ''

  emit('clear-error')
}

function validateOnBlur(field: 'username' | 'password') {
  if (!hasSubmitted.value) return
  if (field === 'username') {
    usernameError.value = username.value.trim() ? '' : 'กรุณากรอก Username'
  } else {
    passwordError.value = password.value ? '' : 'กรุณากรอก Password'
  }
}
</script>

<template>
  <form class="w-full max-w-sm" novalidate @submit.prevent="submit">
    <!-- แบรนด์ — อยู่ในฟอร์มไม่ใช่บนรูป เพราะบนจอเล็กแผงรูปยุบเหลือแถบเตี้ย
         โลโก้บนนั้นจะเล็กจนอ่านไม่ออก ตรงนี้เห็นเท่ากันทุกขนาดจอ -->
    <div class="rise mb-8 flex items-center gap-3" style="--rise-delay: 60ms">
      <img :src="ubisLogo" alt="UBIS" class="h-7 w-auto" />
      <span class="h-6 w-px bg-base-300" aria-hidden="true"></span>
      <span class="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-base-content/45">
        Asset Management
      </span>
    </div>

    <div class="rise mb-6" style="--rise-delay: 120ms">
      <h1 class="font-sans text-4xl font-semibold tracking-tight">Welcome back</h1>
      <p class="mt-2 text-sm text-base-content/55">
        เข้าสู่ระบบด้วยบัญชีผู้ใช้ของบริษัทเพื่อจัดการทะเบียนสินทรัพย์
      </p>
    </div>

    <!-- เหตุผลที่ถูกพามาหน้านี้ (เซสชันหมดอายุ ฯลฯ) - เป็นข้อมูล ไม่ใช่ความผิดของผู้ใช้
         จึงเป็น info ไม่ใช่ error และไม่สั่น -->

    <fieldset class="fieldset rise" style="--rise-delay: 200ms">
      <!-- Username -->
      <legend class="fieldset-legend">Username</legend>
      <!-- group = ให้ไอคอนซ้ายเปลี่ยนสีตามตอนที่ช่องนี้ถูก focus (focus จริงอยู่ที่ <input>
           ข้างใน ไม่ใช่ที่ <label> ตัวนี้ จึงต้องเป็น group-focus-within ไม่ใช่ focus:) -->
      <label
        class="input group w-full transition-shadow duration-200 focus-within:shadow-md"
        :class="[
          usernameError || error ? 'input-error' : '',
          (usernameError || error) && isShaking ? 'shake' : '',
        ]"
      >
        <Icon
          icon="lucide:user"
          class="size-4 text-base-content/40 transition-colors group-focus-within:text-primary"
        />
        <!-- ★ ไม่มี pattern/minlength แล้ว (เดิมบังคับ [A-Za-z][A-Za-z0-9-]* และอย่างน้อย
             3 ตัว) - backend รับ username ยาว 1-100 ตัวอะไรก็ได้ และชื่อผู้ใช้ชุดที่ import
             มาจากระบบเดิมไม่ได้อยู่ในรูปนั้นทั้งหมด กฎที่เข้มกว่าฝั่ง server จึงทำได้อย่างเดียว
             คือขึ้นแดงใส่ชื่อที่ล็อกอินได้จริง
             ★ autocomplete="username" ทำให้ password manager จับคู่ช่องนี้กับรหัสได้ถูก -->
        <input
          ref="usernameInput"
          v-model="username"
          type="text"
          name="username"
          placeholder="Enter your username"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          :disabled="loading || success"
          @input="clearError('username')"
          @blur="validateOnBlur('username')"
        />
      </label>
      <p v-if="usernameError" class="label text-error">{{ usernameError }}</p>

      <!-- Password -->
      <legend class="fieldset-legend">Password</legend>
      <label
        class="input group w-full transition-shadow duration-200 focus-within:shadow-md"
        :class="[
          passwordError || error ? 'input-error' : '',
          (passwordError || error) && isShaking ? 'shake' : '',
        ]"
      >
        <Icon
          icon="lucide:lock"
          class="size-4 text-base-content/40 transition-colors group-focus-within:text-primary"
        />
        <input
          ref="passwordInput"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          name="password"
          placeholder="Enter your password"
          autocomplete="current-password"
          enterkeyhint="go"
          :disabled="loading || success"
          @input="clearError('password')"
          @blur="validateOnBlur('password')"
          @keyup="trackCapsLock"
          @keydown="trackCapsLock"
        />
        <!-- tabindex="-1" ตั้งใจ - ปุ่มดูรหัสไม่ควรขวางทางคนที่กด Tab จากช่องรหัสผ่าน
             ไปยังปุ่มเข้าสู่ระบบ ซึ่งเป็นเส้นทางหลักของคนที่พิมพ์เร็ว -->
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
      <p v-if="passwordError" class="label text-error">{{ passwordError }}</p>

      <!-- Caps Lock: เตือนก่อนกดส่ง ไม่ใช่หลังโดนปฏิเสธ -->
      <Transition name="hint">
        <p v-if="capsLockOn && !passwordError" class="label gap-1.5 text-warning">
          <Icon icon="lucide:arrow-big-up" class="size-4 shrink-0" />
          Caps Lock เปิดอยู่
        </p>
      </Transition>
    </fieldset>

    <div class="rise mt-3 flex items-center justify-between gap-3" style="--rise-delay: 260ms">
      <label class="label cursor-pointer gap-2 text-sm">
        <input v-model="remember" type="checkbox" class="checkbox checkbox-xs checkbox-primary" />
        <span>จดจำชื่อผู้ใช้</span>
      </label>

      <button
        type="button"
        class="link link-hover text-sm text-base-content/55 hover:text-base-content"
        @click="forgotDialog?.showModal()"
      >
        ลืมรหัสผ่าน?
      </button>
    </div>

    <!-- เตือนเน็ตหลุดก่อนกดส่ง - ไม่งั้นจะได้ "เข้าสู่ระบบไม่สำเร็จ" ซึ่งอ่านเหมือนรหัสผิด -->
    <Transition name="hint">
      <div v-if="!online" role="status" class="alert alert-warning alert-soft mt-4 py-2 text-sm">
        <Icon icon="lucide:wifi-off" class="size-4 shrink-0" />
        <span>ตอนนี้เครื่องไม่ได้เชื่อมต่อเครือข่าย — ล็อกอินอาจไม่สำเร็จ</span>
      </div>
    </Transition>

    <!-- Error จาก API (Parent) เช่น รหัสผ่านไม่ถูกต้อง -->
    <Transition name="hint">
      <div v-if="error" role="alert" class="alert alert-error alert-soft mt-4">
        <Icon icon="lucide:circle-alert" class="size-5 shrink-0" />
        <span>{{ error }}</span>
      </div>
    </Transition>

    <!-- ★ สามสถานะในปุ่มเดียว: ว่าง → กำลังส่ง → สำเร็จ
         สถานะ "สำเร็จ" มีอยู่เพราะระหว่างรอ redirect หน้าจะนิ่งไปครู่หนึ่ง ถ้าปุ่มกลับไป
         เป็นปกติในจังหวะนั้น คนจะกดซ้ำ -->
    <button
      type="submit"
      class="btn btn-block mt-6 transition-transform active:scale-[0.98]"
      :class="success ? 'btn-success' : 'btn-primary'"
      :disabled="loading || success"
    >
      <template v-if="success">
        <Icon icon="lucide:check" class="pop-in size-5" />
        เข้าสู่ระบบสำเร็จ
      </template>
      <template v-else-if="loading">
        <span class="loading loading-spinner loading-sm"></span>
        กำลังเข้าสู่ระบบ...
      </template>
      <template v-else>
        Sign in
        <Icon icon="lucide:arrow-right" class="size-4" />
      </template>
    </button>

    <p class="rise mt-8 text-center text-xs text-base-content/40" style="--rise-delay: 320ms">
      © {{ year }} UBIS · สำหรับใช้งานภายในองค์กรเท่านั้น
    </p>

    <!-- ลืมรหัสผ่าน — ระบบยังไม่มีเส้นรีเซ็ตด้วยตัวเอง (ไม่มี /auth/forgot ฝั่ง backend)
         ลิงก์นี้จึงบอก "ทางที่ใช้ได้จริง" แทนการพาไปหน้าที่ยังไม่มี
         ⚠️ TODO: เติมช่องทางติดต่อ IT จริง (เบอร์ภายใน/อีเมล) ลงในย่อหน้าข้างล่าง -->
    <dialog ref="forgotDialog" class="modal">
      <div class="modal-box max-w-sm">
        <h3 class="flex items-center gap-2 text-lg font-semibold">
          <Icon icon="lucide:key-round" class="size-5 text-primary" />
          ลืมรหัสผ่าน
        </h3>
        <p class="py-4 text-sm text-base-content/70">
          ระบบยังไม่เปิดให้รีเซ็ตรหัสผ่านด้วยตัวเอง รหัสผ่านตั้งใหม่ได้โดยผู้ดูแลระบบ
          (ADMIN) เท่านั้น กรุณาติดต่อฝ่าย IT พร้อมแจ้งชื่อผู้ใช้ของคุณ
        </p>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn btn-sm">เข้าใจแล้ว</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  </form>
</template>

<style scoped>
/* ข้อความเตือน/แจ้งเตือนที่โผล่กลางฟอร์ม - เลื่อนลงมาเล็กน้อยพร้อมจางเข้า
   ★ ต้องมี leave ด้วย ไม่งั้นตอนพิมพ์แก้แล้ว error หาย กล่องจะหายวับ
     แล้วของข้างล่างกระตุกเด้งขึ้นมาทันที */
.hint-enter-active,
.hint-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .hint-enter-active,
  .hint-leave-active {
    transition: none;
  }
}
</style>
