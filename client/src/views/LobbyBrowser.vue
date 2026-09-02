<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useI18n } from 'vue-i18n';

import GlobalChat from '@/components/ui/GlobalChat.vue';
import AuthModal from '@/components/ui/AuthModal.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const gameStore = useGameStore();
const authStore = useAuthStore();
const toast = useToastStore();

const activeTab = ref('find');
const inviteCode = ref('');
const isLoading = ref(true);

const isChatModalOpen = ref(false);

const publicLobbies = computed(() => gameStore.publicLobbies);
const pokerLobbies = computed(() => gameStore.pokerLobbies);
const joiningLobbyId = ref(null);
const isJoiningCode = ref(false);
let syncInterval = null;

// Filters (Find tab)
const gameFilter = ref('all'); // 'all' | 'durak' | 'poker'
const typeFilter = ref('all'); // 'all' | 'cash' | 'tournament'
const statusFilter = ref('all'); // 'all' | 'waiting' | 'in_progress'
const betFilter = ref('all'); // 'all' | 'free' | 'paid'
const sortBy = ref('players_desc'); // 'players_desc' | 'players_asc' | 'newest' | 'bet_desc'

// Create tab — Durak or Poker
const createGame = ref('durak'); // 'durak' | 'poker'
const lobbyType = ref('public');
const maxPlayers = ref(authStore.user?.pref_quick_max_players || 2);
const deckSize = ref(authStore.user?.pref_quick_deck_size || 36);
const gameMode = ref(authStore.user?.pref_quick_game_mode || 'podkidnoy');
const turnDuration = ref(60);
const isBetting = ref(authStore.user?.pref_quick_is_betting || false);
const betAmount = ref(authStore.user?.pref_quick_bet_amount || 10);

// Poker settings
const pokerVariant = ref('cash'); // 'cash' | 'tournament'
const pokerMax = ref(6);
const pokerChips = ref(1000);
const pokerBlinds = ref('10_20');

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

const isCreatingPoker = ref(false);
const isCreatingDurak = ref(false);

// Combined unified list of active games
const unifiedLobbies = computed(() => {
  const durakItems = publicLobbies.value.map((l) => ({
    kind: 'durak',
    gameId: l.gameId,
    hostName: l.hostName,
    playerCount: l.playerCount,
    maxPlayers: l.maxPlayers,
    betAmount: l.betAmount || 0,
    gameMode: l.gameMode,
    turnDuration: l.turnDuration,
    gameType: l.betAmount > 0 ? 'cash' : 'free',
    status: 'waiting',
  }));
  const pokerItems = pokerLobbies.value.map((l) => ({
    kind: 'poker',
    gameId: l.gameId,
    hostName: `Стол #${l.gameId.slice(0, 4)}`,
    playerCount: l.players,
    maxPlayers: l.maxPlayers,
    betAmount: 0,
    gameMode: null,
    gameType: l.gameType === 'poker_holdem_tournament' ? 'tournament' : 'cash',
    pokerBlinds: `${l.smallBlind}/${l.bigBlind}`,
    pokerChips: l.startingChips,
    status: 'waiting',
  }));
  return [...durakItems, ...pokerItems];
});

const filteredLobbies = computed(() => {
  let list = unifiedLobbies.value.filter((l) => {
    if (gameFilter.value === 'durak' && l.kind !== 'durak') return false;
    if (gameFilter.value === 'poker' && l.kind !== 'poker') return false;
    if (typeFilter.value === 'cash' && l.gameType !== 'cash' && l.gameType !== 'free') return false;
    if (typeFilter.value === 'tournament' && l.gameType !== 'tournament') return false;
    if (statusFilter.value !== 'all' && l.status !== statusFilter.value) return false;
    if (betFilter.value === 'free' && l.betAmount > 0) return false;
    if (betFilter.value === 'paid' && l.betAmount === 0) return false;
    return true;
  });

  switch (sortBy.value) {
    case 'players_desc':
      list = list.sort((a, b) => b.playerCount - a.playerCount);
      break;
    case 'players_asc':
      list = list.sort((a, b) => a.playerCount - b.playerCount);
      break;
    case 'newest':
      list = list.sort((a, b) => (a.gameId < b.gameId ? 1 : -1));
      break;
    case 'bet_desc':
      list = list.sort((a, b) => b.betAmount - a.betAmount);
      break;
  }
  return list;
});

const counts = computed(() => ({
  all: unifiedLobbies.value.length,
  durak: unifiedLobbies.value.filter((l) => l.kind === 'durak').length,
  poker: unifiedLobbies.value.filter((l) => l.kind === 'poker').length,
  waiting: unifiedLobbies.value.filter((l) => l.status === 'waiting').length,
  free: unifiedLobbies.value.filter((l) => l.betAmount === 0).length,
  paid: unifiedLobbies.value.filter((l) => l.betAmount > 0).length,
}));

onMounted(() => {
  if (route.query.game === 'poker') {
    createGame.value = 'poker';
    activeTab.value = 'create';
  }
  gameStore.subscribeToLobbies();
  gameStore.refreshLobbyList();
  gameStore.refreshPokerLobbies();

  syncInterval = setInterval(() => {
    if (activeTab.value === 'find') {
      gameStore.refreshLobbyList();
      gameStore.refreshPokerLobbies();
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
  Promise.all([gameStore.refreshLobbyList(), gameStore.refreshPokerLobbies()]).finally(() => {
    setTimeout(() => { isLoading.value = false; }, 300);
  });
}

function joinLobby(lobby) {
  if (joiningLobbyId.value) return;
  joiningLobbyId.value = lobby.gameId;
  if (lobby.kind === 'poker') {
    gameStore.joinPokerLobby(lobby.gameId);
  } else {
    gameStore.joinLobby({ gameId: lobby.gameId });
  }
  setTimeout(() => { if (joiningLobbyId.value === lobby.gameId) joiningLobbyId.value = null; }, 3000);
}

function joinByCode() {
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

function createDurakLobby() {
  if (isCreatingDurak.value) return;
  const settings = {
    lobbyType: lobbyType.value,
    maxPlayers: parseInt(maxPlayers.value),
    deckSize: parseInt(deckSize.value),
    gameMode: gameMode.value,
    turnDuration: parseInt(turnDuration.value),
    betAmount: isBetting.value ? parseInt(betAmount.value) : 0,
    playerName: authStore.isAuthenticated ? authStore.user.username : `Guest ${Math.floor(Math.random() * 1000)}`,
  };
  isCreatingDurak.value = true;
  gameStore.createLobby(settings);
  setTimeout(() => { isCreatingDurak.value = false; }, 5000);
}

function createPokerGame() {
  if (isCreatingPoker.value) return;
  const [sb, bb] = pokerBlinds.value.split('_').map(Number);
  const gameType = pokerVariant.value === 'tournament' ? 'poker_holdem_tournament' : 'poker_holdem_cash';
  const settings = {
    gameType,
    maxPlayers: parseInt(pokerMax.value),
    startingChips: parseInt(pokerChips.value),
    smallBlind: sb,
    bigBlind: bb,
  };
  console.log('[LobbyBrowser] Creating poker game', settings);
  isCreatingPoker.value = true;
  gameStore.createPokerLobby(settings);
  // Failsafe: re-enable button after 5s if no redirect arrives
  setTimeout(() => {
    if (isCreatingPoker.value) {
      console.warn('[LobbyBrowser] pokerLobbyCreated not received in 5s, re-enabling button');
      isCreatingPoker.value = false;
    }
  }, 5000);
}

const pokerPresetOptions = [
  { value: '5_10', label: 'Микро (5/10)', sb: 5, bb: 10, chips: 500 },
  { value: '10_20', label: 'Стандарт (10/20)', sb: 10, bb: 20, chips: 1000 },
  { value: '25_50', label: 'High Roller (25/50)', sb: 25, bb: 50, chips: 2500 },
];

function applyPokerPreset(v) {
  pokerBlinds.value = v;
  const p = pokerPresetOptions.find((x) => x.value === v);
  if (p) pokerChips.value = p.chips;
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
          <div v-if="activeTab === 'find'" class="flex flex-col gap-3 animate-fade-in">
            <!-- Filter row -->
            <div class="flex flex-wrap gap-2 items-center">
              <div class="flex p-1 bg-black/20 rounded-xl gap-0.5">
                <button @click="gameFilter = 'all'"
                  class="px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                  :class="gameFilter === 'all' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-white'">
                  🎯 Все ({{ counts.all }})
                </button>
                <button @click="gameFilter = 'durak'"
                  class="px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                  :class="gameFilter === 'durak' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-white'">
                  🃏 Дурак ({{ counts.durak }})
                </button>
                <button @click="gameFilter = 'poker'"
                  class="px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                  :class="gameFilter === 'poker' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant hover:text-white'">
                  ♠️ Покер ({{ counts.poker }})
                </button>
              </div>
              <select v-model="statusFilter"
                class="bg-black/20 border border-outline/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary">
                <option value="all">Любой статус</option>
                <option value="waiting">Ожидание</option>
                <option value="in_progress">В игре</option>
              </select>
              <select v-model="typeFilter"
                class="bg-black/20 border border-outline/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary">
                <option value="all">Любой тип</option>
                <option value="cash">Кэш</option>
                <option value="tournament">Турнир</option>
              </select>
              <select v-model="betFilter"
                class="bg-black/20 border border-outline/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary">
                <option value="all">Любые ставки</option>
                <option value="free">Бесплатные</option>
                <option value="paid">На деньги</option>
              </select>
              <select v-model="sortBy"
                class="bg-black/20 border border-outline/30 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary ml-auto">
                <option value="players_desc">👥 Больше игроков</option>
                <option value="players_asc">👥 Меньше игроков</option>
                <option value="newest">🆕 Сначала новые</option>
                <option value="bet_desc">💰 По ставкам</option>
              </select>
              <button @click="forceRefresh"
                class="p-1.5 rounded-lg text-primary hover:text-white hover:bg-white/10 transition-all active:scale-90"
                :title="$t('refresh_list')">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                  stroke="currentColor" class="w-4 h-4 transition-transform duration-500"
                  :class="{ 'animate-spin': isLoading }">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>

            <div v-if="isLoading && filteredLobbies.length === 0" class="text-center py-8 text-on-surface-variant">{{
              $t('loading') }}...</div>
            <div v-else-if="filteredLobbies.length === 0"
              class="text-center py-8 text-on-surface-variant bg-black/10 rounded-xl border border-white/5">
              🎮 Нет активных игр с выбранными фильтрами
            </div>
            <div v-else class="space-y-2">
              <div v-for="lobby in filteredLobbies" :key="`${lobby.kind}-${lobby.gameId}`"
                class="bg-black/20 p-3 rounded-xl flex items-center justify-between border transition-colors gap-3"
                :class="lobby.kind === 'poker' ? 'border-emerald-500/20 hover:border-emerald-400/40' : 'border-white/5 hover:border-white/20'">
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="text-base shrink-0">{{ lobby.kind === 'poker' ? '♠️' : '🃏' }}</span>
                    <span class="font-bold text-on-surface text-base truncate">#{{ lobby.gameId }}</span>
                    <span v-if="lobby.kind === 'poker'"
                      class="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">Покер</span>
                    <span v-else-if="lobby.gameType === 'tournament'"
                      class="text-[10px] font-bold uppercase tracking-wider bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-500/30">Турнир</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap mt-0.5">
                    <span class="bg-white/10 px-1.5 py-0.5 rounded">👑 {{ lobby.hostName }}</span>
                    <span v-if="lobby.kind === 'durak'"
                      class="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                      <span v-if="lobby.gameMode === 'perevodnoy'">🔄</span><span v-else>⬇️</span>
                      {{ $t('game_mode_' + (lobby.gameMode || 'podkidnoy')) }}
                    </span>
                    <span v-else
                      class="flex items-center gap-1 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      💰 {{ lobby.pokerBlinds }}
                    </span>
                    <span v-if="lobby.turnDuration !== undefined"
                      class="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/10"
                      :title="$t('time_limit_label')">
                      <span>⏱️</span>{{ lobby.turnDuration === 0 ? '∞' : lobby.turnDuration + 's' }}
                    </span>
                    <span>{{ lobby.playerCount }}/{{ lobby.maxPlayers }} 👤</span>
                    <span v-if="lobby.betAmount > 0" class="text-primary font-bold">💰{{ lobby.betAmount }}</span>
                    <span v-if="lobby.status === 'in_progress'" class="text-orange-400">🔥 в игре</span>
                  </div>
                </div>
                <button @click="joinLobby(lobby)" :disabled="joiningLobbyId === lobby.gameId"
                  class="font-bold py-1.5 px-5 rounded-lg transition-all active:scale-95 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 min-w-[80px] justify-center text-sm shrink-0"
                  :class="lobby.kind === 'poker' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-primary hover:bg-[#00A891] text-on-primary shadow-primary/20'">
                  <span v-if="joiningLobbyId === lobby.gameId"
                    class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  <span v-else>{{ $t('join_button') }}</span>
                </button>
              </div>
            </div>
            <div class="relative flex py-0.5 items-center">
              <div class="flex-grow border-t border-outline/30"></div><span
                class="flex-shrink-0 mx-4 text-outline text-xs uppercase">{{ $t('or_separator') }}</span>
              <div class="flex-grow border-t border-outline/30"></div>
            </div>
            <div>
              <h3 class="font-bold text-lg text-white mb-3">Присоединиться по коду</h3>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <input type="text" v-model="inviteCode" @keyup.enter="joinByCode"
                    class="w-full bg-black/20 border border-outline/50 rounded-xl pl-10 pr-4 py-3 text-on-surface focus:outline-none focus:border-primary transition-all uppercase placeholder-on-surface-variant/50 font-mono tracking-widest"
                    :placeholder="$t('enter_code_placeholder')">
                </div>
                <button @click="joinByCode" :disabled="!inviteCode.trim() || isJoiningCode"
                  class="bg-surface-variant hover:bg-on-surface-variant/20 text-on-surface font-bold py-2 px-6 rounded-xl transition-all active:scale-95 border border-white/10 disabled:opacity-50">
                  {{ $t('join_button') }}
                </button>
              </div>
            </div>
          </div>

          <!-- CREATE TAB -->
          <div v-if="activeTab === 'create'" class="flex flex-col gap-4 animate-fade-in">
            <div class="flex p-1 bg-black/20 rounded-xl gap-1">
              <button @click="createGame = 'durak'" class="flex-1 py-2 rounded-lg font-bold text-sm transition-colors"
                :class="createGame === 'durak' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-white'">
                🃏 Дурак
              </button>
              <button @click="createGame = 'poker'" class="flex-1 py-2 rounded-lg font-bold text-sm transition-colors"
                :class="createGame === 'poker' ? 'bg-emerald-600 text-white shadow-sm' : 'text-on-surface-variant hover:text-white'">
                ♠️ Покер
              </button>
            </div>

            <!-- Durak create -->
            <div v-if="createGame === 'durak'" class="flex flex-col gap-3">
              <div class="flex gap-2">
                <button @click="lobbyType = 'public'" class="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border transition-all"
                  :class="lobbyType === 'public' ? 'bg-primary text-on-primary border-primary' : 'bg-black/20 text-on-surface-variant border-outline/30'">
                  🌍 {{ $t('lobby_public') }}
                </button>
                <button @click="lobbyType = 'private'" class="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border transition-all"
                  :class="lobbyType === 'private' ? 'bg-primary text-on-primary border-primary' : 'bg-black/20 text-on-surface-variant border-outline/30'">
                  🔒 {{ $t('lobby_private') }}
                </button>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Игроки</label>
                  <div class="flex gap-1.5">
                    <button v-for="n in [2,3,4,5,6]" :key="n" @click="maxPlayers = n"
                      class="flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all"
                      :class="maxPlayers == n ? 'bg-primary text-on-primary border-primary' : 'bg-black/20 text-on-surface-variant border-outline/30'">
                      {{ n }}
                    </button>
                  </div>
                </div>
                <div>
                  <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Колода</label>
                  <select v-model="deckSize"
                    class="w-full bg-black/20 border border-outline/30 rounded-xl px-3 py-2.5 text-on-surface focus:outline-none focus:border-primary text-sm font-medium">
                    <option value="24">24</option>
                    <option value="36">36</option>
                    <option value="52">52</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Режим</label>
                <div class="grid grid-cols-2 gap-2">
                  <button @click="gameMode = 'podkidnoy'"
                    class="p-3 rounded-xl border text-left transition-all"
                    :class="gameMode === 'podkidnoy' ? 'bg-primary/10 border-primary/40' : 'bg-black/20 border-outline/30'">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">⬇️</span>
                      <span class="font-bold text-sm" :class="gameMode === 'podkidnoy' ? 'text-primary' : 'text-on-surface'">{{ $t('game_mode_podkidnoy') }}</span>
                    </div>
                  </button>
                  <button @click="gameMode = 'perevodnoy'"
                    class="p-3 rounded-xl border text-left transition-all"
                    :class="gameMode === 'perevodnoy' ? 'bg-primary/10 border-primary/40' : 'bg-black/20 border-outline/30'">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">🔄</span>
                      <span class="font-bold text-sm" :class="gameMode === 'perevodnoy' ? 'text-primary' : 'text-on-surface'">{{ $t('game_mode_perevodnoy') }}</span>
                    </div>
                  </button>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Время на ход</label>
                <select v-model="turnDuration"
                  class="w-full bg-black/20 border border-outline/30 rounded-xl px-3 py-2.5 text-on-surface focus:outline-none focus:border-primary text-sm font-medium">
                  <option :value="15">15s</option>
                  <option :value="30">30s</option>
                  <option :value="60">60s</option>
                  <option :value="0">∞</option>
                </select>
              </div>
              <div
                class="flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all"
                :class="isBetting ? 'bg-primary/10 border-primary/30' : 'bg-black/20 border-outline/30'"
                @click="toggleBetting">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                    :class="isBetting ? 'bg-primary/20' : 'bg-white/5'">{{ isBetting ? '💰' : '🎲' }}</div>
                  <div>
                    <div class="font-bold text-sm" :class="isBetting ? 'text-primary' : 'text-on-surface'">На деньги</div>
                    <div class="text-[10px] text-on-surface-variant/60">{{ isBetting ? 'Снять ставку с проигравшего' : 'Бесплатная игра' }}</div>
                  </div>
                </div>
                <div class="w-12 h-7 rounded-full relative transition-colors"
                  :class="isBetting ? 'bg-primary' : 'bg-outline/40'">
                  <div class="absolute top-1 w-5 h-5 bg-white rounded-full transition-all"
                    :class="isBetting ? 'left-6' : 'left-1'"></div>
                </div>
              </div>
              <div v-if="isBetting">
                <input type="number" v-model="betAmount" min="10" step="10"
                  class="w-full bg-black/20 border border-primary/40 rounded-xl px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary font-bold text-sm">
              </div>
              <button @click="createDurakLobby" :disabled="isCreatingDurak"
                class="w-full bg-primary hover:bg-[#00A891] disabled:opacity-60 disabled:cursor-not-allowed text-on-primary font-bold text-base py-4 rounded-2xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
                <span v-if="isCreatingDurak" class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                <span>{{ isCreatingDurak ? 'Создаём...' : $t('create_lobby_button') }}</span>
              </button>
            </div>

            <!-- Poker create -->
            <div v-if="createGame === 'poker'" class="flex flex-col gap-3">
              <div class="flex p-1 bg-black/20 rounded-xl gap-1">
                <button @click="pokerVariant = 'cash'" class="flex-1 py-2 rounded-lg font-bold text-sm transition-colors"
                  :class="pokerVariant === 'cash' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant hover:text-white'">💵 Кэш</button>
                <button @click="pokerVariant = 'tournament'" class="flex-1 py-2 rounded-lg font-bold text-sm transition-colors"
                  :class="pokerVariant === 'tournament' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant hover:text-white'">🏆 Турнир</button>
              </div>
              <div>
                <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Пресет</label>
                <div class="grid grid-cols-3 gap-2">
                  <button v-for="p in pokerPresetOptions" :key="p.value" @click="applyPokerPreset(p.value)"
                    class="p-2.5 rounded-xl border text-center transition-all"
                    :class="pokerBlinds === p.value ? 'bg-emerald-600/20 border-emerald-500/50' : 'bg-black/20 border-outline/30'">
                    <div class="font-bold text-sm" :class="pokerBlinds === p.value ? 'text-emerald-300' : 'text-on-surface'">{{ p.label.split(' ')[0] }}</div>
                    <div class="text-[10px] text-on-surface-variant mt-0.5">{{ p.chips }} фишек</div>
                  </button>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Макс. игроков</label>
                <div class="flex gap-1.5">
                  <button v-for="n in [2,4,6,8]" :key="n" @click="pokerMax = n"
                    class="flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all"
                    :class="pokerMax == n ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-black/20 text-on-surface-variant border-outline/30'">
                    {{ n }}
                  </button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Стартовый стек</label>
                  <input type="number" v-model="pokerChips" min="100" step="100"
                    class="w-full bg-black/20 border border-outline/30 rounded-xl px-3 py-2.5 text-on-surface focus:outline-none focus:border-emerald-500 text-sm font-medium">
                </div>
                <div>
                  <label class="text-xs font-semibold text-on-surface-variant ml-1 mb-2 block">Блайнды (SB/BB)</label>
                  <select v-model="pokerBlinds"
                    class="w-full bg-black/20 border border-outline/30 rounded-xl px-3 py-2.5 text-on-surface focus:outline-none focus:border-emerald-500 text-sm font-medium">
                    <option v-for="p in pokerPresetOptions" :key="p.value" :value="p.value">{{ p.label.split(' ')[1] }}</option>
                  </select>
                </div>
              </div>
              <button @click="createPokerGame" :disabled="isCreatingPoker"
                class="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base py-4 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2">
                <span v-if="isCreatingPoker"
                  class="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                <span>{{ isCreatingPoker ? 'Создаём стол...' : '♠️ Создать покер-стол' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="col-span-1">
        <GlobalChat />
      </div>
    </div>

    <!-- Mobile: filters + list stacked -->
    <div class="md:hidden w-full h-full flex flex-col">
      <div class="bg-surface/95 backdrop-blur-sm shadow-2xl border border-white/5 flex flex-col flex-1 min-h-0">
        <div class="flex px-3 pt-3 items-center gap-2">
          <button @click="router.push('/')"
            class="shrink-0 text-lg p-1.5 bg-white/5 rounded-xl hover:bg-white/10 text-on-surface transition-all active:scale-90">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="flex flex-1 p-1 bg-black/20 rounded-xl gap-1">
            <button @click="activeTab = 'find'" class="flex-1 py-2.5 rounded-lg font-bold text-xs transition-colors"
              :class="activeTab === 'find' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'">Поиск</button>
            <button @click="activeTab = 'create'" class="flex-1 py-2.5 rounded-lg font-bold text-xs transition-colors"
              :class="activeTab === 'create' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'">Создать</button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto px-3 pb-3 pt-3 scrollbar-hide">
          <div v-if="activeTab === 'find'" class="flex flex-col gap-3 animate-fade-in">
            <div class="flex p-1 bg-black/20 rounded-xl gap-0.5 text-xs">
              <button @click="gameFilter = 'all'" class="flex-1 py-2 rounded-lg font-bold"
                :class="gameFilter === 'all' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'">Все</button>
              <button @click="gameFilter = 'durak'" class="flex-1 py-2 rounded-lg font-bold"
                :class="gameFilter === 'durak' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'">Дурак</button>
              <button @click="gameFilter = 'poker'" class="flex-1 py-2 rounded-lg font-bold"
                :class="gameFilter === 'poker' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant'">Покер</button>
            </div>
            <div class="flex gap-1.5">
              <select v-model="statusFilter" class="flex-1 bg-black/20 border border-outline/30 rounded-lg px-2 py-1.5 text-xs text-on-surface">
                <option value="all">Любой</option>
                <option value="waiting">Ожидание</option>
              </select>
              <select v-model="sortBy" class="flex-1 bg-black/20 border border-outline/30 rounded-lg px-2 py-1.5 text-xs text-on-surface">
                <option value="players_desc">По игрокам ↓</option>
                <option value="players_asc">По игрокам ↑</option>
                <option value="newest">Новые</option>
              </select>
            </div>
            <div v-if="isLoading && filteredLobbies.length === 0" class="text-center py-6 text-on-surface-variant text-sm">Загрузка...</div>
            <div v-else-if="filteredLobbies.length === 0" class="text-center py-6 text-on-surface-variant text-sm bg-black/10 rounded-xl border border-white/5">
              Нет игр с такими фильтрами
            </div>
            <div v-else class="space-y-2">
              <div v-for="lobby in filteredLobbies" :key="`${lobby.kind}-${lobby.gameId}`"
                class="bg-black/20 p-2.5 rounded-xl flex items-center justify-between border gap-2"
                :class="lobby.kind === 'poker' ? 'border-emerald-500/20' : 'border-white/5'">
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm shrink-0">{{ lobby.kind === 'poker' ? '♠️' : '🃏' }}</span>
                    <span class="font-bold text-on-surface text-sm truncate">#{{ lobby.gameId }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant flex-wrap mt-0.5">
                    <span class="bg-white/10 px-1.5 py-0.5 rounded truncate max-w-[80px]">👑 {{ lobby.hostName }}</span>
                    <span v-if="lobby.kind === 'poker'" class="text-emerald-300">💰 {{ lobby.pokerBlinds }}</span>
                    <span v-else-if="lobby.gameMode === 'perevodnoy'" class="text-primary">🔄 {{ $t('game_mode_perevodnoy') }}</span>
                    <span v-else class="text-primary">⬇️ {{ $t('game_mode_podkidnoy') }}</span>
                    <span>{{ lobby.playerCount }}/{{ lobby.maxPlayers }} 👤</span>
                    <span v-if="lobby.betAmount > 0" class="text-primary font-bold">💰{{ lobby.betAmount }}</span>
                  </div>
                </div>
                <button @click="joinLobby(lobby)" :disabled="joiningLobbyId === lobby.gameId"
                  class="font-bold py-1.5 px-3 rounded-lg transition-all active:scale-95 disabled:opacity-70 text-xs shrink-0"
                  :class="lobby.kind === 'poker' ? 'bg-emerald-600 text-white' : 'bg-primary text-on-primary'">
                  {{ joiningLobbyId === lobby.gameId ? '...' : '→' }}
                </button>
              </div>
            </div>
            <div class="flex gap-2">
              <input type="text" v-model="inviteCode" @keyup.enter="joinByCode"
                class="flex-1 bg-black/20 border border-outline/50 rounded-xl px-3 py-2.5 text-sm text-on-surface uppercase font-mono"
                placeholder="Код">
              <button @click="joinByCode" :disabled="!inviteCode.trim()"
                class="bg-surface-variant text-on-surface-variant font-bold py-2.5 px-4 rounded-xl border border-white/10">→</button>
            </div>
          </div>

          <div v-if="activeTab === 'create'" class="flex flex-col gap-3 animate-fade-in">
            <div class="flex p-1 bg-black/20 rounded-xl gap-1">
              <button @click="createGame = 'durak'" class="flex-1 py-2 rounded-lg font-bold text-xs"
                :class="createGame === 'durak' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'">🃏 Дурак</button>
              <button @click="createGame = 'poker'" class="flex-1 py-2 rounded-lg font-bold text-xs"
                :class="createGame === 'poker' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant'">♠️ Покер</button>
            </div>
            <div v-if="createGame === 'durak'" class="flex flex-col gap-2">
              <div class="flex gap-1.5">
                <button v-for="n in [2,4,6]" :key="n" @click="maxPlayers = n" class="flex-1 py-2 rounded-xl font-bold text-xs border"
                  :class="maxPlayers == n ? 'bg-primary text-on-primary border-primary' : 'bg-black/20 text-on-surface-variant border-outline/30'">{{ n }}p</button>
              </div>
              <select v-model="gameMode" class="bg-black/20 border border-outline/30 rounded-xl px-3 py-2 text-on-surface text-sm">
                <option value="podkidnoy">⬇️ Подкидной</option>
                <option value="perevodnoy">🔄 Переводной</option>
              </select>
              <select v-model="turnDuration" class="bg-black/20 border border-outline/30 rounded-xl px-3 py-2 text-on-surface text-sm">
                <option :value="15">⏱️ 15s</option>
                <option :value="30">⏱️ 30s</option>
                <option :value="60">⏱️ 60s</option>
                <option :value="0">⏱️ ∞</option>
              </select>
              <button @click="createDurakLobby" :disabled="isCreatingDurak" class="w-full bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-on-primary font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5">
                <span v-if="isCreatingDurak" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                <span>{{ isCreatingDurak ? 'Создаём...' : 'Создать' }}</span>
              </button>
            </div>
            <div v-if="createGame === 'poker'" class="flex flex-col gap-2">
              <div class="flex p-1 bg-black/20 rounded-xl gap-1">
                <button @click="pokerVariant = 'cash'" class="flex-1 py-2 rounded-lg font-bold text-xs"
                  :class="pokerVariant === 'cash' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant'">💵 Кэш</button>
                <button @click="pokerVariant = 'tournament'" class="flex-1 py-2 rounded-lg font-bold text-xs"
                  :class="pokerVariant === 'tournament' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant'">🏆 Турнир</button>
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                <button v-for="p in pokerPresetOptions" :key="p.value" @click="applyPokerPreset(p.value)"
                  class="p-2 rounded-xl border text-xs font-bold"
                  :class="pokerBlinds === p.value ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300' : 'bg-black/20 border-outline/30 text-on-surface'">
                  {{ p.label.split(' ')[0] }}
                </button>
              </div>
              <div class="flex gap-1.5">
                <button v-for="n in [2,4,6,8]" :key="n" @click="pokerMax = n" class="flex-1 py-2 rounded-xl font-bold text-xs border"
                  :class="pokerMax == n ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-black/20 text-on-surface-variant border-outline/30'">{{ n }}p</button>
              </div>
              <input type="number" v-model="pokerChips" min="100" class="bg-black/20 border border-outline/30 rounded-xl px-3 py-2 text-on-surface text-sm" placeholder="Стек">
              <button @click="createPokerGame" :disabled="isCreatingPoker" class="w-full bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5">
                <span v-if="isCreatingPoker" class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                <span>{{ isCreatingPoker ? 'Создаём...' : 'Создать' }}</span>
              </button>
            </div>
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
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
