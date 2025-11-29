<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  isOpen: Boolean,
  mode: String
});

const emit = defineEmits(['close', 'submit']);

const username = ref('');
const password = ref('');
const isLoading = ref(false);
const error = ref('');

const title = computed(() => props.mode === 'login' ? t('login_modal_title') : t('register_modal_title'));
const buttonText = computed(() => props.mode === 'login' ? t('login_submit') : t('register_submit'));

const handleSubmit = async () => {
  if (!username.value || !password.value) {
    error.value = t('error_fill_fields');
    return;
  }

  error.value = '';
  isLoading.value = true;

  emit('submit', {
    mode: props.mode,
    username: username.value,
    password: password.value,
    onComplete: (err) => {
      isLoading.value = false;
      if (err) {
        error.value = err;
      } else {
        username.value = '';
        password.value = '';
      }
    }
  });
};

const handleClose = () => {
  error.value = '';
  username.value = '';
  password.value = '';
  emit('close');
};
</script>

<template>
  <transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">

      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" @click="handleClose"></div>

      <div class="relative w-full max-w-sm bg-surface rounded-3xl border border-white/10 shadow-2xl p-8 animate-scale-in">

        <button
          @click="handleClose"
          class="absolute top-4 right-4 text-on-surface-variant hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-1"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        <h2 class="text-2xl font-bold text-center mb-6 text-white tracking-wide">{{ title }}</h2>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-5">

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-on-surface-variant uppercase ml-1 tracking-wider">{{ $t('username_label') }}</label>
            <div class="relative">
              <input
                v-model="username"
                type="text"
                class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none transition-all pl-10"
                :placeholder="$t('placeholder_username')"
              >
              <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path></svg>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-on-surface-variant uppercase ml-1 tracking-wider">{{ $t('password_label') }}</label>
            <div class="relative">
              <input
                v-model="password"
                type="password"
                class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none transition-all pl-10"
                :placeholder="$t('placeholder_password')"
              >
              <svg class="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
          </div>

          <transition name="fade">
            <div v-if="error" class="bg-error/10 border border-error/20 rounded-lg p-3 flex gap-2 items-start">
              <svg class="w-5 h-5 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p class="text-error text-sm font-medium leading-tight">{{ error }}</p>
            </div>
          </transition>

          <button
            type="submit"
            :disabled="isLoading"
            class="mt-2 w-full bg-primary text-on-primary font-bold text-lg py-3 rounded-xl hover:bg-[#00A891] hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
          >
            <span v-if="!isLoading">{{ buttonText }}</span>

            <svg v-else class="animate-spin h-6 w-6 text-on-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </button>
        </form>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
