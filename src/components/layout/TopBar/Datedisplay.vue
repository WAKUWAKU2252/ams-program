<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

type Locale  = 'en' | 'th'
type Variant = 'short' | 'long' | 'iso' | 'noday'

interface Props {
  date?:        Date | string | number
  locale?:      Locale
  buddhistEra?: boolean
  separator?:   string
  padDay?:      boolean
  padMonth?:    boolean
  variant?:     Variant
  showTime?:    boolean   
  liveTime?:    boolean   
}

const CFG = {
  BE_OFFSET: 543,
  days: {
    en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    th: ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'],
  },
  months: {
    en: { full: ['January','February','March','April','May','June','July','August','September','October','November','December'] },
    th: {
      full:  ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
      short: ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'],
    },
  },
} as const

const props = withDefaults(defineProps<Props>(), {
  date:        () => new Date(),
  locale:      'en',
  buddhistEra: true,
  separator:   '/',
  padDay:      false,
  padMonth:    false,
  variant:     'short',
  showTime:    false,
  liveTime:    false,
})

// ── Live clock ──────────────────────────────
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (props.liveTime) {
    timer = setInterval(() => { now.value = new Date() }, 1000)
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// ── Helpers ─────────────────────────────────
const toDate = (v: Date | string | number): Date => {
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? new Date() : d
}
const pad = (n: number) => String(n).padStart(2, '0')
const toYear = (y: number) => props.buddhistEra ? y + CFG.BE_OFFSET : y

// ── Date string ─────────────────────────────
const formattedDate = computed<string>(() => {
  const d  = props.liveTime ? now.value : toDate(props.date ?? new Date())
  const lo = props.locale

  if (props.variant === 'iso') {
    return `${toYear(d.getFullYear())}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  }

  if (props.variant === 'long') {
    const dayName = lo === 'th' ? `วัน${CFG.days.th[d.getDay()]}` : CFG.days.en[d.getDay()]
    const month   = lo === 'th' ? CFG.months.th.full[d.getMonth()] : CFG.months.en.full[d.getMonth()]
    return lo === 'th'
      ? `${dayName}ที่ ${d.getDate()} ${month} ${toYear(d.getFullYear())}`
      : `${dayName}, ${d.getDate()} ${month} ${toYear(d.getFullYear())}`
  }

  const dayName = lo === 'th' ? `วัน${CFG.days.th[d.getDay()]}` : CFG.days.en[d.getDay()]
  const dd      = props.padDay   ? pad(d.getDate())      : d.getDate()
  const mm      = props.padMonth ? pad(d.getMonth() + 1) : d.getMonth() + 1
  const dateStr = [dd, mm, toYear(d.getFullYear())].join(props.separator)

  return props.variant === 'noday' ? String(dateStr) : `${dayName} ${dateStr}`
})

// ── Time string ─────────────────────────────
const formattedTime = computed<string>(() => {
  const d = props.liveTime ? now.value : toDate(props.date ?? new Date())
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})
</script>

<template>
  <span class="inline-flex items-center gap-3 tabular-nums">
    <span>{{ formattedDate }}</span>
    <span v-if="showTime" class="text-base-content/60">{{ formattedTime }}</span>
  </span>
</template>
```
