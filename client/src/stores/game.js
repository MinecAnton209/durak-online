import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import router from '@/router';
import { useSocketStore } from './socket';
import { useToastStore } from './toast';
import { useAuthStore } from './auth';
import i18n from '@/i18n';

export const useGameStore = defineStore('game', () => {
  const socketStore = useSocketStore();
  const toast = useToastStore();
  const authStore = useAuthStore();

  const gameId = ref(null);
  const playerId = ref(null);
  const hostId = ref(null);
  const players = ref([]);
  const settings = ref({});

  const publicLobbies = ref([]);

  const gameStatus = ref('lobby');
  const isDealing = ref(false);

  const tableCards = ref([]);
  const myCards = ref([]);
  const trumpCard = ref(null);
  const deckCount = ref(0);

  const winner = ref(null);
  const winnerData = ref(null);
  const rematchStatus = ref(null);

  const isMyTurn = ref(false);
  const canTake = ref(false);
  const canPass = ref(false);

  const chatLog = ref([]);
  const unreadMessages = ref(0);

  const musicState = ref({
    currentTrackId: null,
    isPlaying: false,
    trackTitle: i18n.global.t('default_music_title'),
    suggester: null,
    seekTimestamp: 0,
    stateChangeTimestamp: 0
  });

  const isHost = computed(() => hostId.value && playerId.value && hostId.value === playerId.value);
  const myPlayer = computed(() => players.value.find(p => p.id === playerId.value));
  const isAttacker = computed(() => myPlayer.value?.isAttacker || false);
  const isDefender = computed(() => myPlayer.value?.isDefender || false);
  const attackerId = computed(() => players.value.find(p => p.isAttacker)?.id);
  const defenderId = computed(() => players.value.find(p => p.isDefender)?.id);

  const turnPlayerId = computed(() => {
    if (tableCards.value.length % 2 === 0) return attackerId.value;
    return defenderId.value;
  });

  const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  function getRankValue(rank) { return RANK_VALUES[rank] || 0; }

  function canPlayCard(card) {
    if (isDealing.value) return false;
    if (!isMyTurn.value) return false;

    if (isAttacker.value) {
      if (tableCards.value.length === 0) return true;
      const ranksOnTable = tableCards.value.map(c => c.rank);
      return ranksOnTable.includes(card.rank);
    }

    if (isDefender.value) {
      const attackCard = tableCards.value[tableCards.value.length - 1];
      if (!attackCard) return false;

      if (card.suit === attackCard.suit) {
        return getRankValue(card.rank) > getRankValue(attackCard.rank);
      }
      if (trumpCard.value && card.suit === trumpCard.value.suit && attackCard.suit !== trumpCard.value.suit) {
        return true;
      }
    }
    return false;
  }

  function initListeners() {
    const socket = socketStore.socket;
    if (!socket) return;

    socket.off('lobbyCreated'); socket.off('joinSuccess'); socket.off('lobbyStateUpdate');
    socket.off('playerJoined'); socket.off('playerLeft'); socket.off('gameStateUpdate');
    socket.off('invalidMove'); socket.off('musicStateUpdate'); socket.off('newLogEntry');
    socket.off('rematchUpdate');

    socket.on('lobbyCreated', (data) => {
      resetState();
      gameId.value = data.gameId;
      playerId.value = socket.id;
      hostId.value = socket.id;
      if (data.settings) {
        settings.value = data.settings;
      }
      gameStatus.value = 'lobby';
      router.push(`/lobby/${data.gameId}`);
    });

    socket.on('joinSuccess', (data) => {
      resetState();
      gameId.value = data.gameId;
      playerId.value = data.playerId;
      gameStatus.value = 'lobby';
      router.push(`/lobby/${data.gameId}`);
    });

    socket.on('lobbyStateUpdate', (data) => {
      console.log('⚡ EVENT RECEIVED: lobbyStateUpdate', data);
      players.value = data.players || [];
      if (data.hostId) hostId.value = data.hostId;
      if (data.settings) settings.value = data.settings;
    });

    socket.on('playerLeft', (data) => {
      console.log('⚡ EVENT RECEIVED: playerLeft', data);
      if (data && data.playerId) {
        players.value = players.value.filter(p => p.id !== data.playerId);
      }
      if (gameId.value) socketStore.emit('getLobbyState', { gameId: gameId.value });
    });

    socket.on('playerJoined', () => {
      if (gameId.value) socketStore.emit('getLobbyState', { gameId: gameId.value });
    });

    socket.on('gameStateUpdate', (state) => {
      console.log('⚡ Game State:', state);

      if (!state.winner) {
        winnerData.value = null;
        winner.value = null;
        rematchStatus.value = null;
      }

      if (gameStatus.value === 'lobby' && !state.winner && state.trumpCard) {
        isDealing.value = true;
      }

      gameStatus.value = state.winner ? 'finished' : 'playing';

      tableCards.value = state.table || [];
      trumpCard.value = state.trumpCard;
      deckCount.value = state.deckCardCount;
      players.value = state.players;

      if (state.hostId) hostId.value = state.hostId;

      isMyTurn.value = state.isYourTurn;
      canTake.value = state.canTake;
      canPass.value = state.canPass;

      const currentSocketId = socketStore.socket?.id;
      const myId = playerId.value || currentSocketId;
      if (!playerId.value && currentSocketId) playerId.value = currentSocketId;

      const me = state.players.find(p => p.id === myId);
      if (me) myCards.value = me.cards || [];
      else if (state.isSpectator) myCards.value = [];

      if (state.winner) {
        winner.value = state.winner;
        winnerData.value = state.winner;
        isDealing.value = false;

        const amIWinner = state.winner.winners && state.winner.winners.some(w => w.id === myId);
        const amILoser = state.winner.loser && state.winner.loser.id === myId;

        if (amIWinner) new Audio('/sounds/win.mp3').play().catch(() => null);
        else if (amILoser) new Audio('/sounds/lose.mp3').play().catch(() => null);
      }

      if (state.musicState) musicState.value = state.musicState;
    });

    socket.on('musicStateUpdate', (state) => musicState.value = state);

    socket.on('newLogEntry', (entry) => {
      chatLog.value.push(entry);
      unreadMessages.value++;
      if (chatLog.value.length > 50) chatLog.value.shift();
    });

    socket.on('invalidMove', ({ reason }) => toast.addToast('⚠️ ' + reason, 'warning'));
    socket.on('rematchUpdate', (data) => rematchStatus.value = data);
  }

  function resetState() {
    gameStatus.value = 'lobby';
    tableCards.value = [];
    myCards.value = [];
    winnerData.value = null;
    rematchStatus.value = null;
    isMyTurn.value = false;
    hostId.value = null;
    settings.value = {};
  }

  function stopDealingAnimation() { isDealing.value = false; }

  function createLobby(lobbySettings) {
    initListeners();
    socketStore.emit('createLobby', lobbySettings);
  }

  function joinLobby({ gameId, inviteCode, playerName = null }) {
    initListeners();

    const nameToSend = playerName || (authStore.user ? authStore.user.username : `Guest ${Math.floor(Math.random()*1000)}`);

    socketStore.emit('joinLobby', {
      gameId,
      inviteCode,
      playerName: nameToSend
    });
  }

  async function findAndJoinPublicLobby(guestName = null) {
    try {
      initListeners();
      toast.addToast(i18n.global.t('searching_for_game'), 'info');

      const response = await fetch('/api/public/lobbies');
      if (!response.ok) throw new Error('Network error');

      const lobbies = await response.json();

      const suitableLobby = lobbies.find(lobby =>
        lobby.playerCount < lobby.maxPlayers &&
        lobby.maxPlayers >= 2 &&
        lobby.maxPlayers <= 4
      );

      if (suitableLobby) {
        console.log(`Found suitable lobby: ${suitableLobby.gameId}`);
        joinLobby({ gameId: suitableLobby.gameId, playerName: guestName });
      } else {
        console.log('No suitable lobbies found, creating a new one.');
        createLobby({
          lobbyType: 'public',
          maxPlayers: 2,
          deckSize: 36,
          betAmount: 0,
          playerName: guestName
        });
      }
    } catch (error) {
      console.error('Quick play failed:', error);
      toast.addToast(i18n.global.t('error_finding_game'), 'error');
    }
  }


  function subscribeToLobbies() {
    if (!socketStore.socket) return;
    socketStore.emit('joinLobbyBrowser');

    socketStore.socket.on('lobbyListUpdate', (list) => {
      publicLobbies.value = list;
    });
  }

  function unsubscribeFromLobbies() {
    if (!socketStore.socket) return;
    socketStore.emit('leaveLobbyBrowser');
    socketStore.socket.off('lobbyListUpdate');
  }

  function makeMove(card) {
    socketStore.emit('makeMove', { gameId: gameId.value, card });
    new Audio('/sounds/play.mp3').play().catch(() => null);
  }
  function takeCards() {
    socketStore.emit('takeCards', { gameId: gameId.value });
    new Audio('/sounds/take.mp3').play().catch(() => null);
  }
  function passTurn() {
    socketStore.emit('passTurn', { gameId: gameId.value });
    new Audio('/sounds/play.mp3').play().catch(() => null);
  }
  function requestRematch() {
    if (!gameId.value) return;
    socketStore.emit('requestRematch', { gameId: gameId.value });
  }
  function leaveGame() {
    socketStore.emit('leaveLobby', { gameId: gameId.value });
    gameId.value = null;
    playerId.value = null;
    hostId.value = null;
    resetState();
    router.push('/');
  }
  function sendMessage(text) { if (text.trim()) socketStore.emit('sendMessage', { gameId: gameId.value, message: text }); }
  function markChatRead() { unreadMessages.value = 0; }

  function changeTrack(url) {
    const id = getYouTubeID(url);
    if (!id) return toast.addToast(i18n.global.t('game_invalid_link'), 'error');
    const title = prompt(i18n.global.t('prompt_track_title'), i18n.global.t('default_music_title'));
    if (!title) return;
    socketStore.emit('hostChangeTrack', { gameId: gameId.value, trackId: id, trackTitle: title });
  }
  function suggestTrack(url) {
    const id = getYouTubeID(url);
    if (!id) return toast.addToast(i18n.global.t('game_invalid_link'), 'error');
    const title = prompt(i18n.global.t('prompt_track_title'), i18n.global.t('default_offer_title'));
    if (title) {
      socketStore.emit('suggestTrack', { gameId: gameId.value, trackId: id, trackTitle: title });
      toast.addToast(i18n.global.t('sent_to_host'), 'success');
    }
  }
  function getYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  async function refreshLobbyList() {
    try {
      const response = await fetch('/api/public/lobbies');
      if (response.ok) {
        const list = await response.json();
        publicLobbies.value = list;
      }
    } catch (error) {
      console.error("Auto-sync error:", error);
    }
  }

  return {
    gameId, playerId, players, hostId, settings,
    publicLobbies,
    isHost, gameStatus, tableCards, myCards, trumpCard, deckCount,
    turnPlayerId, attackerId, defenderId,
    isMyTurn, isAttacker, isDefender,
    canTake, canPass, isDealing, winnerData, rematchStatus,
    chatLog, unreadMessages, musicState,

    initListeners, createLobby, joinLobby, findAndJoinPublicLobby,
    subscribeToLobbies, unsubscribeFromLobbies,
    makeMove, takeCards, passTurn,
    canPlayCard, stopDealingAnimation, leaveGame, requestRematch,
    sendMessage, markChatRead, changeTrack, suggestTrack, refreshLobbyList
  };
});
