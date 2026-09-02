import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useSocketStore } from './socket';
import { useToastStore } from './toast';

export const usePokerStore = defineStore('poker', () => {
  const socketStore = useSocketStore();
  const toast = useToastStore();

  const gameId = ref(null);
  const gameState = ref(null);
  const playerId = ref(null);
  const isMyTurn = ref(false);
  const myHoleCards = ref([]);
  const communityCards = ref([]);
  const pot = ref(0);
  const currentBet = ref(0);
  const minCall = ref(0);
  const minRaise = ref(0);
  const canCheck = ref(false);
  const canCall = ref(false);
  const canRaise = ref(false);
  const canFold = ref(false);
  const canAllIn = ref(false);

  const lobbyState = ref(null);
  const tournaments = ref([]);

  const showdownWinners = ref([]);
  const showdownPot = ref(0);
  const showResultModal = ref(false);

  const chatLog = ref([]);
  const unreadMessages = ref(0);

  function sendMessage(text) {
    if (!text.trim() || !gameId.value) return;
    socketStore.emit('sendMessage', { gameId: gameId.value, message: text });
  }

  function markChatRead() { unreadMessages.value = 0; }

  const CARD_EMOJIS = {
    '2': '2️⃣', '3': '3️⃣', '4': '4️⃣', '5': '5️⃣', '6': '6️⃣',
    '7': '7️⃣', '8': '8️⃣', '9': '9️⃣', 'T': '🔟', 'J': 'J️⃣',
    'Q': 'Q️⃣', 'K': 'K️⃣', 'A': 'A️⃣',
  };

  function initListeners() {
    const socket = socketStore.socket;
    if (!socket) return;

    socket.off('pokerGameStarted');
    socket.off('pokerActionRequired');
    socket.off('pokerPlayerFolded');
    socket.off('pokerPlayerWentAllIn');
    socket.off('pokerHandComplete');
    socket.off('pokerShowdown');
    socket.off('pokerError');
    socket.off('pokerLobbyUpdate');
    socket.off('pokerPlayerJoined');
    socket.off('pokerLobbies');
    socket.off('pokerLobbyState');
    socket.off('pokerPlayerDisconnected');
    socket.off('newLogEntry');

    socket.on('pokerGameStarted', (data) => {
      gameId.value = data.id || null;
      gameState.value = data;
      playerId.value = socket.id;
      updateLocalState();
    });

    socket.on('pokerFlopDealt', (data) => {
      if (data.id) {
        gameState.value = data;
        updateLocalState();
      }
    });

    socket.on('pokerTurnDealt', (data) => {
      if (data.id) {
        gameState.value = data;
        updateLocalState();
      }
    });

    socket.on('pokerRiverDealt', (data) => {
      if (data.id) {
        gameState.value = data;
        updateLocalState();
      }
    });

    socket.on('pokerActionRequired', ({ playerId: requiredPlayerId, minCall: call, minRaise: raise }) => {
      if (requiredPlayerId === socket.id) {
        minCall.value = call;
        minRaise.value = raise;
        canCheck.value = call === 0;
        canCall.value = call > 0;
        canRaise.value = true;
        isMyTurn.value = true;
      } else {
        isMyTurn.value = false;
      }
    });

    socket.on('pokerPlayerFolded', ({ playerId: foldedId }) => {
      if (gameState.value?.players) {
        const list = Array.isArray(gameState.value.players) ? gameState.value.players : Object.values(gameState.value.players);
        const player = list.find(p => p.id === foldedId);
        if (player) player.folded = true;
      }
    });

    socket.on('pokerPlayerWentAllIn', ({ playerId: allInId }) => {
      if (gameState.value?.players) {
        const list = Array.isArray(gameState.value.players) ? gameState.value.players : Object.values(gameState.value.players);
        const player = list.find(p => p.id === allInId);
        if (player) player.isAllIn = true;
      }
    });

    socket.on('pokerShowdown', ({ winners, pot: potAmount, allCards }) => {
      console.log('Poker showdown:', winners, allCards);
      if (allCards) {
        const list = Array.isArray(allCards) ? allCards : Object.values(allCards);
        list.forEach((entry) => {
          if (gameState.value?.players) {
            const playerList = Array.isArray(gameState.value.players)
              ? gameState.value.players
              : Object.values(gameState.value.players);
            const p = playerList.find((pl) => pl.id === entry.playerId);
            if (p && entry.cards) p.cards = entry.cards;
          }
        });
      }
      showdownWinners.value = winners;
      showdownPot.value = potAmount;
      showResultModal.value = true;
      toast.addToast(`Покер: победитель определен! Банк: ${potAmount}`, 'success');
    });

    socket.on('pokerError', ({ message }) => {
      console.error('[Poker] error from server:', message);
      toast.addToast(message, 'error');
    });

    socket.on('pokerLobbyUpdate', (data) => {
      lobbyState.value = data;
    });

    socket.on('pokerPlayerJoined', ({ playerId: newPlayerId }) => {
      console.log('Player joined poker game:', newPlayerId);
    });

    socket.on('pokerLobbies', (lobbies) => {
      tournaments.value = lobbies;
    });

    socket.on('pokerLobbyState', (state) => {
      console.log('[Poker] lobby state received', state);
      gameId.value = state.id;
      if (!playerId.value) playerId.value = socket.id;
      gameState.value = state;
      updateLocalState();
    });

    socket.on('pokerPlayerDisconnected', ({ playerId, name }) => {
      console.log('[Poker] player disconnected:', name);
      if (gameState.value?.players) {
        const list = Array.isArray(gameState.value.players)
          ? gameState.value.players
          : Object.values(gameState.value.players);
        const p = list.find((pl) => pl.id === playerId);
        if (p) p.isConnected = false;
      }
    });

    socket.on('newLogEntry', (entry) => {
      chatLog.value.push(entry);
      unreadMessages.value++;
      if (chatLog.value.length > 100) chatLog.value.shift();
    });
  }

  function updateLocalState() {
    if (!gameState.value) return;

    const players = Array.isArray(gameState.value.players)
      ? gameState.value.players
      : Object.values(gameState.value.players || {});
    const me = players.find(p => p.id === playerId.value);
    if (me) {
      myHoleCards.value = me.cards || [];
    }
    communityCards.value = gameState.value.communityCards || [];
    pot.value = gameState.value.pot || 0;
    currentBet.value = gameState.value.currentBet || 0;
  }

  function createPokerLobby(settings) {
    initListeners();
    socketStore.emit('createPokerLobby', {
      gameType: settings.gameType || 'poker_holdem_cash',
      maxPlayers: settings.maxPlayers || 10,
      startingChips: settings.startingChips || 1000,
      smallBlind: settings.smallBlind || 5,
      bigBlind: settings.bigBlind || 10,
      blindStructure: settings.blindStructure,
      tournamentId: settings.tournamentId,
    });
  }

  function joinPoker(lobbyId) {
    initListeners();
    socketStore.emit('joinPoker', { gameId: lobbyId });
  }

  function startGame() {
    if (!gameId.value) return;
    socketStore.emit('startPoker', { gameId: gameId.value });
  }

  function call() {
    if (!gameId.value) return;
    socketStore.emit('call', { gameId: gameId.value });
  }

  function check() {
    if (!gameId.value) return;
    socketStore.emit('check', { gameId: gameId.value });
  }

  function raise(amount) {
    if (!gameId.value) return;
    socketStore.emit('raise', { gameId: gameId.value, amount });
  }

  function fold() {
    if (!gameId.value) return;
    socketStore.emit('fold', { gameId: gameId.value });
  }

  function allIn() {
    if (!gameId.value) return;
    socketStore.emit('allIn', { gameId: gameId.value });
  }

  function fetchTournaments() {
    fetch('/api/poker/tournaments')
      .then((r) => r.json())
      .then((data) => {
        tournaments.value = data.tournaments || [];
      })
      .catch(console.error);
  }

  function leaveGame() {
    socketStore.emit('leavePoker', { gameId: gameId.value });
    gameId.value = null;
    gameState.value = null;
    playerId.value = null;
  }

  return {
    gameId,
    gameState,
    playerId,
    isMyTurn,
    myHoleCards,
    communityCards,
    pot,
    currentBet,
    minCall,
    minRaise,
    canCheck,
    canCall,
    canRaise,
    canFold,
    canAllIn,
    lobbyState,
    tournaments,
    showdownWinners,
    showdownPot,
    showResultModal,
    chatLog,
    unreadMessages,
    CARD_EMOJIS,
    initListeners,
    createPokerLobby,
    joinPoker,
    startGame,
    call,
    check,
    raise,
    fold,
    allIn,
    fetchTournaments,
    leaveGame,
    sendMessage,
    markChatRead,
  };
});
