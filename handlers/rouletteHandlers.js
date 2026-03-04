const rouletteService = require('../services/rouletteService');
const prisma = require('../db/prisma');

module.exports = function registerRouletteHandlers(io, socket) {

    socket.on('roulette:getState', async () => {
        const state = rouletteService.getRouletteState();
        socket.emit('roulette:updateState', state);

        if (socket.request.session.user) {
            try {
                const user = await prisma.user.findUnique({
                    where: { id: socket.request.session.user.id },
                    select: { coins: true }
                });
                if (user) {
                    socket.emit('updateBalance', { coins: user.coins });
                }
            } catch (err) {
                console.error('[Roulette Handler] Error fetching balance:', err.message);
            }
        }
    });

    socket.on('roulette:placeBet', async (bet) => {
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
            const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
            if (!dbUser || dbUser.coins < amount) {
                return socket.emit('roulette:betError', { messageKey: 'error_not_enough_coins' });
            }

            // Deduct coins from DB
            await prisma.user.update({
                where: { id: userId },
                data: { coins: { decrement: amount } }
            });

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
                await prisma.user.update({
                    where: { id: userId },
                    data: { coins: { increment: amount } }
                });
                socket.emit('roulette:betError', { messageKey: 'roulette_error_bets_closed' });
            }

        } catch (e) {
            console.error('[Roulette Handler] Bet Error:', e);
            socket.emit('roulette:betError', { messageKey: 'error_database' });
        }
    });

};
