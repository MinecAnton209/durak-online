<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGameStore } from '@/stores/game';
import BaseModal from '@/components/ui/BaseModal.vue';
import ProfileModal from '@/components/ui/ProfileModal.vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close']);

const gameStore = useGameStore();
const voted = ref(false);
const showProfile = ref(false);
const profileUserId = ref(null);

function openProfile(userId) {
  profileUserId.value = userId;
  showProfile.value = true;
}

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
  <BaseModal :is-open="isOpen" :title="title" @close="emit('close')">
    <div v-if="winnerData" class="text-center">
      <div class="text-6xl mb-4">
        {{ isWin ? '🏆' : (isLose ? '🤡' : '🤝') }}
      </div>

      <p class="text-on-surface-variant mb-6">{{ message }}</p>

      <div v-if="winnerData" class="mb-6 space-y-2">
        <div v-if="winnerData.winners && winnerData.winners.length" class="text-sm text-on-surface-variant">
          <template v-for="(winner, index) in winnerData.winners" :key="winner.id">
            <span class="font-semibold text-white cursor-pointer hover:text-primary transition-colors"
                  @click="openProfile(winner.dbId)">
              {{ winner.name }}
            </span>
            <span v-if="index < winnerData.winners.length - 1">, </span>
          </template>
          <span class="text-on-surface-variant"> — {{ $t('winners_label') }}</span>
        </div>
        <div v-if="winnerData.loser" class="text-sm text-on-surface-variant">
          <span class="font-semibold text-white cursor-pointer hover:text-primary transition-colors"
                @click="openProfile(winnerData.loser.dbId)">
            {{ winnerData.loser.name }}
          </span>
          <span class="text-on-surface-variant"> — {{ $t('loser_label') }}</span>
        </div>
      </div>

      <div v-if="rematchInfo" class="mb-4 bg-white/10 rounded-lg p-2 text-sm text-white animate-pulse">
        {{ $t('rematch_label') }} {{ rematchInfo.votes }} / {{ rematchInfo.total }}
      </div>

      <div class="flex flex-col gap-3">
        <button @click="handleRematch" :disabled="voted"
                class="w-full min-h-[48px] font-bold py-3 rounded-xl transition-all shadow-lg text-on-primary"
                :class="voted ? 'bg-gray-500 cursor-not-allowed' : 'bg-primary hover:bg-[#00A891] active:scale-95'">
          {{ voted ? $t('waiting_for_others') : '🔄 ' + $t('rematch_button') }}
        </button>

        <button @click="handleExit"
                class="w-full min-h-[48px] bg-transparent border border-white/20 text-white hover:bg-white/10 font-bold py-3 rounded-xl transition-all">
          {{ $t('exit_to_menu') }}
        </button>
      </div>
    </div>
  </BaseModal>
  <ProfileModal :is-open="showProfile" :user-id="profileUserId" @close="showProfile = false" />
</template>
