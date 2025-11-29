<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useNotificationStore } from '@/stores/notifications';
import Card from '@/components/game/Card.vue';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToastStore();
const notifStore = useNotificationStore();

const styles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];

const currentStyle = ref(authStore.user?.card_back_style || 'default');

watch(() => authStore.user, (newUser) => {
  if (newUser && newUser.card_back_style) {
    currentStyle.value = newUser.card_back_style;
  }
});

const saveSettings = async (style) => {
  if (!authStore.isAuthenticated) {
    return toast.addToast(t('settings_login_required'), 'warning');
  }

  currentStyle.value = style;

  try {
    const res = await fetch('/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_back_style: style })
    });

    if (res.ok) {
      if (authStore.user) authStore.user.card_back_style = style;
      toast.addToast(t('settings_style_saved'), 'success');
    } else {
      toast.addToast(t('settings_save_error'), 'error');
    }
  } catch (e) {
    console.error(e);
    toast.addToast(t('settings_connection_error'), 'error');
  }
};

const toggleNotifications = () => {
  if (notifStore.isSubscribed) {
    notifStore.unsubscribe();
  } else {
    notifStore.subscribe();
  }
};
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative overflow-hidden">

    <div
      class="w-[95%] md:w-full max-w-2xl bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 p-8 animate-fade-in">
      <h1 class="text-3xl font-bold text-white mb-8 text-center">{{ $t('settings_title') }}</h1>

      <div>
        <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">{{ $t('choose_card_back') }}
        </h3>

        <div class="flex flex-wrap gap-6 justify-center">
          <div v-for="style in styles" :key="style" class="flex flex-col items-center gap-3 cursor-pointer group"
            @click="saveSettings(style)">
            <div class="transition-all duration-200 p-1 rounded-xl"
              :class="currentStyle === style ? 'ring-4 ring-primary scale-105' : 'opacity-70 group-hover:opacity-100'">
              <Card :is-back="true" :card-style="style" class="pointer-events-none shadow-xl" />
            </div>
            <span class="text-sm font-medium capitalize"
              :class="currentStyle === style ? 'text-primary' : 'text-on-surface-variant'">{{ style }}</span>
          </div>
        </div>

        <div class="mb-8 w-full border-t border-white/10 pt-6">
          <h3 class="text-on-surface-variant mb-4 font-bold uppercase text-xs tracking-wider text-center">{{ $t('notifications_title') }}
          </h3>

          <div v-if="!notifStore.isSupported" class="text-center text-error text-sm bg-error/10 p-2 rounded-lg">
            {{ $t('notifications_unsupported') }}
          </div>

          <div v-else class="flex flex-col items-center gap-2">
            <button @click="toggleNotifications" :disabled="notifStore.isLoading || notifStore.permission === 'denied'"
              class="w-full py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 max-w-sm"
              :class="notifStore.isSubscribed
                ? 'bg-error/10 text-error border border-error/20 hover:bg-error/20'
                : 'bg-primary text-on-primary shadow-lg hover:shadow-primary/40'">
              <span v-if="notifStore.isLoading" class="animate-spin">⏳</span>
              <span v-else>{{ notifStore.isSubscribed ? $t('notifications_disable') : $t('notifications_enable')
              }}</span>
            </button>

            <p v-if="notifStore.permission === 'denied'" class="text-xs text-error mt-2 font-bold">
              🚫 {{ $t('notifications_denied') }}
            </p>
            <p v-else class="text-xs text-on-surface-variant text-center max-w-xs mt-2">
              {{ $t('notifications_info') }}
            </p>
          </div>
        </div>

        <button @click="router.push('/')"
          class="w-full py-4 rounded-xl border border-outline/30 text-on-surface hover:bg-white/5 transition-colors font-bold">
          {{ $t('go_home') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
