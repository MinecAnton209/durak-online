<script>
import { useI18n } from 'vue-i18n';

export default {
  props: {
    isOpen: Boolean,
    title: String,
    message: String,
    confirmText: {
      type: String,
      default: () => {
        const { t } = useI18n();
        return t('confirm_text');
      }
    },
    cancelText: {
      type: String,
      default: () => {
        const { t } = useI18n();
        return t('cancel_text');
      }
    }
  }
}
</script>

<script setup>
import { watch, defineEmits } from 'vue';

const props = defineProps();
const emit = defineEmits(['confirm', 'cancel']);

watch(() => props.isOpen, (val) => {
  const onEsc = (e) => { if (e.key === 'Escape') emit('cancel'); };
  if (val) document.addEventListener('keydown', onEsc);
  else document.removeEventListener('keydown', onEsc);
});
</script>

<template>
  <transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('cancel')"></div>

      <div class="relative w-full max-w-sm bg-surface rounded-2xl border border-white/10 shadow-2xl p-6 text-center animate-scale-in">

        <div class="text-3xl mb-4">⚠️</div>

        <h3 class="text-lg font-bold text-white mb-2">{{ title }}</h3>
        <p class="text-sm text-on-surface-variant mb-6">{{ message }}</p>

        <div class="flex gap-3">
          <button @click="emit('cancel')" class="flex-1 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
            {{ cancelText }}
          </button>
          <button @click="emit('confirm')" class="flex-1 py-2 bg-error text-white rounded-lg hover:bg-red-600 transition-colors font-bold">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
</style>
