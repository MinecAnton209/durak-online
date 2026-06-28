<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '@/components/ui/BaseModal.vue';
import axios from 'axios';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'view-profile']);

const { t } = useI18n();

const games = ref([]);
const isLoading = ref(false);
const selectedGame = ref(null);

const formatDuration = (seconds) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatDate = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('my_games_just_now');
  if (diffMins < 60) return t('my_games_minutes_ago', { n: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('my_games_hours_ago', { n: diffHours });
  return d.toLocaleDateString();
};

const formatFullDate = (isoStr) => {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString();
};

const outcomeData = (outcome) => {
  if (outcome === 'win') return { icon: '🏆', label: t('my_games_win'), color: 'text-primary', bg: 'bg-primary/10' };
  if (outcome === 'loss') return { icon: '💀', label: t('my_games_loss'), color: 'text-error', bg: 'bg-error/10' };
  return { icon: '🤝', label: t('my_games_draw'), color: 'text-on-surface-variant', bg: 'bg-white/5' };
};

const fetchGames = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get('/api/my-games');
    games.value = res.data;
  } catch (e) {
    console.error('[MyGames] Error:', e);
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.isOpen, (open) => {
  if (open) {
    selectedGame.value = null;
    fetchGames();
  }
});

function viewGame(game) {
  selectedGame.value = game;
}

function backToList() {
  selectedGame.value = null;
}

function openProfile(username) {
  emit('view-profile', username);
}
</script>

<template>
  <BaseModal :is-open="isOpen" :title="selectedGame ? '' : t('my_games_title')" max-width="max-w-lg" @close="emit('close')">
    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <div class="animate-spin rounded-full h-8 w-8 border-[3px] border-primary border-t-transparent"></div>
    </div>

    <!-- Empty -->
    <div v-else-if="!selectedGame && games.length === 0" class="text-center py-16">
      <div class="text-4xl mb-3 opacity-30">🎮</div>
      <p class="text-sm text-on-surface-variant/50">{{ t('my_games_empty') }}</p>
    </div>

    <!-- Detail View -->
    <div v-else-if="selectedGame" class="space-y-5">
      <!-- Back button -->
      <button
        @click="backToList"
        class="inline-flex items-center gap-1.5 text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7-7l-7 7 7 7"/>
        </svg>
        {{ t('my_games_back') }}
      </button>

      <!-- Outcome hero -->
      <div class="text-center py-4">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto mb-3"
          :class="outcomeData(selectedGame.myOutcome).bg"
        >
          {{ outcomeData(selectedGame.myOutcome).icon }}
        </div>
        <h3
          class="text-xl font-bold"
          :class="outcomeData(selectedGame.myOutcome).color"
        >
          {{ outcomeData(selectedGame.myOutcome).label }}
        </h3>
      </div>

      <!-- Participants -->
      <div class="space-y-2">
        <div
          v-for="(p, i) in selectedGame.participants"
          :key="i"
          class="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-3 border border-white/10"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0"
              :class="p.outcome === 'win' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'"
            >
              {{ p.outcome === 'win' ? '🏆' : '💀' }}
            </div>
            <div>
              <button
                v-if="!p.isBot && p.outcome !== selectedGame.myOutcome"
                @click="openProfile(p.username)"
                class="font-semibold text-sm text-white hover:text-primary transition-colors cursor-pointer"
              >
                {{ p.username }}
              </button>
              <span v-else-if="p.outcome === selectedGame.myOutcome" class="font-semibold text-sm text-white">
                {{ p.username }}
                <span class="text-[10px] text-on-surface-variant/50 font-normal ml-1">{{ t('my_games_you') }}</span>
              </span>
              <span v-else class="font-semibold text-sm text-white/60">
                {{ p.username }}
              </span>
              <div v-if="p.rating" class="text-[11px] text-on-surface-variant/40">
                {{ Math.round(p.rating) }} {{ t('my_games_rating_short') }}
              </div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs font-mono text-on-surface-variant/60">{{ p.cardsAtEnd ?? '—' }}</div>
            <div class="text-[10px] text-on-surface-variant/30 uppercase tracking-wider">{{ t('my_games_cards') }}</div>
          </div>
        </div>
      </div>

      <!-- Game meta -->
      <div class="flex flex-wrap gap-2 text-xs text-on-surface-variant/50 bg-white/5 rounded-2xl px-4 py-3 border border-white/10">
        <span v-if="selectedGame.gameType" class="bg-white/5 px-2 py-0.5 rounded-full capitalize">{{ selectedGame.gameType }}</span>
        <span v-if="selectedGame.wasBot" class="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">Bot</span>
        <span>{{ formatDuration(selectedGame.durationSeconds) }}</span>
        <span>·</span>
        <span>{{ formatFullDate(selectedGame.endTime) }}</span>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="space-y-2 max-h-[65dvh] overflow-y-auto scrollbar-thin px-1">
      <div
        v-for="(game, idx) in games"
        :key="game.id"
        @click="viewGame(game)"
        class="bg-white/5 border border-white/10 rounded-2xl p-4 transition-all duration-200 hover:bg-white/[7%] hover:border-white/20 animate-stagger-in cursor-pointer"
        :style="{ animationDelay: `${idx * 0.03}s` }"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2.5">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              :class="outcomeData(game.myOutcome).bg"
            >
              {{ outcomeData(game.myOutcome).icon }}
            </div>
            <span
              class="text-xs font-bold uppercase tracking-wider"
              :class="outcomeData(game.myOutcome).color"
            >
              {{ outcomeData(game.myOutcome).label }}
            </span>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-on-surface-variant/50">
            <span v-if="game.gameType" class="bg-white/5 px-2 py-0.5 rounded-full capitalize">{{ game.gameType }}</span>
            <span v-if="game.wasBot" class="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">Bot</span>
            <span>{{ formatDuration(game.durationSeconds) }}</span>
            <span>·</span>
            <span>{{ formatDate(game.endTime) }}</span>
          </div>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="(p, i) in game.participants"
            :key="i"
            class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
            :class="p.outcome === game.myOutcome
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
              : p.isBot
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-white/5 text-on-surface-variant/70'"
          >
            <span class="font-medium">{{ p.username }}</span>
            <span v-if="p.rating" class="opacity-40">· {{ Math.round(p.rating) }}</span>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.25);
}

.animate-stagger-in {
  animation: staggerFadeIn 0.35s ease-out both;
}

@keyframes staggerFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
