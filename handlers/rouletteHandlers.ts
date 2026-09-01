import rouletteService from '../services/rouletteService.js';
import db from '../db/drizzle.js';
import { user } from '../db/schema.ts';
import { eq, sql } from 'drizzle-orm';

export default function registerRouletteHandlers(io: any, socket: any) {

    socket.on('roulette:getState', async () => {
        const state = rouletteService.getRouletteState();
        socket.emit('roulette:updateState', state);

        if (socket.request.session.user) {
            try {
                const dbUser = await db.query.user.findFirst({ where: { id: socket.request.session.user.id }, select: { coins: true } });
                if (dbUser) {
                    socket.emit('updateBalance', { coins: dbUser.coins });
                }
            } catch (err: any) {
                console.error('[Roulette Handler] Error fetching balance:', err.message);
            }
        }
    });

    socket.on('roulette:placeBet', async (bet: any) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser) return;

        const state = rouletteService.getRouletteState();
        if (state.phase !== 'betting') {
            return socket.emit('roulette:betError', { messageKey: 'roulette_error_bets_closed' });
        }

        if (!bet || !bet.type || !bet.value || !bet.amount || parseInt(bet.amount, 10) <= 0) {
            return socket.emit('roulette:betError', { messageKey: 'roulette_error_invalid_bet' });
        }

        const amount = parseInt(bet.amount, 10);
        const userId = parseInt(sessionUser.id, 10);

        try {
            const dbUser = await db.query.user.findFirst({ where: { id: userId }, select: { coins: true } });
            if (!dbUser || dbUser.coins < amount) {
                return socket.emit('roulette:betError', { messageKey: 'error_not_enough_coins' });
            }

            // Deduct coins from DB
            await db.update(user).set({ coins: sql`${user.coins} - ${amount}` }).where(eq(user.id, userId));

            // Update session if it's there
            if (socket.request.session.user) {
                socket.request.session.user.coins -= amount;
                socket.request.session.save();
            }

            // Record bet in service
            const success = rouletteService.placeBet(userId, bet);
            if (success) {
                socket.emit('roulette:betSuccess', { amount, state });
                socket.emit('updateBalance', { coins: dbUser.coins - amount });
            } else {
                // Refund if failed to place bet in time
                await db.update(user).set({ coins: sql`${user.coins} + ${amount}` }).where(eq(user.id, userId));
                socket.emit('roulette:betError', { messageKey: 'roulette_error_bets_closed' });
            }

        } catch (e) {
            console.error('[Roulette Handler] Bet Error:', e);
            socket.emit('roulette:betError', { messageKey: 'error_database' });
        }
    });

};
