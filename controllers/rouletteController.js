const crypto = require('crypto');
const db = require('../db');
const util = require('util');

const dbRun = util.promisify(db.run.bind(db));
const dbGet = util.promisify(db.get.bind(db));

const BETTING_TIME = 20;
const RESULTS_TIME = 10;
const ROULETTE_INTERVAL = (BETTING_TIME + RESULTS_TIME) * 1000;
const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

let rouletteState = {
    phase: 'waiting',
    timer: 0,
    history: [],
    winningNumber: null,
    bets: {}
};

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

function rouletteTick(io, onlineUsers) {
    if (rouletteState.phase === 'spinning') {
        rouletteState.phase = 'results';
        rouletteState.timer = RESULTS_TIME;

        const winningNumber = rouletteState.winningNumber;
        console.log(`[Roulette] Winning number is ${winningNumber}`);

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
                console.log(`[Roulette] User ${userId} won ${totalPayout} coins.`);
                const userIdNum = parseInt(userId, 10);

                const promise = dbRun('UPDATE users SET coins = coins + ? WHERE id = ?', [totalPayout, userIdNum])
                    .then(() => {
                        const userSocketId = onlineUsers.get(userIdNum);
                        if (userSocketId) {
                            return dbGet('SELECT coins FROM users WHERE id = ?', [userIdNum]).then(user => {
                                if(user) {
                                    io.to(userSocketId).emit('updateBalance', { coins: user.coins });
                                    io.to(userSocketId).emit('roulette:win', { amount: totalPayout });

                                    const userSocket = io.sockets.sockets.get(userSocketId);
                                    if (userSocket?.request?.session?.user) {
                                        userSocket.request.session.user.coins = user.coins;
                                        userSocket.request.session.save();
                                    }
                                }
                            });
                        }
                    });
                payoutPromises.push(promise);
            }
        }

        Promise.all(payoutPromises)
            .then(() => console.log('[Roulette] All payouts processed.'))
            .catch(err => console.error('[Roulette] Error processing payouts:', err));

        io.emit('roulette:updateState', rouletteState);
        return;
    }

    rouletteState.phase = 'betting';
    rouletteState.timer = BETTING_TIME;
    rouletteState.winningNumber = null;
    rouletteState.bets = {};
    console.log('[Roulette] New round started. Accepting bets.');
    io.emit('roulette:updateState', rouletteState);

    setTimeout(() => {
        rouletteState.phase = 'spinning';
        rouletteState.winningNumber = crypto.randomInt(0, 37);

        rouletteState.history.unshift(rouletteState.winningNumber);
        if (rouletteState.history.length > 15) rouletteState.history.pop();

        io.emit('roulette:updateState', rouletteState);
    }, BETTING_TIME * 1000);
}

function startRoulette(io, onlineUsers) {
    rouletteTick(io, onlineUsers);
    setInterval(() => rouletteTick(io, onlineUsers), ROULETTE_INTERVAL);

    setInterval(() => {
        if (rouletteState.timer > 0) {
            rouletteState.timer--;
            io.emit('roulette:timer', { timer: rouletteState.timer, phase: rouletteState.phase });
        }
    }, 1000);
}

module.exports = {
    startRoulette,
    rouletteState,
    dbGet,
    dbRun
};