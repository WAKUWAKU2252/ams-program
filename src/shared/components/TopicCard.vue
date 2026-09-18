<script setup lang="ts">
import { computed } from 'vue'
import { MAIN_TOPIC_OPTIONS } from '@/shared/utils/main-topic'
import { Icon } from '@iconify/vue'

const props = defineProps<{
    value: string
}>()

const topic = computed(() =>
    MAIN_TOPIC_OPTIONS.find(item => item.value === props.value)
)
</script>

<template>
    <div v-if="topic">
        <div>
            <h1 class="flex items-center gap-2 text-3xl font-bold sm:text-4xl">
                <Icon :icon="topic.icon" class="size-7" />
                {{ topic.header }}
            </h1>
            <p class="text-base-content/70">
                {{ topic.label }}
            </p>
        </div>
    </div>
</template>