<script setup lang="ts">
/**
 * แถบรายละเอียดห้องที่เลือก ใต้แผนที่
 *
 * โชว์ code ด้วยเพราะเป็นคีย์ที่คนใช้อ้างถึงห้องเวลาคุยกันข้ามระบบ (id ต่างกันตามเครื่อง
 * dev/prod จึงใช้อ้างอิงไม่ได้ - เหตุผลเดียวกับที่ asset_sub_location.code มีอยู่)
 */
import type { FloorPlanRoom } from '@/shared/services/master.service';

defineProps<{ room: FloorPlanRoom }>();
defineEmits<{ (e: 'clear'): void }>();
</script>

<template>
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body flex-row items-center justify-between gap-4 py-3">
      <div class="min-w-0">
        <p class="truncate font-medium">{{ room.room ?? room.code }}</p>
        <p class="truncate text-sm text-base-content/60">
          {{ room.locationName }} · {{ room.code }}
        </p>
      </div>
      <button class="btn btn-sm" @click="$emit('clear')">ล้างที่เลือก</button>
    </div>
  </div>
</template>
