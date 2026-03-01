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

};
