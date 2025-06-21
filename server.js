require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const authRoutes = require('./routes/auth.js');
const db = require('./database.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

const sessionMiddleware = session({
    store: new SQLiteStore({
        db: 'database.sqlite',
        dir: './data'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: 'auto'
    }
});

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static('public'));
app.use(sessionMiddleware);
app.use('/', authRoutes);

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
let games = {};

function createDeck(deckSize = 36) {
    const SUITS = ['♦', '♥', '♠', '♣'];
    let ranks;
    switch (deckSize) {
        case 52: ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; break;
        case 24: ranks = ['9', '10', 'J', 'Q', 'K', 'A']; break;
        default: ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; break;
    }
    const deck = [];
    for (const suit of SUITS) { for (const rank of ranks) { deck.push({ suit, rank }); } }
    for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return deck;
}
function canBeat(attackCard, defendCard, trumpSuit) {
    if (attackCard.suit === defendCard.suit) return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank];
    if (defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit) return true;
    return false;
}
function getNextPlayerIndex(currentIndex, totalPlayers) { if (totalPlayers === 0) return 0; return (currentIndex + 1) % totalPlayers; }
function updateTurn(game, newAttackerIndex) {
    if (game.playerOrder.length === 0) return;
    const safeIndex = newAttackerIndex % game.playerOrder.length;
    game.attackerId = game.playerOrder[safeIndex];
    const defenderIndex = getNextPlayerIndex(safeIndex, game.playerOrder.length);
    game.defenderId = game.playerOrder[defenderIndex];
    game.turn = game.attackerId;
}
function addPlayerToGame(socket, game, playerName) {
    const sessionUser = socket.request.session.user;
    game.players[socket.id] = {
        id: socket.id,
        name: sessionUser ? sessionUser.username : playerName,
        dbId: sessionUser ? sessionUser.id : null,
        isGuest: !sessionUser,
        cards: []
    };
    game.playerOrder.push(socket.id);
}

function startGame(gameId) {
    const game = games[gameId];
    if (!game) return;
    game.deck = createDeck(game.settings.deckSize);
    game.trumpCard = game.deck[game.deck.length - 1];
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
    logEvent(game, `Гра почалася! Козир: ${game.trumpSuit}. Перший хід за ${game.players[game.playerOrder[firstAttackerIndex]].name}.`);
    updateTurn(game, firstAttackerIndex);
    broadcastGameState(gameId);
}
function refillHands(game) {
    const attackerIndex = game.playerOrder.indexOf(game.attackerId);
    if(attackerIndex === -1) return;
    for (let i = 0; i < game.playerOrder.length; i++) {
        const playerIndex = (attackerIndex + i) % game.playerOrder.length;
        const player = game.players[game.playerOrder[playerIndex]];
        if(player) {
            const cardsToDraw = 6 - player.cards.length;
            if (cardsToDraw > 0 && game.deck.length > 0) {
                const drawnCards = game.deck.splice(0, cardsToDraw);
                player.cards.push(...drawnCards);
                logEvent(game, `${player.name} добирає ${drawnCards.length} карт(и).`);
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
function updateStatsAfterGame(game) {
    if (!game.winner) return;
    const { winners, loser } = game.winner;
    winners.forEach(winner => {
        if (winner && !winner.isGuest) {
            db.run(`UPDATE users SET wins = wins + 1 WHERE id = ?`, [winner.dbId], (err) => {
                if (err) { console.error("Помилка оновлення перемог:", err.message); }
                else {
                    const winnerSocket = io.sockets.sockets.get(winner.id);
                    if (winnerSocket && winnerSocket.request.session.user) {
                        winnerSocket.request.session.user.wins++;
                        winnerSocket.request.session.save();
                    }
                }
            });
        }
    });
    if (loser && !loser.isGuest) {
        db.run(`UPDATE users SET losses = losses + 1 WHERE id = ?`, [loser.dbId], (err) => {
            if (err) { console.error("Помилка оновлення поразок:", err.message); }
            else {
                const loserSocket = io.sockets.sockets.get(loser.id);
                if (loserSocket && loserSocket.request.session.user) {
                    loserSocket.request.session.user.losses++;
                    loserSocket.request.session.save();
                }
            }
        });
    }
}
function logEvent(game, message) {
    if (!game.log) game.log = [];
    const timestamp = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = { timestamp, message };
    game.log.push(logEntry);
    if (game.log.length > 50) game.log.shift();
    io.to(game.id).emit('newLogEntry', logEntry);
}
function broadcastGameState(gameId) {
    const game = games[gameId];
    if (!game) return;
    game.playerOrder.forEach(playerId => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            const stateForPlayer = {
                gameId: game.id,
                players: game.playerOrder.map(id => { const p = game.players[id]; if(!p) return null; return { id: p.id, name: p.name, cards: p.id === playerId ? p.cards : p.cards.map(() => ({ hidden: true })), isAttacker: p.id === game.attackerId, isDefender: p.id === game.defenderId, } }).filter(p => p !== null),
                table: game.table, trumpCard: game.trumpCard, trumpSuit: game.trumpSuit, deckCardCount: game.deck.length,
                isYourTurn: playerId === game.turn, canPass: playerId === game.attackerId && game.table.length > 0 && game.table.length % 2 === 0,
                canTake: playerId === game.defenderId && game.table.length > 0, winner: game.winner, lastAction: game.lastAction
            };
            playerSocket.emit('gameStateUpdate', stateForPlayer);
        }
    });
}

io.on('connection', (socket) => {
    socket.on('createGame', (settings) => { const { playerName } = settings; let gameId = (settings.customId || Math.random().toString(36).substr(2, 6)).toUpperCase(); if (games[gameId]) { return socket.emit('error', `Гра з ID "${gameId}" вже існує.`); } socket.join(gameId); games[gameId] = { id: gameId, players: {}, playerOrder: [], hostId: socket.id, settings: settings, deck: [], table: [], discardPile: [], trumpCard: null, trumpSuit: null, attackerId: null, defenderId: null, turn: null, winner: null, rematchVotes: new Set(), log: [], lastAction: null }; addPlayerToGame(socket, games[gameId], playerName); socket.emit('gameCreated', { gameId, playerId: socket.id }); });
    socket.on('joinGame', ({ gameId, playerName }) => { if (!gameId) { return socket.emit('error', 'ID гри не вказано.'); } const upperCaseGameId = gameId.toUpperCase(); const game = games[upperCaseGameId]; if (game && game.playerOrder.length < game.settings.maxPlayers) { socket.join(upperCaseGameId); addPlayerToGame(socket, game, playerName); socket.emit('joinSuccess', { playerId: socket.id, gameId: upperCaseGameId }); io.to(upperCaseGameId).emit('playerJoined'); } else { socket.emit('error', 'Кімната не існує або вже повна.'); } });
    socket.on('getLobbyState', ({ gameId }) => { const game = games[gameId]; if (game) { io.to(gameId).emit('lobbyStateUpdate', { players: Object.values(game.players), maxPlayers: game.settings.maxPlayers, hostId: game.hostId }); } });
    socket.on('forceStartGame', ({ gameId }) => { const game = games[gameId]; if (!game || game.hostId !== socket.id) return; if (game.playerOrder.length >= 2) { game.settings.maxPlayers = game.playerOrder.length; startGame(gameId); } });
    socket.on('makeMove', ({ gameId, card }) => {
        const game = games[gameId]; if (!game || !game.players[socket.id] || game.winner) return;
        game.lastAction = 'move';
        const player = game.players[socket.id]; const isDefender = socket.id === game.defenderId; const canToss = !isDefender && game.table.length > 0 && game.table.length % 2 === 0;
        if (game.turn !== socket.id && !canToss) { return socket.emit('invalidMove', { reason: "Зараз не ваш хід." }); }
        if (!player.cards.some(c => c.rank === card.rank && c.suit === card.suit)) { return socket.emit('invalidMove', { reason: "Шахраювати не можна!" }); }
        if (isDefender) {
            if (!canBeat(game.table[game.table.length - 1], card, game.trumpSuit)) { return socket.emit('invalidMove', { reason: "Цією картою не можна побити." }); }
            logEvent(game, `${player.name} відбивається картою ${card.rank}${card.suit}.`);
            game.turn = game.attackerId;
        } else {
            if (game.table.length > 0 && !game.table.some(c => c.rank === card.rank)) { return socket.emit('invalidMove', { reason: "Підкидати можна лише карти того ж номіналу." }); }
            const defender = game.players[game.defenderId]; if (!defender) return;
            if ((game.table.length / 2) >= defender.cards.length) { return socket.emit('invalidMove', { reason: "Не можна підкидати більше карт, ніж є у захисника." }); }
            logEvent(game, `${player.name} ходить картою ${card.rank}${card.suit}.`);
            game.turn = game.defenderId;
        }
        player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        game.table.push(card);
        broadcastGameState(gameId);
    });
    socket.on('passTurn', ({ gameId }) => {
        const game = games[gameId]; if (!game || game.attackerId !== socket.id || game.table.length === 0 || game.table.length % 2 !== 0 || game.winner) return;
        game.lastAction = 'pass';
        const defenderIdBeforeRefill = game.defenderId;
        logEvent(game, `Відбій. Хід переходить до ${game.players[defenderIdBeforeRefill].name}.`);
        game.discardPile.push(...game.table); game.table = [];
        refillHands(game);
        if (checkGameOver(game)) { updateStatsAfterGame(game); return broadcastGameState(gameId); }
        let defenderIndex = game.playerOrder.indexOf(defenderIdBeforeRefill); if(defenderIndex === -1) defenderIndex = 0;
        updateTurn(game, defenderIndex);
        broadcastGameState(gameId);
    });
    socket.on('takeCards', ({ gameId }) => {
        const game = games[gameId]; if (!game || game.defenderId !== socket.id || game.table.length === 0 || game.winner) return;
        game.lastAction = 'take';
        logEvent(game, `${game.players[game.defenderId].name} бере карти.`);
        game.players[game.defenderId].cards.push(...game.table); game.table = [];
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
                delete game.players[socket.id];
                game.playerOrder = game.playerOrder.filter(id => id !== socket.id);
                game.rematchVotes.delete(socket.id);
                if (game.trumpSuit) {
                    if (game.playerOrder.length < 2) {
                        game.winner = { reason: `Гравець ${disconnectedPlayer.name} вийшов. Гру завершено.` };
                        broadcastGameState(gameId);
                    } else if (!game.winner) {
                         if (game.turn === socket.id) {
                            const attackerIndex = game.playerOrder.indexOf(game.attackerId);
                            if(attackerIndex === -1) { updateTurn(game, 0); }
                            else { const nextPlayerIndex = getNextPlayerIndex(attackerIndex, game.playerOrder.length); updateTurn(game, nextPlayerIndex); }
                         }
                         broadcastGameState(gameId);
                    } else {
                        const remainingPlayers = Object.keys(game.players);
                        if (game.rematchVotes.size === remainingPlayers.length && remainingPlayers.length >= 2) {
                            game.table = []; game.discardPile = []; game.winner = null; game.rematchVotes.clear();
                            game.playerOrder.sort(() => Math.random() - 0.5);
                            setTimeout(() => startGame(gameId), 1000);
                        } else {
                            io.to(gameId).emit('rematchUpdate', { votes: game.rematchVotes.size, total: remainingPlayers.length });
                        }
                    }
                } else {
                    if (game.hostId === socket.id) {
                        io.to(gameId).emit('error', 'Хост вийшов. Гру скасовано.');
                        delete games[gameId];
                    } else {
                        io.to(gameId).emit('playerJoined');
                    }
                }
                if (Object.keys(game.players).length === 0) { delete games[gameId]; }
                break;
            }
        }
    });
});

server.listen(PORT, () => console.log(`Сервер запущено на порті ${PORT}`));