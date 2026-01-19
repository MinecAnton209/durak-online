<script setup>
import { onMounted, ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useSocketStore } from '@/stores/socket';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useFriendsStore } from '@/stores/friends';
import { useI18n } from 'vue-i18n';

import Card from '@/components/game/Card.vue';
import ShufflingLoader from '@/components/ui/ShufflingLoader.vue';
import DealingAnimation from '@/components/game/DealingAnimation.vue';
import GameOverModal from '@/components/game/GameOverModal.vue';
import GameChat from '@/components/game/GameChat.vue';
import MusicPlayer from '@/components/game/MusicPlayer.vue';
import FriendsModal from '@/components/ui/FriendsModal.vue';

const route = useRoute();
const router = useRouter();
const gameStore = useGameStore();
const socketStore = useSocketStore();
const authStore = useAuthStore();
const toast = useToastStore();
const friendsStore = useFriendsStore();
const { t } = useI18n();

const urlGameId = route.params.id.toUpperCase();

const errorMessage = ref('');
const isLoading = ref(true);

const isFriendsOpen = ref(false);
const friendsModalTab = ref('friends');

const localMaxPlayers = ref(2);
const localDeckSize = ref(36);
const localTurnDuration = ref(60);

const isPlayerInGame = computed(() => gameStore.gameId === urlGameId && !!gameStore.playerId);
const isGameStarted = computed(() => gameStore.gameStatus === 'playing');
const currentUrl = computed(() => window.location.href);

const timerProgress = ref(100);
let timerInterval = null;

const isTimerMine = computed(() => {
  return gameStore.isMyTurn || gameStore.canPass || gameStore.canTake;
});

const opponents = computed(() => {
  if (!gameStore.players.length) return [];
  if (!gameStore.playerId) return gameStore.players;
  const myIndex = gameStore.players.findIndex(p => p.id === gameStore.playerId);
  if (myIndex === -1) return gameStore.players;
  return [...gameStore.players.slice(myIndex + 1), ...gameStore.players.slice(0, myIndex)];
});

const opponentsGridClass = computed(() => {
  const count = opponents.value.length;
  if (count === 1) return 'justify-center';
  return 'justify-between';
});

const getOpponentCardStyle = (index, total) => {
  if (total <= 1) return { zIndex: index };
  const center = (total - 1) / 2;
  const spread = 8; const height = 1.5; const offsetY = 12;
  const rotate = (index - center) * spread;
  const translateY = Math.abs(index - center) * height + offsetY;
  const translateX = (index - center) * 2;
  return {
    transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg)`,
    zIndex: index,
    transitionDelay: `${index * 30}ms`
  };
};

onMounted(async () => {
  if (!socketStore.isConnected) {
    await socketStore.connect();
  }
  checkRoomStatus();

  socketStore.socket?.on('error', handleSocketError);
  socketStore.socket?.on('kicked', (data) => {
    toast.addToast(data.reason || t('you_were_kicked'), 'warning');
    gameStore.leaveGame();
  });
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  socketStore.socket?.off('error', handleSocketError);
  socketStore.socket?.off('kicked');
});

const checkRoomStatus = () => {
  isLoading.value = true;
  errorMessage.value = '';

  if (isPlayerInGame.value) {
    socketStore.emit('getLobbyState', { gameId: urlGameId });
    isLoading.value = false;
  } else {
    gameStore.attemptReconnect(urlGameId);

    const timeoutTimer = setTimeout(() => {
      if (isLoading.value) {
        errorMessage.value = t('error_reconnect_failed');
        isLoading.value = false;
        socketStore.socket?.off('reconnectFailed', onReconnectFailed);
      }
    }, 5000);

    const onReconnectFailed = () => {
      clearTimeout(timeoutTimer);
      errorMessage.value = t('error_reconnect_failed');
      isLoading.value = false;
      socketStore.socket?.off('reconnectFailed', onReconnectFailed);
    };
    socketStore.socket?.once('reconnectFailed', onReconnectFailed);
  }
};

const handleSocketError = (err) => {
  isLoading.value = false;
  let msg = err.i18nKey ? t(err.i18nKey, err.options || {}) : (t(err.message) || t('error_unknown'));

  if (['error_game_not_found', 'error_lobby_not_found', 'error_room_full'].includes(err.i18nKey)) {
    errorMessage.value = msg;
  } else {
    toast.addToast(msg, 'error');
  }
};

const copyLink = () => {
  navigator.clipboard.writeText(currentUrl.value);
  toast.addToast(t('link_copied'), 'success');
};

const startGame = () => socketStore.emit('forceStartGame', { gameId: gameStore.gameId });
const onCardClick = (card) => { if (gameStore.canPlayCard(card)) gameStore.makeMove(card); };
const onDealingFinished = () => gameStore.stopDealingAnimation();

const openAddFriend = (nickname) => {
  friendsStore.searchQuery = nickname;
  friendsStore.searchUsers(nickname);
  friendsModalTab.value = 'search';
  isFriendsOpen.value = true;
};

const openFriendsList = () => {
  friendsModalTab.value = 'friends';
  isFriendsOpen.value = true;
};

const updateSettings = () => {
  socketStore.emit('updateLobbySettings', {
    gameId: urlGameId,
    settings: {
      maxPlayers: localMaxPlayers.value,
      deckSize: localDeckSize.value,
      turnDuration: localTurnDuration.value
    }
  });
};

const kickPlayer = (playerId) => {
  if (confirm(t('confirm_kick'))) {
    socketStore.emit('kickPlayer', { gameId: urlGameId, playerIdToKick: playerId });
  }
};

watch(() => gameStore.settings, (newSettings) => {
  if (newSettings) {
    localMaxPlayers.value = newSettings.maxPlayers;
    localDeckSize.value = newSettings.deckSize;
    localTurnDuration.value = newSettings.turnDuration !== undefined ? newSettings.turnDuration : 60;
  }
}, { immediate: true, deep: true });

watch(() => gameStore.gameStatus, (newStatus) => {
  if (newStatus !== 'lobby') isLoading.value = false;
});

watch(() => gameStore.players, (val) => {
  if (val && val.length > 0 && gameStore.gameStatus === 'lobby') isLoading.value = false;
});

watch(() => gameStore.turnDeadline, (deadline) => {
  if (timerInterval) clearInterval(timerInterval);
  if (!deadline) { timerProgress.value = 0; return; }

  const totalDuration = (gameStore.settings?.turnDuration || 60) * 1000;

  timerInterval = setInterval(() => {
    const now = Date.now();
    const left = deadline - now;
    if (left <= 0) {
      timerProgress.value = 0;
      clearInterval(timerInterval);
    } else {
      timerProgress.value = Math.min(100, (left / totalDuration) * 100);
    }
  }, 100);
}, { immediate: true });

const botDifficulty = ref('medium');

const addBot = () => {
  console.log(`📤 Emitting addBot: gameId=${urlGameId}, difficulty=${botDifficulty.value}`);

  socketStore.emit('addBot', {
    gameId: urlGameId,
    difficulty: botDifficulty.value
  });
};
</script>

<template>
  <div
    class="h-[100dvh] w-full flex flex-col relative overflow-hidden font-sans bg-background select-none touch-manipulation">

    <div v-if="!isGameStarted" class="flex-1 flex items-center justify-center p-4 overflow-y-auto">
      <div
        class="w-full max-w-xl bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/5 p-6 md:p-8 animate-fade-in text-on-surface my-auto">
        <h2 class="text-center text-on-surface-variant mb-1 text-sm uppercase">{{ $t('room_label') }}</h2>
        <h1 class="text-4xl md:text-5xl text-center font-bold text-primary tracking-widest font-mono uppercase mb-6">{{
          urlGameId }}</h1>

        <div v-if="errorMessage" class="text-center py-4">
          <p class="text-error font-bold text-lg mb-2">{{ errorMessage }}</p>
          <router-link to="/" class="text-primary underline">{{ $t('go_home') }}</router-link>
        </div>

        <div v-else-if="isLoading" class="flex justify-center py-10">
          <ShufflingLoader />
        </div>

        <div v-else class="flex flex-col gap-4">

          <div class="bg-black/20 p-3 rounded-xl border border-white/5 flex flex-col gap-2">

            <div class="flex justify-between items-center pb-2 border-b border-white/5">
              <span class="text-sm text-on-surface-variant">{{ $t('game_mode_label') }}</span>
              <span class="font-bold text-primary flex items-center gap-1">
                <span v-if="gameStore.settings?.gameMode === 'perevodnoy'">🔄</span>
                <span v-else>⬇️</span>
                {{ $t('game_mode_' + (gameStore.settings?.gameMode || 'podkidnoy')) }}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-on-surface-variant">{{ $t('players_count_label') }}</span>
              <select v-if="gameStore.isHost" @change="updateSettings" v-model="localMaxPlayers"
                class="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none">
                <option :value="2">2</option>
                <option :value="3">3</option>
                <option :value="4">4</option>
              </select>
              <span v-else class="font-bold text-white">{{ gameStore.settings?.maxPlayers || 2 }}</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-on-surface-variant">{{ $t('deck_size_label') }}</span>
              <select v-if="gameStore.isHost" @change="updateSettings" v-model="localDeckSize"
                class="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none">
                <option :value="24">24</option>
                <option :value="36">36</option>
                <option :value="52">52</option>
              </select>
              <span v-else class="font-bold text-white">{{ gameStore.settings?.deckSize || 36 }}</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-on-surface-variant">{{ $t('time_limit_label') }}</span>
              <select v-if="gameStore.isHost" @change="updateSettings" v-model="localTurnDuration"
                class="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none">
                <option :value="15">{{ $t('time_15s') }}</option>
                <option :value="30">{{ $t('time_30s') }}</option>
                <option :value="60">{{ $t('time_60s') }}</option>
                <option :value="0">{{ $t('time_unlimited') }}</option>
              </select>
              <span v-else class="font-bold text-white">
                {{ gameStore.settings?.turnDuration === 0 ? $t('time_unlimited') : (gameStore.settings?.turnDuration ||
                60) + 's' }}
              </span>
            </div>

            <div v-if="gameStore.isHost && gameStore.players.length < localMaxPlayers"
              class="pt-2 border-t border-white/10 mt-2">
              <div class="flex gap-2">
                <select v-model="botDifficulty" class="bg-black/40 text-white text-xs rounded px-2 outline-none flex-1">
                  <option value="child">👶 Child</option>
                  <option value="beginner">🤡 Beginner</option>
                  <option value="easy">🤖 Easy</option>
                  <option value="medium">😐 Medium</option>
                  <option value="hard">😎 Hard</option>
                  <option value="impossible">🦾 Impossible</option>
                </select>
                <button @click="addBot"
                  class="bg-surface text-white text-xs px-3 py-1.5 rounded font-bold hover:bg-white/20 transition-colors">
                  + Bot
                </button>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-on-surface-variant">{{ $t('bet_amount_label') }}</span>
              <span class="font-bold text-primary">💰 {{ gameStore.settings?.betAmount || 0 }}</span>
            </div>
          </div>

          <div class="flex gap-2">
            <input type="text" :value="currentUrl" readonly
              class="w-full bg-black/20 border border-outline/50 rounded-xl px-4 py-2 text-white text-xs md:text-sm truncate">
            <button @click="copyLink"
              class="bg-surface border border-outline/50 px-3 rounded-xl hover:bg-white/10 text-white transition-colors">📋</button>
          </div>

          <div v-if="authStore.isAuthenticated" class="flex justify-end">
            <button @click="openFriendsList"
              class="text-xs font-bold text-primary flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
              <span>👥</span> {{ $t('invite_button') }}
            </button>
          </div>

          <ul class="space-y-2">
            <li v-for="p in gameStore.players" :key="p.id"
              class="flex items-center justify-between bg-black/20 p-2.5 rounded-xl border border-white/5 relative group">

              <div class="flex items-center gap-3 min-w-0">
                <div
                  class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                  <span v-if="p.isBot">🤖</span>
                  <span v-else>{{ p.name[0] }}</span>
                </div>

                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-medium truncate" :class="p.isBot ? 'text-cyan-400' : 'text-white'">
                      {{ p.name }}
                    </span>
                    <svg v-if="p.isVerified" class="w-3 h-3 text-blue-400 shrink-0" viewBox="0 0 24 24"
                      fill="currentColor">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span v-if="p.streak > 3"
                      class="text-[10px] text-orange-500 font-bold bg-orange-500/10 px-1 rounded border border-orange-500/20 shrink-0">🔥{{
                      p.streak }}</span>
                  </div>
                  <span v-if="p.id === gameStore.playerId" class="text-[10px] text-gray-400">{{ $t('you_label')
                    }}</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button v-if="p.id !== gameStore.playerId && authStore.isAuthenticated && !p.isBot"
                  @click="openAddFriend(p.name)"
                  class="w-7 h-7 rounded-lg bg-white/5 hover:bg-primary hover:text-white text-primary flex items-center justify-center transition-colors"
                  :title="$t('tooltip_add_friend')">+</button>

                <span v-if="p.id === gameStore.hostId" :title="$t('tooltip_host')" class="text-lg">👑</span>

                <button v-if="gameStore.isHost && p.id !== gameStore.playerId" @click="kickPlayer(p.id)"
                  class="text-error hover:bg-white/10 p-1 rounded transition-colors"
                  :title="$t('kick_player')">🚫</button>
              </div>
            </li>
          </ul>

          <button v-if="gameStore.isHost" @click="startGame" :disabled="gameStore.players.length < 2"
            class="w-full bg-primary text-on-primary font-bold py-3 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all">{{
              $t('start_game_button') }}</button>
          <p v-else class="text-center text-xs text-white/50 animate-pulse">{{ $t('waiting_for_host') }}</p>
          <button @click="gameStore.leaveGame"
            class="w-full bg-transparent border border-white/10 text-white/70 hover:bg-white/5 font-bold py-2 rounded-xl transition-all">{{
              $t('leave_lobby') }}</button>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col h-full w-full relative">

      <div v-if="gameStore.turnDeadline"
        class="w-full h-2 absolute top-[var(--safe-area-top)] left-0 z-0 pointer-events-none group">
        <div
          class="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
          :class="isTimerMine ? 'text-emerald-400' : 'text-blue-400'">
          {{ isTimerMine ? $t('your_time') : $t('opponent_time') }}
        </div>

        <div class="h-full transition-all duration-100 ease-linear shadow-[0_0_20px_currentColor]" :class="{
          'bg-emerald-500/60 shadow-emerald-500/40': isTimerMine && timerProgress > 50,
          'bg-amber-500/60 shadow-amber-500/40': isTimerMine && timerProgress <= 50 && timerProgress > 20,
          'bg-rose-500/60 shadow-rose-500/40': isTimerMine && timerProgress <= 20,
          'bg-blue-400/30 shadow-blue-400/10': !isTimerMine
        }" :style="{ width: timerProgress + '%' }">
        </div>
      </div>

      <DealingAnimation v-if="gameStore.isDealing" :trump-card="gameStore.trumpCard" @finished="onDealingFinished" />

      <div class="grid grid-rows-[auto_1fr_auto] h-full w-full transition-opacity duration-700 safe-bottom"
        :class="gameStore.isDealing ? 'opacity-0 pointer-events-none' : 'opacity-100'">

        <div class="w-full px-2 pt-[calc(0.5rem+var(--safe-area-top))] pb-1 shrink-0 flex items-start safe-px"
          :class="opponentsGridClass">
          <div v-for="(opp, oppIdx) in opponents" :key="opp.id"
            class="flex flex-col items-center relative group transition-all min-w-[4rem] md:min-w-[6rem]">
            <div
              class="w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white font-bold text-sm md:text-xl border-2 md:border-4 transition-all z-10 bg-surface shadow-md relative"
              :class="{ 'border-primary shadow-[0_0_15px_rgba(0,191,165,0.6)] scale-110': opp.id === gameStore.turnPlayerId, 'border-white/10': opp.id !== gameStore.turnPlayerId, 'opacity-50 grayscale': gameStore.disconnectedPlayers[opp.id] }">
              {{ opp.name[0] }}
              <div v-if="gameStore.disconnectedPlayers[opp.id]"
                class="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-2xl animate-pulse">
                ⏳</div>
              <div v-if="gameStore.attackerId === opp.id"
                class="absolute -bottom-1 -right-1 text-base md:text-2xl drop-shadow-md animate-bounce z-20">⚔️</div>
              <div v-if="gameStore.defenderId === opp.id"
                class="absolute -bottom-1 -right-1 text-base md:text-2xl drop-shadow-md animate-pulse z-20">🛡️</div>
            </div>
            <div
              class="mt-1 bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-sm w-full flex justify-center max-w-full z-30">
              <p class="text-white text-[10px] md:text-xs font-medium truncate text-center leading-tight flex-1">{{
                opp.name }}</p>
              <span v-if="gameStore.disconnectedPlayers[opp.id]" class="text-orange-400 font-bold text-xs ml-1">{{
                gameStore.disconnectedPlayers[opp.id] }}</span>
              <svg v-if="opp.isVerified" class="w-3 h-3 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span v-if="opp.streak > 3" class="text-[10px] text-orange-500 font-bold shrink-0">🔥{{ opp.streak
                }}</span>
            </div>
            <transition-group tag="div" name="opp-cards"
              class="flex justify-center items-end relative w-full h-16 md:h-20 -mt-2">
              <div v-for="(n, idx) in (opp.cardCount || opp.cards?.length || 0)" :key="idx"
                class="absolute bottom-0 origin-bottom transition-transform"
                :style="getOpponentCardStyle(idx, (opp.cardCount || opp.cards?.length || 0))">
                <Card :is-back="true" :card-style="opp.cardBackStyle || 'default'"
                  class="w-8 h-12 md:w-12 md:h-16 shadow-md !rounded-lg border border-black/20 z-20" />
              </div>
            </transition-group>
          </div>
        </div>

        <div class="relative w-full flex items-center justify-center min-h-0">
          <div
            class="absolute left-[calc(0.5rem+var(--safe-area-left))] top-1/2 -translate-y-1/2 flex items-center z-0 scale-[0.6] md:scale-100 origin-left">
            <Card v-if="gameStore.trumpCard" :rank="gameStore.trumpCard.rank" :suit="gameStore.trumpCard.suit"
              class="rotate-90 translate-x-12 opacity-100 z-0" />
            <div v-if="gameStore.deckCount > 0" class="relative z-10">
              <Card :is-back="true" class="shadow-xl" card-style="default" />
              <div
                class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-white font-bold bg-black/60 px-2 rounded text-xs border border-white/10">
                {{ gameStore.deckCount }}</div>
            </div>
            <div v-else
              class="absolute left-0 text-white/30 font-bold border-2 border-dashed border-white/10 w-20 h-28 rounded-xl flex items-center justify-center z-0">
              0</div>
          </div>
          <div
            class="flex flex-wrap justify-center items-center content-center gap-2 md:gap-4 px-8 md:px-32 w-full h-full max-w-4xl gap-y-6 overflow-auto">
            <div v-for="(card, i) in gameStore.tableCards" :key="`${card.rank}-${card.suit}-${i}`"
              class="relative transition-all duration-300 transform scale-[0.85] sm:scale-100"
              :class="{ 'z-0 ml-1 md:ml-2': i % 2 === 0, 'z-10 -ml-10 md:-ml-16 -mt-4 md:-mt-8 rotate-6 shadow-xl': i % 2 !== 0 }">
              <Card :rank="card.rank" :suit="card.suit" />
            </div>
          </div>
        </div>

        <div
          class="shrink-0 flex flex-col items-center w-full pb-[calc(0.5rem+var(--safe-area-bottom))] md:pb-4 gap-1 relative z-30">
          <div class="mb-1">
            <div v-if="!gameStore.canPass && !gameStore.canTake"
              class="px-3 py-1 bg-black/60 backdrop-blur text-white/90 rounded-full text-xs md:text-sm border border-white/10 animate-pulse">
              <span v-if="!gameStore.isMyTurn">{{ gameStore.isAttacker ? $t('status_waiting') :
                $t('status_opponent_turn') }}</span>
              <span v-else class="text-primary font-bold">{{ gameStore.isAttacker ? $t('status_your_turn') :
                $t('status_defend') }}</span>
            </div>
          </div>
          <div class="flex gap-4 w-full px-4 justify-center pointer-events-none h-0 relative z-20">
            <div class="absolute bottom-4 flex gap-4 pointer-events-auto">
              <transition name="pop"><button v-if="gameStore.canPass" @click="gameStore.passTurn"
                  class="px-6 py-2 bg-slate-600 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(0,0,0,0.5)] active:scale-95 border-2 border-slate-400 text-sm md:text-base">{{
                    $t('btn_pass') }}</button></transition>
              <transition name="pop"><button v-if="gameStore.canTake" @click="gameStore.takeCards"
                  class="px-6 py-2 bg-red-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(0,0,0,0.5)] active:scale-95 border-2 border-red-300 text-sm md:text-base">{{
                    $t('btn_take') }}</button></transition>
            </div>
          </div>
          <div class="w-full overflow-x-auto overflow-y-visible px-4 pb-2 pt-8 no-scrollbar touch-pan-x">
            <div class="flex justify-center min-w-max mx-auto px-4"
              :class="gameStore.myCards.length > 5 ? '-space-x-8 sm:-space-x-12' : '-space-x-4 sm:-space-x-8'">
              <transition-group name="hand">
                <div v-for="(card, index) in gameStore.myCards" :key="`${card.rank}-${card.suit}`"
                  class="transition-all duration-300 transform origin-bottom cursor-pointer relative hover:-translate-y-4 hover:!z-50 hover:scale-110"
                  :style="{ zIndex: index }" @click="onCardClick(card)">
                  <Card :rank="card.rank" :suit="card.suit" :is-playable="gameStore.canPlayCard(card)"
                    :class="{ 'brightness-50 grayscale-[0.5]': !gameStore.canPlayCard(card) && gameStore.isMyTurn }" />
                </div>
              </transition-group>
            </div>
          </div>
        </div>
      </div>
    </div>

    <GameOverModal />
    <GameChat />
    <MusicPlayer />
    <FriendsModal :is-open="isFriendsOpen" :initial-tab="friendsModalTab" @close="isFriendsOpen = false" />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hand-enter-active,
.hand-leave-active {
  transition: all 0.4s ease;
}

.hand-enter-from {
  opacity: 0;
  transform: translateY(100px);
}

.hand-leave-to {
  opacity: 0;
  transform: translateY(-100px);
}

.hand-move {
  transition: transform 0.4s ease;
  position: relative;
}

.pop-enter-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.pop-leave-active {
  transition: all 0.2s ease-in;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

.opp-cards-enter-active,
.opp-cards-leave-active {
  transition: all 0.3s ease;
}

.opp-cards-enter-from,
.opp-cards-leave-to {
  opacity: 0;
  transform: scale(0);
}
</style>
