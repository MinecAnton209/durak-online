<script setup>
import { ref, watch, computed } from 'vue';
import { useFriendsStore } from '@/stores/friends';
import { useGameStore } from '@/stores/game';

const props = defineProps({
  isOpen: Boolean,
  initialTab: { type: String, default: 'friends' }
});

const emit = defineEmits(['close']);

const friendsStore = useFriendsStore();
const gameStore = useGameStore();

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
    alert('Спочатку створіть гру або увійдіть у лобі!');
  }
};
</script>

<template>
  <transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

      <div
        class="relative w-full max-w-lg bg-surface rounded-3xl border border-white/10 shadow-2xl flex flex-col max-h-[80vh] animate-scale-in">

        <div class="p-6 pb-2 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-2xl font-bold text-white">👥 Друзі</h2>
          <button @click="emit('close')" class="text-on-surface-variant hover:text-white">✕</button>
        </div>

        <div class="flex p-2 gap-2 bg-black/20">
          <button @click="activeTab = 'friends'"
                  :class="activeTab === 'friends' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'"
                  class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">Мої друзі</button>
          <button @click="activeTab = 'requests'"
                  :class="activeTab === 'requests' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'"
                  class="flex-1 py-2 rounded-xl text-sm font-bold transition-all relative">
            Запити
            <span v-if="friendsStore.incoming.length"
                  class="absolute -top-1 -right-1 bg-error w-4 h-4 rounded-full text-[10px] flex items-center justify-center">{{
                friendsStore.incoming.length }}</span>
          </button>
          <button @click="activeTab = 'search'"
                  :class="activeTab === 'search' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'"
                  class="flex-1 py-2 rounded-xl text-sm font-bold transition-all">Пошук</button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">

          <div v-if="activeTab === 'friends'">
            <div v-if="friendsStore.friends.length === 0" class="text-center text-white/30 py-8">У вас поки
              немає друзів.</div>
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
                  <div class="text-xs text-white/50">Рейтинг: {{ Math.round(user.rating) }}</div>
                </div>
              </div>
              <div class="flex gap-2">
                <button @click="invite(user.id)"
                        class="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/40 transition-colors"
                        :class="{ 'opacity-50 cursor-not-allowed': !isInLobby }"
                        :title="isInLobby ? 'Запросити в гру' : 'Увійдіть у лобі'">✉️</button>
                <button @click="friendsStore.removeFriend(user.id)"
                        class="p-2 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors"
                        title="Видалити">✕</button>
              </div>
            </div>
          </div>

          <div v-if="activeTab === 'requests'">
            <h3 v-if="friendsStore.incoming.length" class="text-xs text-white/50 uppercase mb-2">Вхідні</h3>
            <div v-for="user in friendsStore.incoming" :key="user.id"
                 class="flex items-center justify-between bg-white/5 p-3 rounded-xl mb-2">
              <span class="text-white font-bold">{{ user.nickname }}</span>
              <div class="flex gap-2">
                <button @click="friendsStore.acceptRequest(user.id)"
                        class="px-3 py-1 bg-primary text-on-primary rounded-lg text-sm">Прийняти</button>
                <button @click="friendsStore.removeFriend(user.id)"
                        class="px-3 py-1 bg-white/10 text-white rounded-lg text-sm">Відхилити</button>
              </div>
            </div>
            <div v-if="friendsStore.incoming.length === 0 && friendsStore.outgoing.length === 0"
                 class="text-center text-white/30 py-8">Немає запитів.</div>
          </div>

          <div v-if="activeTab === 'search'">
            <div class="flex gap-2 mb-4">
              <input v-model="friendsStore.searchQuery" @keyup.enter="handleSearch" type="text"
                     class="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-primary focus:outline-none"
                     placeholder="Нікнейм...">
              <button @click="handleSearch"
                      class="bg-primary px-4 rounded-xl text-on-primary font-bold">🔍</button>
            </div>

            <div v-if="friendsStore.searchResults.length === 0 && friendsStore.searchQuery.length > 1"
                 class="text-center text-white/30 text-sm">Нічого не знайдено</div>

            <div v-for="user in friendsStore.searchResults" :key="user.id"
                 class="flex items-center justify-between bg-white/5 p-3 rounded-xl">
              <span class="text-white font-bold">{{ user.nickname }}</span>
              <span v-if="friendsStore.friends.some(f => f.id === user.id)"
                    class="text-xs text-green-400">Вже друг</span>
              <button v-else @click="friendsStore.sendRequest(user.id)"
                      class="p-2 bg-white/10 rounded-lg hover:bg-primary hover:text-on-primary transition-colors text-sm">Додати</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
