const prisma = require('../db/prisma');
const crypto = require('crypto');
const { validateLobbySettings } = require('../utils/validation');

module.exports = function registerLobbyHandlers(io, socket, sharedContext) {
    const { games, addPlayerToGame, broadcastPublicLobbies, checkBanStatus } = sharedContext;

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

            await prisma.game.create({
                data: {
                    id: gameId,
                    status: 'waiting',
                    lobby_type: lobbySettings.lobbyType,
                    invite_code: inviteCode,
                    max_players: lobbySettings.maxPlayers,
                    host_user_id: userId,
                    game_settings: JSON.stringify(lobbySettings),
                    start_time: new Date().toISOString()
                }
            });

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

                gameFromDb = await prisma.game.findFirst({
                    where: { invite_code: codeToCheck, status: 'waiting' },
                    select: { id: true, max_players: true }
                });

                if (!gameFromDb) {
                    gameFromDb = await prisma.game.findFirst({
                        where: { id: codeToCheck, status: 'waiting' },
                        select: { id: true, max_players: true }
                    });
                }

                if (gameFromDb) lobbyToJoinId = gameFromDb.id;

            } else if (lobbyToJoinId) {
                gameFromDb = await prisma.game.findFirst({
                    where: { id: lobbyToJoinId, status: 'waiting' },
                    select: { id: true, max_players: true }
                });
            }

            console.log(`[JoinLobby] DB Search Result:`, gameFromDb);

            if (!lobbyToJoinId || !gameFromDb) {
                console.log(`[JoinLobby] Lobby not found in DB or wrong status`);
                return socket.emit('error', { i18nKey: 'error_lobby_not_found' });
            }

            const game = games[lobbyToJoinId];
            if (!game) {
                console.log(`[JoinLobby] Lobby found in DB but NOT in Memory. Cancelling DB record.`);
                await prisma.game.update({
                    where: { id: lobbyToJoinId },
                    data: { status: 'cancelled' }
                });
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
                    if (sharedContext.logEvent) {
                        sharedContext.logEvent(game, null, { i18nKey: 'log_new_host', options: { name: game.players[game.hostId].name } });
                    }
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

    socket.on('getLobbyList', () => {
        const publicGames = Object.values(games)
            .filter(g => g.status === 'waiting' && g.settings.lobbyType === 'public')
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

    socket.on('addBot', ({ gameId, difficulty }) => {
        const game = games[gameId];
        if (!game || game.hostId !== socket.id || game.status !== 'waiting') return;
        if (Object.keys(game.players).length >= game.settings.maxPlayers) return;

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
            isVerified: true,
            rating: 1500
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

};
