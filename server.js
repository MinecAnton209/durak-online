require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const db = require('./db');
const authRoutes = require('./routes/auth.js');
const achievementRoutes = require('./routes/achievements.js');
const adminRoutes = require('./routes/admin.js');
const { seedAchievements } = require('./db/seed.js');
const achievementService = require('./services/achievementService.js');


const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.set('socketio', io);

i18next
    .use(Backend)
    .init({
        fallbackLng: 'en',
        ns: ['translation'],
        defaultNS: 'translation',
        backend: {
            loadPath: path.join(__dirname, 'public/locales/{{lng}}/{{ns}}.json'),
        },
        preload: ['en', 'uk']
    });


const PORT = process.env.PORT || 3000;

setTimeout(seedAchievements, 1000);
achievementService.init(io);


const sessionMiddleware = session({
    store: (process.env.DB_CLIENT === 'postgres' && process.env.DATABASE_URL) ?
        new (require('connect-pg-simple')(session))({ pool: db.pool, tableName: 'user_sessions' }) :
        new (require('connect-sqlite3')(session))({ db: 'database.sqlite', dir: './data' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, secure: 'auto' }
});

if (process.env.DB_CLIENT === 'postgres' && process.env.DATABASE_URL) {
    console.log("Сесії будуть зберігатися в PostgreSQL.");
} else {
    console.log("Сесії будуть зберігатися в SQLite.");
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static('public'));
app.use(sessionMiddleware);

app.use('/', authRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/admin', adminRoutes);


app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

const VERIFIED_BADGE_SVG = `
    <span class="verified-badge" title="Верифікований гравець">
        <svg viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0"></path>
        </svg>
    </span>`;

const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
let games = {};
app.set('activeGames', games);

function createDeck(deckSize = 36) { const SUITS = ['♦', '♥', '♠', '♣']; let ranks; switch (deckSize) { case 52: ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; break; case 24: ranks = ['9', '10', 'J', 'Q', 'K', 'A']; break; default: ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; break; } const deck = []; for (const suit of SUITS) { for (const rank of ranks) { deck.push({ suit, rank }); } } for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; } return deck; }
function canBeat(attackCard, defendCard, trumpSuit) { if (!attackCard || !defendCard) return false; if (attackCard.suit === defendCard.suit) return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank]; if (defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit) return true; return false; }
function getNextPlayerIndex(currentIndex, totalPlayers) { if (totalPlayers === 0) return 0; return (currentIndex + 1) % totalPlayers; }
function updateTurn(game, intendedAttackerIndex) {
    if (game.playerOrder.length < 2) return;

    let currentAttackerIndex = intendedAttackerIndex % game.playerOrder.length;
    let attempts = 0;

    while (game.players[game.playerOrder[currentAttackerIndex]] && game.players[game.playerOrder[currentAttackerIndex]].cards.length === 0 && attempts < game.playerOrder.length) {
        currentAttackerIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
        attempts++;
    }
    if (attempts >= game.playerOrder.length) {
        console.warn(`[updateTurn] Не знайдено гравця з картами для атаки в грі ${game.id}`);
        return; 
    }

    game.attackerId = game.playerOrder[currentAttackerIndex];

    let currentDefenderIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
    attempts = 0;

    while (
        (game.players[game.playerOrder[currentDefenderIndex]] && game.players[game.playerOrder[currentDefenderIndex]].cards.length === 0 && game.playerOrder.length > 1) &&
        attempts < game.playerOrder.length
    ) {
        currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        attempts++;
        if(game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex) {
            currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        }
    }
    if (attempts >= game.playerOrder.length || (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex) ) {
        console.warn(`[updateTurn] Не знайдено гравця з картами для захисту в грі ${game.id} або захисник = атакуючий.`);
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
        isVerified: sessionUser ? sessionUser.isVerified : false,
        is_muted: sessionUser ? sessionUser.is_muted : false,
        cards: [],
        gameStats: {
            cardsTaken: 0,
            successfulDefenses: 0,
            cardsBeatenInDefense: 0
        }
    };
    game.playerOrder.push(socket.id);
}
function logEvent(game, message, options = {}) {
    if (!game.log) game.log = [];
    const timestamp = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const logEntry = { timestamp, ...options };
    if(typeof message === 'string' && !options.i18nKey) {
        logEntry.message = message;
    }

    game.log.push(logEntry);
    if (game.log.length > 50) game.log.shift();
    io.to(game.id).emit('newLogEntry', logEntry);
}
function startGame(gameId) { const game = games[gameId]; if (!game) return; game.startTime = new Date(); game.deck = createDeck(game.settings.deckSize); game.trumpCard = game.deck.length > 0 ? game.deck[game.deck.length - 1] : { suit: '♠', rank: ''}; game.trumpSuit = game.trumpCard.suit; let firstAttackerIndex = 0; let minTrumpRank = Infinity; game.playerOrder.forEach((playerId, index) => { const player = game.players[playerId]; player.cards = game.deck.splice(0, 6); player.cards.forEach(card => { if (card.suit === game.trumpSuit && RANK_VALUES[card.rank] < minTrumpRank) { minTrumpRank = RANK_VALUES[card.rank]; firstAttackerIndex = index; } }); }); logEvent(game, null, { i18nKey: 'log_game_start', options: { trump: game.trumpSuit, player: game.players[game.playerOrder[firstAttackerIndex]].name } }); updateTurn(game, firstAttackerIndex); broadcastGameState(gameId); }
function refillHands(game) { const attackerIndex = game.playerOrder.indexOf(game.attackerId); if(attackerIndex === -1) return; for (let i = 0; i < game.playerOrder.length; i++) { const playerIndex = (attackerIndex + i) % game.playerOrder.length; const player = game.players[game.playerOrder[playerIndex]]; if(player) { const cardsToDraw = 6 - player.cards.length; if (cardsToDraw > 0 && game.deck.length > 0) { const drawnCards = game.deck.splice(0, cardsToDraw); player.cards.push(...drawnCards); logEvent(game, null, { i18nKey: 'log_draw_cards', options: { name: player.name, count: drawnCards.length } }); } } } }
function checkGameOver(game) { if (game.deck.length === 0) { const playersWithCards = game.playerOrder.map(id => game.players[id]).filter(p => p && p.cards.length > 0); if (playersWithCards.length <= 1) { const loser = playersWithCards.length === 1 ? playersWithCards[0] : null; const winners = game.playerOrder.map(id => game.players[id]).filter(p => p && p.cards.length === 0); game.winner = { winners, loser }; return true; } } return false; }
function updateStatsAfterGame(game) {
    if (!game.winner || !game.startTime) return;
    const endTime = new Date(); const durationSeconds = Math.round((endTime - game.startTime) / 1000); const minDuration = parseInt(process.env.MIN_GAME_DURATION_SECONDS, 10) || 30; const isSuspicious = durationSeconds < minDuration;
    db.run(`INSERT INTO games_history (game_id, start_time, end_time, duration_seconds, players_count, is_suspicious) VALUES (?, ?, ?, ?, ?, ?)`, [game.id, game.startTime.toISOString(), endTime.toISOString(), durationSeconds, game.playerOrder.length, isSuspicious], (err) => { if (err) { console.error("Помилка запису в історію ігор:", err.message); } else if (isSuspicious) { console.warn(`ПОПЕРЕДЖЕННЯ: Гра ${game.id} завершилася занадто швидко (${durationSeconds} сек) і позначена як підозріла.`); } });
    const { winners, loser } = game.winner; const allPlayersInGame = [...winners, loser].filter(p => p);
    allPlayersInGame.forEach(player => {
        if (player && !player.isGuest) {
            db.get(`SELECT streak_count, last_played_date, wins, losses, win_streak FROM users WHERE id = ?`, [player.dbId], (err, userData) => {
                if (err || !userData) return;

                const isWinner = winners.some(w => w.id === player.id);
                let newWinStreak = isWinner ? (userData.win_streak || 0) + 1 : 0;

                achievementService.checkPostGameAchievements(game, player, userData, newWinStreak);

                const today = new Date().toISOString().slice(0, 10); const lastPlayed = userData.last_played_date; let newStreak = 1;
                if (lastPlayed) { const lastDate = new Date(lastPlayed); const todayDate = new Date(today); const diffTime = Math.abs(todayDate - lastDate); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); if (diffDays === 0) newStreak = userData.streak_count; else if (diffDays === 1) newStreak = userData.streak_count + 1; }

                const query = isWinner
                    ? `UPDATE users SET wins = wins + 1, streak_count = ?, last_played_date = ?, win_streak = ? WHERE id = ?`
                    : `UPDATE users SET losses = losses + 1, streak_count = ?, last_played_date = ?, win_streak = 0 WHERE id = ?`;
                const params = isWinner
                    ? [newStreak, today, newWinStreak, player.dbId]
                    : [newStreak, today, player.dbId];

                db.run(query, params, (updateErr) => {
                    if (updateErr) console.error("Помилка оновлення статистики:", updateErr.message);
                    else {
                        const playerSocket = io.sockets.sockets.get(player.id);
                        if (playerSocket && playerSocket.request.session.user) {
                            if (isWinner) playerSocket.request.session.user.wins++; else playerSocket.request.session.user.losses++;
                            playerSocket.request.session.user.streak = newStreak;
                            playerSocket.request.session.user.win_streak = newWinStreak;
                            playerSocket.request.session.save();
                        }
                    }
                });
            });
        }
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
                players: game.playerOrder.map(id => {
                    const p = game.players[id];
                    if (!p) return null;
                    return {
                        id: p.id,
                        name: p.name,
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
                canPass: playerId === game.attackerId && game.table.length > 0 && game.table.length % 2 === 0,
                canTake: playerId === game.defenderId && game.table.length > 0,
                winner: game.winner,
                lastAction: game.lastAction
            };
            playerSocket.emit('gameStateUpdate', stateForPlayer);
        }
    });
}

io.on('connection', (socket) => {
    const sessionUser = socket.request.session.user;

    if (sessionUser) {
        db.get('SELECT is_banned, ban_reason FROM users WHERE id = ?', [sessionUser.id], (err, dbUser) => {
            if (err) {
                console.error(`Помилка перевірки статусу бану для користувача ${sessionUser.id}:`, err.message);
                socket.disconnect(true);
                return;
            }
            if (dbUser && dbUser.is_banned) {
                const reasonText = dbUser.ban_reason || i18next.t('ban_reason_not_specified');
                console.log(`Користувач ${sessionUser.username} (ID: ${sessionUser.id}) забанений. Причина: ${reasonText}. Відключення сокету.`);
                socket.emit('forceDisconnect', {
                    i18nKey: 'error_account_banned_with_reason',
                    options: { reason: reasonText }
                });
                socket.disconnect(true);
                return;
            }
            console.log(`Клієнт підключився: ${socket.id}, користувач: ${sessionUser.username}`);
        });
    } else {
        console.log(`Клієнт підключився: ${socket.id} (гість)`);
    }

    socket.on('createGame', (settings) => { const { playerName } = settings; let gameId = (settings.customId || Math.random().toString(36).substr(2, 6)).toUpperCase(); if (games[gameId]) { return socket.emit('error', {i18nKey: 'error_game_exists', text: `Гра з ID "${gameId}" вже існує.`}); } socket.join(gameId); games[gameId] = { id: gameId, players: {}, playerOrder: [], hostId: socket.id, settings: settings, deck: [], table: [], discardPile: [], trumpCard: null, trumpSuit: null, attackerId: null, defenderId: null, turn: null, winner: null, rematchVotes: new Set(), log: [], lastAction: null, startTime: null }; addPlayerToGame(socket, games[gameId], playerName); socket.emit('gameCreated', { gameId, playerId: socket.id }); });
    socket.on('joinGame', ({ gameId, playerName }) => { if (!gameId) { return socket.emit('error', {i18nKey: 'error_no_game_id', text: 'ID гри не вказано.'}); } const upperCaseGameId = gameId.toUpperCase(); const game = games[upperCaseGameId]; if (game && game.playerOrder.length < game.settings.maxPlayers) { socket.join(upperCaseGameId); addPlayerToGame(socket, game, playerName); socket.emit('joinSuccess', { playerId: socket.id, gameId: upperCaseGameId }); io.to(upperCaseGameId).emit('playerJoined'); } else { socket.emit('error', {i18nKey: 'error_room_full_or_not_exist', text: 'Кімната не існує або вже повна.'}); } });
    socket.on('getLobbyState', ({ gameId }) => { const game = games[gameId]; if (game) { io.to(gameId).emit('lobbyStateUpdate', { players: Object.values(game.players), maxPlayers: game.settings.maxPlayers, hostId: game.hostId }); } });
    socket.on('forceStartGame', ({ gameId }) => { const game = games[gameId]; if (!game || game.hostId !== socket.id) return; if (game.playerOrder.length >= 2) { game.settings.maxPlayers = game.playerOrder.length; startGame(gameId); } });
    socket.on('sendMessage', ({ gameId, message }) => {
        const game = games[gameId];
        const player = game ? game.players[socket.id] : null;
        if (!game || !player || !message) return;

        if (player.is_muted) {
            socket.emit('systemMessage', { i18nKey: 'error_chat_muted', type: 'error' });
            return;
        }
        const trimmedMessage = message.trim();
        if (trimmedMessage.length > 0 && trimmedMessage.length <= 100) {
            let authorHTML = player.name;
            if (player.isVerified) {
                authorHTML += VERIFIED_BADGE_SVG;
            }
            const chatMessage = `<span class="message-author">${authorHTML}:</span> <span class="message-text">${trimmedMessage}</span>`;
            logEvent(game, chatMessage);
        }
    });
    socket.on('makeMove', ({ gameId, card }) => {
        const game = games[gameId]; if (!game || !game.players[socket.id] || game.winner) return;
        game.lastAction = 'move';
        const player = game.players[socket.id]; const isDefender = socket.id === game.defenderId; const canToss = !isDefender && game.table.length > 0 && game.table.length % 2 === 0;
        if (game.turn !== socket.id && !canToss) { return socket.emit('invalidMove', { reason: "error_invalid_move_turn" }); }
        if (!player.cards.some(c => c.rank === card.rank && c.suit === card.suit)) { return socket.emit('invalidMove', { reason: "error_invalid_move_no_card" }); }
        if (isDefender) {
            if (!canBeat(game.table[game.table.length - 1], card, game.trumpSuit)) { return socket.emit('invalidMove', { reason: "error_invalid_move_cannot_beat" }); }
            logEvent(game, null, { i18nKey: 'log_defend', options: { name: player.name, rank: card.rank, suit: card.suit } });
            game.turn = game.attackerId;
        } else {
            const isAttacking = game.attackerId === socket.id;
            const logKey = isAttacking ? 'log_attack' : 'log_toss';
            if (game.table.length > 0 && !game.table.some(c => c.rank === card.rank)) { return socket.emit('invalidMove', { reason: "error_invalid_move_wrong_rank" }); }
            const defender = game.players[game.defenderId]; if (!defender) return;
            if ((game.table.length / 2) >= defender.cards.length) { return socket.emit('invalidMove', { reason: "error_invalid_move_toss_limit" }); }
            logEvent(game, null, { i18nKey: logKey, options: { name: player.name, rank: card.rank, suit: card.suit } });
            game.turn = game.defenderId;
        }
        player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        game.table.push(card);
        broadcastGameState(gameId);
    });
    socket.on('passTurn', ({ gameId }) => {
        const game = games[gameId]; if (!game || game.attackerId !== socket.id || game.table.length === 0 || game.table.length % 2 !== 0 || game.winner) return;
        game.lastAction = 'pass'; const defenderIdBeforeRefill = game.defenderId;

        const defender = game.players[defenderIdBeforeRefill];
        if (defender) {
            const defenderStats = defender.gameStats;
            defenderStats.successfulDefenses += 1;
            defenderStats.cardsBeatenInDefense += game.table.length / 2;
            achievementService.checkInGameAchievements(game, defenderIdBeforeRefill, 'passTurn');
            logEvent(game, null, { i18nKey: 'log_pass', options: { name: defender.name } });
        }

        game.discardPile.push(...game.table); game.table = [];
        refillHands(game);
        if (checkGameOver(game)) { updateStatsAfterGame(game); return broadcastGameState(gameId); }
        let defenderIndex = game.playerOrder.indexOf(defenderIdBeforeRefill); if(defenderIndex === -1) defenderIndex = 0;
        const nextAttacker = game.players[game.playerOrder[defenderIndex]];
        if(nextAttacker && nextAttacker.cards.length === 0) { defenderIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length); }
        updateTurn(game, defenderIndex);
        broadcastGameState(gameId);
    });
    socket.on('takeCards', ({ gameId }) => {
        const game = games[gameId]; if (!game || game.defenderId !== socket.id || game.table.length === 0 || game.winner) return;
        game.lastAction = 'take';

        const defender = game.players[game.defenderId];
        if(defender) {
            const defenderStats = defender.gameStats;
            defenderStats.cardsTaken += game.table.length;
            logEvent(game, null, { i18nKey: 'log_take', options: { name: defender.name } });
            defender.cards.push(...game.table);
        }
        game.table = [];

        refillHands(game);
        if (checkGameOver(game)) { updateStatsAfterGame(game); return broadcastGameState(gameId); }
        const defenderIndex = game.playerOrder.indexOf(game.defenderId);
        const nextPlayerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
        updateTurn(game, nextPlayerIndex);
        broadcastGameState(gameId);
    });
    socket.on('requestRematch', ({ gameId }) => { const game = games[gameId]; if (!game || !game.players[socket.id]) return; game.rematchVotes.add(socket.id); const remainingPlayers = Object.keys(game.players); io.to(gameId).emit('rematchUpdate', { votes: game.rematchVotes.size, total: remainingPlayers.length }); if (game.rematchVotes.size === remainingPlayers.length && remainingPlayers.length >= 2) { game.table = []; game.discardPile = []; game.winner = null; game.rematchVotes.clear(); game.playerOrder.sort(() => Math.random() - 0.5); setTimeout(() => startGame(gameId), 1000); } });
    socket.on('disconnect', () => {
        console.log(`Клієнт відключився: ${socket.id}`);
        for (const gameId in games) {
            const game = games[gameId];
            if (game.players[socket.id]) {
                const disconnectedPlayer = game.players[socket.id];
                console.log(`Гравець ${disconnectedPlayer.name} (${socket.id}) відключився з гри ${gameId}`);
                delete game.players[socket.id];
                game.playerOrder = game.playerOrder.filter(id => id !== socket.id);
                game.rematchVotes.delete(socket.id);
                if (!game.trumpSuit) {
                    if (game.hostId === socket.id) {
                        io.to(gameId).emit('error', { i18nKey: 'error_host_left_lobby', text: 'Хост вийшов. Гру скасовано.' });
                        delete games[gameId];
                        console.log(`Хост вийшов з лобі ${gameId}. Гру видалено.`);
                    } else {
                        io.to(gameId).emit('playerJoined');
                    }
                } else if (!game.winner) {
                    if (game.playerOrder.length < 2) {
                        logEvent(game, null, { i18nKey: 'log_player_left_game_over', options: { name: disconnectedPlayer.name } });
                        game.winner = { reason: { i18nKey: 'game_over_player_left', options: { player: disconnectedPlayer.name } } };
                    } else {
                        logEvent(game, null, { i18nKey: 'log_player_left_continue', options: { name: disconnectedPlayer.name } });
                        if (game.turn === socket.id) {
                            const attackerIndex = game.playerOrder.indexOf(game.attackerId);
                            if (socket.id === game.attackerId || attackerIndex === -1) {
                                const defenderIndex = game.playerOrder.indexOf(game.defenderId);
                                updateTurn(game, defenderIndex !== -1 ? defenderIndex : 0);
                            } else {
                                const currentTurnIndex = game.playerOrder.indexOf(game.turn);
                                updateTurn(game, currentTurnIndex !== -1 ? currentTurnIndex : 0);
                            }
                        }
                    }
                    broadcastGameState(gameId);
                } else {
                    const remainingPlayers = Object.keys(game.players);
                    if (remainingPlayers.length > 0) {
                        io.to(gameId).emit('rematchUpdate', { votes: game.rematchVotes.size, total: remainingPlayers.length });
                    }
                }
                if (game.playerOrder.length === 0 && Object.keys(game.players).length === 0) {
                    console.log(`Гра ${gameId} порожня, видаляємо.`);
                    delete games[gameId];
                }
                break;
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущено на порті ${PORT}`);
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports.games = games;
}