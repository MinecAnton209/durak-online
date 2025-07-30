require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const db = require('./db');
const authRoutes = require('./routes/auth.js');
const publicRoutes = require('./routes/public.js');
const achievementRoutes = require('./routes/achievements.js');
const adminRoutes = require('./routes/admin.js');
const friendsRoutes = require('./routes/friends.js');
const notificationsRoutes = require('./routes/notifications.js');
const {seedAchievements} = require('./db/seed.js');
const achievementService = require('./services/achievementService.js');
const ratingService = require('./services/ratingService.js');
const statsService = require('./services/statsService.js');
const notificationService = require('./services/notificationService.js');
const webpush = require('web-push');

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
const io = socketIo(server, {cors: {origin: "*"}});
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

let games = {};

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

const sessionMiddleware = session({
    store: (process.env.DB_CLIENT === 'postgres' && process.env.DATABASE_URL) ?
        new (require('connect-pg-simple')(session))({pool: db.pool, tableName: 'user_sessions'}) :
        new (require('connect-sqlite3')(session))({db: 'database.sqlite', dir: './data'}),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined
    }
});

if (process.env.DB_CLIENT === 'postgres' && process.env.DATABASE_URL) {
    console.log("Сесії будуть зберігатися в PostgreSQL.");
} else {
    console.log("Сесії будуть зберігатися в SQLite.");
}

app.set('trust proxy', 1);

app.use((req, res, next) => {
    const maintenanceMode = req.app.get('maintenanceMode');

    if (maintenanceMode.enabled) {
        if (req.originalUrl.startsWith('/api/admin') ||
            req.session?.user?.is_admin ||
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

app.use(cors({
    origin: process.env.ADMIN_CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.get('/maintenance', (req, res) => {
    const maintenanceMode = req.app.get('maintenanceMode');

    if (!maintenanceMode.enabled) {
        return res.redirect('/');
    }

    res.sendFile(path.join(__dirname, 'public', 'maintenance-page.html'));
});
app.use(sessionMiddleware);

app.use(express.static('public'));

app.use('/', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);

app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});


app.use((err, req, res, next) => {
    console.error("Critical server error:");
    console.error(err.stack);

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
});

app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'error.html'));
});

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

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
            deck.push({suit, rank});
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
        name: sessionUser ? sessionUser.username : playerName,
        dbId: sessionUser ? sessionUser.id : null,
        isGuest: !sessionUser,
        cardBackStyle: sessionUser ? sessionUser.card_back_style : 'default',
        streak: sessionUser ? sessionUser.streak : 0,
        rating: sessionUser ? Math.round(sessionUser.rating) : 1500,
        isVerified: sessionUser ? sessionUser.isVerified : false,
        is_muted: sessionUser ? sessionUser.is_muted : false,
        cards: [],
        gameStats: {cardsTaken: 0, successfulDefenses: 0, cardsBeatenInDefense: 0}
    };
    game.playerOrder.push(socket.id);
}

function logEvent(game, message, options = {}) {
    if (!game.log) game.log = [];
    const timestamp = new Date().toLocaleTimeString('uk-UA', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
    const logEntry = {timestamp, ...options};
    if (typeof message === 'string' && !options.i18nKey) {
        logEntry.message = message;
    }
    game.log.push(logEntry);
    if (game.log.length > 50) game.log.shift();
    io.to(game.id).emit('newLogEntry', logEntry);
}

function startGame(gameId) {
    const game = games[gameId];
    if (!game) return;
    game.startTime = new Date();
    game.deck = createDeck(game.settings.deckSize);
    game.trumpCard = game.deck.length > 0 ? game.deck[game.deck.length - 1] : {suit: '♠', rank: ''};
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
    db.run(`INSERT INTO games (id, start_time, game_type, host_user_id, is_bot_game)
            VALUES (?, ?, ?, ?,
                    ?)`, [game.id, game.startTime.toISOString(), gameType, hostUserId, isBotGame], (err) => {
        if (err) {
            return console.error(`Помилка створення запису для гри ${game.id} в 'games':`, err.message);
        }
        game.playerOrder.forEach((playerId, index) => {
            const player = game.players[playerId];
            const isFirstAttacker = (index === firstAttackerIndex);
            if (player.dbId) {
                db.run(`INSERT INTO game_participants (game_id, user_id, is_bot, is_first_attacker)
                        VALUES (?, ?, ?,
                                ?)`, [game.id, player.dbId, player.isGuest, isFirstAttacker], (participantErr) => {
                    if (participantErr) {
                        console.error(`Помилка додавання учасника ${player.name} до гри ${game.id}:`, participantErr.message);
                    }
                });
            }
        });
    });
    logEvent(game, null, {
        i18nKey: 'log_game_start',
        options: {trump: game.trumpSuit, player: game.players[game.playerOrder[firstAttackerIndex]].name}
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
                    options: {name: player.name, count: drawnCards.length}
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
            game.winner = {winners, loser};
            return true;
        }
    }
    return false;
}

function updateStatsAfterGame(game) {
    if (!game.winner || !game.startTime) return;
    if (!game.winner.winners || !game.winner.hasOwnProperty('loser')) {
        console.log(`[updateStatsAfterGame] Гру ${game.id} завершено з причини, статистика гравців та рейтинг не оновлюються.`);
        const endTime = new Date();
        const durationSeconds = Math.round((endTime - game.startTime) / 1000);
        db.run(`UPDATE games
                SET end_time         = ?,
                    duration_seconds = ?
                WHERE id = ?`, [endTime.toISOString(), durationSeconds, game.id], (err) => {
            if (err) console.error(`Помилка оновлення часу гри ${game.id}:`, err.message);
        });
        return;
    }
    db.serialize(() => {
        console.log(`[updateStatsAfterGame] Початок транзакції для гри ${game.id}`);
        db.run("BEGIN TRANSACTION");
        const endTime = new Date();
        const durationSeconds = Math.round((endTime - game.startTime) / 1000);
        const {winners, loser} = game.winner;
        const winnerId = (winners.length === 1 && !winners[0].isGuest) ? winners[0].dbId : null;
        const loserId = (loser && !loser.isGuest) ? loser.dbId : null;
        db.run(`UPDATE games
                SET end_time         = ?,
                    duration_seconds = ?,
                    winner_user_id   = ?,
                    loser_user_id    = ?
                WHERE id = ?`, [endTime.toISOString(), durationSeconds, winnerId, loserId, game.id], (err) => {
            if (err) return db.run("ROLLBACK", () => console.error(`Помилка оновлення гри ${game.id} в 'games':`, err.message));
            statsService.incrementDailyCounter('games_played');
        });
        const allPlayersInGame = [...winners, loser].filter(p => p);
        allPlayersInGame.forEach(player => {
            if (player && !player.isGuest) {
                const outcome = winners.some(w => w.id === player.id) ? 'win' : 'loss';
                db.run(`UPDATE game_participants
                        SET outcome      = ?,
                            cards_at_end = ?
                        WHERE game_id = ?
                          AND user_id = ?`, [outcome, player.cards.length, game.id, player.dbId], (err) => {
                    if (err) return db.run("ROLLBACK", () => console.error(`Помилка оновлення учасника ${player.name}:`, err.message));
                });
                db.get(`SELECT streak_count, last_played_date, wins, losses, win_streak
                        FROM users
                        WHERE id = ?`, [player.dbId], (err, userData) => {
                    if (err) return db.run("ROLLBACK", () => console.error(`Помилка отримання даних гравця ${player.name}:`, err.message));
                    if (!userData) return;
                    const isWinner = outcome === 'win';
                    let newWinStreak = isWinner ? (userData.win_streak || 0) + 1 : 0;
                    achievementService.checkPostGameAchievements(game, player, userData, newWinStreak);
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
                    const query = isWinner ? `UPDATE users
                                              SET wins             = wins + 1,
                                                  streak_count     = ?,
                                                  last_played_date = ?,
                                                  win_streak       = ?
                                              WHERE id = ?` : `UPDATE users
                                                               SET losses           = losses + 1,
                                                                   streak_count     = ?,
                                                                   last_played_date = ?,
                                                                   win_streak       = 0
                                                               WHERE id = ?`;
                    const params = isWinner ? [newStreak, today, newWinStreak, player.dbId] : [newStreak, today, player.dbId];
                    db.run(query, params, (updateErr) => {
                        if (updateErr) return db.run("ROLLBACK", () => console.error("Помилка оновлення статистики:", updateErr.message));
                        const playerSocket = io.sockets.sockets.get(player.id);
                        if (playerSocket && playerSocket.request.session.user) {
                            if (isWinner) playerSocket.request.session.user.wins++; else playerSocket.request.session.user.losses++;
                            playerSocket.request.session.user.streak = newStreak;
                            playerSocket.request.session.user.win_streak = newWinStreak;
                            playerSocket.request.session.save();
                        }
                    });
                });
            }
        });
        ratingService.updateRatingsAfterGame(game).then(() => {
            db.run("COMMIT", [], (commitErr) => {
                if (commitErr) {
                    console.error("Помилка фіксації транзакції:", commitErr.message);
                } else {
                    console.log(`[updateStatsAfterGame] Транзакція для гри ${game.id} успішно завершена.`);
                }
            });
        }).catch(err => {
            console.error("Помилка в ratingService, відкат транзакції:", err);
            db.run("ROLLBACK");
        });
    });
}

function broadcastGameState(gameId) {
    const game = games[gameId];
    if (!game) return;
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
                        cards: p.id === playerId ? p.cards : p.cards.map(() => ({hidden: true})),
                        isAttacker: p.id === game.attackerId,
                        isDefender: p.id === game.defenderId,
                    };
                }).filter(p => p !== null),
                table: game.table,
                trumpCard: game.trumpCard,
                trumpSuit: game.trumpSuit,
                deckCardCount: game.deck.length,
                isYourTurn: playerId === game.turn && playerForWhomStateIs.cards.length > 0,
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
}

io.on('connection', (socket) => {
    const session = socket.request.session;
    const sessionUser = session?.user;
    if (sessionUser && sessionUser.id) {
        onlineUsers.set(parseInt(sessionUser.id, 10), socket.id);
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
                    options: {reason: reasonText}
                });
                socket.disconnect(true);
            }
        });
    } else {
        console.log(`Клієнт підключився: ${socket.id} (гість)`);
    }
    socket.on('createGame', (settings) => {
        const maintenanceMode = app.get('maintenanceMode');

        if (maintenanceMode.startTime && Date.now() < maintenanceMode.startTime) {
            return socket.emit('error', { i18nKey: 'error_maintenance_scheduled' });
        }
        const {playerName} = settings;
        let gameId = (settings.customId || Math.random().toString(36).substr(2, 6)).toUpperCase();
        if (games[gameId]) {
            return socket.emit('error', {i18nKey: 'error_game_exists', text: `Гра з ID "${gameId}" вже існує.`});
        }
        socket.join(gameId);
        games[gameId] = {
            id: gameId,
            players: {},
            playerOrder: [],
            hostId: socket.id,
            settings: settings,
            deck: [],
            table: [],
            discardPile: [],
            trumpCard: null,
            trumpSuit: null,
            attackerId: null,
            defenderId: null,
            turn: null,
            winner: null,
            rematchVotes: new Set(),
            log: [],
            lastAction: null,
            startTime: null,
            spectators: [],
            musicState: {
                currentTrackId: null,
                isPlaying: false,
                trackTitle: 'Тиша...',
                suggester: null,
                stateChangeTimestamp: null,
                seekTimestamp: 0
            }
        };
        addPlayerToGame(socket, games[gameId], playerName);
        socket.emit('gameCreated', {gameId, playerId: socket.id});
    });
    socket.on('joinGame', ({gameId, playerName}) => {
        const maintenanceMode = app.get('maintenanceMode');
        if (maintenanceMode.startTime && Date.now() < maintenanceMode.startTime) {
            return socket.emit('error', { i18nKey: 'error_maintenance_scheduled' });
        }
        if (!gameId) {
            return socket.emit('error', {i18nKey: 'error_no_game_id'});
        }
        const upperCaseGameId = gameId.toUpperCase();
        const game = games[upperCaseGameId];
        if (game && game.playerOrder.length < game.settings.maxPlayers) {
            socket.join(upperCaseGameId);
            addPlayerToGame(socket, game, playerName);
            socket.emit('joinSuccess', {playerId: socket.id, gameId: upperCaseGameId});
            io.to(upperCaseGameId).emit('playerJoined');
            if (game.musicState.currentTrackId) {
                socket.emit('musicStateUpdate', game.musicState);
            }
        } else {
            socket.emit('error', {i18nKey: 'error_room_full_or_not_exist'});
        }
    });
    socket.on('getLobbyState', ({gameId}) => {
        const game = games[gameId];
        if (game) {
            const playersForLobby = Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                isVerified: p.isVerified,
                streak: p.streak,
                rating: p.rating
            }));
            io.to(gameId).emit('lobbyStateUpdate', {
                players: playersForLobby,
                maxPlayers: game.settings.maxPlayers,
                hostId: game.hostId
            });
        }
    });
    socket.on('forceStartGame', ({gameId}) => {
        const game = games[gameId];
        if (!game || game.hostId !== socket.id) return;
        if (game.playerOrder.length >= 2) {
            game.settings.maxPlayers = game.playerOrder.length;
            startGame(gameId);
        }
    });
    socket.on('sendMessage', ({gameId, message}) => {
        const game = games[gameId];
        const player = game ? game.players[socket.id] : null;
        if (!game || !player || !message) return;
        if (player.is_muted) {
            return socket.emit('systemMessage', {i18nKey: 'error_chat_muted', type: 'error'});
        }
        const trimmedMessage = message.trim();
        if (trimmedMessage.length > 0 && trimmedMessage.length <= 100) {
            const cleanedMessage = trimmedMessage;
            let authorHTML = player.name;
            if (player.isVerified) {
                authorHTML += VERIFIED_BADGE_SVG;
            }
            const chatMessage = `<span class="message-author">${authorHTML}:</span> <span class="message-text">${cleanedMessage}</span>`;
            logEvent(game, chatMessage);
        }
    });
    socket.on('makeMove', ({gameId, card}) => {
        const game = games[gameId];
        if (!game || !game.players[socket.id] || game.winner) return;
        game.lastAction = 'move';
        const player = game.players[socket.id];
        const isDefender = socket.id === game.defenderId;
        const canToss = !isDefender && game.table.length > 0 && game.table.length % 2 === 0;
        if (game.turn !== socket.id && !canToss) {
            return socket.emit('invalidMove', {reason: "error_invalid_move_turn"});
        }
        if (!player.cards.some(c => c.rank === card.rank && c.suit === card.suit)) {
            return socket.emit('invalidMove', {reason: "error_invalid_move_no_card"});
        }
        if (isDefender) {
            if (!canBeat(game.table[game.table.length - 1], card, game.trumpSuit)) {
                return socket.emit('invalidMove', {reason: "error_invalid_move_cannot_beat"});
            }
            logEvent(game, null, {
                i18nKey: 'log_defend',
                options: {name: player.name, rank: card.rank, suit: card.suit}
            });
            game.turn = game.attackerId;
        } else {
            const isAttacking = game.attackerId === socket.id;
            const logKey = isAttacking ? 'log_attack' : 'log_toss';
            if (game.table.length > 0 && !game.table.some(c => c.rank === card.rank)) {
                return socket.emit('invalidMove', {reason: "error_invalid_move_wrong_rank"});
            }
            const defender = game.players[game.defenderId];
            if (!defender) return;
            if ((game.table.length / 2) >= defender.cards.length) {
                return socket.emit('invalidMove', {reason: "error_invalid_move_toss_limit"});
            }
            logEvent(game, null, {i18nKey: logKey, options: {name: player.name, rank: card.rank, suit: card.suit}});
            game.turn = game.defenderId;
        }
        player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        game.table.push(card);
        broadcastGameState(gameId);
    });
    socket.on('passTurn', ({gameId}) => {
        const game = games[gameId];
        if (!game || game.attackerId !== socket.id || game.table.length === 0 || game.table.length % 2 !== 0 || game.winner) return;
        game.lastAction = 'pass';
        const defenderIdBeforeRefill = game.defenderId;
        const defender = game.players[defenderIdBeforeRefill];
        if (defender) {
            const defenderStats = defender.gameStats;
            defenderStats.successfulDefenses += 1;
            defenderStats.cardsBeatenInDefense += game.table.length / 2;
            achievementService.checkInGameAchievements(game, defenderIdBeforeRefill, 'passTurn');
            logEvent(game, null, {i18nKey: 'log_pass', options: {name: defender.name}});
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
    socket.on('takeCards', ({gameId}) => {
        const game = games[gameId];
        if (!game || game.defenderId !== socket.id || game.table.length === 0 || game.winner) return;
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
            logEvent(game, null, {i18nKey: 'log_take', options: {name: defender.name}});
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
    socket.on('requestRematch', ({gameId}) => {
        const game = games[gameId];
        if (!game || !game.players[socket.id]) return;
        game.rematchVotes.add(socket.id);
        const remainingPlayers = game.playerOrder.filter(id => game.players[id]);
        io.to(gameId).emit('rematchUpdate', {votes: game.rematchVotes.size, total: remainingPlayers.length});
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
        let disconnectedUsername = "Гість";

        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                onlineUsers.delete(userId);
                break;
            }
        }

        if (disconnectedUserId) {
            console.log(`[Online Status] User with ID ${disconnectedUserId} disconnected. Total online: ${onlineUsers.size}`);
        } else {
            console.log(`Клієнт відключився: ${socket.id} (гість)`);
        }
        for (const gameId in games) {
            const game = games[gameId];
            const spectatorIndex = game.spectators.indexOf(socket.id);
            if (spectatorIndex > -1) {
                game.spectators.splice(spectatorIndex, 1);
                console.log(`Спостерігач (socket ID: ${socket.id}) покинув гру ${gameId}`);
            }
            if (game.players[socket.id]) {
                const disconnectedPlayer = game.players[socket.id];
                disconnectedUsername = disconnectedPlayer.name;
                console.log(`Гравець ${disconnectedPlayer.name} (${socket.id}) відключився з гри ${gameId}`);
                delete game.players[socket.id];
                game.playerOrder = game.playerOrder.filter(id => id !== socket.id);
                game.rematchVotes.delete(socket.id);
                if (!game.trumpSuit) {
                    if (game.hostId === socket.id) {
                        io.to(gameId).emit('error', {i18nKey: 'error_host_left_lobby'});
                        delete games[gameId];
                        console.log(`Хост вийшов з лобі ${gameId}. Гру видалено.`);
                    } else {
                        io.to(gameId).emit('playerJoined');
                    }
                } else if (!game.winner) {
                    if (game.playerOrder.length < 2) {
                        game.winner = {
                            reason: {
                                i18nKey: 'game_over_player_left',
                                options: {player: disconnectedPlayer.name}
                            }
                        };
                        updateStatsAfterGame(game);
                        broadcastGameState(gameId);
                    } else {
                        logEvent(game, null, {
                            i18nKey: 'log_player_left_continue',
                            options: {name: disconnectedPlayer.name}
                        });
                        if (game.turn === socket.id) {
                            const attackerIndex = game.playerOrder.indexOf(game.attackerId);
                            if (socket.id === game.attackerId || attackerIndex === -1) {
                                const defenderIndex = game.playerOrder.indexOf(game.defenderId);
                                updateTurn(game, defenderIndex !== -1 ? defenderIndex : 0);
                            } else {
                                updateTurn(game, game.playerOrder.indexOf(game.turn));
                            }
                        }
                        broadcastGameState(gameId);
                    }
                } else {
                    const remainingPlayers = game.playerOrder.filter(id => game.players[id]);
                    if (remainingPlayers.length > 0) {
                        io.to(gameId).emit('rematchUpdate', {
                            votes: game.rematchVotes.size,
                            total: remainingPlayers.length
                        });
                    }
                }
                if (Object.keys(game.players).length === 0) {
                    console.log(`Гра ${gameId} порожня, видаляємо.`);
                    delete games[gameId];
                }
                break;
            }
        }
    });
    socket.on('adminSpectateGame', ({gameId}) => {
        const sessionUser = socket.request.session.user;
        if (!sessionUser || !sessionUser.is_admin) {
            return socket.emit('error', {i18nKey: 'error_forbidden_admin_only'});
        }
        const game = games[gameId];
        if (!game) {
            return socket.emit('error', {i18nKey: 'error_game_not_found', text: gameId});
        }
        if (game.players[socket.id]) {
            return socket.emit('error', {i18nKey: 'error_already_in_game_as_player'});
        }
        if (game.spectators.includes(socket.id)) {
            broadcastGameState(gameId);
            return;
        }
        game.spectators.push(socket.id);
        socket.join(gameId);
        console.log(`Адмін ${sessionUser.username} почав спостерігати за грою ${gameId}`);
        logEvent(game, null, {i18nKey: 'log_admin_spectating', options: {adminName: sessionUser.username}});
        broadcastGameState(gameId);
        socket.emit('spectateSuccess', {gameId});
    });
    socket.on('hostChangeTrack', ({gameId, trackId, trackTitle}) => {
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
    socket.on('hostTogglePlayback', ({gameId, isPlaying, currentTime}) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        console.log(`[Music] Хост гри ${gameId} змінив стан відтворення на: ${isPlaying}`);
        game.musicState.isPlaying = isPlaying;
        game.musicState.stateChangeTimestamp = Date.now();
        game.musicState.seekTimestamp = currentTime || 0;
        io.to(gameId).emit('musicStateUpdate', game.musicState);
    });
    socket.on('suggestTrack', ({gameId, trackId, trackTitle}) => {
        const game = games[gameId];
        const suggester = game ? game.players[socket.id] : null;
        if (!game || !game.hostId || !suggester) return;
        if (socket.id === game.hostId) return;
        const hostSocket = io.sockets.sockets.get(game.hostId);
        if (hostSocket) {
            hostSocket.emit('trackSuggested', {trackId, trackTitle, suggesterName: suggester.name});
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

        if(createGameBtn) createGameBtn.disabled = true;
        if(joinGameBtn) joinGameBtn.disabled = true;
    });

    socket.on('maintenanceCancelled', () => {
        isMaintenanceScheduled = false;

        const maintenanceBanner = document.getElementById('maintenance-banner');
        if (maintenanceBanner) maintenanceBanner.style.display = 'none';
        if (maintenanceCountdownInterval) clearInterval(maintenanceCountdownInterval);

        if(createGameBtn) createGameBtn.disabled = false;
        if(joinGameBtn) joinGameBtn.disabled = false;
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
                url: `/?gameId=${gameId}`
            };

            await notificationService.sendNotification(targetUserId, payload);
        } catch (error) {
            console.error(`[Invites] Failed to send push notification for user ${targetUserId}:`, error);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущено на порті ${PORT}`);
});