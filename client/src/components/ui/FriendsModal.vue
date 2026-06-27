<script setup>
import { ref, watch, computed } from 'vue';
import { useFriendsStore } from '@/stores/friends';
import { useGameStore } from '@/stores/game';
import { useI18n } from 'vue-i18n';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps({
  isOpen: Boolean,
  initialTab: { type: String, default: 'friends' }
});

const emit = defineEmits(['close']);

const friendsStore = useFriendsStore();
const gameStore = useGameStore();
const { t } = useI18n();

const activeTab = ref('friends');

watch(() => props.isOpen, (val) => {
  if (val) {
    friendsStore.fetchFriends();
    activeTab.value = props.initialTab || 'friends';
  }
});

const handleSearch = () => {
  friendsStore.searchUsers();
};

const isInLobby = computed(() => !!gameStore.gameId);

const invite = (id) => {
  if (isInLobby.value) {
    friendsStore.inviteToGame(id, gameStore.gameId);
  } else {
    alert(t('friends_alert_create_game_first'));
  }
};
</script>

<template>
  <BaseModal :is-open="isOpen" :title="$t('friends_title')" max-width="max-w-lg" @close="emit('close')">
    <div class="flex p-2 gap-2 bg-black/20">
      <button @click="activeTab = 'friends'"
              :class="activeTab === 'friends' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'"
              class="flex-1 min-h-[40px] py-2 rounded-xl text-sm font-bold transition-all active:scale-95">{{ $t('friends_tab_friends') }}</button>
      <button @click="activeTab = 'requests'"
              :class="activeTab === 'requests' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'"
              class="flex-1 min-h-[40px] py-2 rounded-xl text-sm font-bold transition-all relative active:scale-95">
        {{ $t('friends_tab_requests') }}
        <span v-if="friendsStore.incoming.length"
              class="absolute -top-1 -right-1 bg-error w-4 h-4 rounded-full text-[10px] flex items-center justify-center">{{
            friendsStore.incoming.length }}</span>
      </button>
      <button @click="activeTab = 'search'"
              :class="activeTab === 'search' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'"
              class="flex-1 min-h-[40px] py-2 rounded-xl text-sm font-bold transition-all active:scale-95">{{ $t('friends_tab_search') }}</button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">

      <div v-if="activeTab === 'friends'">
        <div v-if="friendsStore.friends.length === 0" class="text-center text-white/30 py-8">{{ $t('friends_empty') }}</div>
        <div v-for="user in friendsStore.friends" :key="user.id"
             class="flex items-center justify-between bg-white/5 p-3 rounded-xl">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white">
              {{ user.nickname[0] }}</div>
            <div>
              <div class="font-bold text-white flex items-center gap-2">
                {{ user.nickname }}
                <span v-if="user.isOnline"
                      class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_lime]"></span>
              </div>
              <div class="text-xs text-white/50">{{ $t('leaderboard_rating') }}: {{ Math.round(user.rating) }}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="invite(user.id)"
                    class="min-h-[36px] p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/40 transition-colors active:scale-95"
                    :class="{ 'opacity-50 cursor-not-allowed': !isInLobby }"
                    :title="isInLobby ? $t('friends_invite_title') : $t('friends_enter_lobby_title')">✉️</button>
            <button @click="friendsStore.removeFriend(user.id)"
                    class="min-h-[36px] p-2 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors active:scale-95"
                    :title="$t('friends_delete_title')">✕</button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'requests'">
        <h3 v-if="friendsStore.incoming.length" class="text-xs text-white/50 uppercase mb-2">{{ $t('friends_incoming_label') }}</h3>
        <div v-for="user in friendsStore.incoming" :key="user.id"
             class="flex items-center justify-between bg-white/5 p-3 rounded-xl mb-2">
          <span class="text-white font-bold">{{ user.nickname }}</span>
          <div class="flex gap-2">
            <button @click="friendsStore.acceptRequest(user.id)"
                    class="min-h-[36px] px-3 py-1 bg-primary text-on-primary rounded-lg text-sm active:scale-95">{{ $t('friends_accept') }}</button>
            <button @click="friendsStore.removeFriend(user.id)"
                    class="min-h-[36px] px-3 py-1 bg-white/10 text-white rounded-lg text-sm active:scale-95">{{ $t('friends_decline') }}</button>
          </div>
        </div>
        <div v-if="friendsStore.incoming.length === 0 && friendsStore.outgoing.length === 0"
             class="text-center text-white/30 py-8">{{ $t('friends_no_requests') }}</div>
      </div>

      <div v-if="activeTab === 'search'">
        <div class="flex gap-2 mb-4">
          <input v-model="friendsStore.searchQuery" @keyup.enter="handleSearch" type="text"
                 class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-primary focus:outline-none"
                 :placeholder="$t('friends_search_placeholder')">
          <button @click="handleSearch"
                  class="min-h-[36px] bg-primary px-4 rounded-xl text-on-primary font-bold active:scale-95">🔍</button>
        </div>

        <div v-if="friendsStore.searchResults.length === 0 && friendsStore.searchQuery.length > 1"
             class="text-center text-white/30 text-sm">{{ $t('friends_nothing_found') }}</div>

        <div v-for="user in friendsStore.searchResults" :key="user.id"
             class="flex items-center justify-between bg-white/5 p-3 rounded-xl">
          <span class="text-white font-bold">{{ user.nickname }}</span>
          <span v-if="friendsStore.friends.some(f => f.id === user.id)"
                class="text-xs text-green-400">{{ $t('friends_already_friend') }}</span>
          <button v-else @click="friendsStore.sendRequest(user.id)"
                  class="min-h-[36px] p-2 bg-white/10 rounded-lg hover:bg-primary hover:text-on-primary transition-colors text-sm active:scale-95">{{ $t('friends_add') }}</button>
        </div>
      </div>

    </div>
  </BaseModal>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
</style>
