let io;

const prisma = require('../db/prisma');

function init(socketIoInstance) {
    io = socketIoInstance;
}

/**
 * Gives the achievement to the player if they do not already have it.
 */
async function unlockAchievement(ioInstance, socketId, userId, achievementCode) {
    if (!userId || !achievementCode) return;

    try {
        // Try to create — will fail silently if already exists (unique constraint)
        await prisma.userAchievement.create({
            data: { user_id: userId, achievement_code: achievementCode }
        });

        console.log(`🎉 Achievement '${achievementCode}' unlocked for user ${userId}!`);

        const ioRef = ioInstance || io;
        if (ioRef) {
            for (const [sid, socket] of ioRef.of('/').sockets) {
                if (socket.request.session.user && socket.request.session.user.id === userId) {
                    ioRef.to(sid).emit('achievementUnlocked', { code: achievementCode });
                    break;
                }
            }
        }
    } catch (err) {
        // P2002 = unique constraint violation (already unlocked) — not an error
        if (err.code !== 'P2002') {
            console.error(`[Achievements] Error unlocking achievement ${achievementCode} for user ${userId}:`, err.message);
        }
    }
}

function checkInGameAchievements(game, playerId, action) {
    const player = game.players[playerId];
    if (!player || player.isGuest) return;

    const userId = player.dbId;

    if (action === 'passTurn' && game.table.length === 12) {
        unlockAchievement(null, null, userId, 'DEFEND_6_CARDS');
    }
}

function checkPostGameAchievements(game, player, userStats, newWinStreak) {
    if (!player || player.isGuest || !userStats) return;

    const userId = player.dbId;
    const gameStats = player.gameStats || { cardsTaken: 0 };

    if (userStats.wins + userStats.losses === 0) {
        unlockAchievement(null, null, userId, 'FIRST_GAME');
    }

    const isWinner = game.winner.winners.some(w => w.id === player.id);
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

module.exports = {
    init,
    unlockAchievement,
    checkPostGameAchievements,
    checkInGameAchievements
};