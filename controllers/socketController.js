const db = require('../db');
const economyService = require('../services/economyService');
const notificationService = require('../services/notificationService');
const gameController = require('./gameController');
const rouletteController = require('./rouletteController');

const VERIFIED_BADGE_SVG = `<span class="verified-badge" title="Верифікований гравець"><svg viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0"></path></svg></span>`;

const games = {};
const onlineUsers = new Map();

function initializeSocket(io, app, i18next) {
    app.set('onlineUsers', onlineUsers);
    app.set('activeGames', games);

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
            const betAmount = settings.betAmount || 0;

            if (maintenanceMode.startTime && Date.now() < maintenanceMode.startTime) {
                return socket.emit('error', { i18nKey: 'error_maintenance_scheduled' });
            }
            if (betAmount > 0) {
                if (!sessionUser) {
                    return socket.emit('error', { i18nKey: 'error_guests_cannot_bet' });
                }
                if (sessionUser.coins < betAmount) {
                    return socket.emit('error', { i18nKey: 'error_not_enough_coins_host' });
                }
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
            gameController.addPlayerToGame(socket, games[gameId], playerName);
            socket.emit('gameCreated', {gameId, playerId: socket.id});
        });
        socket.on('joinGame', async ({gameId, playerName}) => {
            const maintenanceMode = app.get('maintenanceMode');
            if (maintenanceMode.startTime && Date.now() < maintenanceMode.startTime) {
                return socket.emit('error', { i18nKey: 'error_maintenance_scheduled' });
            }
            if (!gameId) {
                return socket.emit('error', {i18nKey: 'error_no_game_id'});
            }

            const upperCaseGameId = gameId.toUpperCase();
            const game = games[upperCaseGameId];

            if (!game) {
                return socket.emit('error', {i18nKey: 'error_room_full_or_not_exist'});
            }

            const sessionUser = socket.request.session?.user;

            if (sessionUser) {
                const isAlreadyInGame = Object.values(game.players).some(
                    player => player.dbId === sessionUser.id
                );
                if (isAlreadyInGame) {
                    return socket.emit('error', { i18nKey: 'error_already_in_game' });
                }
            }

            const betAmount = game.settings.betAmount || 0;

            if (betAmount > 0) {
                if (!sessionUser) {
                    return socket.emit('error', { i18nKey: 'error_guests_cannot_bet' });
                }

                try {
                    const dbUser = await rouletteController.dbGet('SELECT coins FROM users WHERE id = ?', [sessionUser.id]);
                    if (!dbUser) {
                        return socket.emit('error', { i18nKey: 'error_database' });
                    }
                    if (dbUser.coins < betAmount) {
                        return socket.emit('error', { i18nKey: 'error_not_enough_coins_join' });
                    }
                    socket.request.session.user.coins = dbUser.coins;
                    socket.request.session.save();
                } catch (error) {
                    console.error("DB error on checking balance:", error);
                    return socket.emit('error', { i18nKey: 'error_database' });
                }
            }

            if (game.playerOrder.length < game.settings.maxPlayers) {
                socket.join(upperCaseGameId);
                gameController.addPlayerToGame(socket, game, playerName);
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
                gameController.startGame(io, games, gameId);
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
                gameController.logEvent(io, game, chatMessage);
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
                if (!gameController.canBeat(game.table[game.table.length - 1], card, game.trumpSuit)) {
                    return socket.emit('invalidMove', {reason: "error_invalid_move_cannot_beat"});
                }
                gameController.logEvent(io, game, null, {
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
                gameController.logEvent(io, game, null, {i18nKey: logKey, options: {name: player.name, rank: card.rank, suit: card.suit}});
                game.turn = game.defenderId;
            }
            player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
            game.table.push(card);
            gameController.broadcastGameState(io, games, gameId);
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
                gameController.logEvent(io, game, null, {i18nKey: 'log_pass', options: {name: defender.name}});
            }
            game.discardPile.push(...game.table);
            game.table = [];
            gameController.refillHands(io, game);
            if (gameController.checkGameOver(game)) {
                gameController.updateStatsAfterGame(io, game);
                return gameController.broadcastGameState(io, games, gameId);
            }
            let defenderIndex = game.playerOrder.indexOf(defenderIdBeforeRefill);
            if (defenderIndex === -1) defenderIndex = 0;
            gameController.updateTurn(game, defenderIndex);
            gameController.broadcastGameState(io, games, gameId);
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
                gameController.logEvent(io, game, null, {i18nKey: 'log_take', options: {name: defender.name}});
                defender.cards.push(...game.table);
            }
            game.table = [];
            gameController.refillHands(io, game);
            if (gameController.checkGameOver(game)) {
                gameController.updateStatsAfterGame(io, game);
                return gameController.broadcastGameState(io, games, gameId);
            }
            const defenderIndex = game.playerOrder.indexOf(game.defenderId);
            const nextPlayerIndex = gameController.getNextPlayerIndex(defenderIndex, game.playerOrder.length);
            gameController.updateTurn(game, nextPlayerIndex);
            gameController.broadcastGameState(io, games, gameId);
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
                setTimeout(() => gameController.startGame(io, games, gameId), 1000);
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
                            gameController.updateStatsAfterGame(io, game);
                            gameController.broadcastGameState(io, games, gameId);
                        } else {
                            gameController.logEvent(io, game, null, {
                                i18nKey: 'log_player_left_continue',
                                options: {name: disconnectedPlayer.name}
                            });
                            if (game.turn === socket.id) {
                                const attackerIndex = game.playerOrder.indexOf(game.attackerId);
                                if (socket.id === game.attackerId || attackerIndex === -1) {
                                    const defenderIndex = game.playerOrder.indexOf(game.defenderId);
                                    gameController.updateTurn(game, defenderIndex !== -1 ? defenderIndex : 0);
                                } else {
                                    gameController.updateTurn(game, game.playerOrder.indexOf(game.turn));
                                }
                            }
                            gameController.broadcastGameState(io, games, gameId);
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
                gameController.broadcastGameState(io, games, gameId);
                return;
            }
            game.spectators.push(socket.id);
            socket.join(gameId);
            console.log(`Адмін ${sessionUser.username} почав спостерігати за грою ${gameId}`);
            gameController.logEvent(io, game, null, {i18nKey: 'log_admin_spectating', options: {adminName: sessionUser.username}});
            gameController.broadcastGameState(io, games, gameId);
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
        socket.on('roulette:getState', () => {
            socket.emit('roulette:updateState', rouletteController.rouletteState);
            if (socket.request.session.user) {
                db.get('SELECT coins FROM users WHERE id = ?', [socket.request.session.user.id], (err, user) => {
                    if (user) socket.emit('updateBalance', { coins: user.coins });
                });
            }
        });

        socket.on('roulette:placeBet', async (bet) => {
            const sessionUser = socket.request.session?.user;

            if (!sessionUser) return;
            if (rouletteController.rouletteState.phase !== 'betting') {
                return socket.emit('roulette:betError', { messageKey: 'roulette_error_bets_closed' });
            }
            if (!bet || !bet.type || !bet.value || !bet.amount || parseInt(bet.amount, 10) <= 0) {
                return socket.emit('roulette:betError', { messageKey: 'roulette_error_invalid_bet' });
            }

            const amount = parseInt(bet.amount, 10);
            const userId = sessionUser.id;

            try {
                const dbUser = await rouletteController.dbGet('SELECT coins FROM users WHERE id = ?', [userId]);
                if (!dbUser || dbUser.coins < amount) {
                    return socket.emit('roulette:betError', { messageKey: 'error_not_enough_coins' });
                }

                await rouletteController.dbRun('UPDATE users SET coins = coins - ? WHERE id = ?', [amount, userId]);

                socket.request.session.user.coins -= amount;
                socket.request.session.save();

                if (!rouletteController.rouletteState.bets[userId]) {
                    rouletteController.rouletteState.bets[userId] = [];
                }
                rouletteController.rouletteState.bets[userId].push({
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
    });
}

module.exports = { initializeSocket };