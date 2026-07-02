<template>
  <header class="bg-surface dark:bg-background flex justify-between items-center ml-sidebar-width px-container-padding py-4 w-[calc(100%-theme(spacing.sidebar-width))] sticky top-0 z-40">
    <div class="flex items-center gap-2">


      <button class="material-symbols-outlined text-secondary hover:text-primary transition-all">
        arrow_back
      </button>

      
      <span class="font-body-sm text-body-sm text-on-surface-variant">
        {{ title }}
      </span>
    </div>

    <div class="flex items-center gap-4">
      <span class="font-body-sm text-body-sm text-on-surface-variant">
        {{ currentTime }}
      </span>

      <div class="flex gap-2">
        <button class="material-symbols-outlined text-secondary hover:text-primary p-1">
          help
        </button>
        <button class="material-symbols-outlined text-secondary hover:text-primary p-1">
          settings
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'

const title = ref('Create New Asset')
const currentTime = ref('Friday 26/8/2569 11:49')
</script>