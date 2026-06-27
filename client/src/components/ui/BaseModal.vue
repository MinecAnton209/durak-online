<script setup>
import { watch, onUnmounted } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  title: { type: String, default: '' },
  maxWidth: { type: String, default: 'max-w-sm' },
  noPadding: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);

const handleBackdrop = () => {
  emit('close');
};

const handleKeydown = (e) => {
  if (e.key === 'Escape') emit('close');
};

let previousOverflow = '';

watch(() => props.isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', handleKeydown);
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    document.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = previousOverflow;
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? 'modal-title' : undefined"
        @click.self="handleBackdrop"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" @click="handleBackdrop"></div>

        <div
          :class="[
            maxWidth,
            noPadding ? '' : 'p-4 sm:p-6 md:p-8',
            'relative w-full sm:rounded-3xl rounded-t-3xl bg-surface border border-white/10 shadow-2xl max-h-[90dvh] overflow-y-auto animate-modal-in'
          ]"
        >
          <div v-if="title" class="flex items-center justify-between sticky top-0 bg-surface/95 backdrop-blur-sm z-10 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-3 sm:py-4 border-b border-white/5 sm:rounded-t-3xl">
            <h2 id="modal-title" class="text-lg sm:text-xl font-bold text-white tracking-wide">{{ title }}</h2>
            <button
              @click="emit('close')"
              class="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full shrink-0 active:scale-95"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <slot></slot>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.animate-modal-in {
  animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
