const db = require('../db');
const util = require('util');

const dbGet = util.promisify(db.get.bind(db));
const dbRun = util.promisify(db.run.bind(db));

const DAILY_BONUS_AMOUNT = 200;

async function checkAndAwardDailyBonus(userId, io, userSocketId) {
    try {
        const user = await dbGet('SELECT last_daily_bonus_claim, coins FROM users WHERE id = ?', [userId]);
        if (!user) return;

        const today = new Date().toISOString().slice(0, 10);

        if (user.last_daily_bonus_claim === today) {
            return;
        }

        const newBalance = (user.coins || 0) + DAILY_BONUS_AMOUNT;
        await dbRun('UPDATE users SET coins = ?, last_daily_bonus_claim = ? WHERE id = ?', [newBalance, today, userId]);

        console.log(`[Economy] Daily bonus awarded to user ${userId}. New balance: ${newBalance}`);

        if (io && userSocketId) {
            io.to(userSocketId).emit('dailyBonusAwarded', {
                amount: DAILY_BONUS_AMOUNT,
                newBalance: newBalance
            });
        }
    } catch (error) {
        console.error(`[Economy] Error checking daily bonus for user ${userId}:`, error);
    }
}

module.exports = {
    checkAndAwardDailyBonus
};