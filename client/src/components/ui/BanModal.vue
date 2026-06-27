<script setup>
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps({
  isOpen: Boolean,
  reason: String
});
</script>

<template>
  <BaseModal :is-open="isOpen" max-width="max-w-md" @close="() => {}">
    <div class="text-center">
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
  </BaseModal>
</template>
