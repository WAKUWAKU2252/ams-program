<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted, onUnmounted } from 'vue';
import { useConnectionStore } from '@/stores/connection';
const connection = useConnectionStore();

onMounted(() => connection.connect());
onUnmounted(() => connection.disconnect());
</script>

<template>
  <div id="app">
    {{ connection.statusText }}
    <RouterView />
  </div>
</template>

<style scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  text-align: center;
  margin-top: 0;
}
</style>
