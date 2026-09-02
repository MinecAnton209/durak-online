import * as pokerService from '../services/pokerService.js';

export default function registerPokerLobbyHandlers(_io: any, socket: any) {
  socket.on('createPokerLobby', async (settings: any) => {
    console.log(`[Poker] createPokerLobby from ${socket.id}:`, settings);
    try {
      const gameId = await pokerService.createPokerLobby(socket, {
        gameType: settings.gameType ?? 'poker_holdem_cash',
        maxPlayers: settings.maxPlayers ?? 10,
        startingChips: settings.startingChips ?? 1000,
        smallBlind: settings.smallBlind ?? 5,
        bigBlind: settings.bigBlind ?? 10,
        blindStructure: settings.blindStructure,
        tournamentId: settings.tournamentId,
      });
      console.log(`[Poker] Lobby created: ${gameId}, sending pokerLobbyCreated to ${socket.id}`);
      socket.join(gameId);
      socket.data.gameId = gameId;
      socket.emit('pokerLobbyCreated', { gameId });
      sendLobbyState(socket);
    } catch (err: any) {
      console.error(`[Poker] createPokerLobby failed:`, err);
      socket.emit('pokerError', { message: err?.message || 'Failed to create poker lobby' });
    }
  });

  // Helper to send current state to socket
  const sendLobbyState = (socket: any) => {
    const state = pokerService.getPokerGame(socket.data.gameId);
    if (!state) return;
    // Use a public-state event (no hole cards revealed yet)
    const pub = {
      id: state.id,
      gameType: state.gameType,
      status: state.status,
      players: Object.values(state.players).map((p: any) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        folded: p.folded,
        isAllIn: p.isAllIn,
        cardCount: p.cards?.length || 0,
        currentBet: p.currentBet,
      })),
      playerOrder: state.playerOrder,
      pot: state.pot,
      currentBet: state.currentBet,
      bettingRound: state.bettingRound,
      maxPlayers: state.maxPlayers ?? 10,
    };
    socket.emit('pokerLobbyState', pub);
  };

  socket.on('joinPoker', (payload: { gameId: string; inviteCode?: string }) => {
    pokerService.joinPokerGame(socket, payload.gameId);
    socket.join(payload.gameId);
    socket.data.gameId = payload.gameId;
    sendLobbyState(socket);
  });

  socket.on('leavePoker', (payload: { gameId: string }) => {
    socket.leave(payload.gameId);
    delete socket.data.gameId;
  });

  socket.on('getPokerLobbies', () => {
    const list = pokerService.listPokerLobbies();
    socket.emit('pokerLobbies', list);
  });
}
