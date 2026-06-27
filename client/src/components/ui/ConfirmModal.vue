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
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps();
const emit = defineEmits(['confirm', 'cancel']);
</script>

<template>
  <BaseModal :is-open="isOpen" :title="title || $t('confirm_title')" @close="emit('cancel')">
    <div class="text-center">
      <div class="text-3xl mb-4">⚠️</div>

      <p class="text-sm text-on-surface-variant mb-6">{{ message }}</p>

      <div class="flex gap-3">
        <button @click="emit('cancel')" class="flex-1 min-h-[44px] py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
          {{ cancelText }}
        </button>
        <button @click="emit('confirm')" class="flex-1 min-h-[44px] py-2 bg-error text-white rounded-lg hover:bg-red-600 transition-colors font-bold">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
