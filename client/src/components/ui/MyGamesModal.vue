<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import BaseModal from '@/components/ui/BaseModal.vue';
import axios from 'axios';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close']);
const { t } = useI18n();
const authStore = useAuthStore();

const games = ref([]);
const isLoading = ref(false);

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
  if (open) fetchGames();
});

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

const outcomeClass = (outcome) => {
  if (outcome === 'win') return 'text-primary';
  if (outcome === 'loss') return 'text-error';
  return 'text-on-surface-variant';
};

const outcomeIcon = (outcome) => {
  if (outcome === 'win') return '🏆';
  if (outcome === 'loss') return '💀';
  return '🤝';
};
</script>

<template>
  <BaseModal :is-open="isOpen" :title="t('my_games_title')" max-width="max-w-lg" @close="emit('close')">
    <div v-if="isLoading" class="text-center py-10">
      <div class="w-8 h-8 border-3 border-white/10 border-t-white rounded-full animate-spin mx-auto"></div>
    </div>

    <div v-else-if="games.length === 0" class="text-center py-10 text-white/30">
      <div class="text-3xl mb-2">🎮</div>
      <p class="text-sm">{{ t('my_games_empty') }}</p>
    </div>

    <div v-else class="space-y-2 max-h-[65dvh] overflow-y-auto scrollbar-thin">
      <div v-for="game in games" :key="game.id"
        class="bg-white/5 border border-white/5 rounded-xl p-3 transition-all hover:bg-white/8">

        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ outcomeIcon(game.myOutcome) }}</span>
            <span class="text-xs font-mono text-white/40">{{ game.id }}</span>
          </div>
          <span :class="outcomeClass(game.myOutcome)" class="text-xs font-bold uppercase">
            {{ game.myOutcome === 'win' ? t('my_games_win') : game.myOutcome === 'loss' ? t('my_games_loss') : t('my_games_draw') }}
          </span>
        </div>

        <div class="flex items-center gap-3 text-xs text-white/50">
          <span v-if="game.gameType" class="bg-white/5 px-2 py-0.5 rounded-full">{{ game.gameType }}</span>
          <span v-if="game.wasBot" class="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">{{ t('my_games_bot') }}</span>
          <span>{{ formatDuration(game.durationSeconds) }}</span>
          <span>{{ formatDate(game.endTime) }}</span>
        </div>

        <div class="mt-2 flex flex-wrap gap-1.5">
          <span v-for="(p, i) in game.participants" :key="i"
            class="text-[11px] px-2 py-0.5 rounded-full"
            :class="p.isBot ? 'bg-blue-500/10 text-blue-400' : p.outcome === 'win' ? 'bg-primary/10 text-primary' : 'bg-white/5 text-white/60'">
            {{ p.username }}
            <span v-if="p.rating" class="text-white/30 ml-0.5">({{ Math.round(p.rating) }})</span>
          </span>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
</style>
