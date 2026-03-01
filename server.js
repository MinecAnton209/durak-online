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
const inboxService = require('./services/inboxService.js');
const webpush = require('web-push');
const util = require('util');
const prisma = require('./db/prisma');
const cookieParser = require('cookie-parser');
const { attachUserFromToken, socketAttachUser } = require('./middlewares/jwtAuth');
const telegramBot = require('./services/telegramBot');
const botLogic = require('./services/botLogic');
const { escapeHtml, validateLobbySettings, validateCard, validateGameId } = require('./utils/validation');
const { RANK_VALUES, createDeck, canBeat, getNextPlayerIndex, updateTurn, checkGameOver } = require('./utils/gameLogic');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const registerLobbyHandlers = require('./handlers/lobbyHandlers');
const registerGameHandlers = require('./handlers/gameHandlers');

prisma.game.updateMany({
    where: { status: 'waiting' },
    data: { status: 'cancelled' }
})
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
    console.log("Web Push (VAPID) initialized.");
} else {
    console.warn("VAPID keys not found in .env file. Push notifications will not work.");
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

io.use(socketAttachUser);
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

// Rate Limiter for Chat
const chatSpamTracker = new Map();
const CHAT_HISTORY_LIMIT = 50;
const CHAT_PAGE_SIZE = 50;
const globalChatHistory = [];

global.globalChatSettings = {
    slowModeInterval: 0 // in seconds
};

global.chatFilters = {
    badWords: [],
    linkRegex: null
};

async function loadChatFilters() {
    try {
        const filters = await prisma.chatFilter.findMany({
            where: { is_enabled: true },
            select: { type: true, content: true }
        });

        // Auto-seed default link regex if missing
        const defaultLinkRegex = '(http:\\/\\/|https:\\/\\/|www\\.)';
        const hasLinkRegex = filters.some(f => f.type === 'regex' && f.content === defaultLinkRegex);

        if (!hasLinkRegex) {
            console.log('Autoseeding default link regex...');
            try {
                await prisma.chatFilter.create({ data: { type: 'regex', content: defaultLinkRegex } });
                filters.push({ type: 'regex', content: defaultLinkRegex });
            } catch (seedErr) {
                console.error('Error autoseeding link regex:', seedErr);
            }
        }

        const words = [];
        const regexes = [];

        filters.forEach(f => {
            if (f.type === 'word') words.push(f.content.toLowerCase());
            if (f.type === 'regex') {
                try {
                    regexes.push(new RegExp(f.content, 'i'));
                } catch (e) {
                    console.error(`Invalid regex in DB: ${f.content}`, e);
                }
            }
        });

        global.chatFilters.badWords = words;
        global.chatFilters.regexes = regexes;

        console.log(`✅ Loaded ${words.length} bad words and ${regexes.length} regex filters.`);

    } catch (error) {
        console.error('❌ Failed to load chat filters:', error);
    }
}

global.loadChatFilters = loadChatFilters;

// Initial load
setTimeout(loadChatFilters, 3000); // Wait for DB connection


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
    message: "The site is undergoing maintenance. Please come back later.",
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
app.set('globalChatHistory', globalChatHistory);

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
inboxService.init(io);

app.set('trust proxy', 1);

app.use((req, res, next) => {
    res.set('Accept-CH', 'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model');
    res.set('Critical-CH', 'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model');

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
            scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...allowedOrigins],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", "https://*.telegram.org"],
            frameAncestors: ["'self'", "https://*.telegram.org", "https://*.t.me"],
        },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: false,
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
const inboxRoutes = require('./routes/inbox.js');
app.use('/api/inbox', inboxRoutes);


app.use(express.static(path.join(__dirname, 'public')));

app.get(/.*/, (req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBot.init(process.env.TELEGRAM_BOT_TOKEN, getSystemStats);
}

io.use(socketAttachUser);

async function checkBanStatus(userId) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { is_banned: true, ban_reason: true, ban_until: true }
        });
        if (user && user.is_banned) {
            if (user.ban_until && new Date(user.ban_until) < new Date()) {
                await prisma.user.update({
                    where: { id: userId },
                    data: { is_banned: false, ban_until: null, ban_reason: null }
                });
                return null;
            }
            return user.ban_reason || 'Account banned';
        }
        return null;
    } catch (error) {
        console.error("Error in checkBanStatus:", error);
        return null;
    }
}

const VERIFIED_BADGE_SVG = `<span class="verified-badge" title="Verified player"><svg viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0"></path></svg></span>`;

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
                await prisma.user.updateMany({
                    where: { id: { in: playerDbIds } },
                    data: { coins: { decrement: betAmount } }
                });
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
        await prisma.game.update({
            where: { id: game.id },
            data: {
                start_time: game.startTime.toISOString(),
                game_type: gameType,
                is_bot_game: isBotGame,
                status: 'in_progress',
                host_user_id: hostUserId
            }
        });

        await prisma.gameParticipant.deleteMany({ where: { game_id: game.id } });

        for (let index = 0; index < game.playerOrder.length; index++) {
            const playerId = game.playerOrder[index];
            const player = game.players[playerId];
            const isFirstAttacker = (index === firstAttackerIndex);

            if (player.dbId) {
                await prisma.gameParticipant.create({
                    data: {
                        game_id: game.id,
                        user_id: player.dbId,
                        is_bot: player.isGuest,
                        is_first_attacker: isFirstAttacker
                    }
                });
            }
        }

    } catch (err) {
        console.error(`Error starting game ${game.id} in DB:`, err.message);
    }
    logEvent(game, null, {
        i18nKey: 'log_game_start',
        options: { trump: game.trumpSuit, player: game.players[game.playerOrder[firstAttackerIndex]].name }
    });
    updateTurn(game, firstAttackerIndex);
    broadcastGameState(gameId);
    io.emit('lobbyStarted', { lobbyId: gameId });
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
                console.log(`[Game] ${player.name} drew ${drawnCards.length} cards in game ${game.id}`);
            }
        }
    }
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
            await prisma.game.update({
                where: { id: game.id },
                data: { end_time: endTime.toISOString(), duration_seconds: durationSeconds }
            });
        } catch (err) {
            console.error(`[GAME END ${game.id}] Error updating game end time:`, err.message);
        }
        return;
    }
    const hasBots = Object.values(game.players).some(p => p.isBot);

    try {
        await prisma.$transaction(async (tx) => {
            const endTime = new Date();
            const durationSeconds = Math.round((endTime - game.startTime) / 1000);
            const { winners, loser } = game.winner;
            const winnerDbIds = winners.filter(p => p && !p.isGuest).map(p => p.dbId);
            const loserDbId = (loser && !loser.isGuest) ? loser.dbId : null;

            await tx.game.update({
                where: { id: game.id },
                data: {
                    end_time: endTime.toISOString(),
                    duration_seconds: durationSeconds,
                    winner_user_id: winnerDbIds.length > 0 ? winnerDbIds[0] : null,
                    loser_user_id: loserDbId
                }
            });
            await statsService.incrementDailyCounter('games_played');

            const allPlayersInGame = [...winners, loser].filter(p => p);

            for (const player of allPlayersInGame) {
                if (player && !player.isGuest && player.dbId) {
                    const outcome = winners.some(w => w.id === player.id) ? 'win' : 'loss';
                    await tx.gameParticipant.updateMany({
                        where: { game_id: game.id, user_id: player.dbId },
                        data: { outcome, cards_at_end: player.cards.length }
                    });

                    const userData = await tx.user.findUnique({
                        where: { id: player.dbId },
                        select: { streak_count: true, last_played_date: true, wins: true, losses: true, win_streak: true }
                    });
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

                    await tx.user.update({
                        where: { id: player.dbId },
                        data: isWinner
                            ? { wins: { increment: 1 }, streak_count: newStreak, last_played_date: today, win_streak: newWinStreak }
                            : { losses: { increment: 1 }, streak_count: newStreak, last_played_date: today, win_streak: 0 }
                    });
                }
            }

            const betAmount = game.settings.betAmount || 0;
            if (betAmount > 0 && game.bank > 0) {
                const txWinners = game.winner.winners.filter(p => p && !p.isGuest);

                if (txWinners.length > 0) {
                    const prizePerWinner = Math.floor(game.bank / txWinners.length);
                    console.log(`[Economy] Awarding ${prizePerWinner} coins to ${txWinners.length} winner(s) for game ${game.id}.`);
                    for (const winner of txWinners) {
                        await tx.user.update({
                            where: { id: winner.dbId },
                            data: { coins: { increment: prizePerWinner } }
                        });
                    }
                } else {
                    console.log(`[Economy] No registered winners in game ${game.id}. Refunding bets.`);

                    const allRegisteredPlayers = Object.values(game.players).filter(p => p && !p.isGuest);

                    if (allRegisteredPlayers.length > 0) {
                        await tx.user.updateMany({
                            where: { id: { in: allRegisteredPlayers.map(p => p.dbId) } },
                            data: { coins: { increment: betAmount } }
                        });
                        console.log(`[Economy] Refunded ${betAmount} coins to ${allRegisteredPlayers.length} players.`);

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
        });

    } catch (error) {
        console.error(`[GAME END ${game.id}] FATAL ERROR during stats update. Rolling back.`, error);
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

                const promise = prisma.user.update({
                    where: { id: userIdNum },
                    data: { coins: { increment: totalPayout } }
                })
                    .then(() => prisma.user.findUnique({ where: { id: userIdNum }, select: { coins: true } }))
                    .then(user => {
                        const userSocketId = onlineUsers.get(userIdNum);
                        if (userSocketId && user) {
                            io.to(userSocketId).emit('updateBalance', { coins: user.coins });
                            io.to(userSocketId).emit('roulette:win', { amount: totalPayout });

                            const userSocket = io.sockets.sockets.get(userSocketId);
                            if (userSocket?.request?.session?.user) {
                                userSocket.request.session.user.coins = user.coins;
                                userSocket.request.session.save();
                            }
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
        logEvent(game, `🚫 ${player.name} removed from the game due to inactivity.`);

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
        const userId = parseInt(sessionUser.id, 10);
        onlineUsers.set(userId, socket.id);
        socket.join(`user_${userId}`); // Join user-specific room

        economyService.checkAndAwardDailyBonus(userId, io, socket.id);
        console.log(`[Online Status] User connected: ${sessionUser.username} (ID: ${sessionUser.id}). Total online: ${onlineUsers.size}`);
        prisma.user.findUnique({
            where: { id: userId },
            select: { is_banned: true, ban_reason: true, ban_until: true }
        }).then(async (dbUser) => {
            if (dbUser && dbUser.is_banned) {
                if (dbUser.ban_until && new Date(dbUser.ban_until) < new Date()) {
                    await prisma.user.update({
                        where: { id: userId },
                        data: { is_banned: false, ban_until: null, ban_reason: null }
                    });
                    console.log(`[Ban] Ban expired for user ${sessionUser.username}`);
                } else {
                    const reasonText = dbUser.ban_reason || i18next.t('ban_reason_not_specified');
                    const options = { reason: reasonText };
                    if (dbUser.ban_until) {
                        options.until = new Date(dbUser.ban_until).toLocaleString();
                    }
                    socket.emit('forceDisconnect', {
                        i18nKey: dbUser.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                        options: options
                    });
                    socket.disconnect(true);
                }
            }
        }).catch(err => {
            console.error(`[Ban] Error checking ban status for ${sessionUser.username}:`, err.message);
            socket.disconnect(true);
        });
    } else {
        console.log(`Client connected: ${socket.id} (guest)`);
    }
    registerLobbyHandlers(io, socket, { games, addPlayerToGame, broadcastPublicLobbies, checkBanStatus });
    socket.on('reconnectAttempt', async ({ gameId }) => {
        console.log(`[Reconnect] Attempt from socket ${socket.id} for game ${gameId}`);

        if (!gameId) {
            return socket.emit('reconnectFailed');
        }

        const targetGameId = gameId.toUpperCase();
        const game = games[targetGameId];

        if (!game) {
            console.log(`[Reconnect] Game ${targetGameId} not found in memory`);
            return socket.emit('reconnectFailed');
        }

        if (game.status === 'finished') {
            console.log(`[Reconnect] Game ${targetGameId} already finished`);
            return socket.emit('reconnectFailed');
        }

        const sessionUser = socket.request.session?.user;
        const userDbId = sessionUser?.id;

        let existingPlayerId = null;
        if (userDbId) {
            for (const [playerId, player] of Object.entries(game.players)) {
                if (player.dbId === userDbId) {
                    existingPlayerId = playerId;
                    break;
                }
            }
        }

        if (existingPlayerId) {
            console.log(`[Reconnect] User found in game. Old socket: ${existingPlayerId}, New socket: ${socket.id}`);

            const oldPlayer = game.players[existingPlayerId];
            const oldPlayerId = existingPlayerId;

            game.players[socket.id] = { ...oldPlayer, id: socket.id };
            delete game.players[oldPlayerId];

            const orderIndex = game.playerOrder.indexOf(oldPlayerId);
            if (orderIndex !== -1) {
                game.playerOrder[orderIndex] = socket.id;
            }

            if (game.attackerId === oldPlayerId) game.attackerId = socket.id;
            if (game.defenderId === oldPlayerId) game.defenderId = socket.id;
            if (game.turn === oldPlayerId) game.turn = socket.id;
            if (game.hostId === oldPlayerId) game.hostId = socket.id;

            if (oldPlayer.reconnectTimeout) {
                clearTimeout(oldPlayer.reconnectTimeout);
                delete game.players[socket.id].reconnectTimeout;
            }
            delete game.players[socket.id].disconnected;
            delete game.players[socket.id].disconnectTime;

            socket.join(targetGameId);

            io.to(targetGameId).emit('playerReconnected', {
                playerId: socket.id,
                oldPlayerId: oldPlayerId,
                name: oldPlayer.name
            });

            logEvent(game, null, { i18nKey: 'log_player_reconnected', options: { name: oldPlayer.name } });

            console.log(`[Reconnect] Success for ${oldPlayer.name}`);
            broadcastGameState(targetGameId);

        } else {
            console.log(`[Reconnect] User not in game. Checking if can join...`);

            // If game is not in waiting status, user cannot join
            if (game.status !== 'waiting') {
                console.log(`[Reconnect] Game ${targetGameId} is not in waiting status (${game.status})`);
                return socket.emit('reconnectFailed', { i18nKey: 'error_lobby_not_found' });
            }

            // If game is full, user cannot join
            if (Object.keys(game.players).length >= game.settings.maxPlayers) {
                console.log(`[Reconnect] Game ${targetGameId} is full`);
                return socket.emit('reconnectFailed', { i18nKey: 'error_room_full' });
            }

            // Check bet requirements
            const betAmount = game.settings.betAmount || 0;
            if (betAmount > 0) {
                if (!sessionUser) {
                    console.log(`[Reconnect] Guest cannot join game with bet`);
                    return socket.emit('reconnectFailed', { i18nKey: 'error_guests_cannot_bet' });
                }
                if (sessionUser.coins < betAmount) {
                    console.log(`[Reconnect] User doesn't have enough coins for bet`);
                    return socket.emit('reconnectFailed', { i18nKey: 'error_not_enough_coins_join' });
                }
            }

            // Add player to game
            const playerName = sessionUser ? sessionUser.username : `Guest ${Math.floor(Math.random() * 1000)}`;
            socket.join(targetGameId);
            addPlayerToGame(socket, game, playerName);

            console.log(`[Reconnect] ${playerName} joined lobby ${targetGameId} via URL`);

            socket.emit('joinSuccess', { gameId: targetGameId, playerId: socket.id });

            io.to(targetGameId).emit('lobbyStateUpdate', {
                players: Object.values(game.players).map(p => ({ id: p.id, name: p.name, rating: p.rating, isVerified: p.isVerified })),
                hostId: game.hostId,
                maxPlayers: game.settings.maxPlayers,
                settings: game.settings
            });

            broadcastPublicLobbies();
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
    registerGameHandlers(io, socket, {
        games,
        startGame,
        canBeat,
        getNextPlayerIndex,
        checkGameOver,
        logEvent,
        updateTurn,
        broadcastGameState,
        refillHands,
        updateStatsAfterGame,
        achievementService,
        VERIFIED_BADGE_SVG,
        escapeHtml
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
                            prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } }).catch(() => { });
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
                        prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } }).catch(() => { });
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
        console.log(`Admin ${sessionUser.username} started spectating game ${gameId}`);
        logEvent(game, null, { i18nKey: 'log_admin_spectating', options: { adminName: sessionUser.username } });
        broadcastGameState(gameId);
        socket.emit('spectateSuccess', { gameId });
    });
    socket.on('hostChangeTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        console.log(`[Music] Host of game ${gameId} changed track to: ${trackTitle} (ID: ${trackId})`);
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
        console.log(`[Music] Host of game ${gameId} changed playback state to: ${isPlaying}`);
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
                maintenanceBannerCountdown.textContent = "Maintenance started!";
                clearInterval(maintenanceCountdownInterval);
                setTimeout(() => window.location.reload(), 2000);
                return;
            }
            const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
            const seconds = Math.floor((timeLeft / 1000) % 60);
            maintenanceBannerCountdown.textContent = `Until start: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

            // Add to Inbox
            await inboxService.addMessage(targetUserId, {
                type: 'game_invite',
                titleKey: 'inbox.game_invite_title',
                contentKey: 'inbox.game_invite_content',
                contentParams: {
                    fromUserId: sessionUser.id,
                    fromUsername: sessionUser.username,
                    lobbyId: gameId
                }
            });
        } catch (error) {
            console.error(`[Invites] Failed to send push/inbox notification for user ${targetUserId}:`, error);
        }
    });
    socket.on('roulette:getState', () => {
        socket.emit('roulette:updateState', rouletteState);
        if (socket.request.session.user) {
            prisma.user.findUnique({
                where: { id: socket.request.session.user.id },
                select: { coins: true }
            }).then(user => {
                if (user) socket.emit('updateBalance', { coins: user.coins });
            }).catch(err => console.error('[Roulette] Error getting balance:', err.message));
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
        const userId = parseInt(sessionUser.id, 10);

        try {
            const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
            if (!dbUser || dbUser.coins < amount) {
                return socket.emit('roulette:betError', { messageKey: 'error_not_enough_coins' });
            }

            await prisma.user.update({ where: { id: userId }, data: { coins: { decrement: amount } } });

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
            await prisma.game.update({ where: { id: gameId }, data: { status: 'in_progress' } });
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
                prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } }).catch(() => { });
                io.emit('lobbyExpired', { lobbyId: gameId });
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
            prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } }).catch(() => { });
            io.emit('lobbyExpired', { lobbyId: gameId });
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
            await prisma.game.update({
                where: { id: gameId },
                data: { game_settings: JSON.stringify(game.settings), max_players: game.settings.maxPlayers }
            });

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
        // Initial lobby list update when joining the browser
        const list = Object.values(games)
            .filter(game => game.status === 'waiting' && game.settings.lobbyType === 'public' && game.playerOrder.length > 0 && !game.host?.is_shadow_banned)
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

    socket.on('getLobbyList', () => {
        const publicGames = Object.values(games)
            .filter(g => g.status === 'waiting' && g.settings.lobbyType === 'public' && !g.host?.is_shadow_banned)
            .map(g => ({
                gameId: g.id,
                hostName: g.players[g.hostId]?.name || 'Unknown',
                playerCount: Object.keys(g.players).length,
                maxPlayers: g.settings.maxPlayers,
                full: Object.keys(g.players).length >= g.settings.maxPlayers,
                betAmount: g.settings.betAmount,
                gameMode: g.settings.gameMode,
                turnDuration: g.settings.turnDuration
            }));
        socket.emit('lobbyList', publicGames);
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

        if (sessionUser.is_muted) {
            if (sessionUser.mute_until && new Date(sessionUser.mute_until) < new Date()) {
                // Mute expired
                sessionUser.is_muted = false;
                sessionUser.mute_until = null;
                prisma.user.update({
                    where: { id: sessionUser.id },
                    data: { is_muted: false, mute_until: null }
                }).catch(err => console.error('[Mute] Error unmuting user:', err.message));
            } else {
                return socket.emit('systemMessage', { i18nKey: 'error_chat_muted', type: 'error' });
            }
        }

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

        // Global Chat Settings (Simple in-memory for now, could move to DB)
        const slowModeInterval = global.globalChatSettings?.slowModeInterval || 0;

        // Slow Mode Check
        if (slowModeInterval > 0 && !sessionUser.is_admin) {
            const lastTime = userData.lastTime || 0;
            if (now - lastTime < slowModeInterval * 1000) {
                return socket.emit('chat:error', {
                    i18nKey: 'error_chat_slow_mode',
                    options: { seconds: Math.ceil((slowModeInterval * 1000 - (now - lastTime)) / 1000) }
                });
            }
        }

        const trimmedMessage = message.trim();
        if (trimmedMessage.length === 0 || trimmedMessage.length > 255) {
            return;
        }

        // Content Filtering (Blacklist & Links from DB)
        const filters = global.chatFilters || { badWords: [], regexes: [] };
        // Default link regex if none in DB, or combine?
        // User asked to load linkRegex from DB too. 
        // If DB has regexes, use them. If we want a fallback hardcoded link regex, we can keep it or add it to DB.
        // Assuming we rely on DB or updated global variable.

        let isSpam = false;

        // Check Regexes (including links if added to DB)
        if (filters.regexes && filters.regexes.length > 0) {
            isSpam = filters.regexes.some(r => r.test(trimmedMessage));
        }

        // Fallback hardcoded link check if requested, OR assume it's in DB.
        // Let's keep a hardcoded fallback for links ONLY if not in DB? 
        // User said "linkRegex too from db", implying we should NOT hardcode it if possible, 
        // or the DB should contain it. 
        // But for safety, I will keep a basic link check if `global.chatFilters.linkRegex` is not set?
        // Wait, I defined `linkRegex: null` in the global object init.
        // The previous code had `const linkRegex = /(http:\/\/|https:\/\/|www\.)/i;`

        if (!isSpam && filters.badWords && filters.badWords.length > 0) {
            const lowerMsg = trimmedMessage.toLowerCase();
            isSpam = filters.badWords.some(w => lowerMsg.includes(w));
        }

        const messageObject = {
            id: `msg_${now}_${sessionUser.id}`,
            author: {
                id: sessionUser.id,
                username: sessionUser.username,
                isAdmin: sessionUser.is_admin,
                isVerified: sessionUser.isVerified,
                isMuted: sessionUser.is_muted,
                muteUntil: sessionUser.mute_until
            },
            text: trimmedMessage,
            timestamp: now
        };

        // Shadowban Logic
        if (sessionUser.is_shadow_banned || isSpam) {
            // Only emit to sender, do not add to global history
            socket.emit('chat:newMessage', messageObject);
            return;
        }

        // Update spam tracker only if message actually sent
        userData.lastTime = now;
        chatSpamTracker.set(sessionUser.id, userData);

        // Save to Persistent History (Async, don't block)
        prisma.chatMessage.create({
            data: {
                user_id: sessionUser.id,
                username: sessionUser.username,
                content: trimmedMessage,
                created_at: new Date(now)
            }
        }).catch(err => console.error('Failed to save chat message:', err));

        globalChatHistory.push(messageObject);
        if (globalChatHistory.length > CHAT_HISTORY_LIMIT) {
            globalChatHistory.splice(0, globalChatHistory.length - CHAT_HISTORY_LIMIT);
        }

        io.to('global_chat').emit('chat:newMessage', messageObject);
    });

    socket.on('chat:muteUser', async ({ userId, durationMinutes, permanent }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.is_admin) return;

        let muteUntil = null;
        if (!permanent) {
            const duration = parseInt(durationMinutes, 10) || 60;
            muteUntil = new Date(Date.now() + duration * 60000).toISOString();
        }

        await prisma.user.update({
            where: { id: parseInt(userId, 10) },
            data: { is_muted: true, mute_until: muteUntil ? new Date(muteUntil) : null }
        });

        // Update existing messages in history to reflect mute status immediately
        globalChatHistory.forEach(msg => {
            if (msg.author.id === userId) {
                msg.author.isMuted = true;
                msg.author.muteUntil = muteUntil;
                io.to('global_chat').emit('chat:updateMessage', msg);
            }
        });

        // Log admin action
        const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId, 10) }, select: { username: true } });
        logAdminAction({
            adminId: sessionUser.id,
            adminUsername: sessionUser.username,
            actionType: permanent ? 'MUTE_USER_PERMANENT' : 'MUTE_USER_TEMPORARY',
            targetUserId: userId,
            targetUsername: targetUser ? targetUser.username : 'Unknown',
            reason: permanent ? 'Permanent mute from global chat quick actions' : `Temporary mute (${durationMinutes}min) from global chat quick actions`
        });
    });

    socket.on('chat:banUser', async ({ userId, durationMinutes, permanent }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.is_admin) return;

        let banUntil = null;
        if (!permanent) {
            const duration = parseInt(durationMinutes, 10) || 60;
            banUntil = new Date(Date.now() + duration * 60000).toISOString();
        }

        await prisma.user.update({
            where: { id: parseInt(userId, 10) },
            data: {
                is_banned: true,
                ban_until: banUntil ? new Date(banUntil) : null,
                ban_reason: permanent ? 'Permanent ban from global chat' : 'Temporary ban from global chat'
            }
        });

        // Log admin action
        const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId, 10) }, select: { username: true } });
        logAdminAction({
            adminId: sessionUser.id,
            adminUsername: sessionUser.username,
            actionType: permanent ? 'BAN_USER_PERMANENT' : 'BAN_USER_TEMPORARY',
            targetUserId: userId,
            targetUsername: targetUser ? targetUser.username : 'Unknown',
            reason: permanent ? 'Permanent ban from global chat quick actions' : `Temporary ban (${durationMinutes}min) from global chat quick actions`
        });

        // Force disconnect the banned user if they are online
        io.sockets.sockets.forEach((s) => {
            if (s.request.session?.user?.id === parseInt(userId, 10)) {
                const options = { reason: permanent ? 'Permanent ban from global chat' : 'Temporary ban from global chat' };
                if (banUntil) {
                    options.until = new Date(banUntil).toLocaleString();
                }
                s.emit('forceDisconnect', {
                    i18nKey: banUntil ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                    options: options
                });
                s.disconnect(true);
            }
        });
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

    socket.on('health:subscribe', () => {
        socket.join('health_status');
        console.log(`[Health] Socket ${socket.id} subscribed to health updates`);
    });

    socket.on('health:unsubscribe', () => {
        socket.leave('health_status');
        console.log(`[Health] Socket ${socket.id} unsubscribed from health updates`);
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
            prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } }).catch(() => { });
            io.emit('lobbyExpired', { lobbyId: gameId });
            hasChanges = true;
        }
    }
    if (hasChanges) {
        broadcastPublicLobbies();
    }
}, 30000);

async function getSystemStats() {
    try {
        const onlineUsersMap = onlineUsers;
        const activeGamesMap = games || {};

        const onlineCount = onlineUsersMap ? onlineUsersMap.size : 0;
        const totalGamesCount = Object.keys(activeGamesMap).length;

        let gamesInProgress = 0;
        let publicLobbies = 0;
        let privateLobbies = 0;
        let playersInMatches = 0;
        let botGames = 0;

        for (const game of Object.values(activeGamesMap)) {
            if (game.status === 'in_progress') {
                gamesInProgress++;
                playersInMatches += game.playerOrder.length;
                if (Object.values(game.players).some(p => p.isBot)) {
                    botGames++;
                }
            } else if (game.status === 'waiting') {
                if (game.settings.lobbyType === 'private') privateLobbies++;
                else publicLobbies++;
            }
        }

        const { performance } = require('perf_hooks');
        const dbStartTime = performance.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbPing = Math.round(performance.now() - dbStartTime);

        const today = new Date().toISOString().slice(0, 10);
        let dailyStats = await prisma.systemStatsDaily.findUnique({ where: { date: today } });
        if (!dailyStats) {
            dailyStats = { new_registrations: 0, games_played: 0 };
        }

        const memory = process.memoryUsage();

        let currentAppVersion = 'unknown';
        try {
            const packageJsonPath = path.join(__dirname, 'package.json');
            if (require('fs').existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'));
                currentAppVersion = packageJson.version;
            }
        } catch (e) {
            console.error("Failed to read package.json version in health broadcast", e);
        }

        function formatUptime(uptime) {
            const seconds = Math.floor(uptime);
            const days = Math.floor(seconds / (3600 * 24));
            const hours = Math.floor((seconds % (3600 * 24)) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const parts = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds % 60}s`].filter(Boolean);
            return parts.join(' ');
        }

        return {
            status: 'OK',
            timestamp: new Date().toISOString(),
            app: {
                version: currentAppVersion,
                environment: process.env.NODE_ENV || 'development',
                uptime: formatUptime(process.uptime()),
            },
            activity: {
                users_online: onlineCount,
                sessions_total: totalGamesCount,
                games_in_progress: gamesInProgress,
                lobbies_waiting: publicLobbies + privateLobbies,
                public_lobbies: publicLobbies,
                private_lobbies: privateLobbies,
                players_in_game: playersInMatches,
                bot_games_active: botGames,
            },
            daily_stats: {
                date: today,
                registrations_today: dailyStats.new_registrations,
                games_played_today: dailyStats.games_played,
            },
            system: {
                memory_rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
                node_version: process.version,
                db_ping_ms: dbPing,
            }
        };
    } catch (error) {
        console.error('[Health] Error getting system stats:', error);
        return null;
    }
}

async function broadcastHealthStatus() {
    const stats = await getSystemStats();
    if (stats) {
        io.to('health_status').emit('health:update', stats);
    }
}

setInterval(broadcastHealthStatus, 1000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

let isShuttingDown = false;

const SHUTDOWN_TIMEOUT = 5000;

async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log("Shutdown already in progress...");
        return;
    }

    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
        console.error("Shutdown timeout exceeded. Force exit.");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
        console.log("Stopping HTTP server...");
        await new Promise((resolve) => {
            server.close(() => {
                console.log("HTTP server closed");
                resolve();
            });

            server.getConnections((_, count) => {
                if (count > 0) {
                    server.closeIdleConnections?.();
                    server.closeAllConnections?.();
                }
            });
        });

        console.log("Closing Socket.IO...");
        const sockets = await io.fetchSockets();
        for (const socket of sockets) {
            socket.disconnect(true);
        }
        io.close();
        console.log("Socket.IO closed");

        if (telegramBot && telegramBot.stop) {
            console.log("Stopping Telegram bot...");
            try {
                await telegramBot.stop();
            } catch (e) {
                console.error("Telegram stop error:", e);
            }
            console.log("Telegram bot stopped");
        }

        console.log("Closing database connection...");
        await prisma.$disconnect();
        console.log("Prisma disconnected");

        clearTimeout(forceExitTimer);

        console.log("Graceful shutdown completed");
        process.exit(0);

    } catch (err) {
        clearTimeout(forceExitTimer);
        console.error("Error during shutdown:", err);
        process.exit(1);
    }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, p) => {
    console.error("Unhandled Rejection:", reason);
});
