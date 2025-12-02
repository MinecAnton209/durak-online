require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cors = require('cors');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const db = require('./db');
const authRoutes = require('./routes/auth.js');
const telegramRoutes = require('./routes/telegram.js');
const publicRoutes = require('./routes/public.js');
const achievementRoutes = require('./routes/achievements.js');
const adminRoutes = require('./routes/admin.js');
const friendsRoutes = require('./routes/friends.js');
const notificationsRoutes = require('./routes/notifications.js');
const { seedAchievements } = require('./db/seed.js');
const achievementService = require('./services/achievementService.js');
const ratingService = require('./services/ratingService.js');
const statsService = require('./services/statsService.js');
const notificationService = require('./services/notificationService.js');
const economyService = require('./services/economyService.js');
const webpush = require('web-push');
const util = require('util');
const dbRun = util.promisify(db.run.bind(db));
const dbGet = util.promisify(db.get.bind(db));
const cookieParser = require('cookie-parser');
const { attachUserFromToken, socketAttachUser } = require('./middlewares/jwtAuth');
const telegramBot = require('./services/telegramBot');
const botLogic = require('./services/botLogic');
const { escapeHtml, validateLobbySettings, validateCard, validateGameId } = require('./utils/validation');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dbRun("UPDATE games SET status = 'cancelled' WHERE status = 'waiting'")
    .then(() => console.log('🧹 DB cleaned: Stale lobbies cancelled.'))
    .catch(err => console.error('DB Clean error:', err));

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://durak.minecanton209.pp.ua',
    'https://durak.crushtalm.pp.ua'
];

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log("Web Push (VAPID) ініціалізовано.");
} else {
    console.warn("VAPID ключі не знайдено в .env файлі. Push-сповіщення не працюватимуть.");
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

const globalChatHistory = [];
const chatSpamTracker = new Map();
const CHAT_HISTORY_LIMIT = 500;
const CHAT_PAGE_SIZE = 50;

let games = {};

let rouletteState = {
    phase: 'waiting',
    timer: 0,
    history: [],
    winningNumber: null,
    bets: {}
};
const BETTING_TIME = 20;
const RESULTS_TIME = 10;
const ROULETTE_INTERVAL = (BETTING_TIME + RESULTS_TIME) * 1000;
const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

let isMaintenanceScheduled = false;

let maintenanceMode = {
    enabled: false,
    message: "На сайті проводяться технічні роботи. Будь ласка, зайдіть пізніше.",
    timer: null,
    startTime: null,
    warningMessage: ""
};

app.set('maintenanceMode', maintenanceMode);

app.set('socketio', io);
app.set('activeGames', games);
app.set('onlineUsers', onlineUsers);
app.set('logEvent', logEvent);
app.set('broadcastGameState', broadcastGameState);
app.set('i18next', i18next);

i18next
    .use(Backend)
    .init({
        fallbackLng: 'en',
        ns: ['translation'],
        defaultNS: 'translation',
        backend: {
            loadPath: path.join(__dirname, 'public/locales/{{lng}}/{{ns}}.json'),
        },
    });

const PORT = process.env.PORT || 3000;

setTimeout(seedAchievements, 1000);
achievementService.init(io);

app.set('trust proxy', 1);

app.use((req, res, next) => {
    const maintenanceMode = req.app.get('maintenanceMode');

    if (maintenanceMode.enabled) {
        if (req.originalUrl.startsWith('/api/admin') ||
            req.user?.is_admin ||
            req.originalUrl.startsWith('/maintenance') ||
            req.originalUrl.startsWith('/css') ||
            req.originalUrl.startsWith('/js') ||
            req.originalUrl.startsWith('/locales')) {
            return next();
        }

        if (req.originalUrl.startsWith('/api/')) {
            return res.status(503).json({ i18nKey: 'error_maintenance_mode' });
        }

        const msg = encodeURIComponent(maintenanceMode.message);
        const eta = maintenanceMode.endTime || null;

        let redirectUrl = `/maintenance?msg=${msg}`;
        if (eta) {
            redirectUrl += `&eta=${eta}`;
        }
        return res.redirect(redirectUrl);
    }

    next();
});

app.use(cookieParser());

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...allowedOrigins],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            frameAncestors: ["'self'", "https://*.telegram.org", "https://*.t.me"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.get('/maintenance', (req, res) => {
    const maintenanceMode = req.app.get('maintenanceMode');

    if (!maintenanceMode.enabled) {
        return res.redirect('/');
    }

    res.sendFile(path.join(__dirname, 'public', 'maintenance-page.html'));
});
app.use(express.json());

app.use(attachUserFromToken);

app.use('/', authRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.set('dbGet', dbGet);
app.set('dbRun', dbRun);

app.use(express.static(path.join(__dirname, 'public')));

app.get(/.*/, (req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBot.init(process.env.TELEGRAM_BOT_TOKEN);
}

io.use(socketAttachUser);

async function checkBanStatus(userId) {
    const user = await dbGet('SELECT is_banned, ban_reason FROM users WHERE id = ?', [userId]);
    if (user && user.is_banned) {
        return user.ban_reason || 'Account banned';
    }
    return null;
}

const VERIFIED_BADGE_SVG = `<span class="verified-badge" title="Верифікований гравець"><svg viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0"></path></svg></span>`;
const RANK_VALUES = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14
};

function createDeck(deckSize = 36) {
    const SUITS = ['♦', '♥', '♠', '♣'];
    let ranks;
    switch (deckSize) {
        case 52:
            ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            break;
        case 24:
            ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
            break;
        default:
            ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            break;
    }
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function canBeat(attackCard, defendCard, trumpSuit) {
    if (!attackCard || !defendCard) return false;
    if (attackCard.suit === defendCard.suit) return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank];
    if (defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit) return true;
    return false;
}

function getNextPlayerIndex(currentIndex, totalPlayers) {
    if (totalPlayers === 0) return 0;
    return (currentIndex + 1) % totalPlayers;
}

function updateTurn(game, intendedAttackerIndex) {
    if (game.playerOrder.length < 2) return;
    let currentAttackerIndex = intendedAttackerIndex % game.playerOrder.length;
    let attempts = 0;
    while (game.players[game.playerOrder[currentAttackerIndex]] && game.players[game.playerOrder[currentAttackerIndex]].cards.length === 0 && attempts < game.playerOrder.length) {
        currentAttackerIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
        attempts++;
    }
    if (attempts >= game.playerOrder.length) {
        return;
    }
    game.attackerId = game.playerOrder[currentAttackerIndex];
    let currentDefenderIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
    attempts = 0;
    while ((game.players[game.playerOrder[currentDefenderIndex]] && game.players[game.playerOrder[currentDefenderIndex]].cards.length === 0 && game.playerOrder.length > 1) && attempts < game.playerOrder.length) {
        currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        attempts++;
        if (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex) {
            currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        }
    }
    if (attempts >= game.playerOrder.length || (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex)) {
        game.defenderId = null;
    } else {
        game.defenderId = game.playerOrder[currentDefenderIndex];
    }
    game.turn = game.attackerId;
}

function addPlayerToGame(socket, game, playerName) {
    const sessionUser = socket.request.session.user;
    game.players[socket.id] = {
        id: socket.id,
        deviceId: socket.deviceId,
        name: sessionUser ? sessionUser.username : playerName,
        dbId: sessionUser ? sessionUser.id : null,
        isGuest: !sessionUser,
        cardBackStyle: sessionUser ? sessionUser.card_back_style : 'default',
        streak: sessionUser ? sessionUser.streak : 0,
        rating: sessionUser ? Math.round(sessionUser.rating) : 1500,
        isVerified: sessionUser ? sessionUser.isVerified : false,
        is_muted: sessionUser ? sessionUser.is_muted : false,
        cards: [],
        gameStats: { cardsTaken: 0, successfulDefenses: 0, cardsBeatenInDefense: 0 },
        afkStrikes: 0
    };
    game.playerOrder.push(socket.id);
}

function logEvent(game, message, options = {}) {
    if (!game.log) game.log = [];
    const timestamp = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = { timestamp, ...options };
    if (typeof message === 'string' && !options.i18nKey) {
        logEntry.message = message;
    }
    game.log.push(logEntry);
    if (game.log.length > 50) game.log.shift();
    io.to(game.id).emit('newLogEntry', logEntry);
}

async function startGame(gameId) {
    const game = games[gameId];
    if (!game) return;
    game.status = 'in_progress';
    const betAmount = game.settings.betAmount || 0;
    if (betAmount > 0) {
        game.bank = 0;
        const playerDbIds = [];

        game.playerOrder.forEach(socketId => {
            const player = game.players[socketId];
            if (player && !player.isGuest) {
                playerDbIds.push(player.dbId);
                game.bank += betAmount;
            }
        });

        if (playerDbIds.length > 0) {
            try {
                const placeholders = playerDbIds.map(() => '?').join(',');
                const sql = `UPDATE users SET coins = coins - ? WHERE id IN (${placeholders})`;
                await dbRun(sql, [betAmount, ...playerDbIds]);
                console.log(`[Economy] Bets deducted for game ${gameId}. Bank is ${game.bank}`);
            } catch (error) {
                console.error(`[Economy] CRITICAL: Failed to deduct bets for game ${gameId}. Cancelling game.`, error.message);
                io.to(gameId).emit('error', { i18nKey: 'error_bet_deduction_failed' });
                delete games[gameId];
                return;
            }
        }
    }
    game.startTime = new Date();
    game.deck = createDeck(game.settings.deckSize);
    game.trumpCard = game.deck.length > 0 ? game.deck[game.deck.length - 1] : { suit: '♠', rank: '' };
    game.trumpSuit = game.trumpCard.suit;
    let firstAttackerIndex = 0;
    let minTrumpRank = Infinity;
    game.playerOrder.forEach((playerId, index) => {
        const player = game.players[playerId];
        player.cards = game.deck.splice(0, 6);
        player.cards.forEach(card => {
            if (card.suit === game.trumpSuit && RANK_VALUES[card.rank] < minTrumpRank) {
                minTrumpRank = RANK_VALUES[card.rank];
                firstAttackerIndex = index;
            }
        });
    });
    const gameType = `${game.playerOrder.length}_player`;
    const hostUserId = game.players[game.hostId]?.dbId || null;
    const isBotGame = Object.values(game.players).some(p => p.isGuest);

    try {
        await dbRun(
            `UPDATE games 
             SET start_time = ?, game_type = ?, is_bot_game = ?, status = 'in_progress', host_user_id = ?
             WHERE id = ?`,
            [game.startTime.toISOString(), gameType, isBotGame, hostUserId, game.id]
        );

        await dbRun('DELETE FROM game_participants WHERE game_id = ?', [game.id]);

        for (let index = 0; index < game.playerOrder.length; index++) {
            const playerId = game.playerOrder[index];
            const player = game.players[playerId];
            const isFirstAttacker = (index === firstAttackerIndex);

            if (player.dbId) {
                await dbRun(
                    `INSERT INTO game_participants (game_id, user_id, is_bot, is_first_attacker) VALUES (?, ?, ?, ?)`,
                    [game.id, player.dbId, player.isGuest, isFirstAttacker]
                );
            }
        }

    } catch (err) {
        console.error(`Помилка старту гри ${game.id} в БД:`, err.message);
    }
    logEvent(game, null, {
        i18nKey: 'log_game_start',
        options: { trump: game.trumpSuit, player: game.players[game.playerOrder[firstAttackerIndex]].name }
    });
    updateTurn(game, firstAttackerIndex);
    broadcastGameState(gameId);
}

function refillHands(game) {
    const attackerIndex = game.playerOrder.indexOf(game.attackerId);
    if (attackerIndex === -1) return;
    for (let i = 0; i < game.playerOrder.length; i++) {
        const playerIndex = (attackerIndex + i) % game.playerOrder.length;
        const player = game.players[game.playerOrder[playerIndex]];
        if (player) {
            const cardsToDraw = 6 - player.cards.length;
            if (cardsToDraw > 0 && game.deck.length > 0) {
                const drawnCards = game.deck.splice(0, cardsToDraw);
                player.cards.push(...drawnCards);
                logEvent(game, null, {
                    i18nKey: 'log_draw_cards',
                    options: { name: player.name, count: drawnCards.length }
                });
            }
        }
    }
}

function checkGameOver(game) {
    if (game.deck.length === 0) {
        const playersWithCards = game.playerOrder.map(id => game.players[id]).filter(p => p && p.cards.length > 0);
        if (playersWithCards.length <= 1) {
            const loser = playersWithCards.length === 1 ? playersWithCards[0] : null;
            const winners = game.playerOrder.map(id => game.players[id]).filter(p => p && p.cards.length === 0);
            game.winner = { winners, loser };
            return true;
        }
    }
    return false;
}

async function updateStatsAfterGame(game) {
    stopTurnTimer(game);
    if (game.isStatsUpdating) {
        console.log(`[Stats] Update for game ${game.id} already in progress. Skipping.`);
        return;
    }
    game.isStatsUpdating = true;
    console.log(`[GAME END ${game.id}] Starting stats update.`);
    if (!game.winner || !game.startTime || !game.winner.winners || !game.winner.hasOwnProperty('loser')) {
        const endTime = new Date();
        const durationSeconds = Math.round((endTime - game.startTime) / 1000);
        try {
            await dbRun(`UPDATE games SET end_time = ?, duration_seconds = ? WHERE id = ?`, [endTime.toISOString(), durationSeconds, game.id]);
        } catch (err) {
            console.error(`[GAME END ${game.id}] Error updating game end time:`, err.message);
        }
        return;
    }
    const hasBots = Object.values(game.players).some(p => p.isBot);

    try {
        await dbRun("BEGIN TRANSACTION");

        const endTime = new Date();
        const durationSeconds = Math.round((endTime - game.startTime) / 1000);
        const { winners, loser } = game.winner;
        const winnerDbIds = winners.filter(p => p && !p.isGuest).map(p => p.dbId);
        const loserDbId = (loser && !loser.isGuest) ? loser.dbId : null;

        await dbRun(`UPDATE games SET end_time = ?, duration_seconds = ?, winner_user_id = ?, loser_user_id = ? WHERE id = ?`,
            [endTime.toISOString(), durationSeconds, winnerDbIds.length > 0 ? winnerDbIds[0] : null, loserDbId, game.id]);
        await statsService.incrementDailyCounter('games_played');

        const allPlayersInGame = [...winners, loser].filter(p => p);

        for (const player of allPlayersInGame) {
            if (player && !player.isGuest && player.dbId) {
                const outcome = winners.some(w => w.id === player.id) ? 'win' : 'loss';
                await dbRun(`UPDATE game_participants SET outcome = ?, cards_at_end = ? WHERE game_id = ? AND user_id = ?`,
                    [outcome, player.cards.length, game.id, player.dbId]);

                const userData = await dbGet(`SELECT streak_count, last_played_date, wins, losses, win_streak FROM users WHERE id = ?`, [player.dbId]);
                if (!userData) throw new Error(`User not found for ID: ${player.dbId}`);

                const isWinner = outcome === 'win';
                let newWinStreak = isWinner ? (userData.win_streak || 0) + 1 : 0;
                await achievementService.checkPostGameAchievements(game, player, userData, newWinStreak);

                const today = new Date().toISOString().slice(0, 10);
                const lastPlayed = userData.last_played_date;
                let newStreak = 1;
                if (lastPlayed) {
                    const lastDate = new Date(lastPlayed);
                    const todayDate = new Date(today);
                    const diffTime = Math.abs(todayDate - lastDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 0) newStreak = userData.streak_count; else if (diffDays === 1) newStreak = userData.streak_count + 1;
                }

                const query = isWinner ? `UPDATE users SET wins = wins + 1, streak_count = ?, last_played_date = ?, win_streak = ? WHERE id = ?`
                    : `UPDATE users SET losses = losses + 1, streak_count = ?, last_played_date = ?, win_streak = 0 WHERE id = ?`;
                const params = isWinner ? [newStreak, today, newWinStreak, player.dbId] : [newStreak, today, player.dbId];
                await dbRun(query, params);
            }
        }

        const betAmount = game.settings.betAmount || 0;
        if (betAmount > 0 && game.bank > 0) {
            const winners = game.winner.winners.filter(p => p && !p.isGuest);

            if (winners.length > 0) {
                const prizePerWinner = Math.floor(game.bank / winners.length);
                console.log(`[Economy] Awarding ${prizePerWinner} coins to ${winners.length} winner(s) for game ${game.id}.`);
                for (const winner of winners) {
                    await dbRun(`UPDATE users SET coins = coins + ? WHERE id = ?`, [prizePerWinner, winner.dbId]);
                }
            } else {
                console.log(`[Economy] No registered winners in game ${game.id}. Refunding bets.`);

                const allRegisteredPlayers = Object.values(game.players).filter(p => p && !p.isGuest);

                if (allRegisteredPlayers.length > 0) {
                    const playerDbIds = allRegisteredPlayers.map(p => p.dbId);
                    const placeholders = playerDbIds.map(() => '?').join(',');
                    const sql = `UPDATE users SET coins = coins + ? WHERE id IN (${placeholders})`;

                    await dbRun(sql, [betAmount, ...playerDbIds]);
                    console.log(`[Economy] Refunded ${betAmount} coins to ${playerDbIds.length} players.`);

                    allRegisteredPlayers.forEach(player => {
                        const playerSocket = io.sockets.sockets.get(player.id);
                        if (playerSocket) {
                            playerSocket.emit('systemMessage', { i18nKey: 'info_bet_refunded' });
                            if (playerSocket.request.session.user) {
                                playerSocket.request.session.user.coins += betAmount;
                                playerSocket.request.session.save();
                            }
                        }
                    });
                }
            }
        }

        if (hasBots) {
            console.log(`[Rating] Game ${game.id} had bots. Rating update skipped.`);
        } else {
            await ratingService.updateRatingsAfterGame(game);
        }
        await dbRun("COMMIT");

    } catch (error) {
        console.error(`[GAME END ${game.id}] FATAL ERROR during stats update. Rolling back.`, error);
        try {
            await dbRun("ROLLBACK");
            console.log(`[GAME END ${game.id}] Transaction rolled back successfully.`);
        } catch (rollbackError) {
            console.error(`[GAME END ${game.id}] CRITICAL: Failed to roll back transaction!`, rollbackError);
        }
    } finally {
        if (game) {
            game.isStatsUpdating = false;
        }
    }
}

function broadcastGameState(gameId) {
    const game = games[gameId];
    if (!game) return;

    if (game.status === 'in_progress' && !game.winner) {
        startTurnTimer(game, io);
    } else {
        stopTurnTimer(game);
    }

    game.playerOrder.forEach(playerId => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            const playerForWhomStateIs = game.players[playerId];
            if (!playerForWhomStateIs) return;
            const stateForPlayer = {
                gameId: game.id,
                hostId: game.hostId,
                isSpectator: false,
                players: game.playerOrder.map(id => {
                    const p = game.players[id];
                    if (!p) return null;
                    return {
                        id: p.id,
                        name: p.name,
                        rating: p.rating,
                        isVerified: p.isVerified,
                        streak: p.streak || 0,
                        cardBackStyle: p.cardBackStyle || 'default',
                        cards: p.id === playerId ? p.cards : p.cards.map(() => ({ hidden: true })),
                        isAttacker: p.id === game.attackerId,
                        isDefender: p.id === game.defenderId,
                    };
                }).filter(p => p !== null),
                table: game.table,
                trumpCard: game.trumpCard,
                trumpSuit: game.trumpSuit,
                deckCardCount: game.deck.length,
                isYourTurn: playerId === game.turn && playerForWhomStateIs.cards.length > 0,
                turnDeadline: game.turnDeadline,
                canPass: playerId === game.attackerId && game.table.length > 0 && game.table.length % 2 === 0,
                canTake: playerId === game.defenderId && game.table.length > 0,
                winner: game.winner,
                lastAction: game.lastAction,
                musicState: game.musicState
            };
            playerSocket.emit('gameStateUpdate', stateForPlayer);
        }
    });
    game.spectators.forEach(spectatorSocketId => {
        const spectatorSocket = io.sockets.sockets.get(spectatorSocketId);
        if (spectatorSocket) {
            const stateForSpectator = {
                gameId: game.id,
                hostId: game.hostId,
                isSpectator: true,
                players: game.playerOrder.map(id => {
                    const p = game.players[id];
                    if (!p) return null;
                    return {
                        id: p.id,
                        name: p.name,
                        rating: p.rating,
                        isVerified: p.isVerified,
                        streak: p.streak || 0,
                        cardBackStyle: p.cardBackStyle || 'default',
                        cards: p.cards,
                        isAttacker: p.id === game.attackerId,
                        isDefender: p.id === game.defenderId,
                    };
                }).filter(p => p !== null),
                table: game.table,
                trumpCard: game.trumpCard,
                trumpSuit: game.trumpSuit,
                deckCardCount: game.deck.length,
                isYourTurn: false,
                canPass: false,
                canTake: false,
                winner: game.winner,
                lastAction: game.lastAction,
                musicState: game.musicState
            };
            spectatorSocket.emit('gameStateUpdate', stateForSpectator);
        }
    });
    const room = io.sockets.adapter.rooms.get(game.id);
    if (room) {
        room.forEach(socketId => {
            if (!game.players[socketId] && !game.spectators.includes(socketId)) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    const stateForSpectator = {
                        gameId: game.id,
                        hostId: game.hostId,
                        isSpectator: true,
                        players: game.playerOrder.map(id => {
                            const p = game.players[id];
                            if (!p) return null;
                            return {
                                id: p.id,
                                name: p.name,
                                rating: p.rating,
                                isVerified: p.isVerified,
                                streak: p.streak || 0,
                                cardBackStyle: p.cardBackStyle || 'default',
                                cards: p.cards,
                                isAttacker: p.id === game.attackerId,
                                isDefender: p.id === game.defenderId,
                            };
                        }).filter(p => p !== null),
                        table: game.table,
                        trumpCard: game.trumpCard,
                        trumpSuit: game.trumpSuit,
                        deckCardCount: game.deck.length,
                        isYourTurn: false,
                        canPass: false,
                        canTake: false,
                        winner: game.winner,
                        lastAction: game.lastAction,
                        musicState: game.musicState
                    };
                    socket.emit('gameStateUpdate', stateForSpectator);
                }
            }
        });
    }
    if (game.status === 'in_progress' && !game.winner) {
        const currentPlayer = game.players[game.turn];
        if (currentPlayer && currentPlayer.isBot) {
            processBotTurn(game, io);
        }
    }
}

function rouletteTick() {
    if (rouletteState.phase === 'spinning') {
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
                console.log(`[Roulette] User ${userId} won ${totalPayout} coins.`);
                const userIdNum = parseInt(userId, 10);

                const promise = dbRun('UPDATE users SET coins = coins + ? WHERE id = ?', [totalPayout, userIdNum])
                    .then(() => {
                        const userSocketId = onlineUsers.get(userIdNum);
                        if (userSocketId) {
                            return dbGet('SELECT coins FROM users WHERE id = ?', [userIdNum]).then(user => {
                                if (user) {
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
            .catch(err => console.error('[Roulette] Error processing payouts:', err));

        io.emit('roulette:updateState', rouletteState);
        return;
    }

    rouletteState.phase = 'betting';
    rouletteState.timer = BETTING_TIME;
    rouletteState.winningNumber = null;
    rouletteState.bets = {};
    io.emit('roulette:updateState', rouletteState);

    setTimeout(() => {
        rouletteState.phase = 'spinning';
        rouletteState.winningNumber = crypto.randomInt(0, 37);

        rouletteState.history.unshift(rouletteState.winningNumber);
        if (rouletteState.history.length > 15) rouletteState.history.pop();

        io.emit('roulette:updateState', rouletteState);
    }, BETTING_TIME * 1000);
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

function broadcastPublicLobbies() {
    const publicLobbies = Object.values(games)
        .filter(game => {
            return game.status === 'waiting' &&
                game.settings.lobbyType === 'public' &&
                game.playerOrder &&
                game.playerOrder.length > 0;
        })
        .map(game => ({
            gameId: game.id,
            hostName: game.players[game.hostId]?.name || 'Unknown',
            playerCount: game.playerOrder.length,
            maxPlayers: game.settings.maxPlayers,
            betAmount: game.settings.betAmount || 0,
            deckSize: game.settings.deckSize || 36,
            gameMode: game.settings.gameMode || 'podkidnoy'
        }));

    io.to('lobby_browser').emit('lobbyListUpdate', publicLobbies);
}

function stopTurnTimer(game) {
    if (game.turnTimer) {
        clearTimeout(game.turnTimer);
        game.turnTimer = null;
    }
    game.turnDeadline = null;
}

function startTurnTimer(game, io) {
    stopTurnTimer(game);

    if (!game.settings.turnDuration || game.settings.turnDuration <= 0 || game.winner) return;

    const durationMs = game.settings.turnDuration * 1000 + 2000;
    game.turnDeadline = Date.now() + durationMs;

    game.turnTimer = setTimeout(() => {
        handleTurnTimeout(game, io);
    }, durationMs);
}

function handleTurnTimeout(game, io) {
    if (!game || game.winner) return;

    const currentPlayerId = game.turn;
    const player = game.players[currentPlayerId];

    if (!player) return;

    console.log(`[Game] Timeout for ${player.name} in game ${game.id}`);

    player.afkStrikes = (player.afkStrikes || 0) + 1;

    if (player.afkStrikes >= 2) {
        console.log(`[Game] Player ${player.name} kicked due to AFK limit.`);

        delete game.players[currentPlayerId];
        game.playerOrder = game.playerOrder.filter(id => id !== currentPlayerId);

        io.to(game.id).emit('playerLeft', { playerId: currentPlayerId, name: player.name, reason: 'afk' });
        logEvent(game, `🚫 ${player.name} видалений з гри за неактивність.`);

        if (game.playerOrder.length < 2) {
            const winners = game.playerOrder.map(id => game.players[id]);
            game.winner = {
                winners: winners,
                loser: { ...player, name: player.name + " (AFK)" },
                reason: { i18nKey: 'game_over_afk', options: { name: player.name } }
            };
            game.status = 'finished';
            updateStatsAfterGame(game);
        } else {
            let nextIndex = 0;
            updateTurn(game, nextIndex);
        }
        broadcastGameState(game.id);
        return;
    }

    if (game.turn === game.defenderId) {
        logEvent(game, null, { i18nKey: 'log_timeout_take', options: { name: player.name } });

        const defender = player;
        defender.gameStats.cardsTaken += game.table.length;
        defender.cards.push(...game.table);
        game.table = [];
        refillHands(game);

        if (checkGameOver(game)) updateStatsAfterGame(game);
        else {
            const defenderIndex = game.playerOrder.indexOf(game.defenderId);
            const nextPlayerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
            updateTurn(game, nextPlayerIndex);
        }
    }
    else {
        if (game.table.length > 0) {
            logEvent(game, null, { i18nKey: 'log_timeout_pass', options: { name: player.name } });

            game.discardPile.push(...game.table);
            game.table = [];
            refillHands(game);

            if (checkGameOver(game)) updateStatsAfterGame(game);
            else {
                let defenderIndex = game.playerOrder.indexOf(game.defenderId);
                updateTurn(game, defenderIndex !== -1 ? defenderIndex : 0);
            }
        } else {
            const sortedCards = [...player.cards].sort((a, b) => {
                const isTrumpA = a.suit === game.trumpSuit;
                const isTrumpB = b.suit === game.trumpSuit;
                if (isTrumpA !== isTrumpB) return isTrumpA ? 1 : -1;
                const ranks = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
                return ranks[a.rank] - ranks[b.rank];
            });

            const cardToPlay = sortedCards[0];

            if (cardToPlay) {
                console.log(`[Game] Auto-playing card for ${player.name}: ${cardToPlay.rank}${cardToPlay.suit}`);

                player.cards = player.cards.filter(c => c !== cardToPlay);

                game.table.push(cardToPlay);
                game.lastAction = 'move';
                game.turn = game.defenderId;

                logEvent(game, null, { i18nKey: 'log_attack', options: { name: player.name, rank: cardToPlay.rank, suit: cardToPlay.suit } });
            }
        }
    }

    broadcastGameState(game.id);
}

function processBotTurn(game, io) {
    if (!game || game.status !== 'in_progress' || game.winner || game.isStatsUpdating) return;

    const activePlayerId = game.turn;
    const player = game.players[activePlayerId];

    if (!player || !player.isBot) return;

    if (player.isThinking) return;
    player.isThinking = true;

    try {
        const { action, delay } = botLogic.getBotMove(game, player);

        setTimeout(() => {
            player.isThinking = false;

            if (game.status !== 'in_progress' || game.turn !== player.id) return;


            if (action.type === 'move') {
                if (!action.card) {
                    console.error(`[Bot Error] Bot tried to move without a card!`);
                    return;
                }

                const initialCount = player.cards.length;
                player.cards = player.cards.filter(c => !(c.rank === action.card.rank && c.suit === action.card.suit));

                if (player.cards.length === initialCount) {
                    console.error(`[Bot Error] Card not found in hand: ${action.card.rank}${action.card.suit}`);
                    return;
                }

                game.table.push(action.card);
                game.lastAction = 'move';

                if (game.defenderId === player.id) {
                    logEvent(game, null, { i18nKey: 'log_defend', options: { name: player.name, rank: action.card.rank, suit: action.card.suit } });
                    game.turn = game.attackerId;
                } else {
                    const isAttacking = game.attackerId === player.id;
                    logEvent(game, null, { i18nKey: isAttacking ? 'log_attack' : 'log_toss', options: { name: player.name, rank: action.card.rank, suit: action.card.suit } });
                    game.turn = game.defenderId;
                }
            }
            else if (action.type === 'take') {
                const defender = game.players[game.defenderId];
                logEvent(game, null, { i18nKey: 'log_timeout_take', options: { name: defender.name } });

                defender.cards.push(...game.table);
                game.table = [];
                refillHands(game);

                if (checkGameOver(game)) updateStatsAfterGame(game);
                else {
                    const defenderIndex = game.playerOrder.indexOf(game.defenderId);
                    const nextPlayerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
                    updateTurn(game, nextPlayerIndex);
                }
            }
            else if (action.type === 'pass') {
                logEvent(game, null, { i18nKey: 'log_pass', options: { name: player.name } });

                if (game.attackerId === player.id) {
                    game.discardPile.push(...game.table);
                    game.table = [];
                    refillHands(game);

                    if (checkGameOver(game)) updateStatsAfterGame(game);
                    else {
                        let defenderIndex = game.playerOrder.indexOf(game.defenderId);
                        updateTurn(game, defenderIndex !== -1 ? defenderIndex : 0);
                    }
                } else {
                    game.turn = game.attackerId;
                }
            }

            player.afkStrikes = 0;

            broadcastGameState(game.id);

        }, delay);

    } catch (e) {
        console.error(`[Bot Critical Error]`, e);
        player.isThinking = false;
    }
}

io.on('connection', (socket) => {
    const session = socket.request.session;
    const sessionUser = session?.user;
    if (sessionUser && sessionUser.id) {
        onlineUsers.set(parseInt(sessionUser.id, 10), socket.id);
        const userId = parseInt(sessionUser.id, 10);
        economyService.checkAndAwardDailyBonus(userId, io, socket.id);
        console.log(`[Online Status] User connected: ${sessionUser.username} (ID: ${sessionUser.id}). Total online: ${onlineUsers.size}`);
        db.get('SELECT is_banned, ban_reason FROM users WHERE id = ?', [sessionUser.id], (err, dbUser) => {
            if (err) {
                socket.disconnect(true);
                return;
            }
            if (dbUser && dbUser.is_banned) {
                const reasonText = dbUser.ban_reason || i18next.t('ban_reason_not_specified');
                socket.emit('forceDisconnect', {
                    i18nKey: 'error_account_banned_with_reason',
                    options: { reason: reasonText }
                });
                socket.disconnect(true);
            }
        });
    } else {
        console.log(`Клієнт підключився: ${socket.id} (гість)`);
    }
    socket.on('createLobby', async (settings) => {
        const sessionUser = socket.request.session?.user;

        if (sessionUser) {
            const banReason = await checkBanStatus(sessionUser.id);
            if (banReason) {
                return socket.emit('forceDisconnect', { i18nKey: 'error_account_banned_with_reason', options: { reason: banReason } });
            }
        }

        const validation = validateLobbySettings(settings);
        if (!validation.valid) {
            return socket.emit('error', { i18nKey: 'error_invalid_settings', message: validation.error });
        }

        const lobbySettings = validation.sanitized;

        const playerName = sessionUser ? sessionUser.username : (settings.playerName || "Guest");
        const userId = sessionUser ? sessionUser.id : null;

        const betAmount = lobbySettings.betAmount;
        if (betAmount > 0) {
            if (!sessionUser) {
                return socket.emit('error', { i18nKey: 'error_guests_cannot_bet' });
            }
            if (sessionUser.coins < betAmount) {
                return socket.emit('error', { i18nKey: 'error_not_enough_coins_host' });
            }
        }

        const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();

        try {
            const inviteCode = lobbySettings.lobbyType === 'private' ? crypto.randomBytes(3).toString('hex').toUpperCase() : null;

            await dbRun(
                `INSERT INTO games (id, status, lobby_type, invite_code, max_players, host_user_id, game_settings, start_time)
                 VALUES (?, 'waiting', ?, ?, ?, ?, ?, ?)`,
                [gameId, lobbySettings.lobbyType, inviteCode, lobbySettings.maxPlayers, userId, JSON.stringify(lobbySettings), new Date().toISOString()]
            );

            games[gameId] = {
                id: gameId,
                status: 'waiting',
                hostId: socket.id,
                players: {},
                playerOrder: [],
                settings: lobbySettings,
                deck: [], table: [], discardPile: [], trumpCard: null, trumpSuit: null,
                attackerId: null, defenderId: null, turn: null, winner: null,
                rematchVotes: new Set(), log: [], lastAction: null, startTime: null,
                spectators: [], musicState: { currentTrackId: null, isPlaying: false, trackTitle: 'Silence', suggester: null, stateChangeTimestamp: null, seekTimestamp: 0 }
            };

            socket.join(gameId);
            addPlayerToGame(socket, games[gameId], playerName);

            console.log(`[Lobby] Lobby created: ${gameId} by ${playerName} (Guest: ${!sessionUser})`);
            socket.emit('lobbyCreated', { gameId, inviteCode, settings: lobbySettings });
            broadcastPublicLobbies();

        } catch (e) {
            console.error("[Lobby] Error creating lobby:", e);
            socket.emit('error', { i18nKey: 'error_database' });
        }
    });
    socket.on('joinLobby', async ({ gameId, inviteCode, playerName }) => {
        console.log(`[JoinLobby] Request received: GameId=${gameId}, Code=${inviteCode}, Name=${playerName}`);

        const sessionUser = socket.request.session?.user;

        if (sessionUser) {
            const banReason = await checkBanStatus(sessionUser.id);
            if (banReason) return socket.emit('forceDisconnect', { i18nKey: 'error_account_banned_with_reason', options: { reason: banReason } });
        }

        const actualPlayerName = sessionUser ? sessionUser.username : (playerName || "Guest");
        let lobbyToJoinId = gameId ? gameId.toUpperCase() : null;
        let gameFromDb;

        try {
            if (inviteCode) {
                const codeToCheck = inviteCode.toUpperCase();

                gameFromDb = await dbGet("SELECT id, max_players FROM games WHERE invite_code = ? AND status = 'waiting'", [codeToCheck]);

                if (!gameFromDb) {
                    gameFromDb = await dbGet("SELECT id, max_players FROM games WHERE id = ? AND status = 'waiting'", [codeToCheck]);
                }

                if (gameFromDb) lobbyToJoinId = gameFromDb.id;

            } else if (lobbyToJoinId) {
                gameFromDb = await dbGet("SELECT id, max_players FROM games WHERE id = ? AND status = 'waiting'", [lobbyToJoinId]);
            }

            console.log(`[JoinLobby] DB Search Result:`, gameFromDb);

            if (!lobbyToJoinId || !gameFromDb) {
                console.log(`[JoinLobby] Lobby not found in DB or wrong status`);
                return socket.emit('error', { i18nKey: 'error_lobby_not_found' });
            }

            const game = games[lobbyToJoinId];
            if (!game) {
                console.log(`[JoinLobby] Lobby found in DB but NOT in Memory. Cancelling DB record.`);
                await dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [lobbyToJoinId]);
                return socket.emit('error', { i18nKey: 'error_lobby_not_found_in_memory' });
            }

            if (sessionUser && Object.values(game.players).some(p => p.dbId === sessionUser.id)) {
                console.log(`[JoinLobby] User already in game`);
                return socket.emit('error', { i18nKey: 'error_already_in_game' });
            }

            if (Object.keys(game.players).length >= game.settings.maxPlayers) {
                console.log(`[JoinLobby] Lobby is full`);
                return socket.emit('error', { i18nKey: 'error_lobby_full' });
            }

            const betAmount = game.settings.betAmount || 0;
            if (betAmount > 0) {
                if (!sessionUser) return socket.emit('error', { i18nKey: 'error_guests_cannot_bet' });
                if (sessionUser.coins < betAmount) return socket.emit('error', { i18nKey: 'error_not_enough_coins_join' });
            }

            socket.join(lobbyToJoinId);
            addPlayerToGame(socket, game, actualPlayerName);

            console.log(`[Lobby] ${actualPlayerName} joined lobby ${lobbyToJoinId}`);

            socket.emit('joinSuccess', { gameId: lobbyToJoinId, playerId: socket.id });

            io.to(lobbyToJoinId).emit('lobbyStateUpdate', {
                players: Object.values(game.players).map(p => ({ id: p.id, name: p.name, rating: p.rating, isVerified: p.isVerified })),
                hostId: game.hostId,
                maxPlayers: game.settings.maxPlayers
            });

        } catch (e) {
            console.error("[Lobby] Error joining lobby:", e);
            socket.emit('error', { i18nKey: 'error_database' });
        }
    });
    socket.on('getLobbyState', ({ gameId }) => {
        const game = games[gameId];
        if (game) {
            if (game.players[socket.id] || game.spectators.includes(socket.id)) {
                socket.join(gameId);
            }

            const playersForLobby = Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                isVerified: p.isVerified,
                streak: p.streak || 0,
                rating: p.rating,
                isHost: p.id === game.hostId,
            }));

            socket.emit('lobbyStateUpdate', {
                players: playersForLobby,
                maxPlayers: game.settings.maxPlayers,
                hostId: game.hostId,
                settings: game.settings
            });
        } else {
            socket.emit('error', { i18nKey: 'error_game_not_found' });
        }
    });
    socket.on('forceStartGame', ({ gameId }) => {
        const game = games[gameId];
        if (!game || game.hostId !== socket.id) return;
        if (game.playerOrder.length >= 2) {
            game.settings.maxPlayers = game.playerOrder.length;
            startGame(gameId);
        }
    });
    socket.on('sendMessage', ({ gameId, message }) => {
        const game = games[gameId];
        const player = game ? game.players[socket.id] : null;
        if (!game || !player || !message) return;
        if (player.is_muted) {
            return socket.emit('systemMessage', { i18nKey: 'error_chat_muted', type: 'error' });
        }
        const trimmedMessage = message.trim();
        if (trimmedMessage.length > 0 && trimmedMessage.length <= 100) {
            const escapedMessage = escapeHtml(trimmedMessage);
            const escapedName = escapeHtml(player.name);
            let authorHTML = escapedName;
            if (player.isVerified) {
                authorHTML += VERIFIED_BADGE_SVG;
            }
            const chatMessage = `<span class="message-author">${authorHTML}:</span> <span class="message-text">${escapedMessage}</span>`;
            logEvent(game, chatMessage);
        }
    });
    socket.on('makeMove', ({ gameId, card }) => {
        const game = games[gameId];
        if (!game || !game.players[socket.id] || game.winner) return;

        const cardValidation = validateCard(card);
        if (!cardValidation.valid) {
            return socket.emit('invalidMove', { reason: "error_invalid_card" });
        }

        game.lastAction = 'move';
        const player = game.players[socket.id];
        player.afkStrikes = 0;
        const isDefender = socket.id === game.defenderId;
        const canToss = !isDefender && game.table.length > 0 && game.table.length % 2 === 0;

        if (game.turn !== socket.id && !canToss) {
            return socket.emit('invalidMove', { reason: "error_invalid_move_turn" });
        }

        if (!player.cards.some(c => c.rank === card.rank && c.suit === card.suit)) {
            return socket.emit('invalidMove', { reason: "error_invalid_move_no_card" });
        }

        if (isDefender) {

            const isPerevodnoy = game.settings.gameMode === 'perevodnoy';
            const isSameRank = game.table.length > 0 && game.table.every(c => c.rank === card.rank);

            if (isPerevodnoy && isSameRank) {
                const currentDefenderIndex = game.playerOrder.indexOf(game.defenderId);
                const nextPlayerIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
                const nextPlayerId = game.playerOrder[nextPlayerIndex];
                const nextPlayer = game.players[nextPlayerId];

                if (nextPlayer && nextPlayer.cards.length >= (game.table.length + 1)) {

                    player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
                    game.table.push(card);

                    logEvent(game, null, {
                        i18nKey: 'log_transfer',
                        options: { name: player.name, nextPlayer: nextPlayer.name }
                    });

                    game.attackerId = game.defenderId;
                    game.defenderId = nextPlayerId;
                    game.turn = nextPlayerId;
                    game.lastAction = 'transfer';

                    broadcastGameState(gameId);
                    return;
                } else {
                }
            }

            if (!canBeat(game.table[game.table.length - 1], card, game.trumpSuit)) {
                return socket.emit('invalidMove', { reason: "error_invalid_move_cannot_beat" });
            }

            logEvent(game, null, {
                i18nKey: 'log_defend',
                options: { name: player.name, rank: card.rank, suit: card.suit }
            });
            game.turn = game.attackerId;

        } else {
            const isAttacking = game.attackerId === socket.id;
            const logKey = isAttacking ? 'log_attack' : 'log_toss';

            if (game.table.length > 0 && !game.table.some(c => c.rank === card.rank)) {
                return socket.emit('invalidMove', { reason: "error_invalid_move_wrong_rank" });
            }

            const defender = game.players[game.defenderId];
            if (!defender) return;

            const cardsToBeat = game.table.length - (game.table.length % 2 === 0 ? game.table.length / 2 : Math.floor(game.table.length / 2));

            if ((game.table.length - Math.floor(game.table.length / 2)) >= defender.cards.length) {
                return socket.emit('invalidMove', { reason: "error_invalid_move_toss_limit" });
            }

            logEvent(game, null, { i18nKey: logKey, options: { name: player.name, rank: card.rank, suit: card.suit } });
            game.turn = game.defenderId;
        }

        player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        game.table.push(card);
        broadcastGameState(gameId);
    });
    socket.on('passTurn', ({ gameId }) => {
        const game = games[gameId];
        if (!game || game.attackerId !== socket.id || game.table.length === 0 || game.table.length % 2 !== 0 || game.winner) return;
        if (game.players[socket.id]) {
            game.players[socket.id].afkStrikes = 0;
        }
        game.lastAction = 'pass';
        const defenderIdBeforeRefill = game.defenderId;
        const defender = game.players[defenderIdBeforeRefill];
        if (defender) {
            const defenderStats = defender.gameStats;
            defenderStats.successfulDefenses += 1;
            defenderStats.cardsBeatenInDefense += game.table.length / 2;
            achievementService.checkInGameAchievements(game, defenderIdBeforeRefill, 'passTurn');
            logEvent(game, null, { i18nKey: 'log_pass', options: { name: defender.name } });
        }
        game.discardPile.push(...game.table);
        game.table = [];
        refillHands(game);
        if (checkGameOver(game)) {
            updateStatsAfterGame(game);
            return broadcastGameState(gameId);
        }
        let defenderIndex = game.playerOrder.indexOf(defenderIdBeforeRefill);
        if (defenderIndex === -1) defenderIndex = 0;
        updateTurn(game, defenderIndex);
        broadcastGameState(gameId);
    });
    socket.on('takeCards', ({ gameId }) => {
        const game = games[gameId];
        if (!game || game.defenderId !== socket.id || game.table.length === 0 || game.winner) return;
        if (game.players[socket.id]) {
            game.players[socket.id].afkStrikes = 0;
        }
        game.lastAction = 'take';
        const defender = game.players[game.defenderId];
        if (defender) {
            defender.gameStats.cardsTaken += game.table.length;
            if (defender.dbId) {
                db.run(`UPDATE game_participants
                        SET cards_taken_total = cards_taken_total + ?
                        WHERE game_id = ?
                          AND user_id = ?`, [game.table.length, gameId, defender.dbId], (err) => {
                    if (err) console.error(`Помилка оновлення cards_taken_total для гри ${gameId}:`, err.message);
                });
            }
            logEvent(game, null, { i18nKey: 'log_take', options: { name: defender.name } });
            defender.cards.push(...game.table);
        }
        game.table = [];
        refillHands(game);
        if (checkGameOver(game)) {
            updateStatsAfterGame(game);
            return broadcastGameState(gameId);
        }
        const defenderIndex = game.playerOrder.indexOf(game.defenderId);
        const nextPlayerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
        updateTurn(game, nextPlayerIndex);
        broadcastGameState(gameId);
    });
    socket.on('requestRematch', ({ gameId }) => {
        const game = games[gameId];
        if (!game || !game.players[socket.id]) return;
        game.rematchVotes.add(socket.id);
        const remainingPlayers = game.playerOrder.filter(id => game.players[id]);
        io.to(gameId).emit('rematchUpdate', { votes: game.rematchVotes.size, total: remainingPlayers.length });
        if (game.rematchVotes.size === remainingPlayers.length && remainingPlayers.length >= 2) {
            game.table = [];
            game.discardPile = [];
            game.winner = null;
            game.rematchVotes.clear();
            game.playerOrder.sort(() => Math.random() - 0.5);
            setTimeout(() => startGame(gameId), 1000);
        }
    });
    socket.on('disconnect', () => {
        let disconnectedUserId = null;

        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                onlineUsers.delete(userId);
                break;
            }
        }

        if (disconnectedUserId) {
            console.log(`[Online Status] User ID ${disconnectedUserId} disconnected. Total online: ${onlineUsers.size}`);
        } else {
            console.log(`[Disconnect] Guest client disconnected: ${socket.id}`);
        }

        for (const gameId in games) {
            const game = games[gameId];

            const spectatorIndex = game.spectators.indexOf(socket.id);
            if (spectatorIndex > -1) {
                game.spectators.splice(spectatorIndex, 1);
                console.log(`[Spectator] Spectator left game ${gameId}`);
                break;
            }

            if (game.players[socket.id]) {
                const disconnectedPlayer = game.players[socket.id];

                if (game.status === 'waiting') {
                    console.log(`[Lobby] Player ${disconnectedPlayer.name} leaving lobby ${gameId}...`);

                    delete game.players[socket.id];
                    game.playerOrder = game.playerOrder.filter(id => id !== socket.id);

                    if (game.playerOrder.length > 0) {
                        const humanIds = game.playerOrder.filter(id => game.players[id] && !game.players[id].isBot);
                        if (humanIds.length === 0) {
                            delete games[gameId];
                            dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [gameId]);
                            console.log(`[Lobby] Lobby ${gameId} has only bots and was deleted.`);
                        } else {
                            if (game.hostId === socket.id) {
                                game.hostId = humanIds[0];
                                const newHostName = game.players[game.hostId].name;
                                console.log(`[Lobby] Host left. New host for ${gameId} is ${newHostName}`);
                                logEvent(game, null, { i18nKey: 'log_new_host', options: { name: newHostName } });
                            }

                            io.to(gameId).emit('lobbyStateUpdate', {
                                players: Object.values(game.players).map(p => ({ id: p.id, name: p.name, rating: p.rating, isVerified: p.isVerified, isHost: p.id === game.hostId })),
                                hostId: game.hostId,
                                maxPlayers: game.settings.maxPlayers,
                                settings: game.settings
                            });
                            io.to(gameId).emit('playerLeft', { playerId: socket.id, name: disconnectedPlayer.name });
                            console.log(`[Lobby] ${disconnectedPlayer.name} removed. Lobby ${gameId} updated.`);
                        }
                    } else {
                        delete games[gameId];
                        dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [gameId]);
                        console.log(`[Lobby] Lobby ${gameId} is empty and was deleted.`);
                    }
                    broadcastPublicLobbies();
                }

                else if (game.status === 'in_progress' && !game.winner) {
                    console.log(`[Game] Player ${disconnectedPlayer.name} disconnected from active game ${gameId}. Starting reconnect timer...`);

                    disconnectedPlayer.disconnected = true;
                    disconnectedPlayer.disconnectTime = Date.now();

                    io.to(gameId).emit('playerDisconnected', {
                        playerId: socket.id,
                        timeout: 60
                    });
                    logEvent(game, null, { i18nKey: 'log_player_disconnected', options: { name: disconnectedPlayer.name } });

                    disconnectedPlayer.reconnectTimeout = setTimeout(() => {
                        const currentGame = games[gameId];
                        if (!currentGame || !currentGame.players[socket.id] || !currentGame.players[socket.id].disconnected) {
                            console.log(`[Reconnect] Timer for ${disconnectedPlayer.name} in ${gameId} cancelled or player already reconnected.`);
                            return;
                        }

                        if (!currentGame || currentGame.status === 'finished') {
                            return;
                        }

                        console.log(`[Game] Reconnect timeout for ${disconnectedPlayer.name}. Player removed permanently from ${gameId}.`);
                        const playerWhoLeft = { ...currentGame.players[socket.id] };

                        delete currentGame.players[socket.id];
                        currentGame.playerOrder = currentGame.playerOrder.filter(id => id !== socket.id);

                        if (currentGame.playerOrder.length < 2) {
                            console.log(`[Game] Game ${gameId} finished due to timeout.`);
                            if (currentGame.status !== 'finished') {
                                stopTurnTimer(currentGame);
                                currentGame.winner = {
                                    winners: currentGame.playerOrder.map(id => currentGame.players[id]).filter(p => p),
                                    loser: playerWhoLeft,
                                    reason: {
                                        i18nKey: 'game_over_player_left_timeout',
                                        options: { player: playerWhoLeft.name }
                                    }
                                };
                                currentGame.status = 'finished';
                            }
                            updateStatsAfterGame(currentGame);
                        } else {
                            logEvent(currentGame, null, { i18nKey: 'log_player_left_continue', options: { name: playerWhoLeft.name } });
                            if (currentGame.turn === socket.id) {
                                const nextIndex = 0;
                                updateTurn(currentGame, nextIndex);
                            }
                        }
                        broadcastGameState(gameId);

                    }, 60000);
                }

                break;
            }
        }
    });
    socket.on('adminSpectateGame', ({ gameId }) => {
        const sessionUser = socket.request.session.user;
        if (!sessionUser || !sessionUser.is_admin) {
            return socket.emit('error', { i18nKey: 'error_forbidden_admin_only' });
        }
        const game = games[gameId];
        if (!game) {
            return socket.emit('error', { i18nKey: 'error_game_not_found', text: gameId });
        }
        if (game.players[socket.id]) {
            return socket.emit('error', { i18nKey: 'error_already_in_game_as_player' });
        }
        if (game.spectators.includes(socket.id)) {
            broadcastGameState(gameId);
            return;
        }
        game.spectators.push(socket.id);
        socket.join(gameId);
        console.log(`Адмін ${sessionUser.username} почав спостерігати за грою ${gameId}`);
        logEvent(game, null, { i18nKey: 'log_admin_spectating', options: { adminName: sessionUser.username } });
        broadcastGameState(gameId);
        socket.emit('spectateSuccess', { gameId });
    });
    socket.on('hostChangeTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        console.log(`[Music] Хост гри ${gameId} змінив трек на: ${trackTitle} (ID: ${trackId})`);
        game.musicState.currentTrackId = trackId;
        game.musicState.trackTitle = trackTitle;
        game.musicState.isPlaying = true;
        game.musicState.stateChangeTimestamp = Date.now();
        game.musicState.seekTimestamp = 0;
        game.musicState.suggester = game.players[socket.id]?.name;
        io.to(gameId).emit('musicStateUpdate', game.musicState);
    });
    socket.on('hostTogglePlayback', ({ gameId, isPlaying, currentTime }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        console.log(`[Music] Хост гри ${gameId} змінив стан відтворення на: ${isPlaying}`);
        game.musicState.isPlaying = isPlaying;
        game.musicState.stateChangeTimestamp = Date.now();
        game.musicState.seekTimestamp = currentTime || 0;
        io.to(gameId).emit('musicStateUpdate', game.musicState);
    });
    socket.on('suggestTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        const suggester = game ? game.players[socket.id] : null;
        if (!game || !game.hostId || !suggester) return;
        if (socket.id === game.hostId) return;
        const hostSocket = io.sockets.sockets.get(game.hostId);
        if (hostSocket) {
            hostSocket.emit('trackSuggested', { trackId, trackTitle, suggesterName: suggester.name });
        }
    });
    let maintenanceCountdownInterval = null;

    socket.on('maintenanceWarning', ({ message, startTime }) => {
        isMaintenanceScheduled = true;

        const maintenanceBanner = document.getElementById('maintenance-banner');
        const maintenanceBannerMessage = document.getElementById('maintenance-banner-message');
        const maintenanceBannerCountdown = document.getElementById('maintenance-banner-countdown');

        if (!maintenanceBanner || !maintenanceBannerMessage || !maintenanceBannerCountdown) return;

        maintenanceBannerMessage.textContent = message;
        maintenanceBanner.style.display = 'block';

        if (maintenanceCountdownInterval) clearInterval(maintenanceCountdownInterval);

        const updateCountdown = () => {
            const timeLeft = startTime - Date.now();
            if (timeLeft <= 0) {
                maintenanceBannerCountdown.textContent = "Роботи почалися!";
                clearInterval(maintenanceCountdownInterval);
                setTimeout(() => window.location.reload(), 2000);
                return;
            }
            const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
            const seconds = Math.floor((timeLeft / 1000) % 60);
            maintenanceBannerCountdown.textContent = `До початку: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };

        maintenanceCountdownInterval = setInterval(updateCountdown, 1000);
        updateCountdown();

        if (createGameBtn) createGameBtn.disabled = true;
        if (joinGameBtn) joinGameBtn.disabled = true;
    });

    socket.on('maintenanceCancelled', () => {
        isMaintenanceScheduled = false;

        const maintenanceBanner = document.getElementById('maintenance-banner');
        if (maintenanceBanner) maintenanceBanner.style.display = 'none';
        if (maintenanceCountdownInterval) clearInterval(maintenanceCountdownInterval);

        if (createGameBtn) createGameBtn.disabled = false;
        if (joinGameBtn) joinGameBtn.disabled = false;
    });
    socket.on('friend:invite', async ({ toUserId, gameId }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.id) {
            console.warn(`[Invites] Invite attempt from unauthenticated user. Socket: ${socket.id}`);
            return;
        }
        if (!toUserId || !gameId) {
            console.warn(`[Invites] Invalid invite from ${sessionUser.username}. Missing toUserId or gameId. Data:`, { toUserId, gameId });
            return;
        }

        const game = games[gameId];
        if (!game) {
            console.warn(`[Invites] Invite sent to a non-existent game: ${gameId}.`);
            socket.emit('systemMessage', { i18nKey: 'error_invite_game_not_found', type: 'error' });
            return;
        }

        const targetUserId = parseInt(toUserId, 10);
        const friendSocketId = onlineUsers.get(targetUserId);

        if (friendSocketId) {
            const friendSocket = io.sockets.sockets.get(friendSocketId);
            if (friendSocket) {
                console.log(`[Invites] User ${sessionUser.username} invites user ID ${targetUserId} to game ${gameId}`);
                friendSocket.emit('friend:receiveInvite', {
                    fromUser: {
                        id: sessionUser.id,
                        username: sessionUser.username
                    },
                    gameId: gameId
                });
            }
        } else {
            console.warn(`[Invites] Could not find online user with ID: ${targetUserId}`);
        }
        try {
            const payload = {
                title: i18next.t('push_invite_title', { ns: 'translation' }),
                body: i18next.t('push_invite_body', { username: sessionUser.username, ns: 'translation' }),
                url: `/game/${gameId}`
            };

            await notificationService.sendNotification(targetUserId, payload);
        } catch (error) {
            console.error(`[Invites] Failed to send push notification for user ${targetUserId}:`, error);
        }
    });
    socket.on('roulette:getState', () => {
        socket.emit('roulette:updateState', rouletteState);
        if (socket.request.session.user) {
            db.get('SELECT coins FROM users WHERE id = ?', [socket.request.session.user.id], (err, user) => {
                if (user) socket.emit('updateBalance', { coins: user.coins });
            });
        }
    });

    socket.on('roulette:placeBet', async (bet) => {
        const sessionUser = socket.request.session?.user;

        if (!sessionUser) return;
        if (rouletteState.phase !== 'betting') {
            return socket.emit('roulette:betError', { messageKey: 'roulette_error_bets_closed' });
        }
        if (!bet || !bet.type || !bet.value || !bet.amount || parseInt(bet.amount, 10) <= 0) {
            return socket.emit('roulette:betError', { messageKey: 'roulette_error_invalid_bet' });
        }

        const amount = parseInt(bet.amount, 10);
        const userId = sessionUser.id;

        try {
            const dbUser = await dbGet('SELECT coins FROM users WHERE id = ?', [userId]);
            if (!dbUser || dbUser.coins < amount) {
                return socket.emit('roulette:betError', { messageKey: 'error_not_enough_coins' });
            }

            await dbRun('UPDATE users SET coins = coins - ? WHERE id = ?', [amount, userId]);

            socket.request.session.user.coins -= amount;
            socket.request.session.save();

            if (!rouletteState.bets[userId]) {
                rouletteState.bets[userId] = [];
            }
            rouletteState.bets[userId].push({
                type: bet.type,
                value: bet.value,
                amount: amount
            });

            console.log(`[Roulette] User ${userId} placed a bet: ${bet.type} on ${bet.value} for ${amount} coins.`);

            socket.emit('updateBalance', { coins: socket.request.session.user.coins });
            socket.emit('roulette:betAccepted', bet);

        } catch (error) {
            console.error(`[Roulette] Bet error for user ${userId}:`, error);
            socket.emit('roulette:betError', { messageKey: 'error_database' });
        }
    });
    socket.on('startGame', async ({ gameId }) => {
        const sessionUser = socket.request.session?.user;
        const game = games[gameId];

        if (!game || !sessionUser || game.players[socket.id]?.dbId !== sessionUser.id || game.hostId !== socket.id) {
            return socket.emit('error', { i18nKey: 'error_not_host' });
        }

        if (Object.keys(game.players).length < 2) {
            return socket.emit('error', { i18nKey: 'error_not_enough_players' });
        }

        try {
            await dbRun("UPDATE games SET status = 'in_progress' WHERE id = ?", [gameId]);

            startGame(gameId);

            broadcastPublicLobbies();
        } catch (e) {
            console.error(`[Game] Error starting game ${gameId}:`, e);
        }
    });
    socket.on('leaveLobby', ({ gameId }) => {
        const game = games[gameId];
        if (!game || !game.players[socket.id] || game.status !== 'waiting') return;

        const player = game.players[socket.id];
        console.log(`[Lobby] Player ${player.name} left lobby ${gameId}`);

        socket.leave(gameId);

        delete game.players[socket.id];
        game.playerOrder = game.playerOrder.filter(id => id !== socket.id);

        if (game.playerOrder.length > 0) {
            const humanIds = game.playerOrder.filter(id => game.players[id] && !game.players[id].isBot);
            if (humanIds.length === 0) {
                console.log(`[Lobby] Lobby ${gameId} has only bots. Deleting.`);
                delete games[gameId];
                dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [gameId]);
            } else {
                if (game.hostId === socket.id) {
                    game.hostId = humanIds[0];
                    console.log(`[Lobby] New host for ${gameId}: ${game.players[game.hostId].name}`);
                    logEvent(game, null, { i18nKey: 'log_new_host', options: { name: game.players[game.hostId].name } });
                }

                io.to(gameId).emit('lobbyStateUpdate', {
                    players: Object.values(game.players).map(p => ({ id: p.id, name: p.name, rating: p.rating, isVerified: p.isVerified })),
                    hostId: game.hostId,
                    maxPlayers: game.settings.maxPlayers
                });
                broadcastPublicLobbies();
            }

        } else {
            console.log(`[Lobby] Lobby ${gameId} is empty. Deleting.`);
            delete games[gameId];
            dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [gameId]);
            broadcastPublicLobbies();
        }
    });
    socket.on('updateLobbySettings', async ({ gameId, settings }) => {
        const game = games[gameId];
        if (!game || game.status !== 'waiting' || game.hostId !== socket.id) return;

        if (settings.maxPlayers) {
            if (game.playerOrder.length <= settings.maxPlayers) {
                game.settings.maxPlayers = parseInt(settings.maxPlayers);
            }
        }
        if (settings.deckSize) game.settings.deckSize = parseInt(settings.deckSize);

        if (settings.turnDuration !== undefined) {
            game.settings.turnDuration = parseInt(settings.turnDuration);
        }

        try {
            await dbRun("UPDATE games SET game_settings = ?, max_players = ? WHERE id = ?",
                [JSON.stringify(game.settings), game.settings.maxPlayers, gameId]
            );

            io.to(gameId).emit('lobbyStateUpdate', {
                players: Object.values(game.players).map(p => ({
                    id: p.id, name: p.name, rating: p.rating, isVerified: p.isVerified, isHost: p.id === game.hostId
                })),
                hostId: game.hostId,
                maxPlayers: game.settings.maxPlayers,
                settings: game.settings
            });

            broadcastPublicLobbies();

        } catch (e) {
            console.error("Error updating settings:", e);
        }
    });

    socket.on('kickPlayer', ({ gameId, playerIdToKick }) => {
        const game = games[gameId];
        if (!game || game.status !== 'waiting' || game.hostId !== socket.id) return;
        if (playerIdToKick === socket.id) return;

        const kickedSocket = io.sockets.sockets.get(playerIdToKick);

        console.log(`[Lobby] Host kicked player ${playerIdToKick} from ${gameId}`);

        if (game.players[playerIdToKick]) {
            delete game.players[playerIdToKick];
            game.playerOrder = game.playerOrder.filter(id => id !== playerIdToKick);

            io.to(gameId).emit('playerLeft', { playerId: playerIdToKick });
            io.to(gameId).emit('lobbyStateUpdate', {
                players: Object.values(game.players).map(p => ({
                    id: p.id, name: p.name, rating: p.rating, isVerified: p.isVerified
                })),
                hostId: game.hostId,
                maxPlayers: game.settings.maxPlayers
            });
        }

        if (kickedSocket) {
            kickedSocket.emit('kicked', { reason: 'Host kicked you.' });
            kickedSocket.leave(gameId);
        }
    });
    socket.on('joinLobbyBrowser', () => {
        socket.join('lobby_browser');
        const list = Object.values(games)
            .filter(game => game.status === 'waiting' && game.settings.lobbyType === 'public' && game.playerOrder.length > 0)
            .map(game => ({
                gameId: game.id,
                hostName: game.players[game.hostId]?.name || 'Unknown',
                playerCount: game.playerOrder.length,
                maxPlayers: game.settings.maxPlayers,
                betAmount: game.settings.betAmount || 0,
                deckSize: game.settings.deckSize || 36
            }));
        socket.emit('lobbyListUpdate', list);
    });

    socket.on('leaveLobbyBrowser', () => {
        socket.leave('lobby_browser');
    });

    socket.on('reconnectAttempt', async (payload) => {
        const requestedGameId = payload && payload.gameId;
        const sessionUser = socket.request.session?.user;
        const deviceId = socket.deviceId;

        console.log(`[Reconnect] Attempt from UserID: ${sessionUser?.id}, DeviceID: ${deviceId}`);

        if (!requestedGameId || !games[requestedGameId]) {
            return socket.emit('reconnectFailed');
        }
        const gameId = requestedGameId;
        const game = games[gameId];
        if (game.status !== 'in_progress') {
            return socket.emit('reconnectFailed');
        }

        let oldPlayerSocketId = null;
        let oldPlayerData = null;

        for (const [socketId, player] of Object.entries(game.players)) {
            if (player.disconnected) {
                if (sessionUser && player.dbId === sessionUser.id) {
                    oldPlayerSocketId = socketId;
                    oldPlayerData = player;
                    break;
                }
                if (!sessionUser && player.isGuest && player.deviceId === deviceId) {
                    oldPlayerSocketId = socketId;
                    oldPlayerData = player;
                    break;
                }
            }
        }

        if (oldPlayerSocketId && oldPlayerData) {
            console.log(`[Reconnect] Player ${oldPlayerData.name} found in game ${gameId}. Reconnecting...`);
            clearTimeout(oldPlayerData.reconnectTimeout);

            const newPlayerId = socket.id;
            game.players[newPlayerId] = oldPlayerData;

            game.players[newPlayerId].id = newPlayerId;
            game.players[newPlayerId].disconnected = false;
            game.players[newPlayerId].disconnectTime = null;
            game.players[newPlayerId].reconnectTimeout = null;

            const playerIndex = game.playerOrder.indexOf(oldPlayerSocketId);
            if (playerIndex > -1) {
                game.playerOrder[playerIndex] = newPlayerId;
            }

            if (game.hostId === oldPlayerSocketId) {
                game.hostId = newPlayerId;
            }

            if (game.attackerId === oldPlayerSocketId) {
                game.attackerId = newPlayerId;
            }
            if (game.defenderId === oldPlayerSocketId) {
                game.defenderId = newPlayerId;
            }
            if (game.turn === oldPlayerSocketId) {
                game.turn = newPlayerId;
            }

            delete game.players[oldPlayerSocketId];

            socket.join(gameId);

            io.to(gameId).emit('playerReconnected', {
                playerId: newPlayerId,
                oldPlayerId: oldPlayerSocketId,
                name: oldPlayerData.name
            });
            logEvent(game, null, { i18nKey: 'log_player_reconnected', options: { name: oldPlayerData.name } });

            broadcastGameState(gameId);

            return;
        }
        socket.emit('reconnectFailed');
    });
    socket.on('requestGameState', ({ gameId }) => {
        const game = games[gameId];
        if (game && game.players[socket.id]) {
            broadcastGameState(gameId);
        }
    });
    socket.on('addBot', ({ gameId, difficulty }) => {

        const game = games[gameId];

        if (!game) {
            console.error(`[AddBot] Error: Game ${gameId} not found in memory.`);
            return;
        }
        if (game.hostId !== socket.id) {
            console.error(`[AddBot] Error: User is not the host.`);
            return;
        }
        if (game.status !== 'waiting') {
            console.error(`[AddBot] Error: Game has already started.`);
            return;
        }
        if (Object.keys(game.players).length >= game.settings.maxPlayers) {
            console.error(`[AddBot] Error: Lobby is full.`);
            return;
        }

        const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const botNames = {
            child: "Baby Bot 👶", beginner: "Noob Bot 🤡", easy: "Simple Bot 🤖",
            medium: "Normal Bot 😐", hard: "Pro Bot 😎", impossible: "Terminator 🦾"
        };

        game.players[botId] = {
            id: botId,
            name: botNames[difficulty] || "Bot",
            isBot: true,
            difficulty: difficulty,
            cards: [],
            gameStats: { cardsTaken: 0, successfulDefenses: 0, cardsBeatenInDefense: 0 },
            afkStrikes: 0,
            isVerified: true
        };
        game.playerOrder.push(botId);

        io.to(gameId).emit('lobbyStateUpdate', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                rating: p.rating,
                isVerified: p.isVerified,
                isHost: p.id === game.hostId,
                isBot: p.isBot || false,
                difficulty: p.difficulty
            })),
            hostId: game.hostId,
            maxPlayers: game.settings.maxPlayers,
            settings: game.settings
        });
        broadcastPublicLobbies();
    });
    socket.on('chat:joinGlobal', () => {
        socket.join('global_chat');

        const lastPage = globalChatHistory.slice(-CHAT_PAGE_SIZE);
        socket.emit('chat:history', {
            messages: lastPage,
            hasMore: globalChatHistory.length > CHAT_PAGE_SIZE
        });
    });

    socket.on('chat:leaveGlobal', () => {
        socket.leave('global_chat');
    });

    socket.on('chat:sendGlobal', (message) => {
        const sessionUser = socket.request.session?.user;

        if (!sessionUser) return socket.emit('systemMessage', { i18nKey: 'error_chat_auth_required', type: 'error' });
        if (sessionUser.is_muted) return socket.emit('systemMessage', { i18nKey: 'error_chat_muted', type: 'error' });

        const now = Date.now();
        const userData = chatSpamTracker.get(sessionUser.id) || { lastTime: 0, violations: 0 };

        if (now - userData.lastTime > 60000) {
            userData.violations = 0;
        }

        const BASE_COOLDOWN = 3000;
        const PENALTY_PER_VIOLATION = 5000;
        const requiredCooldown = BASE_COOLDOWN + (userData.violations * PENALTY_PER_VIOLATION);

        if (now - userData.lastTime < requiredCooldown) {
            userData.violations++;
            chatSpamTracker.set(sessionUser.id, userData);

            const timeLeft = Math.ceil((requiredCooldown - (now - userData.lastTime)) / 1000);

            return socket.emit('chat:error', {
                i18nKey: 'error_chat_spam_wait',
                options: { seconds: timeLeft }
            });

            return socket.emit('systemMessage', { i18nKey: 'error_chat_spam_wait', options: { seconds: timeLeft }, type: 'warning' });
        }

        userData.lastTime = now;
        chatSpamTracker.set(sessionUser.id, userData);

        const trimmedMessage = message.trim();
        if (trimmedMessage.length === 0 || trimmedMessage.length > 255) {
            return;
        }

        const messageObject = {
            id: `msg_${now}_${sessionUser.id}`,
            author: {
                id: sessionUser.id,
                username: sessionUser.username,
                isAdmin: sessionUser.is_admin,
                isVerified: sessionUser.isVerified
            },
            text: trimmedMessage,
            timestamp: now
        };

        globalChatHistory.push(messageObject);
        if (globalChatHistory.length > CHAT_HISTORY_LIMIT) {
            globalChatHistory.splice(0, globalChatHistory.length - CHAT_HISTORY_LIMIT);
        }

        io.to('global_chat').emit('chat:newMessage', messageObject);
    });

    socket.on('chat:deleteMessage', async ({ messageId }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.is_admin) return;

        const messageIndex = globalChatHistory.findIndex(msg => msg.id === messageId);
        if (messageIndex > -1) {
            globalChatHistory[messageIndex].text = '[deleted by admin]';
            globalChatHistory[messageIndex].deleted = true;

            io.to('global_chat').emit('chat:updateMessage', globalChatHistory[messageIndex]);
        }
    });

    socket.on('chat:loadMore', ({ beforeTimestamp }) => {
        if (!beforeTimestamp) return;

        const lastIndex = globalChatHistory.findIndex(msg => msg.timestamp < beforeTimestamp);

        if (lastIndex > -1) {
            const startIndex = Math.max(0, lastIndex - CHAT_PAGE_SIZE);
            const page = globalChatHistory.slice(startIndex, lastIndex);

            socket.emit('chat:historyPage', {
                messages: page,
                hasMore: startIndex > 0
            });
        }
    });

    socket.on('chat:editMessage', ({ messageId, newText }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser) return;

        const trimmedText = newText.trim();
        if (trimmedText.length === 0 || trimmedText.length > 255) return;

        const message = globalChatHistory.find(msg => msg.id === messageId);

        if (message && message.author.id === sessionUser.id) {

            const TIME_LIMIT = 5 * 60 * 1000;
            if (Date.now() - message.timestamp > TIME_LIMIT) {
                return socket.emit('chat:error', { i18nKey: 'error_edit_time_expired' });
            }

            message.text = trimmedText;
            message.edited = true;
            message.editedAt = Date.now();

            io.to('global_chat').emit('chat:updateMessage', message);
        }
    });

    socket.on('chat:deleteOwnMessage', ({ messageId }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser) return;

        const messageIndex = globalChatHistory.findIndex(msg => msg.id === messageId);

        if (messageIndex > -1) {
            const message = globalChatHistory[messageIndex];

            if (message.author.id === sessionUser.id) {

                const TIME_LIMIT = 5 * 60 * 1000;
                if (Date.now() - message.timestamp > TIME_LIMIT) {
                    return socket.emit('chat:error', { i18nKey: 'error_delete_time_expired' });
                }

                message.text = '[message deleted]';
                message.deleted = true;

                io.to('global_chat').emit('chat:updateMessage', message);
            }
        }
    });
});

rouletteTick();
setInterval(rouletteTick, ROULETTE_INTERVAL);

setInterval(() => {
    if (rouletteState.timer > 0) {
        rouletteState.timer--;
        io.emit('roulette:timer', { timer: rouletteState.timer, phase: rouletteState.phase });
    }
}, 1000);

setInterval(() => {
    let hasChanges = false;
    for (const gameId in games) {
        const game = games[gameId];
        if (game.status === 'waiting' && (!game.playerOrder || game.playerOrder.length === 0)) {
            console.log(`[GC] Removing zombie lobby: ${gameId}`);
            delete games[gameId];
            dbRun("UPDATE games SET status = 'cancelled' WHERE id = ?", [gameId]);
            hasChanges = true;
        }
    }
    if (hasChanges) {
        broadcastPublicLobbies();
    }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущено на порті ${PORT}`);
});
