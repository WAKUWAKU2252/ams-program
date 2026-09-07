<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { FloorPlanRoom } from '@/shared/services/master.service';

const props = defineProps<{
  rooms: FloorPlanRoom[];
  selectedId: number | null;
}>();

const emit = defineEmits<{
  (e: 'select', id: number): void;
}>();

const search = ref('');
const roomRefs = ref<Record<number, HTMLElement>>({});

function setRoomRef(id: number, el: Element | null) {
  if (el instanceof HTMLElement) {
    roomRefs.value[id] = el;
  }
}

const grouped = computed(() => {
  const q = search.value.trim().toLowerCase();

  const matched = q
    ? props.rooms.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          (r.room ?? '').toLowerCase().includes(q) ||
          r.locationName.toLowerCase().includes(q),
      )
    : props.rooms;

  const byBuilding = new Map<string, FloorPlanRoom[]>();

  for (const room of matched) {
    const list = byBuilding.get(room.locationName);

    if (list) {
      list.push(room);
    } else {
      byBuilding.set(room.locationName, [room]);
    }
  }

  return [...byBuilding.entries()];
});

// เมื่อ selectedId เปลี่ยน → scroll ไปหาห้องนั้น
watch(
  () => props.selectedId,
  async (id) => {
    if (id === null) return;

    await nextTick();

    roomRefs.value[id]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <label class="input w-full">
      <input
        v-model="search"
        type="search"
        placeholder="ค้นชื่อห้อง / รหัส / ตึก"
      />
    </label>

    <div class="min-h-0 flex-1 overflow-y-auto rounded-box border border-base-300">
      <ul class="menu w-full">
        <li v-for="[building, list] in grouped" :key="building">
          <h2 class="menu-title">
            {{ building }} ({{ list.length }})
          </h2>

          <ul>
            <li v-for="room in list" :key="room.id">
              <button
                :ref="(el) => setRoomRef(room.id, el as Element | null)"
                :class="{ 'menu-active': room.id === selectedId }"
                @click="emit('select', room.id)"
              >
                <span class="truncate">
                  {{ room.room ?? room.code }}
                </span>
              </button>
            </li>
          </ul>
        </li>
      </ul>

      <p
        v-if="!grouped.length"
        class="p-4 text-sm text-base-content/60"
      >
        ไม่พบห้องที่ค้น
      </p>
    </div>
  </div>
</template>