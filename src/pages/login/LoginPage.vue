<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ApiError } from '@/shared/services/httpClient'
import { useAuthStore } from '@/shared/stores/auth'
import LoginForm from '@/pages/login/components/LoginForm.vue'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const loading = ref(false)
const errorMsg = ref('')

async function handleSubmit(payload: {
  username: string
  password: string
}) {
  loading.value = true
  errorMsg.value = ''

  try {
    await authStore.login(payload)

    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/dashboard'

    router.replace(redirect)
  } catch (err) {
    errorMsg.value =
      err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <LoginForm
    :loading="loading"
    :error="errorMsg"
    @submit="handleSubmit"
  />
</template>