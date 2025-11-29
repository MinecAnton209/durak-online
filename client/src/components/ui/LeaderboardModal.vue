<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close']);

const activeTab = ref('rating');
const leaders = ref([]);
const isLoading = ref(false);

const tabs = [
  { id: 'rating', label: 'Рейтинг' },
  { id: 'wins', label: 'Перемоги' },
  { id: 'win_streak', label: 'Серія' }
];

const fetchLeaders = async () => {
  isLoading.value = true;
  try {
    const res = await fetch(`/api/public/leaderboard?type=${activeTab.value}&limit=50`);
    if (res.ok) {
      leaders.value = await res.json();
    }
  } catch (e) {
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

watch([() => props.isOpen, activeTab], ([isOpen]) => {
  if (isOpen) fetchLeaders();
});
</script>

<template>
  <transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

      <div class="relative w-full max-w-lg bg-surface rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scale-in">

        <div class="p-6 pb-2 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-2xl font-bold text-white">🏆 Лідерборди</h2>
          <button @click="emit('close')" class="text-on-surface-variant hover:text-white">✕</button>
        </div>

        <div class="flex p-2 gap-2 bg-black/20">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
            :class="activeTab === tab.id ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:bg-white/5'"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <div v-if="isLoading" class="text-center py-10">
            <svg class="animate-spin h-8 w-8 text-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
          </div>

          <table v-else class="w-full text-left border-collapse">
            <thead>
            <tr class="text-on-surface-variant text-xs uppercase border-b border-white/10">
              <th class="p-2 w-10">#</th>
              <th class="p-2">Гравець</th>
              <th class="p-2 text-right">Значення</th>
            </tr>
            </thead>
            <tbody class="text-sm">
            <tr v-for="(player, idx) in leaders" :key="idx" class="border-b border-white/5 hover:bg-white/5">
              <td class="p-3 font-mono text-primary font-bold">
                <span v-if="idx === 0">🥇</span>
                <span v-else-if="idx === 1">🥈</span>
                <span v-else-if="idx === 2">🥉</span>
                <span v-else>{{ idx + 1 }}</span>
              </td>
              <td class="p-3 text-white font-medium flex items-center gap-2">
                {{ player.username }}
                <span v-if="player.is_verified" class="text-blue-400" title="Verified">✓</span>
              </td>
              <td class="p-3 text-right font-mono text-on-surface">
                {{ activeTab === 'rating' ? Math.round(player.rating) : (activeTab === 'wins' ? player.wins : player.win_streak) }}
              </td>
            </tr>
            </tbody>
          </table>

          <div v-if="!isLoading && leaders.length === 0" class="text-center text-on-surface-variant py-10">
            Список порожній...
          </div>
        </div>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
</style>
