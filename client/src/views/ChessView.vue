<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocketStore } from '@/stores/socket';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useI18n } from 'vue-i18n';
import { TheChessboard } from 'vue3-chessboard';
import 'vue3-chessboard/style.css';

const Chessboard = TheChessboard;

const route = useRoute();
const router = useRouter();
const socketStore = useSocketStore();
const authStore = useAuthStore();
const toast = useToastStore();
const { t } = useI18n();

const urlGameId = route.params.id?.toUpperCase();

const gameState = ref(null);
const errorMessage = ref('');
const isLoading = ref(true);
const isCreating = ref(false);
const selectedTimeType = ref('rapid');
const selectedBetAmount = ref(0);

const playerName = ref('');

const timeTypes = [
  { value: 'blitz', label: 'Blitz 3 min', time: 180000 },
  { value: 'rapid', label: 'Rapid 5 min', time: 300000 },
  { value: 'classical', label: 'Classical 10 min', time: 600000 }
];

const isPlayerInGame = computed(() => {
  if (!gameState.value || !gameState.value.players) return false;
  return gameState.value.players.some(p => p.id === socketStore.socket?.id);
});

const currentPlayer = computed(() => {
  if (!gameState.value || !gameState.value.players) return null;
  return gameState.value.players.find(p => p.id === socketStore.socket?.id);
});

const opponent = computed(() => {
  if (!gameState.value || !gameState.value.players) return null;
  return gameState.value.players.find(p => p.id !== socketStore.socket?.id);
});

const isMyTurn = computed(() => gameState.value?.isYourTurn || false);

const myColor = computed(() => gameState.value?.yourColor || null);

const gameStatusText = computed(() => {
  if (!gameState.value) return '';
  if (gameState.value.status === 'waiting') return t('chess_waiting_for_player');
  if (gameState.value.status === 'finished') {
    if (gameState.value.winner) {
      const winnerName = gameState.value.winner.player?.name;
      if (gameState.value.winner.type === 'checkmate') {
        return t('chess_checkmate_winner', { winner: winnerName });
      }
      return t('chess_winner', { winner: winnerName });
    }
    return t('chess_draw');
  }
  if (isMyTurn.value) return t('chess_your_turn');
  return t('chess_opponent_turn');
});

const formatTime = (ms) => {
  if (!ms) return '0:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

onMounted(async () => {
  if (!socketStore.isConnected) {
    await socketStore.connect();
  }

  setupSocketListeners();

  if (urlGameId) {
    joinExistingGame();
  } else {
    isLoading.value = false;
    playerName.value = authStore.user?.username || t('default_guest_name') + ' ' + Math.floor(Math.random() * 1000);
  }
});

onUnmounted(() => {
  removeSocketListeners();
});

const setupSocketListeners = () => {
  const socket = socketStore.socket;
  if (!socket) return;

  socket.on('chessGameStateUpdate', handleGameStateUpdate);
  socket.on('chessLobbyStateUpdate', handleLobbyStateUpdate);
  socket.on('chessJoinSuccess', handleJoinSuccess);
  socket.on('chessLobbyCreated', handleLobbyCreated);
  socket.on('chessInvalidMove', handleInvalidMove);
  socket.on('chessPlayerDisconnected', handlePlayerDisconnected);
  socket.on('error', handleSocketError);
  socket.on('chessLobbyExpired', handleLobbyExpired);
};

const removeSocketListeners = () => {
  const socket = socketStore.socket;
  if (!socket) return;

  socket.off('chessGameStateUpdate', handleGameStateUpdate);
  socket.off('chessLobbyStateUpdate', handleLobbyStateUpdate);
  socket.off('chessJoinSuccess', handleJoinSuccess);
  socket.off('chessLobbyCreated', handleLobbyCreated);
  socket.off('chessInvalidMove', handleInvalidMove);
  socket.off('chessPlayerDisconnected', handlePlayerDisconnected);
  socket.off('error', handleSocketError);
  socket.off('chessLobbyExpired', handleLobbyExpired);
};

const handleGameStateUpdate = (state) => {
  gameState.value = state;
  isLoading.value = false;
};

const handleLobbyStateUpdate = (state) => {
  gameState.value = { ...gameState.value, ...state, status: 'waiting' };
};

const handleJoinSuccess = ({ gameId }) => {
  socketStore.socket?.emit('getChessLobbyState', { gameId });
};

const handleLobbyCreated = ({ gameId }) => {
  router.replace(`/chess/${gameId}`);
};

const handleInvalidMove = ({ reason }) => {
  toast.addToast(t('chess_invalid_move'), 'error');
};

const handlePlayerDisconnected = ({ playerId, timeout }) => {
  toast.addToast(t('chess_player_disconnected'), 'warning');
};

const handleSocketError = (error) => {
  if (error.i18nKey) {
    toast.addToast(t(error.i18nKey), 'error');
  } else if (error.message) {
    toast.addToast(error.message, 'error');
  }
};

const handleLobbyExpired = () => {
  toast.addToast(t('chess_lobby_expired'), 'warning');
  router.push('/');
};

const createLobby = () => {
  isCreating.value = true;
  socketStore.socket?.emit('createChessLobby', {
    timeType: selectedTimeType.value,
    betAmount: selectedBetAmount.value,
    playerName: playerName.value
  });
};

const joinExistingGame = () => {
  isLoading.value = true;
  socketStore.socket?.emit('joinChessLobby', {
    gameId: urlGameId,
    playerName: authStore.user?.username || null
  });
};

const joinRandomLobby = () => {
  isLoading.value = true;
  socketStore.socket?.emit('joinChessLobbyBrowser');
  socketStore.socket?.once('chessLobbyListUpdate', (lobbies) => {
    if (lobbies && lobbies.length > 0) {
      const randomLobby = lobbies[Math.floor(Math.random() * lobbies.length)];
      joinSpecificLobby(randomLobby.gameId);
    } else {
      isLoading.value = false;
      createLobby();
    }
  });
};

const joinSpecificLobby = (gameId) => {
  socketStore.socket?.emit('joinChessLobby', {
    gameId,
    playerName: authStore.user?.username || null
  });
};

const onMove = ({ from, to }) => {
  if (!gameState.value || gameState.value.status !== 'in_progress') return false;
  if (!isMyTurn.value) return false;

  socketStore.socket?.emit('chessMove', {
    gameId: gameState.value.gameId,
    from,
    to,
    promotion: 'q'
  });
  return false;
};

const resign = () => {
  if (!confirm(t('chess_resign_confirm'))) return;
  socketStore.socket?.emit('chessResign', {
    gameId: gameState.value.gameId
  });
};

const offerDraw = () => {
  socketStore.socket?.emit('chessOfferDraw', {
    gameId: gameState.value.gameId
  });
};

const leaveGame = () => {
  if (gameState.value?.gameId) {
    socketStore.socket?.emit('leaveChessLobby', {
      gameId: gameState.value.gameId
    });
  }
  router.push('/');
};

const copyInviteLink = () => {
  const link = `${window.location.origin}/chess/${gameState.value?.gameId}`;
  navigator.clipboard.writeText(link);
  toast.addToast(t('link_copied'), 'success');
};
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <div class="flex items-center justify-between p-4 bg-surface/50">
      <button @click="leaveGame" class="text-white hover:text-primary transition-colors">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-xl font-bold text-white">{{ t('chess_title') }}</h1>
      <div class="w-10"></div>
    </div>

    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>

    <div v-else-if="!gameState || gameState.status === 'waiting'" class="flex-1 flex flex-col items-center justify-center p-4">
      <div class="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl">
        <h2 class="text-2xl font-bold text-white mb-6 text-center">
          {{ urlGameId ? t('chess_joining') : t('chess_create_game') }}
        </h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-on-surface-variant mb-2">
              {{ t('chess_time_control') }}
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="type in timeTypes"
                :key="type.value"
                @click="selectedTimeType = type.value"
                :class="[
                  'py-2 px-3 rounded-lg text-sm font-medium transition-all',
                  selectedTimeType === type.value
                    ? 'bg-primary text-white'
                    : 'bg-white/10 text-on-surface hover:bg-white/20'
                ]"
              >
                {{ type.label }}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-on-surface-variant mb-2">
              {{ t('chess_bet_amount') }}
            </label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="amount in [0, 10, 50, 100]"
                :key="amount"
                @click="selectedBetAmount = amount"
                :class="[
                  'py-2 rounded-lg text-sm font-medium transition-all',
                  selectedBetAmount === amount
                    ? 'bg-primary text-white'
                    : 'bg-white/10 text-on-surface hover:bg-white/20'
                ]"
              >
                {{ amount === 0 ? t('free') : amount }}
              </button>
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              @click="createLobby"
              :disabled="isCreating"
              class="flex-1 bg-primary hover:bg-[#00A891] text-white font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50"
            >
              {{ t('chess_create') }}
            </button>
            <button
              @click="joinRandomLobby"
              class="flex-1 bg-transparent border border-outline text-on-surface font-medium py-3 px-4 rounded-xl hover:bg-white/5 transition-all"
            >
              {{ t('chess_quick_join') }}
            </button>
          </div>

          <div v-if="gameState?.gameId" class="mt-4 p-4 bg-white/5 rounded-xl">
            <p class="text-sm text-on-surface-variant mb-2">{{ t('chess_invite_friend') }}</p>
            <div class="flex gap-2">
              <input
                :value="`${$route.path}`"
                readonly
                class="flex-1 bg-black/20 border border-outline/50 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button
                @click="copyInviteLink"
                class="bg-primary/20 text-primary px-3 rounded-lg hover:bg-primary/30 transition-colors"
              >
                📋
              </button>
            </div>
          </div>

          <div v-if="gameState?.players?.length > 0" class="mt-4">
            <p class="text-sm text-on-surface-variant mb-2">{{ t('chess_players_in_lobby') }}:</p>
            <div class="space-y-2">
              <div
                v-for="player in gameState.players"
                :key="player.id"
                class="flex items-center justify-between bg-white/5 p-3 rounded-lg"
              >
                <div class="flex items-center gap-2">
                  <span :class="player.color === 'white' ? 'text-white' : 'text-gray-400'">
                    {{ player.color === 'white' ? '⚪' : '⚫' }}
                  </span>
                  <span class="text-white font-medium">{{ player.name }}</span>
                  <span v-if="player.isHost" class="text-xs bg-primary/30 text-primary px-2 py-0.5 rounded">
                    {{ t('host') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex flex-col p-4 gap-4">
      <div class="flex items-center justify-between bg-surface rounded-xl p-4">
        <div class="flex items-center gap-3">
          <span :class="opponent?.color === 'white' ? 'text-white' : 'text-gray-400'" class="text-2xl">
            {{ opponent?.color === 'white' ? '⚪' : '⚫' }}
          </span>
          <div>
            <p class="text-white font-medium">{{ opponent?.name || t('waiting') }}</p>
            <p class="text-xs text-on-surface-variant">{{ opponent?.rating || 0 }} {{ t('rating') }}</p>
          </div>
        </div>
        <div class="text-2xl font-bold text-white">
          {{ formatTime(opponent?.timeLeft) }}
        </div>
      </div>

      <div class="flex-1 flex items-center justify-center">
        <div class="w-full max-w-lg aspect-square">
          <Chessboard
            :game="gameState.fen"
            @move="onMove"
            :board-style="{
              width: '100%',
              height: '100%'
            }"
          />
        </div>
      </div>

      <div class="flex items-center justify-between bg-surface rounded-xl p-4">
        <div class="flex items-center gap-3">
          <span :class="currentPlayer?.color === 'white' ? 'text-white' : 'text-gray-400'" class="text-2xl">
            {{ currentPlayer?.color === 'white' ? '⚪' : '⚫' }}
          </span>
          <div>
            <p class="text-white font-medium">{{ currentPlayer?.name }}</p>
            <p class="text-xs text-on-surface-variant">{{ currentPlayer?.rating || 0 }} {{ t('rating') }}</p>
          </div>
        </div>
        <div class="text-2xl font-bold" :class="isMyTurn ? 'text-primary' : 'text-white'">
          {{ formatTime(currentPlayer?.timeLeft) }}
        </div>
      </div>

      <div class="flex items-center justify-center gap-4">
        <button
          v-if="gameState.status === 'in_progress'"
          @click="resign"
          class="px-6 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          {{ t('chess_resign') }}
        </button>
        <button
          v-if="gameState.status === 'in_progress'"
          @click="offerDraw"
          class="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
        >
          {{ t('chess_offer_draw') }}
        </button>
      </div>

      <div v-if="gameState.status === 'finished'" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div class="bg-surface rounded-2xl p-8 text-center max-w-sm mx-4">
          <h2 class="text-3xl font-bold text-white mb-4">{{ gameStatusText }}</h2>
          <button
            @click="router.push('/')"
            class="w-full bg-primary hover:bg-[#00A891] text-white font-bold py-3 rounded-xl transition-all"
          >
            {{ t('back_to_home') }}
          </button>
        </div>
      </div>

      <div v-if="gameState.log?.length > 0" class="bg-surface/50 rounded-xl p-3 max-h-32 overflow-y-auto">
        <div v-for="(entry, index) in gameState.log" :key="index" class="text-xs text-on-surface-variant">
          <span class="text-primary">[{{ entry.timestamp }}]</span>
          {{ entry.message || t(entry.i18nKey, entry.options) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chessboard-container {
  width: 100%;
  max-width: 500px;
  aspect-ratio: 1;
}
</style>
