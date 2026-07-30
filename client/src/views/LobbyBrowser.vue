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
        class="col-span-2 bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 flex flex-col min-h-0">
        <div class="flex items-center gap-2 p-4 pb-0">
          <button @click="router.push('/')"
            class="shrink-0 text-lg p-2 bg-white/5 hover:bg-white/10 rounded-xl text-on-surface transition-all active:scale-90"
            :title="$t('back_to_main_menu')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="flex flex-1 p-1 bg-black/20 rounded-xl gap-1">
            <button @click="activeTab = 'find'" class="flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors"
              :class="activeTab === 'find' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-white'">{{
                $t('find_game') }}</button>
            <button @click="activeTab = 'create'" class="flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors"
              :class="activeTab === 'create' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-white'">{{
                $t('create_game') }}</button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div v-if="activeTab === 'find'" class="flex flex-col gap-4 animate-fade-in">
            <div class="flex justify-between items-center">
              <h3 class="font-bold text-base text-white">{{ $t('lobby_list_public') }}</h3>
              <button @click="forceRefresh"
                class="p-1.5 rounded-lg text-primary hover:text-white hover:bg-white/10 transition-all active:scale-90 flex items-center gap-1.5"
                :title="$t('refresh_list')">
                <span class="text-xs font-bold uppercase tracking-wider">{{ $t('refresh_list') }}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                  stroke="currentColor" class="w-4 h-4 transition-transform duration-500"
                  :class="{ 'animate-spin': isLoading }">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>
            <div v-if="isLoading && publicLobbies.length === 0" class="text-center py-8 text-on-surface-variant">{{
              $t('loading') }}...</div>
            <div v-else-if="publicLobbies.length === 0"
              class="text-center py-8 text-on-surface-variant bg-black/10 rounded-xl border border-white/5">{{
                $t('no_public_lobbies') }}</div>
            <div v-else class="space-y-2">
              <div v-for="lobby in publicLobbies" :key="lobby.gameId"
                class="bg-black/20 p-3 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/20 transition-colors gap-3">
                <div class="flex flex-col min-w-0"><span class="font-bold text-on-surface text-base">#{{ lobby.gameId }}</span>
                  <div class="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap mt-0.5"><span
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
                  class="bg-primary hover:bg-[#00A891] text-on-primary font-bold py-1.5 px-5 rounded-lg transition-all active:scale-95 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 min-w-[70px] justify-center text-sm shrink-0"><span
                    v-if="joiningLobbyId === lobby.gameId"
                    class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span><span
                    v-else>{{ $t('join_button') }}</span></button>
              </div>
            </div>
            <div class="relative flex py-0.5 items-center">
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
          <div v-if="activeTab === 'create'" class="flex flex-col gap-4 animate-fade-in">
            <!-- Section: Game Settings -->
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('settings_title') }}</span>
              <div class="flex-grow border-t border-outline/20"></div>
            </div>

            <!-- Lobby Type -->
            <div>
              <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">{{ $t('lobby_type') }}</label>
              <div class="flex gap-2">
                <button @click="lobbyType = 'public'"
                  class="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 border"
                  :class="lobbyType === 'public' ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  🌍 {{ $t('lobby_public') }}
                </button>
                <button @click="lobbyType = 'private'"
                  class="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 border"
                  :class="lobbyType === 'private' ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  🔒 {{ $t('lobby_private') }}
                </button>
              </div>
            </div>

            <!-- Players + Deck Row -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">{{ $t('players_count_label') }}</label>
                <div class="flex gap-1.5">
                  <button v-for="n in [2,3,4]" :key="n" @click="maxPlayers = n"
                    class="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 border"
                    :class="maxPlayers == n ? 'bg-primary text-on-primary border-primary shadow-sm shadow-primary/20' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                    {{ n }}
                  </button>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">{{ $t('deck_size_label') }}</label>
                <select v-model="deckSize"
                  class="w-full bg-black/20 border border-outline/30 rounded-xl px-3 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer appearance-none text-sm font-medium">
                  <option value="24" class="bg-surface">24</option>
                  <option value="36" class="bg-surface">36</option>
                  <option value="52" class="bg-surface">52</option>
                </select>
              </div>
            </div>

            <!-- Game Mode -->
            <div>
              <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">{{ $t('game_mode_label') }}</label>
              <div class="grid grid-cols-2 gap-2">
                <button @click="gameMode = 'podkidnoy'"
                  class="p-3 rounded-xl border text-left transition-all active:scale-[0.98]"
                  :class="gameMode === 'podkidnoy' ? 'bg-primary/10 border-primary/40 shadow-sm' : 'bg-black/20 border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">⬇️</span>
                    <span class="font-bold text-sm" :class="gameMode === 'podkidnoy' ? 'text-primary' : 'text-on-surface'">{{ $t('game_mode_podkidnoy') }}</span>
                  </div>
                </button>
                <button @click="gameMode = 'perevodnoy'"
                  class="p-3 rounded-xl border text-left transition-all active:scale-[0.98]"
                  :class="gameMode === 'perevodnoy' ? 'bg-primary/10 border-primary/40 shadow-sm' : 'bg-black/20 border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">🔄</span>
                    <span class="font-bold text-sm" :class="gameMode === 'perevodnoy' ? 'text-primary' : 'text-on-surface'">{{ $t('game_mode_perevodnoy') }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Turn Duration -->
            <div>
              <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">{{ $t('time_limit_label') }}</label>
              <select v-model="turnDuration"
                class="w-full bg-black/20 border border-outline/30 rounded-xl px-3 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer appearance-none text-sm font-medium">
                <option :value="15" class="bg-surface">{{ $t('time_15s') }}</option>
                <option :value="30" class="bg-surface">{{ $t('time_30s') }}</option>
                <option :value="60" class="bg-surface">{{ $t('time_60s') }}</option>
                <option :value="0" class="bg-surface">{{ $t('time_unlimited') }}</option>
              </select>
            </div>

            <!-- Betting Toggle -->
            <div
              class="flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer"
              :class="isBetting ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-black/20 border-outline/30 hover:bg-black/30 hover:border-outline/50'"
              @click="toggleBetting">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  :class="isBetting ? 'bg-primary/20' : 'bg-white/5'">
                  {{ isBetting ? '💰' : '🎲' }}
                </div>
                <div>
                  <div class="font-bold text-sm" :class="isBetting ? 'text-primary' : 'text-on-surface'">{{ $t('bet_toggle_label') }}</div>
                  <div class="text-[10px] text-on-surface-variant/60">{{ isBetting ? $t('bet_toggle_sublabel') : $t('bet_toggle_sublabel_simple') }}</div>
                </div>
              </div>
              <div class="w-12 h-7 rounded-full relative transition-colors duration-300 cursor-pointer select-none"
                :class="isBetting ? 'bg-primary' : 'bg-outline/40'"
                @click.stop="toggleBetting">
                <div
                  class="absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-md"
                  :class="isBetting ? 'left-6' : 'left-1'"></div>
              </div>
            </div>
            <div v-if="isBetting" class="animate-fade-in -mt-1">
              <label class="text-xs font-semibold text-primary ml-1 mb-2 block">{{ $t('bet_amount_label') }}</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-primary text-lg">💰</span>
                <input type="number" v-model="betAmount"
                  class="w-full bg-black/20 border border-primary/40 rounded-xl px-4 py-2.5 pl-10 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-bold text-sm transition-all"
                  min="10" step="10">
              </div>
            </div>

            <!-- Game Preview -->
            <div class="bg-black/20 rounded-xl border border-white/5 p-3.5">
              <div class="flex items-center gap-2 mb-2.5">
                <svg class="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('room_label') }}</span>
                <div class="flex-grow border-t border-outline/20"></div>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-base">{{ lobbyType === 'public' ? '🌍' : '🔒' }}</span>
                  <span class="font-medium text-on-surface text-xs">{{ lobbyType === 'public' ? $t('lobby_public') : $t('lobby_private') }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-base">👥</span>
                  <span class="text-on-surface-variant text-xs">{{ maxPlayers }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-base">🃏</span>
                  <span class="text-on-surface-variant text-xs">{{ deckSize }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-base">{{ gameMode === 'podkidnoy' ? '⬇️' : '🔄' }}</span>
                  <span class="text-on-surface-variant text-xs">{{ gameMode === 'podkidnoy' ? $t('game_mode_podkidnoy') : $t('game_mode_perevodnoy') }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-base">⏱️</span>
                  <span class="text-on-surface-variant text-xs">{{ turnDuration === 0 ? '∞' : turnDuration + 's' }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-base">{{ isBetting ? '💰' : '🎲' }}</span>
                  <span class="text-on-surface-variant text-xs">{{ isBetting ? betAmount : $t('bet_toggle_sublabel_simple') }}</span>
                </div>
              </div>
            </div>

            <button @click="createLobby"
              class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-base py-4 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ $t('create_lobby_button') }}
            </button>
          </div>
        </div>
      </div>

      <div class="col-span-1">
        <GlobalChat />
      </div>
    </div>

    <div class="md:hidden w-full h-full flex flex-col">
      <div
        class="bg-surface/95 backdrop-blur-sm shadow-2xl border border-white/5 flex flex-col flex-1 min-h-0">
        <div class="flex px-3 pt-3 items-center gap-2">
          <button @click="router.push('/')"
            class="shrink-0 text-lg p-1.5 bg-white/5 rounded-xl hover:bg-white/10 text-on-surface transition-all active:scale-90"
            :title="$t('back_to_main_menu')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="flex flex-1 p-1 bg-black/20 rounded-xl gap-1">
            <button @click="activeTab = 'find'" class="flex-1 py-2.5 rounded-lg font-bold text-xs transition-colors"
              :class="activeTab === 'find' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'">{{
                $t('find_game') }}</button>
            <button @click="activeTab = 'create'" class="flex-1 py-2.5 rounded-lg font-bold text-xs transition-colors"
              :class="activeTab === 'create' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'">{{
                $t('create_game') }}</button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto px-4 pb-4 pt-3 scrollbar-hide">
          <div v-if="activeTab === 'find'" class="flex flex-col gap-4 animate-fade-in">
            <div class="flex justify-between items-center">
              <h3 class="font-bold text-sm text-white">{{ $t('lobby_list_public') }}</h3>
              <button @click="forceRefresh"
                class="p-1.5 rounded-lg text-primary hover:text-white hover:bg-white/10 transition-all active:scale-90 flex items-center gap-1.5"
                :title="$t('refresh_list')">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                  stroke="currentColor" class="w-4 h-4 transition-transform duration-500"
                  :class="{ 'animate-spin': isLoading }">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>
            <div v-if="isLoading && publicLobbies.length === 0" class="text-center py-6 text-on-surface-variant text-sm">{{
              $t('loading') }}...</div>
            <div v-else-if="publicLobbies.length === 0"
              class="text-center py-6 text-on-surface-variant text-sm bg-black/10 rounded-xl border border-white/5">{{
                $t('no_public_lobbies') }}</div>
            <div v-else class="space-y-2">
              <div v-for="lobby in publicLobbies" :key="lobby.gameId"
                class="bg-black/20 p-2.5 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/20 transition-colors gap-2">
                <div class="flex flex-col min-w-0"><span class="font-bold text-on-surface text-sm">#{{ lobby.gameId }}</span>
                  <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant flex-wrap mt-0.5"><span
                      class="bg-white/10 px-1.5 py-0.5 rounded truncate max-w-[80px]">👑 {{ lobby.hostName }}</span><span
                      class="flex items-center gap-0.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20"><span
                        v-if="lobby.gameMode === 'perevodnoy'">🔄</span><span v-else>⬇️</span>{{ $t('game_mode_' +
                          (lobby.gameMode || 'podkidnoy')) }}</span><span>{{ lobby.playerCount }}/{{ lobby.maxPlayers }}
                      👤</span><span v-if="lobby.betAmount > 0" class="text-primary font-bold">💰{{ lobby.betAmount
                      }}</span></div>
                </div>
                <button @click="joinPublicLobby(lobby.gameId)" :disabled="joiningLobbyId === lobby.gameId"
                  class="bg-primary hover:bg-[#00A891] text-on-primary font-bold py-1.5 px-4 rounded-lg transition-all active:scale-95 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5 min-w-[65px] justify-center text-xs shrink-0"><span
                    v-if="joiningLobbyId === lobby.gameId"
                    class="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span><span
                    v-else>{{ $t('join_button') }}</span></button>
              </div>
            </div>
            <div class="relative flex py-0.5 items-center">
              <div class="flex-grow border-t border-outline/30"></div><span
                class="flex-shrink-0 mx-3 text-outline text-[10px] uppercase">{{ $t('or_separator') }}</span>
              <div class="flex-grow border-t border-outline/30"></div>
            </div>
            <div>
              <h3 class="font-bold text-sm text-white mb-2">{{ $t('join_private_lobby') }}</h3>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"><svg
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                      <path fill-rule="evenodd"
                        d="M15.75 1.5a6.75 6.75 0 00-6.651 7.906c-1.067.322-2.02 1.01-2.529 1.906l-1.074 1.89c-.3.528-.106 1.209.435 1.51l.97.543a1.125 1.125 0 01.36.85v.42c0 .499-.251.968-.669 1.25l-.59.4a2.656 2.656 0 00-.974 2.965l.947 3.315c.16.56.737.906 1.293.775l2.427-.57c.718-.169 1.267-.775 1.37-1.503l.36-2.404c.057-.38.318-.707.677-.849l.525-.21c.642-.256 1.396.06 1.638.69l.17.442c.275.715 1.055 1.116 1.8.925l1.63-.417c.596-.152.966-.757.825-1.353-.255-1.079.227-2.195 1.172-2.71a6.75 6.75 0 011.056-10.795zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z"
                        clip-rule="evenodd" />
                    </svg></div><input type="text" v-model="inviteCode" @keyup.enter="joinPrivateLobby"
                    class="w-full bg-black/20 border border-outline/50 rounded-xl pl-8 pr-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-all uppercase placeholder-on-surface-variant/50 font-mono tracking-widest"
                    :placeholder="$t('enter_code_placeholder')">
                </div><button @click="joinPrivateLobby" :disabled="!inviteCode.trim() || isJoiningCode"
                  class="bg-surface-variant hover:bg-on-surface-variant/20 text-on-surface font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0"><span
                    v-if="isJoiningCode"
                    class="animate-spin h-4 w-4 border-2 border-white/50 border-t-white rounded-full"></span><svg v-else
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5"
                    stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg></button>
              </div>
            </div>
          </div>
          <div v-if="activeTab === 'create'" class="flex flex-col gap-3 animate-fade-in">
            <!-- Section: Game Settings -->
            <div class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('settings_title') }}</span>
              <div class="flex-grow border-t border-outline/20"></div>
            </div>

            <!-- Lobby Type -->
            <div>
              <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('lobby_type') }}</label>
              <div class="flex gap-1.5">
                <button @click="lobbyType = 'public'"
                  class="flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all active:scale-95 border"
                  :class="lobbyType === 'public' ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  🌍 {{ $t('lobby_public') }}
                </button>
                <button @click="lobbyType = 'private'"
                  class="flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all active:scale-95 border"
                  :class="lobbyType === 'private' ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  🔒 {{ $t('lobby_private') }}
                </button>
              </div>
            </div>

            <!-- Players + Deck Row -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('players_count_label') }}</label>
                <div class="flex gap-1">
                  <button v-for="n in [2,3,4]" :key="n" @click="maxPlayers = n"
                    class="flex-1 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 border"
                    :class="maxPlayers == n ? 'bg-primary text-on-primary border-primary shadow-sm shadow-primary/20' : 'bg-black/20 text-on-surface-variant border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                    {{ n }}
                  </button>
                </div>
              </div>
              <div>
                <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('deck_size_label') }}</label>
                <select v-model="deckSize"
                  class="w-full bg-black/20 border border-outline/30 rounded-xl px-2.5 py-2 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer appearance-none text-xs font-medium">
                  <option value="24" class="bg-surface">24</option>
                  <option value="36" class="bg-surface">36</option>
                  <option value="52" class="bg-surface">52</option>
                </select>
              </div>
            </div>

            <!-- Game Mode -->
            <div>
              <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('game_mode_label') }}</label>
              <div class="grid grid-cols-2 gap-1.5">
                <button @click="gameMode = 'podkidnoy'"
                  class="p-2.5 rounded-xl border text-left transition-all active:scale-[0.98]"
                  :class="gameMode === 'podkidnoy' ? 'bg-primary/10 border-primary/40 shadow-sm' : 'bg-black/20 border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  <div class="flex items-center gap-1.5">
                    <span class="text-base">⬇️</span>
                    <span class="font-bold text-xs" :class="gameMode === 'podkidnoy' ? 'text-primary' : 'text-on-surface'">{{ $t('game_mode_podkidnoy') }}</span>
                  </div>
                </button>
                <button @click="gameMode = 'perevodnoy'"
                  class="p-2.5 rounded-xl border text-left transition-all active:scale-[0.98]"
                  :class="gameMode === 'perevodnoy' ? 'bg-primary/10 border-primary/40 shadow-sm' : 'bg-black/20 border-outline/30 hover:bg-black/30 hover:border-outline/50'">
                  <div class="flex items-center gap-1.5">
                    <span class="text-base">🔄</span>
                    <span class="font-bold text-xs" :class="gameMode === 'perevodnoy' ? 'text-primary' : 'text-on-surface'">{{ $t('game_mode_perevodnoy') }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Turn Duration -->
            <div>
              <label class="text-[10px] font-semibold text-on-surface-variant ml-1 mb-1.5 block">{{ $t('time_limit_label') }}</label>
              <select v-model="turnDuration"
                class="w-full bg-black/20 border border-outline/30 rounded-xl px-2.5 py-2 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer appearance-none text-xs font-medium">
                <option :value="15" class="bg-surface">{{ $t('time_15s') }}</option>
                <option :value="30" class="bg-surface">{{ $t('time_30s') }}</option>
                <option :value="60" class="bg-surface">{{ $t('time_60s') }}</option>
                <option :value="0" class="bg-surface">{{ $t('time_unlimited') }}</option>
              </select>
            </div>

            <!-- Betting Toggle -->
            <div
              class="flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer"
              :class="isBetting ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-black/20 border-outline/30 hover:bg-black/30 hover:border-outline/50'"
              @click="toggleBetting">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                  :class="isBetting ? 'bg-primary/20' : 'bg-white/5'">
                  {{ isBetting ? '💰' : '🎲' }}
                </div>
                <div>
                  <div class="font-bold text-xs" :class="isBetting ? 'text-primary' : 'text-on-surface'">{{ $t('bet_toggle_label') }}</div>
                  <div class="text-[9px] text-on-surface-variant/60">{{ isBetting ? $t('bet_toggle_sublabel') : $t('bet_toggle_sublabel_simple') }}</div>
                </div>
              </div>
              <div class="w-11 h-6 rounded-full relative transition-colors duration-300 cursor-pointer select-none"
                :class="isBetting ? 'bg-primary' : 'bg-outline/40'"
                @click.stop="toggleBetting">
                <div
                  class="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all duration-300 shadow-md"
                  :class="isBetting ? 'left-[22px]' : 'left-0.5'"></div>
              </div>
            </div>
            <div v-if="isBetting" class="animate-fade-in -mt-0.5">
              <label class="text-[10px] font-semibold text-primary ml-1 mb-1.5 block">{{ $t('bet_amount_label') }}</label>
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary text-base">💰</span>
                <input type="number" v-model="betAmount"
                  class="w-full bg-black/20 border border-primary/40 rounded-xl px-3.5 py-2 pl-8 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-bold text-xs transition-all"
                  min="10" step="10">
              </div>
            </div>

            <!-- Game Preview -->
            <div class="bg-black/20 rounded-xl border border-white/5 p-2.5">
              <div class="flex items-center gap-1.5 mb-2">
                <svg class="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{{ $t('room_label') }}</span>
                <div class="flex-grow border-t border-outline/20"></div>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1">
                <div class="flex items-center gap-1">
                  <span class="text-sm">{{ lobbyType === 'public' ? '🌍' : '🔒' }}</span>
                  <span class="font-medium text-on-surface text-[10px]">{{ lobbyType === 'public' ? $t('lobby_public') : $t('lobby_private') }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-sm">👥</span>
                  <span class="text-on-surface-variant text-[10px]">{{ maxPlayers }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-sm">🃏</span>
                  <span class="text-on-surface-variant text-[10px]">{{ deckSize }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-sm">{{ gameMode === 'podkidnoy' ? '⬇️' : '🔄' }}</span>
                  <span class="text-on-surface-variant text-[10px]">{{ gameMode === 'podkidnoy' ? $t('game_mode_podkidnoy') : $t('game_mode_perevodnoy') }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-sm">⏱️</span>
                  <span class="text-on-surface-variant text-[10px]">{{ turnDuration === 0 ? '∞' : turnDuration + 's' }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-sm">{{ isBetting ? '💰' : '🎲' }}</span>
                  <span class="text-on-surface-variant text-[10px]">{{ isBetting ? betAmount : $t('bet_toggle_sublabel_simple') }}</span>
                </div>
              </div>
            </div>

            <button @click="createLobby"
              class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold text-sm py-3.5 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              {{ $t('create_lobby_button') }}
            </button>
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
