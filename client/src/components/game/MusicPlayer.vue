<script setup>
import { computed, ref } from 'vue';
import { useGameStore } from '@/stores/game';
import { useI18n } from 'vue-i18n';

const gameStore = useGameStore();
const voted = ref(false);

const winnerData = computed(() => gameStore.winnerData);
const rematchInfo = computed(() => gameStore.rematchStatus);
const { t } = useI18n();

const isWin = computed(() => {
  if (!winnerData.value) return false;
  if (winnerData.value.winners && winnerData.value.winners.some(w => w.id === gameStore.playerId)) {
    return true;
  }
  return false;
});

const isLose = computed(() => {
  if (!winnerData.value) return false;
  return winnerData.value.loser && winnerData.value.loser.id === gameStore.playerId;
});

const title = computed(() => {
  if (isWin.value) return t('win_title');
  if (isLose.value) return t('lose_title');
  return t('draw_title');
});

const message = computed(() => {
  if (isLose.value) return t('lose_subtitle');
  if (isWin.value) return t('win_subtitle');
  return t('draw_subtitle');
});

const handleExit = () => {
  gameStore.leaveGame();
  voted.value = false;
};

const handleRematch = () => {
  voted.value = true;
  gameStore.requestRematch();
};
</script>

<template>
  <transition name="pop">
    <div v-if="winnerData" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-md"></div>

      <div
        class="relative w-full max-w-sm bg-surface rounded-3xl border border-white/20 shadow-2xl p-8 text-center animate-bounce-in">

        <div class="text-6xl mb-4">
          {{ isWin ? '🏆' : (isLose ? '🤡' : '🤝') }}
        </div>

        <h2 class="text-3xl font-bold mb-2" :class="isWin ? 'text-primary' : (isLose ? 'text-error' : 'text-white')">
          {{ title }}
        </h2>

        <p class="text-on-surface-variant mb-6">{{ message }}</p>

        <div v-if="rematchInfo" class="mb-4 bg-white/10 rounded-lg p-2 text-sm text-white animate-pulse">
          {{ $t('rematch_label') }} {{ rematchInfo.votes }} / {{ rematchInfo.total }}
        </div>

        <div class="flex flex-col gap-3">
          <button @click="handleRematch" :disabled="voted"
                  class="w-full font-bold py-3 rounded-xl transition-all shadow-lg text-on-primary"
                  :class="voted ? 'bg-gray-500 cursor-not-allowed' : 'bg-primary hover:bg-[#00A891] active:scale-95'">
            {{ voted ? $t('waiting_for_others') : '🔄 ' + $t('rematch_button') }}
          </button>

          <button @click="handleExit"
                  class="w-full bg-transparent border border-white/20 text-white hover:bg-white/10 font-bold py-3 rounded-xl transition-all">
            {{ $t('exit_to_menu') }}
          </button>
        </div>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.animate-bounce-in {
  animation: bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }

  50% {
    opacity: 1;
    transform: scale(1.05);
  }

  70% {
    transform: scale(0.9);
  }

  100% {
    transform: scale(1);
  }
}
</style>
