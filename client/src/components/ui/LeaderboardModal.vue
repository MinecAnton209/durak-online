<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '@/components/ui/BaseModal.vue';
import ProfileModal from './ProfileModal.vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close']);

const activeTab = ref('rating');
const leaders = ref([]);
const isLoading = ref(false);
const showProfile = ref(false);
const profileUserId = ref(null);
const { t } = useI18n();

function openProfile(userId) {
  profileUserId.value = userId;
  showProfile.value = true;
}

const tabs = [
  { id: 'rating', label: t('leaderboard_rating') },
  { id: 'wins', label: t('leaderboard_wins') },
  { id: 'win_streak', label: t('leaderboard_win_streak') }
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
  <BaseModal :is-open="isOpen" :title="$t('leaderboard_title')" max-width="max-w-lg" @close="emit('close')">
    <div class="flex p-2 gap-2 bg-black/20">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="flex-1 min-h-[40px] py-2 rounded-xl text-sm font-bold transition-all"
        :class="activeTab === tab.id ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:bg-white/5'"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 scrollbar-thin">
      <div v-if="isLoading" class="text-center py-10">
        <svg class="animate-spin h-8 w-8 text-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
      </div>

      <div v-else class="text-sm">
        <div class="text-on-surface-variant text-xs uppercase border-b border-white/10 px-3 py-2 flex">
          <span class="w-10">#</span>
          <span class="flex-1">{{ $t('leaderboard_col_player') }}</span>
          <span class="text-right">{{ $t('leaderboard_col_value') }}</span>
        </div>
        <div
          v-for="(player, idx) in leaders"
          :key="idx"
          @click="openProfile(player.id)"
          class="border-b border-white/5 hover:bg-white/5 px-3 py-3 flex items-center cursor-pointer"
        >
          <span class="w-10 font-mono text-primary font-bold">
            <span v-if="idx === 0">🥇</span>
            <span v-else-if="idx === 1">🥈</span>
            <span v-else-if="idx === 2">🥉</span>
            <span v-else>{{ idx + 1 }}</span>
          </span>
          <span class="flex-1 text-white font-medium flex items-center gap-2">
            {{ player.username }}
            <span v-if="player.is_verified" class="text-blue-400" :title="$t('verified_label')">✓</span>
          </span>
          <span class="text-right font-mono text-on-surface">
            {{ activeTab === 'rating' ? Math.round(player.rating) : (activeTab === 'wins' ? player.wins : player.win_streak) }}
          </span>
        </div>
      </div>

      <div v-if="!isLoading && leaders.length === 0" class="text-center text-on-surface-variant py-10">
        {{ $t('leaderboard_empty') }}
      </div>
    </div>
  </BaseModal>
  <ProfileModal :is-open="showProfile" :user-id="profileUserId" @close="showProfile = false" />
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
</style>
