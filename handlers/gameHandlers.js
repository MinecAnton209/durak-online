const prisma = require('../db/prisma');
const { validateCard } = require('../utils/validation');

module.exports = function registerGameHandlers(io, socket, sharedContext) {
    const {
        games,
        gameService,
        achievementService,
        VERIFIED_BADGE_SVG,
        escapeHtml
    } = sharedContext;

    socket.on('forceStartGame', ({ gameId }) => {
        const game = games[gameId];
        if (!game || game.hostId !== socket.id) return;
        if (game.playerOrder.length >= 2) {
            game.settings.maxPlayers = game.playerOrder.length;
            gameService.startGame(gameId);
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
            gameService.startGame(gameId);
            gameService.broadcastPublicLobbies();
        } catch (e) {
            console.error(`[Game] Error starting game ${gameId}:`, e);
        }
    });

    socket.on('sendMessage', ({ gameId, message }) => {
        const game = games[gameId];
        const player = game ? game.players[socket.id] : null;
        if (!game || !player || !message) return;

        if (player.is_muted) {
            const sessionUser = socket.request.session?.user;
            if (sessionUser && sessionUser.mute_until && new Date(sessionUser.mute_until) < new Date()) {
                // Mute expired
                player.is_muted = false;
                if (sessionUser) {
                    sessionUser.is_muted = false;
                    sessionUser.mute_until = null;
                }
                prisma.user.update({
                    where: { id: player.dbId || sessionUser?.id },
                    data: { is_muted: false, mute_until: null }
                }).catch(err => console.error(err));
            } else {
                return socket.emit('systemMessage', { i18nKey: 'error_chat_muted', type: 'error' });
            }
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
            gameService.logEvent(game, chatMessage);
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
        const { canBeat, getNextPlayerIndex } = require('../utils/gameLogic');

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

                    gameService.logEvent(game, null, {
                        i18nKey: 'log_transfer',
                        options: { name: player.name, nextPlayer: nextPlayer.name }
                    });

                    game.attackerId = game.defenderId;
                    game.defenderId = nextPlayerId;
                    game.turn = nextPlayerId;
                    game.lastAction = 'transfer';

                    gameService.broadcastGameState(gameId);
                    return;
                }
            }

            if (!canBeat(game.table[game.table.length - 1], card, game.trumpSuit)) {
                return socket.emit('invalidMove', { reason: "error_invalid_move_cannot_beat" });
            }

            gameService.logEvent(game, null, {
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

            if ((game.table.length - Math.floor(game.table.length / 2)) >= defender.cards.length) {
                return socket.emit('invalidMove', { reason: "error_invalid_move_toss_limit" });
            }

            gameService.logEvent(game, null, { i18nKey: logKey, options: { name: player.name, rank: card.rank, suit: card.suit } });
            game.turn = game.defenderId;
        }

        player.cards = player.cards.filter(c => !(c.rank === card.rank && c.suit === card.suit));
        game.table.push(card);
        gameService.broadcastGameState(gameId);
    });

    socket.on('passTurn', ({ gameId }) => {
        const game = games[gameId];
        const { getNextPlayerIndex, updateTurn, checkGameOver } = require('../utils/gameLogic');
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
            gameService.logEvent(game, null, { i18nKey: 'log_pass', options: { name: defender.name } });
        }
        game.discardPile.push(...game.table);
        game.table = [];
        gameService.refillHands(game);
        if (checkGameOver(game)) {
            gameService.updateStatsAfterGame(game);
            return gameService.broadcastGameState(gameId);
        }
        let defenderIndex = game.playerOrder.indexOf(defenderIdBeforeRefill);
        if (defenderIndex === -1) defenderIndex = 0;
        updateTurn(game, defenderIndex);
        gameService.broadcastGameState(gameId);
    });

    socket.on('takeCards', ({ gameId }) => {
        const game = games[gameId];
        const { getNextPlayerIndex, updateTurn, checkGameOver } = require('../utils/gameLogic');
        if (!game || game.defenderId !== socket.id || game.table.length === 0 || game.winner) return;
        if (game.players[socket.id]) {
            game.players[socket.id].afkStrikes = 0;
        }
        game.lastAction = 'take';
        const defender = game.players[game.defenderId];
        if (defender) {
            defender.gameStats.cardsTaken += game.table.length;
            if (defender.dbId) {
                prisma.gameParticipant.update({
                    where: { game_id_user_id: { game_id: gameId, user_id: defender.dbId } },
                    data: { cards_taken_total: { increment: game.table.length } }
                }).catch(err => console.error(`[Game] Error updating cards_taken_total:`, err.message));
            }
            gameService.logEvent(game, null, { i18nKey: 'log_take', options: { name: defender.name } });
            defender.cards.push(...game.table);
        }
        game.table = [];
        gameService.refillHands(game);
        if (checkGameOver(game)) {
            gameService.updateStatsAfterGame(game);
            return gameService.broadcastGameState(gameId);
        }
        const defenderIndex = game.playerOrder.indexOf(game.defenderId);
        const nextPlayerIndex = getNextPlayerIndex(defenderIndex, game.playerOrder.length);
        updateTurn(game, nextPlayerIndex);
        gameService.broadcastGameState(gameId);
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
            setTimeout(() => gameService.startGame(gameId), 1000);
        }
    });

    socket.on('reconnectAttempt', async (payload) => {
        const requestedGameId = payload && payload.gameId;
        const sessionUser = socket.request.session?.user;
        const deviceId = socket.deviceId;

        if (!requestedGameId || !games[requestedGameId]) return socket.emit('reconnectFailed');
        const gameId = requestedGameId;
        const game = games[gameId];
        if (game.status !== 'in_progress') return socket.emit('reconnectFailed');

        let oldPlayerSocketId = null;
        let oldPlayerData = null;

        for (const [socketId, player] of Object.entries(game.players)) {
            if (player.disconnected) {
                if (sessionUser && player.dbId === sessionUser.id) {
                    oldPlayerSocketId = socketId; oldPlayerData = player; break;
                }
                if (!sessionUser && player.isGuest && player.deviceId === deviceId) {
                    oldPlayerSocketId = socketId; oldPlayerData = player; break;
                }
            }
        }

        if (oldPlayerSocketId && oldPlayerData) {
            console.log(`[Reconnect] Player ${oldPlayerData.name} rejoining game ${gameId}`);
            clearTimeout(oldPlayerData.reconnectTimeout);

            const newPlayerId = socket.id;
            game.players[newPlayerId] = oldPlayerData;
            game.players[newPlayerId].id = newPlayerId;
            game.players[newPlayerId].disconnected = false;
            game.players[newPlayerId].disconnectTime = null;
            game.players[newPlayerId].reconnectTimeout = null;

            const playerIndex = game.playerOrder.indexOf(oldPlayerSocketId);
            if (playerIndex > -1) game.playerOrder[playerIndex] = newPlayerId;
            if (game.hostId === oldPlayerSocketId) game.hostId = newPlayerId;
            if (game.attackerId === oldPlayerSocketId) game.attackerId = newPlayerId;
            if (game.defenderId === oldPlayerSocketId) game.defenderId = newPlayerId;
            if (game.turn === oldPlayerSocketId) game.turn = newPlayerId;

            delete game.players[oldPlayerSocketId];
            socket.join(gameId);

            io.to(gameId).emit('playerReconnected', { playerId: newPlayerId, oldPlayerId: oldPlayerSocketId, name: oldPlayerData.name });
            gameService.logEvent(game, null, { i18nKey: 'log_player_reconnected', options: { name: oldPlayerData.name } });
            gameService.broadcastGameState(gameId);
            return;
        }
        socket.emit('reconnectFailed');
    });

    socket.on('requestGameState', ({ gameId }) => {
        if (games[gameId] && games[gameId].players[socket.id]) gameService.broadcastGameState(gameId);
    });

    socket.on('adminSpectateGame', ({ gameId }) => {
        const sessionUser = socket.request.session.user;
        if (!sessionUser || !sessionUser.is_admin) return socket.emit('error', { i18nKey: 'error_forbidden_admin_only' });
        const game = games[gameId];
        if (!game) return socket.emit('error', { i18nKey: 'error_game_not_found' });
        if (game.players[socket.id]) return socket.emit('error', { i18nKey: 'error_already_in_game_as_player' });
        if (game.spectators.includes(socket.id)) {
            gameService.broadcastGameState(gameId);
            return;
        }
        game.spectators.push(socket.id);
        socket.join(gameId);
        gameService.logEvent(game, null, { i18nKey: 'log_admin_spectating', options: { adminName: sessionUser.username } });
        gameService.broadcastGameState(gameId);
        socket.emit('spectateSuccess', { gameId });
    });

    socket.on('hostChangeTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
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
        game.musicState.isPlaying = isPlaying;
        game.musicState.stateChangeTimestamp = Date.now();
        game.musicState.seekTimestamp = currentTime || 0;
        io.to(gameId).emit('musicStateUpdate', game.musicState);
    });

    socket.on('suggestTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        const suggester = game ? game.players[socket.id] : null;
        if (!game || !game.hostId || !suggester || socket.id === game.hostId) return;
        const hostSocket = io.sockets.sockets.get(game.hostId);
        if (hostSocket) hostSocket.emit('trackSuggested', { trackId, trackTitle, suggesterName: suggester.name });
    });
};
