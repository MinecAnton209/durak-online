import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([]);
  let idCounter = 0;

  function addToast(message, type = 'info', duration = 3000) {
    const id = idCounter++;
    const toast = { id, message, type };

    toasts.value.unshift(toast);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, addToast, removeToast };
});
