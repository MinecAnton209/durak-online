const crypto = require('crypto');
const db = require('../db');
const util = require('util');
const achievementService = require('../services/achievementService.js');
const ratingService = require('../services/ratingService.js');
const statsService = require('../services/statsService.js');

const dbRun = util.promisify(db.run.bind(db));
const dbGet = util.promisify(db.get.bind(db));

const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
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

function logEvent(io, game, message, options = {}) {
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

async function startGame(io, games, gameId) {
    const game = games[gameId];
    if (!game) return;
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
    logEvent(io, game, null, {
        i18nKey: 'log_game_start',
        options: {trump: game.trumpSuit, player: game.players[game.playerOrder[firstAttackerIndex]].name}
    });
    updateTurn(game, firstAttackerIndex);
    broadcastGameState(io, games, gameId);
}

function refillHands(io, game) {
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
                logEvent(io, game, null, {
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

async function updateStatsAfterGame(io, game) {
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
            if (player && !player.isGuest) {
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

        await ratingService.updateRatingsAfterGame(game);

        await dbRun("COMMIT");

    } catch (error) {
        console.error(`[GAME END ${game.id}] FATAL ERROR during stats update. Rolling back.`, error);
        try {
            await dbRun("ROLLBACK");
            console.log(`[GAME END ${game.id}] Transaction rolled back successfully.`);
        } catch (rollbackError) {
            console.error(`[GAME END ${game.id}] CRITICAL: Failed to roll back transaction!`, rollbackError);
        }
    }
}

function broadcastGameState(io, games, gameId) {
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

module.exports = {
    createDeck,
    canBeat,
    getNextPlayerIndex,
    updateTurn,
    addPlayerToGame,
    logEvent,
    startGame,
    refillHands,
    checkGameOver,
    updateStatsAfterGame,
    broadcastGameState,
    RANK_VALUES
};