import { eq } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { user } from '../db/schema.ts';

const DAILY_BONUS_AMOUNT = 200;

async function checkAndAwardDailyBonus(userId, io, userSocketId) {
  try {
    const found = await db.query.user.findFirst({
      where: { id: userId }
    });
    if (!found) return;

    const lastBonus = found.last_daily_bonus_claim;
    const coins = found.coins;

    const todayStr = new Date().toISOString().slice(0, 10);

    let lastClaimDateStr = null;
    if (lastBonus) {
      lastClaimDateStr = new Date(lastBonus).toISOString().slice(0, 10);
    }

    if (lastClaimDateStr === todayStr) {
      console.log(`[Economy] Daily bonus for user ${userId} has already been claimed today.`);
      return;
    }

    const currentBalance = parseInt(coins || 0, 10);
    const newBalance = currentBalance + DAILY_BONUS_AMOUNT;

    await db
      .update(user)
      .set({ coins: newBalance, last_daily_bonus_claim: new Date() })
      .where(eq(user.id, userId));

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

export { checkAndAwardDailyBonus };

export default { checkAndAwardDailyBonus };
