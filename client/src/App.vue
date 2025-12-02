<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';
import { useGameStore } from '@/stores/game';
import { useTelegramStore } from '@/stores/telegram';
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
  return isWinter.value && gameStore.gameStatus !== 'playing';
});

onMounted(async () => {
  const month = new Date().getMonth();
  if ([11, 0, 1].includes(month)) {
    isWinter.value = true;
    document.body.classList.add('winter-theme');
  }
  telegramStore.init();

  await authStore.checkSession();
  try {
    await socketStore.connect();
    gameStore.initListeners();
  } catch (error) {
    console.error("Socket connection failed:", error);
  }

  const startParam = WebApp.initDataUnsafe?.start_param;

  if (startParam) {
    console.log("🔗 Deep Link Detected:", startParam);
    if (startParam.startsWith('invite_')) {
      console.log("Referral link");
    }
    else {
      router.replace(`/lobby/${startParam}`);
    }
  }

  socketStore.connect();

  gameStore.initListeners();

  if (socketStore.socket) {
    socketStore.socket.on('forceDisconnect', (data) => {
      console.log('Force Disconnect:', data);

      if (data.i18nKey) {
        banReason.value = t(data.i18nKey, data.options || {});
      } else {
        banReason.value = data.message || 'Unknown reason';
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

  <BanModal
    :is-open="isBanned"
    :reason="banReason"
    @close="handleBanClose"
  />

  <div v-if="maintenanceMsg" class="fixed top-0 left-0 w-full bg-orange-500 text-black font-bold text-center py-2 px-4 z-[10000] animate-slide-down shadow-lg">
    ⚠️ {{ maintenanceMsg }}
  </div>
</template>

<style scoped>
.animate-slide-down {
  animation: slideDown 0.5s ease-out;
}
@keyframes slideDown {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
</style>
