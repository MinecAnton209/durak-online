let io;

const db = require('../db');

function init(socketIoInstance) {
    io = socketIoInstance;
}

/**
 * Gives the achievement to the player if they do not already have it.
 * @param {number} userId - User ID.
 * @param {string} achievementCode - The achievement code (for example, ‘FIRST_WIN’).
 */
function unlockAchievement(io, socketId, userId, achievementCode) {
    if (!userId || !achievementCode) {
        return;
    }

    const checkSql = `SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_code = ?`;
    db.get(checkSql, [userId, achievementCode], (err, row) => {
        if (err) {
            return console.error(`Помилка перевірки ачівки ${achievementCode} для юзера ${userId}:`, err.message);
        }

        if (row) {
            return;
        }

        const insertSql = `INSERT INTO user_achievements (user_id, achievement_code) VALUES (?, ?)`;
        db.run(insertSql, [userId, achievementCode], (insertErr) => {
            if (insertErr) {
                return console.error(`Помилка видачі ачівки ${achievementCode} для юзера ${userId}:`, insertErr.message);
            }
            console.log(`🎉 Ачівку '${achievementCode}' розблоковано для гравця ${userId}!`);
            
            for (const [socketId, socket] of io.of("/").sockets) {
                if (socket.request.session.user && socket.request.session.user.id === userId) {
                    io.to(socketId).emit('achievementUnlocked', { code: achievementCode });
                    break;
                }
            }
        });
    });
}


/**
 * Checks all achievements associated with completing the game.
 * @param {object} game - The object of the game.
 * @param {object} player - The object of the player whose stats are being checked.
 * @param {object} userStats - Player statistics from the database (wins, losses).
 */
function checkInGameAchievements(game, playerId, action) {
    const player = game.players[playerId];
    if (!player || player.isGuest) return;

    const userId = player.dbId;

    if (action === 'passTurn' && game.table.length === 12) {
        unlockAchievement(userId, 'DEFEND_6_CARDS');
    }
}

function checkPostGameAchievements(game, player, userStats, newWinStreak) {
    if (!player || player.isGuest || !userStats) {
        return;
    }

    const userId = player.dbId;

    const gameStats = player.gameStats || { cardsTaken: 0 };

    if (userStats.wins + userStats.losses === 0) {
        unlockAchievement(userId, 'FIRST_GAME');
    }

    const isWinner = game.winner.winners.some(w => w.id === player.id);
    if (isWinner) {
        if (userStats.wins === 0) {
            unlockAchievement(userId, 'FIRST_WIN');
        }
        const newWinsCount = userStats.wins + 1;

        if (newWinsCount === 10) unlockAchievement(userId, 'WINS_10');
        if (newWinsCount === 25) unlockAchievement(userId, 'WINS_25');
        if (newWinsCount === 100) unlockAchievement(userId, 'WINS_100');
        if (newWinsCount === 250) unlockAchievement(userId, 'WINS_250');
        if (newWinsCount === 500) unlockAchievement(userId, 'WINS_500');
        if (newWinsCount === 1000) unlockAchievement(userId, 'WINS_1000');

        if (newWinStreak === 3) unlockAchievement(userId, 'WIN_STREAK_3');
        if (newWinStreak === 5) unlockAchievement(userId, 'WIN_STREAK_5');
        if (newWinStreak === 10) unlockAchievement(userId, 'WIN_STREAK_10');
        if (newWinStreak === 20) unlockAchievement(userId, 'WIN_STREAK_20');

        if (gameStats.cardsTaken === 0) {
            unlockAchievement(userId, 'FLAWLESS_VICTORY');
        }
    }
}

module.exports = {
    init,
    unlockAchievement,
    checkPostGameAchievements,
    checkInGameAchievements
};