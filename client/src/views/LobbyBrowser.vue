<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useI18n } from 'vue-i18n';

import GlobalChat from '@/components/ui/GlobalChat.vue';
import AuthModal from '@/components/ui/AuthModal.vue';

const { t } = useI18n();
const router = useRouter();
const gameStore = useGameStore();
const authStore = useAuthStore();
const toast = useToastStore();

const activeTab = ref('find');
const inviteCode = ref('');
const isLoading = ref(true);

const isChatModalOpen = ref(false);

const publicLobbies = computed(() => gameStore.publicLobbies);
const joiningLobbyId = ref(null);
const isJoiningCode = ref(false);
let syncInterval = null;

const lobbyType = ref('public');
const maxPlayers = ref(authStore.user?.pref_quick_max_players || 2);
const deckSize = ref(authStore.user?.pref_quick_deck_size || 36);
const gameMode = ref(authStore.user?.pref_quick_game_mode || 'podkidnoy');
const turnDuration = ref(60);
const isBetting = ref(authStore.user?.pref_quick_is_betting || false);
const betAmount = ref(authStore.user?.pref_quick_bet_amount || 10);

const isAuthModalOpen = ref(false);
const authMode = ref('login');

const openAuth = (mode) => {
  authMode.value = mode;
  isAuthModalOpen.value = true;
};

const handleAuthSubmit = async ({ mode, username, password, onComplete }) => {
  try {
    await authStore.authenticate(mode, { username, password });
    onComplete(null);
    isAuthModalOpen.value = false;
    window.location.reload();
  } catch (err) {
    onComplete(err.message || t('error_generic'));
  }
};

onMounted(() => {
  gameStore.subscribeToLobbies();
  gameStore.refreshLobbyList();

  syncInterval = setInterval(() => {
    if (activeTab.value === 'find') {
      gameStore.refreshLobbyList();
    }
  }, 5000);

  setTimeout(() => { isLoading.value = false; }, 500);
});

onUnmounted(() => {
  gameStore.unsubscribeFromLobbies();
  if (syncInterval) clearInterval(syncInterval);
});

function forceRefresh() {
  isLoading.value = true;
  gameStore.refreshLobbyList().finally(() => {
    setTimeout(() => { isLoading.value = false; }, 300);
  });
}

function joinPublicLobby(gameId) {
  if (joiningLobbyId.value) return;
  joiningLobbyId.value = gameId;
  gameStore.joinLobby({ gameId });
  setTimeout(() => { if (joiningLobbyId.value === gameId) joiningLobbyId.value = null; }, 3000);
}

function joinPrivateLobby() {
  const code = inviteCode.value.trim();
  if (!code) return;
  isJoiningCode.value = true;
  gameStore.joinLobby({ inviteCode: code.toUpperCase() });
  setTimeout(() => { isJoiningCode.value = false; }, 3000);
}

function toggleBetting() {
  if (!authStore.isAuthenticated) {
    toast.addToast(t('error_guests_cannot_bet'), 'warning');
    return;
  }
  isBetting.value = !isBetting.value;
}

function createLobby() {
  const settings = {
    lobbyType: lobbyType.value,
    maxPlayers: parseInt(maxPlayers.value),
    deckSize: parseInt(deckSize.value),
    gameMode: gameMode.value,
    turnDuration: parseInt(turnDuration.value),
    betAmount: isBetting.value ? parseInt(betAmount.value) : 0,
    playerName: authStore.isAuthenticated ? authStore.user.username : `Guest ${Math.floor(Math.random() * 1000)}`
  };
  gameStore.createLobby(settings);
}
</script>

<template>
  <div class="h-[100dvh] w-full flex items-center justify-center p-4 bg-background overflow-hidden">

    <div class="hidden md:grid w-full max-w-6xl h-[90vh] grid-cols-3 gap-4">

      <div
        class="col-span-2 bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 flex flex-col relative">
        <button @click="router.push('/')"
          class="absolute -top-3 -left-3 z-10 text-xl p-2 bg-surface rounded-full hover:bg-surface-variant text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg"
          :title="$t('back_to_main_menu')">←</button>
        <div class="flex p-2 bg-black/20 rounded-t-3xl">
          <button @click="activeTab = 'find'" class="flex-1 py-3 px-4 rounded-2xl font-bold transition-colors"
            :class="activeTab === 'find' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'">{{
              $t('find_game') }}</button>
          <button @click="activeTab = 'create'" class="flex-1 py-3 px-4 rounded-2xl font-bold transition-colors"
            :class="activeTab === 'create' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'">{{
              $t('create_game') }}</button>
        </div>
        <div class="p-6 overflow-y-auto">
          <div v-if="activeTab === 'find'" class="flex flex-col gap-6 animate-fade-in">
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-bold text-lg text-white">{{ $t('lobby_list_public') }}</h3>
              <button @click="forceRefresh"
                class="p-2 rounded-lg text-primary hover:text-white hover:bg-white/10 transition-all active:scale-95 flex items-center gap-2"
                :title="$t('refresh_list')"><span
                  class="text-xs font-bold uppercase tracking-wider hidden sm:inline-block">{{ $t('refresh_list')
                  }}</span><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                  stroke="currentColor" class="w-5 h-5 transition-transform duration-500"
                  :class="{ 'animate-spin': isLoading }">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg></button>
            </div>
            <div v-if="isLoading && publicLobbies.length === 0" class="text-center py-8 text-on-surface-variant">{{
              $t('loading') }}...</div>
            <div v-else-if="publicLobbies.length === 0"
              class="text-center py-8 text-on-surface-variant bg-black/10 rounded-xl border border-white/5">{{
                $t('no_public_lobbies') }}</div>
            <div v-else class="space-y-3">
              <div v-for="lobby in publicLobbies" :key="lobby.gameId"
                class="bg-black/20 p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/20 transition-colors">
                <div class="flex flex-col"><span class="font-bold text-on-surface text-lg">#{{ lobby.gameId }}</span>
                  <div class="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap mt-1"><span
                      class="bg-white/10 px-1.5 py-0.5 rounded">👑 {{ lobby.hostName }}</span><span
                      class="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20"><span
                        v-if="lobby.gameMode === 'perevodnoy'">🔄</span><span v-else>⬇️</span>{{ $t('game_mode_' +
                          (lobby.gameMode || 'podkidnoy')) }}</span><span
                      class="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/10"
                      :title="$t('time_limit_label')"><span>⏱️</span>{{ lobby.turnDuration === 0 ? '∞' :
                        lobby.turnDuration + 's' }}</span><span>{{ lobby.playerCount }}/{{ lobby.maxPlayers }}
                      👤</span><span v-if="lobby.betAmount > 0" class="text-primary font-bold">💰{{ lobby.betAmount
                      }}</span></div>
                </div>
                <button @click="joinPublicLobby(lobby.gameId)" :disabled="joiningLobbyId === lobby.gameId"
                  class="bg-primary hover:bg-[#00A891] text-on-primary font-bold py-2 px-6 rounded-lg transition-all active:scale-95 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 min-w-[80px] justify-center"><span
                    v-if="joiningLobbyId === lobby.gameId"
                    class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span><span
                    v-else>{{ $t('join_button') }}</span></button>
              </div>
            </div>
            <div class="relative flex py-1 items-center">
              <div class="flex-grow border-t border-outline/30"></div><span
                class="flex-shrink-0 mx-4 text-outline text-xs uppercase">{{ $t('or_separator') }}</span>
              <div class="flex-grow border-t border-outline/30"></div>
            </div>
            <div>
              <h3 class="font-bold text-lg text-white mb-3">{{ $t('join_private_lobby') }}</h3>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <div class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"><svg
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                      <path fill-rule="evenodd"
                        d="M15.75 1.5a6.75 6.75 0 00-6.651 7.906c-1.067.322-2.02 1.01-2.529 1.906l-1.074 1.89c-.3.528-.106 1.209.435 1.51l.97.543a1.125 1.125 0 01.36.85v.42c0 .499-.251.968-.669 1.25l-.59.4a2.656 2.656 0 00-.974 2.965l.947 3.315c.16.56.737.906 1.293.775l2.427-.57c.718-.169 1.267-.775 1.37-1.503l.36-2.404c.057-.38.318-.707.677-.849l.525-.21c.642-.256 1.396.06 1.638.69l.17.442c.275.715 1.055 1.116 1.8.925l1.63-.417c.596-.152.966-.757.825-1.353-.255-1.079.227-2.195 1.172-2.71a6.75 6.75 0 011.056-10.795zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z"
                        clip-rule="evenodd" />
                    </svg></div><input type="text" v-model="inviteCode" @keyup.enter="joinPrivateLobby"
                    class="w-full bg-black/20 border border-outline/50 rounded-xl pl-10 pr-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-all uppercase placeholder-on-surface-variant/50 font-mono tracking-widest"
                    :placeholder="$t('enter_code_placeholder')">
                </div><button @click="joinPrivateLobby" :disabled="!inviteCode.trim() || isJoiningCode"
                  class="bg-surface-variant hover:bg-on-surface-variant/20 text-on-surface font-bold py-2 px-6 rounded-xl transition-all active:scale-95 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"><span
                    v-if="isJoiningCode"
                    class="animate-spin h-5 w-5 border-2 border-white/50 border-t-white rounded-full"></span><svg v-else
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5"
                    stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg></button>
              </div>
            </div>
          </div>
          <div v-if="activeTab === 'create'" class="flex flex-col gap-5 animate-fade-in">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('lobby_type')
                  }}</label><select v-model="lobbyType"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="public" class="bg-surface text-black">{{ $t('lobby_public') }}</option>
                  <option value="private" class="bg-surface text-black">{{ $t('lobby_private') }}</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('players_count_label')
                  }}</label><select v-model="maxPlayers"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="2" class="bg-surface text-black">2</option>
                  <option value="3" class="bg-surface text-black">3</option>
                  <option value="4" class="bg-surface text-black">4</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('deck_size_label')
                  }}</label><select v-model="deckSize"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="24" class="bg-surface text-black">24</option>
                  <option value="36" class="bg-surface text-black">36</option>
                  <option value="52" class="bg-surface text-black">52</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('game_mode_label')
                  }}</label><select v-model="gameMode"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="podkidnoy" class="bg-surface text-black">{{ $t('game_mode_podkidnoy') }}</option>
                  <option value="perevodnoy" class="bg-surface text-black">{{ $t('game_mode_perevodnoy') }}</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('time_limit_label')
                  }}</label><select v-model="turnDuration"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option :value="15" class="bg-surface text-black">{{ $t('time_15s') }}</option>
                  <option :value="30" class="bg-surface text-black">{{ $t('time_30s') }}</option>
                  <option :value="60" class="bg-surface text-black">{{ $t('time_60s') }}</option>
                  <option :value="0" class="bg-surface text-black">{{ $t('time_unlimited') }}</option>
                </select></div>
            </div>
            <div
              class="flex items-center justify-between p-3 rounded-xl border border-transparent transition-colors cursor-pointer"
              :class="isBetting ? 'bg-primary/10 border-primary/30' : 'bg-black/20 hover:bg-black/30'"
              @click="toggleBetting">
              <div class="flex items-center gap-3"><span class="text-xl">{{ isBetting ? '💰' : '🎲' }}</span><span
                  class="font-bold text-sm" :class="isBetting ? 'text-primary' : 'text-on-surface'">{{
                    $t('bet_toggle_label') }}</span></div>
              <div class="w-12 h-6 rounded-full relative transition-colors duration-300"
                :class="isBetting ? 'bg-primary' : 'bg-outline/50'">
                <div
                  class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm"
                  :class="{ 'translate-x-6': isBetting }"></div>
              </div>
            </div>
            <div v-if="isBetting" class="space-y-1.5 animate-fade-in"><label
                class="text-xs font-bold text-primary uppercase ml-1">{{ $t('bet_amount_label') }}</label>
              <div class="relative"><input type="number" v-model="betAmount"
                  class="w-full bg-black/20 border rounded-xl px-4 py-3 text-on-surface focus:outline-none border-primary focus:ring-1 focus:ring-primary pl-10 font-bold"
                  min="10" step="10"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-primary">💰</span></div>
            </div><button @click="createLobby"
              class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-lg py-4 rounded-2xl shadow-lg mt-2 transition-all active:scale-95">{{
                $t('create_lobby_button') }}</button>
          </div>
        </div>
      </div>

      <div class="col-span-1">
        <GlobalChat />
      </div>
    </div>

    <div class="md:hidden w-full max-w-2xl h-full flex flex-col relative">
      <div
        class="bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 flex flex-col relative flex-1 max-h-full">
        <button @click="router.push('/')"
          class="absolute -top-3 -left-3 z-10 text-xl p-2 bg-surface rounded-full hover:bg-surface-variant text-on-surface transition-all active:scale-95 border border-white/10 shadow-lg"
          :title="$t('back_to_main_menu')">←</button>
        <div class="flex p-2 bg-black/20 rounded-t-3xl">
          <button @click="activeTab = 'find'" class="flex-1 py-3 px-4 rounded-2xl font-bold transition-colors"
            :class="activeTab === 'find' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'">{{
              $t('find_game') }}</button>
          <button @click="activeTab = 'create'" class="flex-1 py-3 px-4 rounded-2xl font-bold transition-colors"
            :class="activeTab === 'create' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-white/5'">{{
              $t('create_game') }}</button>
        </div>
        <div class="p-6 overflow-y-auto">
          <div v-if="activeTab === 'find'" class="flex flex-col gap-6 animate-fade-in">
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-bold text-lg text-white">{{ $t('lobby_list_public') }}</h3>
              <button @click="forceRefresh"
                class="p-2 rounded-lg text-primary hover:text-white hover:bg-white/10 transition-all active:scale-95 flex items-center gap-2"
                :title="$t('refresh_list')"><span
                  class="text-xs font-bold uppercase tracking-wider hidden sm:inline-block">{{ $t('refresh_list')
                  }}</span><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                  stroke="currentColor" class="w-5 h-5 transition-transform duration-500"
                  :class="{ 'animate-spin': isLoading }">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg></button>
            </div>
            <div v-if="isLoading && publicLobbies.length === 0" class="text-center py-8 text-on-surface-variant">{{
              $t('loading') }}...</div>
            <div v-else-if="publicLobbies.length === 0"
              class="text-center py-8 text-on-surface-variant bg-black/10 rounded-xl border border-white/5">{{
                $t('no_public_lobbies') }}</div>
            <div v-else class="space-y-3">
              <div v-for="lobby in publicLobbies" :key="lobby.gameId"
                class="bg-black/20 p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/20 transition-colors">
                <div class="flex flex-col"><span class="font-bold text-on-surface text-lg">#{{ lobby.gameId }}</span>
                  <div class="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap mt-1"><span
                      class="bg-white/10 px-1.5 py-0.5 rounded">👑 {{ lobby.hostName }}</span><span
                      class="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20"><span
                        v-if="lobby.gameMode === 'perevodnoy'">🔄</span><span v-else>⬇️</span>{{ $t('game_mode_' +
                          (lobby.gameMode || 'podkidnoy')) }}</span><span
                      class="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/10"
                      :title="$t('time_limit_label')"><span>⏱️</span>{{ lobby.turnDuration === 0 ? '∞' :
                        lobby.turnDuration + 's' }}</span><span>{{ lobby.playerCount }}/{{ lobby.maxPlayers }}
                      👤</span><span v-if="lobby.betAmount > 0" class="text-primary font-bold">💰{{ lobby.betAmount
                      }}</span></div>
                </div>
                <button @click="joinPublicLobby(lobby.gameId)" :disabled="joiningLobbyId === lobby.gameId"
                  class="bg-primary hover:bg-[#00A891] text-on-primary font-bold py-2 px-6 rounded-lg transition-all active:scale-95 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 min-w-[80px] justify-center"><span
                    v-if="joiningLobbyId === lobby.gameId"
                    class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span><span
                    v-else>{{ $t('join_button') }}</span></button>
              </div>
            </div>
            <div class="relative flex py-1 items-center">
              <div class="flex-grow border-t border-outline/30"></div><span
                class="flex-shrink-0 mx-4 text-outline text-xs uppercase">{{ $t('or_separator') }}</span>
              <div class="flex-grow border-t border-outline/30"></div>
            </div>
            <div>
              <h3 class="font-bold text-lg text-white mb-3">{{ $t('join_private_lobby') }}</h3>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <div class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"><svg
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                      <path fill-rule="evenodd"
                        d="M15.75 1.5a6.75 6.75 0 00-6.651 7.906c-1.067.322-2.02 1.01-2.529 1.906l-1.074 1.89c-.3.528-.106 1.209.435 1.51l.97.543a1.125 1.125 0 01.36.85v.42c0 .499-.251.968-.669 1.25l-.59.4a2.656 2.656 0 00-.974 2.965l.947 3.315c.16.56.737.906 1.293.775l2.427-.57c.718-.169 1.267-.775 1.37-1.503l.36-2.404c.057-.38.318-.707.677-.849l.525-.21c.642-.256 1.396.06 1.638.69l.17.442c.275.715 1.055 1.116 1.8.925l1.63-.417c.596-.152.966-.757.825-1.353-.255-1.079.227-2.195 1.172-2.71a6.75 6.75 0 011.056-10.795zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z"
                        clip-rule="evenodd" />
                    </svg></div><input type="text" v-model="inviteCode" @keyup.enter="joinPrivateLobby"
                    class="w-full bg-black/20 border border-outline/50 rounded-xl pl-10 pr-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-all uppercase placeholder-on-surface-variant/50 font-mono tracking-widest"
                    :placeholder="$t('enter_code_placeholder')">
                </div><button @click="joinPrivateLobby" :disabled="!inviteCode.trim() || isJoiningCode"
                  class="bg-surface-variant hover:bg-on-surface-variant/20 text-on-surface font-bold py-2 px-6 rounded-xl transition-all active:scale-95 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"><span
                    v-if="isJoiningCode"
                    class="animate-spin h-5 w-5 border-2 border-white/50 border-t-white rounded-full"></span><svg v-else
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5"
                    stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg></button>
              </div>
            </div>
          </div>
          <div v-if="activeTab === 'create'" class="flex flex-col gap-5 animate-fade-in">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('lobby_type')
                  }}</label><select v-model="lobbyType"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="public" class="bg-surface text-black">{{ $t('lobby_public') }}</option>
                  <option value="private" class="bg-surface text-black">{{ $t('lobby_private') }}</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('players_count_label')
                  }}</label><select v-model="maxPlayers"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="2" class="bg-surface text-black">2</option>
                  <option value="3" class="bg-surface text-black">3</option>
                  <option value="4" class="bg-surface text-black">4</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('deck_size_label')
                  }}</label><select v-model="deckSize"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="24" class="bg-surface text-black">24</option>
                  <option value="36" class="bg-surface text-black">36</option>
                  <option value="52" class="bg-surface text-black">52</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('game_mode_label')
                  }}</label><select v-model="gameMode"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option value="podkidnoy" class="bg-surface text-black">{{ $t('game_mode_podkidnoy') }}</option>
                  <option value="perevodnoy" class="bg-surface text-black">{{ $t('game_mode_perevodnoy') }}</option>
                </select></div>
              <div><label class="text-xs font-bold text-on-surface-variant uppercase ml-1">{{ $t('time_limit_label')
                  }}</label><select v-model="turnDuration"
                  class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-3 mt-1 text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none">
                  <option :value="15" class="bg-surface text-black">{{ $t('time_15s') }}</option>
                  <option :value="30" class="bg-surface text-black">{{ $t('time_30s') }}</option>
                  <option :value="60" class="bg-surface text-black">{{ $t('time_60s') }}</option>
                  <option :value="0" class="bg-surface text-black">{{ $t('time_unlimited') }}</option>
                </select></div>
            </div>
            <div
              class="flex items-center justify-between p-3 rounded-xl border border-transparent transition-colors cursor-pointer"
              :class="isBetting ? 'bg-primary/10 border-primary/30' : 'bg-black/20 hover:bg-black/30'"
              @click="toggleBetting">
              <div class="flex items-center gap-3"><span class="text-xl">{{ isBetting ? '💰' : '🎲' }}</span><span
                  class="font-bold text-sm" :class="isBetting ? 'text-primary' : 'text-on-surface'">{{
                    $t('bet_toggle_label') }}</span></div>
              <div class="w-12 h-6 rounded-full relative transition-colors duration-300"
                :class="isBetting ? 'bg-primary' : 'bg-outline/50'">
                <div
                  class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm"
                  :class="{ 'translate-x-6': isBetting }"></div>
              </div>
            </div>
            <div v-if="isBetting" class="space-y-1.5 animate-fade-in"><label
                class="text-xs font-bold text-primary uppercase ml-1">{{ $t('bet_amount_label') }}</label>
              <div class="relative"><input type="number" v-model="betAmount"
                  class="w-full bg-black/20 border rounded-xl px-4 py-3 text-on-surface focus:outline-none border-primary focus:ring-1 focus:ring-primary pl-10 font-bold"
                  min="10" step="10"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-primary">💰</span></div>
            </div><button @click="createLobby"
              class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-lg py-4 rounded-2xl shadow-lg mt-2 transition-all active:scale-95">{{
                $t('create_lobby_button') }}</button>
          </div>
        </div>
      </div>

      <button @click="isChatModalOpen = true"
        class="fixed bottom-6 right-6 bg-primary text-on-primary rounded-full w-16 h-16 flex items-center justify-center shadow-lg text-3xl z-40 active:scale-90 transition-transform md:hidden">
        💬
      </button>
    </div>

    <transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="opacity-0 translate-y-full"
      enter-to-class="opacity-100 translate-y-0" leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-full">
      <div v-if="isChatModalOpen"
        class="md:hidden fixed inset-0 bg-background/80 backdrop-blur-md z-50 p-4 pt-8 flex flex-col">
        <div class="flex-1 min-h-0">
          <GlobalChat />
        </div>
        <button @click="isChatModalOpen = false"
          class="mt-4 bg-surface-variant text-on-surface-variant font-bold py-3 rounded-xl w-full">
          {{ $t('close_chat_button') }}
        </button>
      </div>
    </transition>

    <AuthModal :is-open="isAuthModalOpen" :mode="authMode" @close="isAuthModalOpen = false"
      @submit="handleAuthSubmit" />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
