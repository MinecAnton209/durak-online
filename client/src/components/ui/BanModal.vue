<script setup>
const props = defineProps({
  isOpen: Boolean,
  reason: String
});
</script>

<template>
  <transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">

      <div class="relative w-full max-w-md bg-surface border-2 border-error rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(255,84,73,0.3)] animate-shake">

        <div class="text-6xl mb-4">🚫</div>

        <h2 class="text-3xl font-bold text-error mb-4 uppercase tracking-wider">{{ $t('ban_title') }}</h2>

        <p class="text-on-surface mb-2">{{ $t('ban_access_restricted') }}</p>

        <div class="bg-black/40 p-4 rounded-xl border border-white/10 mb-6">
          <p class="text-xs text-on-surface-variant uppercase font-bold mb-1">{{ $t('ban_reason_label') }}</p>
          <p class="text-white font-medium">{{ reason || $t('ban_default_reason') }}</p>
        </div>

        <button
          @click="$emit('close')"
          class="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all"
        >
          {{ $t('ban_acknowledge_exit') }}
        </button>
      </div>

    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.animate-shake {
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
