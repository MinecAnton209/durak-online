import { getDb } from '../db/drizzle.js';
import type { DrizzleDB } from '../db/drizzle.js';
import { userAchievement } from '../db/schema.ts';
import type { Server as SocketIOServer } from 'socket.io';
import type { GameState, Player } from '../types/index.js';

let io: SocketIOServer | null = null;

function init(socketIoInstance: SocketIOServer): void {
  io = socketIoInstance;
}

async function unlockAchievement(_ioInstance: SocketIOServer | null, socketId: string | null, userId: number | null | undefined, achievementCode: string, executor: DrizzleDB = getDb()): Promise<void> {
  if (!userId || !achievementCode) return;

  try {
    await executor.insert(userAchievement).values({
      user_id: userId,
      achievement_code: achievementCode,
    });

    console.log(`🎉 Achievement '${achievementCode}' unlocked for user ${userId}!`);

    const ioRef = _ioInstance || io;
    if (ioRef) {
      for (const [sid, socket] of (ioRef as any).of('/').sockets) {
        if ((socket as any).request?.session?.user && (socket as any).request.session.user.id === userId) {
          ioRef.to(sid).emit('achievementUnlocked', { code: achievementCode });
          break;
        }
      }
    }
  } catch (err: any) {
    if (err.code !== '23505') {
      console.error(`[Achievements] Error unlocking achievement ${achievementCode} for user ${userId}:`, err.message);
    }
  }
}

function checkInGameAchievements(game: GameState, playerId: string, action: string): void {
  const player = game.players[playerId];
  if (!player || player.isGuest) return;

  const userId = player.dbId;

  if (action === 'passTurn' && game.table.length === 12) {
    unlockAchievement(null, null, userId, 'DEFEND_6_CARDS');
  }
}

function checkPostGameAchievements(game: GameState, player: Player, userStats: any, newWinStreak: number): void {
  if (!player || player.isGuest || !userStats) return;

  const userId = player.dbId;
  const gameStats = player.gameStats || { cardsTaken: 0 };

  if (userStats.wins + userStats.losses === 0) {
    unlockAchievement(null, null, userId, 'FIRST_GAME');
  }

  const isWinner = game.winner!.winners.some((w) => w?.id === player.id);
  if (isWinner) {
    if (userStats.wins === 0) unlockAchievement(null, null, userId, 'FIRST_WIN');

    const newWinsCount = userStats.wins + 1;
    if (newWinsCount === 10) unlockAchievement(null, null, userId, 'WINS_10');
    if (newWinsCount === 25) unlockAchievement(null, null, userId, 'WINS_25');
    if (newWinsCount === 100) unlockAchievement(null, null, userId, 'WINS_100');
    if (newWinsCount === 250) unlockAchievement(null, null, userId, 'WINS_250');
    if (newWinsCount === 500) unlockAchievement(null, null, userId, 'WINS_500');
    if (newWinsCount === 1000) unlockAchievement(null, null, userId, 'WINS_1000');

    if (newWinStreak === 3) unlockAchievement(null, null, userId, 'WIN_STREAK_3');
    if (newWinStreak === 5) unlockAchievement(null, null, userId, 'WIN_STREAK_5');
    if (newWinStreak === 10) unlockAchievement(null, null, userId, 'WIN_STREAK_10');
    if (newWinStreak === 20) unlockAchievement(null, null, userId, 'WIN_STREAK_20');

    if (gameStats.cardsTaken === 0) unlockAchievement(null, null, userId, 'FLAWLESS_VICTORY');
  }
}

export { init, unlockAchievement, checkPostGameAchievements, checkInGameAchievements };

export default { init, unlockAchievement, checkPostGameAchievements, checkInGameAchievements };
