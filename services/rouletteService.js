const crypto = require('crypto');
const prisma = require('../db/prisma');

let rouletteState = {
    phase: 'waiting',
    timer: 0,
    history: [],
    winningNumber: null,
    bets: {}
};

const BETTING_TIME = 20;
const RESULTS_TIME = 10;
const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

let io;
let onlineUsers;

function init(socketIo, usersMap) {
    io = socketIo;
    onlineUsers = usersMap;
    // Start the loop
    setInterval(rouletteTick, 1000);
}

function getRouletteState() {
    return rouletteState;
}

function rouletteTick() {
    if (rouletteState.timer > 0) {
        rouletteState.timer--;
        if (rouletteState.timer === 0) {
            handlePhaseTransition();
        }
        io.emit('roulette:updateState', rouletteState);
    } else {
        // Initial start if timer is somehow lost
        handlePhaseTransition();
    }
}

function handlePhaseTransition() {
    if (rouletteState.phase === 'waiting' || rouletteState.phase === 'results') {
        startBettingPhase();
    } else if (rouletteState.phase === 'betting') {
        startSpinningPhase();
    } else if (rouletteState.phase === 'spinning') {
        startResultsPhase();
    }
}

function startBettingPhase() {
    rouletteState.phase = 'betting';
    rouletteState.timer = BETTING_TIME;
    rouletteState.winningNumber = null;
    rouletteState.bets = {};
    io.emit('roulette:updateState', rouletteState);
}

function startSpinningPhase() {
    rouletteState.phase = 'spinning';
    rouletteState.timer = 1; // Short transition for visual spin
    rouletteState.winningNumber = crypto.randomInt(0, 37);

    rouletteState.history.unshift(rouletteState.winningNumber);
    if (rouletteState.history.length > 15) rouletteState.history.pop();

    io.emit('roulette:updateState', rouletteState);
}

async function startResultsPhase() {
    rouletteState.phase = 'results';
    rouletteState.timer = RESULTS_TIME;

    const winningNumber = rouletteState.winningNumber;
    const payoutPromises = [];

    for (const userId in rouletteState.bets) {
        const userBets = rouletteState.bets[userId];
        let totalPayout = 0;

        userBets.forEach(bet => {
            if (checkWin(winningNumber, bet)) {
                let payout = 0;
                if (bet.type === 'number') {
                    payout = bet.amount * 36;
                } else {
                    payout = bet.amount * 2;
                }
                totalPayout += payout;
            }
        });

        if (totalPayout > 0) {
            const userIdNum = parseInt(userId, 10);
            const promise = processPayout(userIdNum, totalPayout);
            payoutPromises.push(promise);
        }
    }

    try {
        await Promise.all(payoutPromises);
    } catch (err) {
        console.error('[Roulette] Error processing payouts:', err);
    }

    io.emit('roulette:updateState', rouletteState);
}

async function processPayout(userId, amount) {
    try {
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { coins: { increment: amount } },
            select: { coins: true }
        });

        const userSocketId = onlineUsers.get(userId);
        if (userSocketId) {
            io.to(userSocketId).emit('updateBalance', { coins: updatedUser.coins });
            io.to(userSocketId).emit('roulette:win', { amount: amount });

            // Note: Session update must be handled where the socket is accessible
            // We'll emit an event that the server.js can listen to or just rely on the balance update
        }
        return updatedUser;
    } catch (e) {
        console.error(`[Roulette] Payout failed for user ${userId}:`, e);
    }
}

function checkWin(winningNumber, bet) {
    const wn = parseInt(winningNumber, 10);
    const betValue = bet.value;

    switch (bet.type) {
        case 'number':
            return wn === parseInt(betValue, 10);
        case 'color':
            if (betValue === 'red') return ROULETTE_RED_NUMBERS.includes(wn);
            if (betValue === 'black') return wn !== 0 && !ROULETTE_RED_NUMBERS.includes(wn);
            return false;
        case 'even-odd':
            if (wn === 0) return false;
            if (betValue === 'even') return wn % 2 === 0;
            if (betValue === 'odd') return wn % 2 !== 0;
            return false;
        default:
            return false;
    }
}

function placeBet(userId, bet) {
    if (rouletteState.phase !== 'betting') return false;

    if (!rouletteState.bets[userId]) {
        rouletteState.bets[userId] = [];
    }
    rouletteState.bets[userId].push(bet);
    return true;
}

module.exports = {
    init,
    getRouletteState,
    placeBet
};
