import * as pokerService from '../services/pokerService.js';

export default function registerPokerLobbyHandlers(_io: any, socket: any) {
  socket.on('createPokerLobby', async (settings: any) => {
    const gameId = await pokerService.createPokerLobby(socket, {
      gameType: settings.gameType ?? 'poker_holdem_cash',
      maxPlayers: settings.maxPlayers ?? 10,
      startingChips: settings.startingChips ?? 1000,
      smallBlind: settings.smallBlind ?? 5,
      bigBlind: settings.bigBlind ?? 10,
      blindStructure: settings.blindStructure,
      tournamentId: settings.tournamentId,
    });
    socket.join(gameId);
    socket.data.gameId = gameId;
  });

  socket.on('joinPoker', (payload: { gameId: string; inviteCode?: string }) => {
    pokerService.joinPokerGame(socket, payload.gameId);
    socket.join(payload.gameId);
    socket.data.gameId = payload.gameId;
  });

  socket.on('leavePoker', (payload: { gameId: string }) => {
    socket.leave(payload.gameId);
    delete socket.data.gameId;
  });

  socket.on('pokerLobbies', () => {
    const pokerLobbies = pokerService.listPokerLobbies();
    socket.emit('pokerLobbies', pokerLobbies);
  });
}
