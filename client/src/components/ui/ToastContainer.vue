<script setup>
import { useToastStore } from '@/stores/toast';

const store = useToastStore();

const getTypeStyles = (type) => {
  switch (type) {
    case 'error': return 'bg-error/90 text-white border-red-500';
    case 'success': return 'bg-[#00BFA5]/90 text-on-primary border-[#008f7a]';
    case 'warning': return 'bg-yellow-500/90 text-black border-yellow-600';
    default: return 'bg-surface/90 text-white border-outline/50';
  }
};

const getIcon = (type) => {
  switch (type) {
    case 'error': return '⛔';
    case 'success': return '✅';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
};
</script>

<template>
  <div
    class="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none px-4">
    <transition-group name="toast">
      <div v-for="toast in store.toasts" :key="toast.id"
        class="pointer-events-auto flex items-center gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl cursor-pointer"
        :class="getTypeStyles(toast.type)" @click="store.removeToast(toast.id)">
        <span class="text-xl">{{ getIcon(toast.type) }}</span>
        <p class="font-medium text-sm break-words overflow-hidden">{{ toast.message }}</p>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
</style>
