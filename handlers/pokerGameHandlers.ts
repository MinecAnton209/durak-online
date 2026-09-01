import * as pokerService from '../services/pokerService.js';

export default function registerPokerGameHandlers(_io: any, socket: any) {
  socket.on('startPoker', (payload: { gameId: string }) => {
    pokerService.startPoker(payload.gameId);
  });

  socket.on('bet', (payload: { gameId: string; amount: number }) => {
    pokerService.playerBet(socket, payload.gameId, payload.amount);
  });

  socket.on('call', (payload: { gameId: string }) => {
    pokerService.playerCall(socket, payload.gameId);
  });

  socket.on('check', (payload: { gameId: string }) => {
    pokerService.playerCheck(socket, payload.gameId);
  });

  socket.on('raise', (payload: { gameId: string; amount: number }) => {
    pokerService.playerRaise(socket, payload.gameId, payload.amount);
  });

  socket.on('fold', (payload: { gameId: string }) => {
    pokerService.playerFold(socket, payload.gameId);
  });

  socket.on('allIn', (payload: { gameId: string }) => {
    pokerService.playerAllIn(socket, payload.gameId);
  });
}
