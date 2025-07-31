const db = require('../db');
const util = require('util');

const dbGet = util.promisify(db.get.bind(db));
const dbRun = util.promisify(db.run.bind(db));

const DAILY_BONUS_AMOUNT = 200;

async function checkAndAwardDailyBonus(userId, io, userSocketId) {
    try {
        const user = await dbGet('SELECT last_daily_bonus_claim, coins FROM users WHERE id = ?', [userId]);
        if (!user) return;

        const todayStr = new Date().toISOString().slice(0, 10);

        let lastClaimDateStr = null;
        if (user.last_daily_bonus_claim) {
            lastClaimDateStr = new Date(user.last_daily_bonus_claim).toISOString().slice(0, 10);
        }

        if (lastClaimDateStr === todayStr) {
            console.log(`[Economy] Daily bonus for user ${userId} has already been claimed today.`);
            return;
        }

        const currentBalance = parseInt(user.coins || 0, 10);
        const newBalance = currentBalance + DAILY_BONUS_AMOUNT;

        await dbRun('UPDATE users SET coins = ?, last_daily_bonus_claim = ? WHERE id = ?', [newBalance, todayStr, userId]);

        console.log(`[Economy] Daily bonus awarded to user ${userId}. New balance: ${newBalance}`);

        if (io && userSocketId) {
            io.to(userSocketId).emit('dailyBonusAwarded', {
                amount: DAILY_BONUS_AMOUNT,
                newBalance: newBalance
            });

            const userSocket = io.sockets.sockets.get(userSocketId);
            if (userSocket && userSocket.request.session.user) {
                userSocket.request.session.user.coins = newBalance;
                userSocket.request.session.save();
            }
        }

    } catch (error) {
        console.error(`[Economy] Error checking daily bonus for user ${userId}:`, error);
    }
}

module.exports = {
    checkAndAwardDailyBonus
};