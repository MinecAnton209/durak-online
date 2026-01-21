<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';
import { useGameStore } from '@/stores/game';
import { useTelegramStore } from '@/stores/telegram';
import { useToastStore } from '@/stores/toast';
import { useI18n } from 'vue-i18n';

import ToastContainer from '@/components/ui/ToastContainer.vue';
import GameInviteModal from '@/components/game/GameInviteModal.vue';
import BanModal from '@/components/ui/BanModal.vue';
import SnowEffect from '@/components/ui/SnowEffect.vue';
import WebApp from '@twa-dev/sdk';

const authStore = useAuthStore();
const socketStore = useSocketStore();
const gameStore = useGameStore();
const telegramStore = useTelegramStore();
const router = useRouter();
const { t } = useI18n();
const isWinter = ref(false);

const isBanned = ref(false);
const banReason = ref('');

const maintenanceMsg = ref('');
const maintenanceTime = ref('');

const shouldShowSnow = computed(() => {
  return isWinter.value && gameStore.gameStatus !== 'playing' && router.currentRoute.value.path !== '/admin';
});

onMounted(async () => {
  const month = new Date().getMonth();
  if ([11, 0, 1].includes(month)) {
    isWinter.value = true;
    if (document.body) {
      document.body.classList.add('winter-theme');
    }
  }
  telegramStore.init();

  await authStore.checkSession();

  if (authStore.user?.is_banned) {
    const user = authStore.user;
    if (user.ban_until) {
      banReason.value = t('error_account_temp_banned_with_reason', {
        reason: user.ban_reason || t('ban_reason_not_specified'),
        until: new Date(user.ban_until).toLocaleString()
      });
    } else {
      banReason.value = t('error_account_banned_with_reason', {
        reason: user.ban_reason || t('ban_reason_not_specified')
      });
    }
    isBanned.value = true;
    authStore.logout();
  }

  try {
    await socketStore.connect();

    gameStore.initListeners();

    socketStore.socket.on('forceDisconnect', (data) => {
      if (data.i18nKey) {
        const options = { ...(data.options || {}) };
        if (options.reason === null) {
          options.reason = t('ban_reason_not_specified');
        }
        banReason.value = t(data.i18nKey, options);
      } else {
        banReason.value = data.message || t('unknown_reason');
      }
      isBanned.value = true;
      authStore.logout();
      router.push('/');
    });

    socketStore.socket.on('maintenanceWarning', ({ message, startTime }) => {
      maintenanceMsg.value = message;
      const timeLeft = startTime - Date.now();
      if (timeLeft <= 0) {
        window.location.reload();
      } else {
        setTimeout(() => window.location.reload(), timeLeft);
      }
    });

    socketStore.socket.on('systemMessage', (data) => {
      const { message, i18nKey, options, type = 'info' } = data;
      const toastStore = useToastStore();

      let content = message;
      if (i18nKey) {
        content = t(i18nKey, options || {});
      }

      if (content) {
        toastStore.addToast(content, type, 5000);
      }
    });

    socketStore.socket.on('sessionTerminated', () => {
      const toastStore = useToastStore();
      toastStore.addToast(t('error_session_terminated_admin'), 'error', 10000);
      authStore.logout();
      router.push('/');
    });
  } catch (error) {
    console.error("Socket connection failed in App.vue:", error);
  }

  const startParam = WebApp.initDataUnsafe?.start_param;
  if (startParam) {
    console.log("🔗 Deep Link Detected:", startParam);
    if (!startParam.startsWith('invite_')) {
      router.replace(`/lobby/${startParam}`);
    }
  }
});

const handleBanClose = () => {
  isBanned.value = false;
  window.location.reload();
};
</script>

<template>
  <SnowEffect v-if="shouldShowSnow" />
  <RouterView />

  <ToastContainer />
  <GameInviteModal />

  <BanModal :is-open="isBanned" :reason="banReason" @close="handleBanClose" />

  <div v-if="maintenanceMsg"
    class="fixed top-0 left-0 w-full bg-orange-500 text-black font-bold text-center py-2 px-8 z-[10000] animate-slide-down shadow-lg break-words">
    ⚠️ {{ maintenanceMsg }}
  </div>
</template>

<style scoped>
.animate-slide-down {
  animation: slideDown 0.5s ease-out;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
  }

  to {
    transform: translateY(0);
  }
}
</style>
