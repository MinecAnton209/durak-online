<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSocketStore } from '@/stores/socket';
import { usePokerStore } from '@/stores/poker';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import Card from '@/components/game/Card.vue';
import BaseModal from '@/components/ui/BaseModal.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const socketStore = useSocketStore();
const pokerStore = usePokerStore();
const authStore = useAuthStore();
const toast = useToastStore();

const urlGameId = route.params.id.toUpperCase();

const raiseAmount = ref(20);
const showRaiseSlider = ref(false);
const showResult = ref(false);
const resultData = ref(null);
const isStarting = ref(false);
const isChatOpen = ref(false);
const chatInput = ref('');
const chatContainer = ref(null);

function sendChat() {
  if (!chatInput.value.trim()) return;
  pokerStore.sendMessage(chatInput.value);
  chatInput.value = '';
  nextTick(() => {
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  });
}

function openChat() {
  isChatOpen.value = !isChatOpen.value;
  if (isChatOpen.value) {
    pokerStore.markChatRead();
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    });
  }
}

const lastCommunityCount = ref(0);
const dealingCommunity = ref(false);
const lastHoleCount = ref(0);
const dealingHole = ref(false);

watch(() => pokerStore.communityCards.length, (n) => {
  if (n > lastCommunityCount.value) {
    dealingCommunity.value = true;
    setTimeout(() => { dealingCommunity.value = false; }, 600);
  }
  lastCommunityCount.value = n;
});

watch(() => pokerStore.myHoleCards.length, (n) => {
  if (n > lastHoleCount.value) {
    dealingHole.value = true;
    setTimeout(() => { dealingHole.value = false; }, 600);
  }
  lastHoleCount.value = n;
});

const me = computed(() => {
  if (!pokerStore.gameState) return null;
  return pokerStore.gameState.players?.find(p => p.id === pokerStore.playerId);
});

const opponentPlayers = computed(() => {
  if (!pokerStore.gameState) return [];
  return pokerStore.gameState.players?.filter(p => p.id !== pokerStore.playerId) || [];
});

const isMyAction = computed(() => {
  if (!pokerStore.gameState || !pokerStore.playerId) return false;
  const cp = pokerStore.gameState.playerOrder?.[pokerStore.gameState.currentPlayerIdx];
  return cp === pokerStore.playerId;
});

const canCheck = computed(() => isMyAction.value && pokerStore.canCheck);
const canCall = computed(() => isMyAction.value && pokerStore.canCall);
const canRaise = computed(() => isMyAction.value && pokerStore.canRaise && (me.value?.chips || 0) > 0);
const canFold = computed(() => isMyAction.value);
const canAllIn = computed(() => isMyAction.value && (me.value?.chips || 0) > 0);

const roundLabel = computed(() => {
  switch (pokerStore.gameState?.bettingRound) {
    case 'preflop': return 'Preflop';
    case 'flop': return 'Flop';
    case 'turn': return 'Turn';
    case 'river': return 'River';
    case 'showdown': return 'Showdown';
    default: return '';
  }
});

const seatPositions = computed(() => {
  const total = pokerStore.gameState?.players?.length || 0;
  if (total === 0) return [];
  const myIdx = pokerStore.gameState?.players?.findIndex(p => p.id === pokerStore.playerId) ?? 0;

  return pokerStore.gameState.players.map((p, idx) => {
    const isMe = p.id === pokerStore.playerId;
    const offsetFromMe = (idx - myIdx + total) % total;
    return { player: p, isMe, offsetFromMe, total };
  });
});

const opponentsOnLeft = computed(() => seatPositions.value.filter(s => !s.isMe && s.offsetFromMe <= Math.ceil(seatPositions.value.length / 2)));
const opponentsOnRight = computed(() => seatPositions.value.filter(s => !s.isMe && s.offsetFromMe > Math.ceil(seatPositions.value.length / 2)));

const isHost = computed(() => {
  return pokerStore.gameState?.playerOrder?.[0] === pokerStore.playerId;
});

onMounted(async () => {
  if (!socketStore.isConnected) await socketStore.connect();
  pokerStore.initListeners();

  socketStore.socket?.on('pokerHandComplete', onHandComplete);

  // join if not already in this game
  if (pokerStore.gameId !== urlGameId) {
    console.log('[PokerTableView] joining poker', urlGameId);
    pokerStore.joinPoker(urlGameId);
  } else {
    console.log('[PokerTableView] already in this game', pokerStore.gameId);
  }
});

onUnmounted(() => {
  socketStore.socket?.off('pokerHandComplete', onHandComplete);
});

watch(() => pokerStore.gameState?.status, (s) => {
  if (s === 'finished') {
    setTimeout(() => {
      router.push('/lobbies');
    }, 5000);
  }
});

watch(() => pokerStore.showResultModal, (v) => {
  if (v && pokerStore.showdownWinners) {
    resultData.value = { winners: pokerStore.showdownWinners };
    showResult.value = true;
  }
});

function onHandComplete({ winners }) {
  resultData.value = { winners };
  showResult.value = true;
  pokerStore.showResultModal = true;
}

function startGame() {
  if (!pokerStore.gameId) return;
  isStarting.value = true;
  pokerStore.startGame();
  setTimeout(() => { isStarting.value = false; }, 2000);
}

function doFold() { pokerStore.fold(); }
function doCheck() { pokerStore.check(); }
function doCall() { pokerStore.call(); }

function doRaise() {
  const amt = Math.max(pokerStore.minRaise || 20, raiseAmount.value);
  pokerStore.raise(amt);
  showRaiseSlider.value = false;
}

function doAllIn() { pokerStore.allIn(); }

function openRaise() {
  raiseAmount.value = Math.max(pokerStore.minRaise || 20, (pokerStore.gameState?.currentBet || 0) * 2);
  showRaiseSlider.value = true;
}

function leaveGame() {
  pokerStore.leaveGame();
  router.push('/lobbies');
}

function getBadge(player) {
  if (player.isDealer) return { symbol: 'D', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  if (player.isSmallBlind) return { symbol: 'SB', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  if (player.isBigBlind) return { symbol: 'BB', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  return null;
}

function seatStyle(seat) {
  const half = Math.ceil(seat.total / 2);
  if (seat.isMe) return {};
  const leftSide = seat.offsetFromMe <= half;
  return leftSide ? 'justify-self-start' : 'justify-self-end';
}
</script>

<template>
  <div class="h-[100dvh] w-full flex flex-col relative overflow-hidden font-sans bg-background select-none touch-manipulation"
    style="background: radial-gradient(ellipse at center, #0d3a2f 0%, #061a15 50%, #000 100%);">

    <div class="shrink-0 p-3 md:p-4 flex items-center gap-3 z-10">
      <button v-if="!isHost && pokerStore.gameState?.status !== 'in_progress'" @click="leaveGame"
        class="shrink-0 w-9 h-9 bg-white/5 hover:bg-white/10 rounded-xl text-on-surface transition-all active:scale-90 flex items-center justify-center border border-white/10">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex-1 min-w-0">
        <h1 class="text-base md:text-lg font-bold text-white flex items-center gap-2">
          <span class="font-mono text-primary">{{ urlGameId }}</span>
          <span v-if="pokerStore.gameState" class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {{ roundLabel }}
          </span>
        </h1>
        <p v-if="pokerStore.gameState" class="text-xs text-on-surface-variant/60 mt-0.5">
          {{ pokerStore.gameState.players.length }} / {{ pokerStore.gameState.maxPlayers || 10 }} игроков
        </p>
      </div>

      <div v-if="pokerStore.gameState" class="bg-black/40 border border-amber-500/30 rounded-xl px-3 py-1.5 flex items-center gap-2">
        <span class="text-amber-400 text-lg">💰</span>
        <div>
          <div class="text-[9px] text-amber-400/60 uppercase font-bold tracking-wider">Pot</div>
          <div class="text-base font-black text-amber-300 leading-none">{{ pokerStore.gameState.pot }}</div>
        </div>
      </div>

      <button @click="openChat" class="relative shrink-0 w-9 h-9 bg-white/5 hover:bg-white/10 rounded-xl text-on-surface transition-all active:scale-90 flex items-center justify-center border border-white/10" title="Чат">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        <span v-if="pokerStore.unreadMessages > 0" class="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">{{ pokerStore.unreadMessages > 9 ? '9+' : pokerStore.unreadMessages }}</span>
      </button>
    </div>

    <div v-if="!pokerStore.gameState" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="text-5xl mb-3 animate-pulse">♠️</div>
        <p class="text-white text-lg font-bold">Подключение к столу...</p>
        <p class="text-on-surface-variant text-xs mt-2">Ожидание других игроков</p>
      </div>
    </div>

    <div v-else class="flex-1 relative flex flex-col min-h-0">

      <div v-if="pokerStore.gameState.status === 'waiting'" class="flex-1 flex items-center justify-center p-4">
        <div class="bg-black/40 backdrop-blur-md rounded-3xl border border-white/10 p-6 max-w-sm w-full text-center">
          <div class="text-5xl mb-3">🃏</div>
          <h2 class="text-white text-xl font-bold mb-1">Ожидание игроков</h2>
          <p class="text-on-surface-variant text-sm mb-4">Сейчас за столом: {{ pokerStore.gameState.players.length }}</p>

          <div class="space-y-1.5 mb-5">
            <div v-for="p in pokerStore.gameState.players" :key="p.id"
              class="bg-black/30 rounded-xl px-3 py-2 flex items-center gap-2 border border-white/5">
              <div class="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                {{ p.name?.[0] || '?' }}
              </div>
              <span class="text-sm text-white font-medium flex-1 text-left truncate">{{ p.name }}</span>
              <span class="text-xs text-amber-400 font-bold">💰 {{ p.chips }}</span>
            </div>
          </div>

          <button v-if="isHost && pokerStore.gameState.players.length >= 2" @click="startGame" :disabled="isStarting"
            class="w-full bg-primary hover:bg-[#00A891] text-on-primary font-bold py-3 rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
            <span v-if="isStarting" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Начать игру
          </button>
          <p v-else-if="!isHost" class="text-on-surface-variant/60 text-sm animate-pulse">Ждём хоста...</p>
          <p v-else class="text-on-surface-variant/60 text-sm">Нужно минимум 2 игрока</p>
        </div>
      </div>

      <div v-else class="flex-1 relative flex flex-col min-h-0">

        <div class="grid grid-cols-2 gap-2 px-3 pt-2 pb-1 min-h-[80px]">
          <div v-for="seat in opponentsOnLeft" :key="seat.player.id"
            class="flex items-center gap-2 bg-black/30 backdrop-blur rounded-xl px-2 py-1.5 border border-white/5"
            :class="{ 'ring-2 ring-amber-400 border-amber-400/50': pokerStore.gameState.playerOrder[pokerStore.gameState.currentPlayerIdx] === seat.player.id }">
            <div class="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {{ seat.player.name?.[0] || '?' }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1">
                <span class="text-xs font-bold text-white truncate">{{ seat.player.name }}</span>
                <span v-if="getBadge(seat.player)" :class="['text-[9px] px-1 rounded border font-bold', getBadge(seat.player).color]">
                  {{ getBadge(seat.player).symbol }}
                </span>
              </div>
              <div class="text-[10px] text-amber-400 font-bold">💰 {{ seat.player.chips }}</div>
            </div>
            <div v-if="seat.player.folded" class="text-[9px] text-red-400 font-bold">FOLD</div>
            <div v-else-if="seat.player.isAllIn" class="text-[9px] text-purple-400 font-bold">ALL-IN</div>
            <div v-else class="flex">
              <div v-for="n in seat.player.cardCount || 2" :key="n"
                class="w-4 h-6 bg-gradient-to-br from-slate-700 to-slate-600 border border-slate-800 rounded -ml-2 first:ml-0"></div>
            </div>
          </div>

          <div v-for="seat in opponentsOnRight" :key="seat.player.id"
            class="flex items-center gap-2 bg-black/30 backdrop-blur rounded-xl px-2 py-1.5 border border-white/5 col-start-2"
            :class="{ 'ring-2 ring-amber-400 border-amber-400/50': pokerStore.gameState.playerOrder[pokerStore.gameState.currentPlayerIdx] === seat.player.id }">
            <div v-if="seat.player.folded" class="text-[9px] text-red-400 font-bold mr-auto">FOLD</div>
            <div v-else-if="seat.player.isAllIn" class="text-[9px] text-purple-400 font-bold mr-auto">ALL-IN</div>
            <div v-else class="flex mr-auto">
              <div v-for="n in seat.player.cardCount || 2" :key="n"
                class="w-4 h-6 bg-gradient-to-br from-slate-700 to-slate-600 border border-slate-800 rounded -mr-2 last:mr-0"></div>
            </div>
            <div class="min-w-0 flex-1 text-right">
              <div class="flex items-center gap-1 justify-end">
                <span v-if="getBadge(seat.player)" :class="['text-[9px] px-1 rounded border font-bold', getBadge(seat.player).color]">
                  {{ getBadge(seat.player).symbol }}
                </span>
                <span class="text-xs font-bold text-white truncate">{{ seat.player.name }}</span>
              </div>
              <div class="text-[10px] text-amber-400 font-bold">💰 {{ seat.player.chips }}</div>
            </div>
            <div class="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {{ seat.player.name?.[0] || '?' }}
            </div>
          </div>
        </div>

        <div class="flex-1 relative flex items-center justify-center min-h-0">
          <div class="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-white/40 font-bold uppercase tracking-widest">
            {{ roundLabel }}
          </div>

          <div class="flex flex-wrap items-center justify-center gap-2 md:gap-3 px-4 max-w-2xl">
            <Card v-for="(c, i) in pokerStore.communityCards" :key="`cc-${i}`"
              :rank="c.rank" :suit="c.suit" class="deal-flip !shadow-2xl !border-2 !border-white/10"
              card-style="green" />
            <div v-for="n in 5 - (pokerStore.communityCards?.length || 0)" :key="`empty-${n}`"
              class="w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28 rounded-lg border-2 border-dashed border-white/10 opacity-30"></div>
          </div>

          <div v-if="pokerStore.gameState.currentBet > 0" class="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur rounded-full px-3 py-1 border border-amber-500/30">
            <span class="text-[10px] text-amber-400/60 font-bold uppercase mr-1.5">Bet</span>
            <span class="text-amber-300 font-black text-sm">{{ pokerStore.gameState.currentBet }}</span>
          </div>
        </div>

        <div class="shrink-0 px-3 pt-2 pb-3 bg-black/40 backdrop-blur-md border-t border-white/10">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-full bg-primary/30 text-primary flex items-center justify-center font-bold text-sm border-2 border-primary/40">
                {{ me?.name?.[0] || '?' }}
              </div>
              <div>
                <div class="text-sm font-bold text-white flex items-center gap-1.5">
                  {{ me?.name || 'Вы' }}
                  <span v-if="isMyAction" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">Ход</span>
                </div>
                <div class="text-[10px] text-amber-400 font-bold">💰 {{ me?.chips ?? 0 }}</div>
              </div>
            </div>
            <div v-if="me?.currentBet > 0" class="text-right">
              <div class="text-[10px] text-amber-400/60 font-bold uppercase">Ваша ставка</div>
              <div class="text-sm text-amber-300 font-black">{{ me.currentBet }}</div>
            </div>
          </div>

          <div v-if="pokerStore.myHoleCards.length > 0" class="flex justify-center gap-1.5 mb-3">
            <Card v-for="(c, i) in pokerStore.myHoleCards" :key="`my-${i}`"
              :rank="c.rank" :suit="c.suit" class="deal-flip !shadow-xl !border-2 !border-white/20" />
          </div>

          <div v-if="!isMyAction && pokerStore.gameState.status === 'in_progress'" class="text-center text-on-surface-variant text-xs py-2 animate-pulse">
            <span class="text-amber-400">●</span> Ожидание хода соперника...
          </div>

          <div v-else-if="isMyAction" class="grid grid-cols-4 gap-1.5">
            <button @click="doFold"
              class="bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 font-bold py-2.5 rounded-xl transition-all active:scale-95 text-xs sm:text-sm">
              Fold
            </button>
            <button v-if="canCheck" @click="doCheck"
              class="bg-slate-600/30 hover:bg-slate-600/50 border border-slate-400/30 text-white font-bold py-2.5 rounded-xl transition-all active:scale-95 text-xs sm:text-sm">
              Check
            </button>
            <button v-else-if="canCall" @click="doCall"
              class="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 font-bold py-2.5 rounded-xl transition-all active:scale-95 text-xs sm:text-sm">
              Call {{ pokerStore.minCall }}
            </button>
            <button v-if="canRaise" @click="openRaise"
              class="bg-primary hover:bg-[#00A891] text-on-primary font-bold py-2.5 rounded-xl transition-all active:scale-95 text-xs sm:text-sm">
              Raise
            </button>
            <button v-if="canAllIn" @click="doAllIn"
              class="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-300 font-bold py-2.5 rounded-xl transition-all active:scale-95 text-xs sm:text-sm">
              All-In {{ me?.chips }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div v-if="showRaiseSlider" class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        @click.self="showRaiseSlider = false">
        <div class="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-5 shadow-2xl">
          <h3 class="text-white font-bold text-lg mb-3">Raise to: <span class="text-primary">{{ raiseAmount }}</span></h3>
          <input v-model.number="raiseAmount" type="range" :min="pokerStore.minRaise || 20" :max="me?.chips || 1000" step="5"
            class="w-full accent-primary h-2 rounded-full appearance-none bg-white/10 cursor-pointer mb-2" />
          <div class="flex justify-between text-[10px] text-on-surface-variant/60 mb-4">
            <span>{{ pokerStore.minRaise || 20 }}</span>
            <span>{{ Math.floor((pokerStore.minRaise || 20) + (me?.chips || 1000)) / 2 }}</span>
            <span>{{ me?.chips || 0 }}</span>
          </div>
          <div class="flex gap-2">
            <button @click="showRaiseSlider = false"
              class="flex-1 py-2.5 rounded-xl border border-outline/30 text-on-surface hover:bg-white/5 font-bold text-sm">
              Отмена
            </button>
            <button @click="doRaise" :disabled="raiseAmount > (me?.chips || 0)"
              class="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40">
              Raise
            </button>
          </div>
        </div>
      </div>
    </transition>

    <BaseModal :is-open="showResult" max-width="max-w-lg" @close="showResult = false">
      <div v-if="resultData" class="p-4">
        <div class="text-center mb-4">
          <div class="text-5xl mb-2">🏆</div>
          <h2 class="text-2xl font-black text-amber-400">Шоудаун!</h2>
          <p class="text-on-surface-variant text-sm">Банк: {{ pokerStore.showdownPot }} 💰</p>
        </div>
        <div class="space-y-3 mb-4">
          <div v-for="p in pokerStore.gameState?.players || []" :key="p.id"
            class="bg-black/30 rounded-xl p-3 border"
            :class="resultData.winners?.some(w => (w.playerId || w.id) === p.id) ? 'border-amber-500/50' : 'border-white/10'">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-white">{{ p.name }}</span>
                <span v-if="resultData.winners?.some(w => (w.playerId || w.id) === p.id)" class="text-xs text-amber-400 font-bold">👑 ПОБЕДИТЕЛЬ</span>
                <span v-if="p.folded" class="text-xs text-red-400 font-bold">FOLD</span>
              </div>
              <span v-if="p.cards?.length === 2" class="text-xs text-amber-400 font-bold">💰 {{ p.chips }}</span>
            </div>
            <div v-if="p.cards && p.cards.length === 2" class="flex justify-center gap-1.5">
              <Card v-for="(c, i) in p.cards" :key="i" :rank="c.rank" :suit="c.suit" class="shadow-md !w-12 !h-16 sm:!w-14 sm:!h-20 !border !border-white/20" />
            </div>
            <div v-else class="text-center text-on-surface-variant/40 text-xs">карты не показаны</div>
            <div v-if="resultData.winners?.find(w => (w.playerId || w.id) === p.id)?.handRank" class="text-center text-xs text-amber-400 mt-1.5 font-bold">
              {{ resultData.winners.find(w => (w.playerId || w.id) === p.id).handRank.name }}
            </div>
          </div>
        </div>
        <button @click="() => { showResult = false; leaveGame(); }"
          class="w-full bg-primary text-on-primary font-bold py-2.5 rounded-xl">
          В лобби
        </button>
      </div>
    </BaseModal>

    <transition name="slide">
      <div v-if="isChatOpen" class="fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-80 z-40 bg-surface border-t md:border border-white/10 md:rounded-2xl shadow-2xl flex flex-col max-h-[60vh]">
        <div class="flex items-center justify-between p-3 border-b border-white/10 shrink-0">
          <h3 class="text-white font-bold text-sm flex items-center gap-1.5">💬 Чат стола</h3>
          <button @click="isChatOpen = false" class="text-on-surface-variant hover:text-white p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs">
          <div v-if="pokerStore.chatLog.length === 0" class="text-on-surface-variant/50 text-center py-4">Нет сообщений</div>
          <div v-for="(entry, i) in pokerStore.chatLog" :key="i" class="bg-black/20 rounded-lg px-2 py-1.5 border border-white/5">
            <div class="font-bold text-emerald-300 text-[10px]">{{ entry.playerName || 'Player' }}</div>
            <div class="text-white/90 break-words">{{ entry.message }}</div>
          </div>
        </div>
        <form @submit.prevent="sendChat" class="flex gap-1.5 p-2 border-t border-white/10 shrink-0">
          <input v-model="chatInput" type="text" maxlength="200" placeholder="Сообщение..."
            class="flex-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary" />
          <button type="submit" :disabled="!chatInput.trim()"
            class="bg-primary text-on-primary font-bold px-3 rounded-lg disabled:opacity-40 text-sm">→</button>
        </form>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

@keyframes dealFlip {
  0% {
    opacity: 0;
    transform: translateY(-40px) rotateY(180deg) scale(0.5);
  }
  60% {
    transform: translateY(4px) rotateY(0deg) scale(1.05);
  }
  100% {
    opacity: 1;
    transform: translateY(0) rotateY(0deg) scale(1);
  }
}

.deal-flip {
  animation: dealFlip 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

.deal-flip:nth-child(1) { animation-delay: 0ms; }
.deal-flip:nth-child(2) { animation-delay: 100ms; }
.deal-flip:nth-child(3) { animation-delay: 200ms; }
.deal-flip:nth-child(4) { animation-delay: 300ms; }
.deal-flip:nth-child(5) { animation-delay: 400ms; }
</style>
