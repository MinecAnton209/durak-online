const { TIMERS } = require('../services/chessService');

module.exports = function registerChessHandlers(io, socket, sharedContext) {
    const {
        chessGames,
        chessService,
        escapeHtml
    } = sharedContext;

    socket.on('createChessLobby', async (settings) => {
        const sessionUser = socket.request.session?.user;
        
        if (!settings) {
            settings = {};
        }

        const timeType = settings.timeType || 'rapid';
        const timeControl = TIMERS[timeType] || TIMERS.rapid;
        
        const sanitizedSettings = {
            lobbyType: settings.lobbyType || 'public',
            timeType: timeType,
            timeControl: timeControl,
            betAmount: Math.max(0, parseInt(settings.betAmount) || 0),
            rated: settings.rated || false
        };

        const betAmount = sanitizedSettings.betAmount;
        if (betAmount > 0) {
            if (!sessionUser) {
                return socket.emit('error', { i18nKey: 'error_guests_cannot_bet' });
            }
            if (sessionUser.coins < betAmount) {
                return socket.emit('error', { i18nKey: 'error_not_enough_coins_host' });
            }
        }

        const playerName = sessionUser ? sessionUser.username : (settings.playerName || 'Guest');

        const game = await chessService.createChessGame(sanitizedSettings, socket, playerName);

        socket.join(game.id);
        socket.emit('chessLobbyCreated', { gameId: game.id, settings: sanitizedSettings });
        
        chessService.broadcastPublicChessLobbies();
        
        console.log(`[Chess] Lobby created: ${game.id} by ${playerName}`);
    });

    socket.on('joinChessLobby', async ({ gameId, playerName }) => {
        const sessionUser = socket.request.session?.user;
        const actualGameId = gameId ? gameId.toUpperCase() : null;
        
        const game = chessGames[actualGameId];
        
        if (!game) {
            return socket.emit('error', { i18nKey: 'error_lobby_not_found' });
        }

        if (sessionUser && Object.values(game.players).some(p => p.dbId === sessionUser.id)) {
            return socket.emit('error', { i18nKey: 'error_already_in_game' });
        }

        if (game.playerOrder.length >= 2) {
            return socket.emit('error', { i18nKey: 'error_lobby_full' });
        }

        const betAmount = game.betAmount || 0;
        if (betAmount > 0) {
            if (!sessionUser) {
                return socket.emit('error', { i18nKey: 'error_guests_cannot_bet' });
            }
            if (sessionUser.coins < betAmount) {
                return socket.emit('error', { i18nKey: 'error_not_enough_coins_join' });
            }
        }

        const name = sessionUser ? sessionUser.username : (playerName || 'Guest');

        socket.join(actualGameId);
        chessService.addPlayerToChessGame(socket, game, name);

        console.log(`[Chess] ${name} joined lobby ${actualGameId}`);

        socket.emit('chessJoinSuccess', { gameId: actualGameId, playerId: socket.id });

        io.to(actualGameId).emit('chessLobbyStateUpdate', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                rating: p.rating,
                isVerified: p.isVerified,
                isHost: p.id === game.hostId,
                color: p.color
            })),
            hostId: game.hostId,
            settings: game.settings
        });

        if (game.playerOrder.length === 2) {
            chessService.startChessGame(actualGameId);
        }
        
        chessService.broadcastPublicChessLobbies();
    });

    socket.on('getChessLobbyState', ({ gameId }) => {
        const game = chessGames[gameId];
        if (game) {
            if (game.players[socket.id] || game.spectators.includes(socket.id)) {
                socket.join(gameId);
            }
            chessService.broadcastChessGameState(gameId);
        } else {
            socket.emit('error', { i18nKey: 'error_game_not_found' });
        }
    });

    socket.on('chessMove', ({ gameId, from, to, promotion }) => {
        const game = chessGames[gameId];
        if (!game) {
            return socket.emit('error', { i18nKey: 'error_game_not_found' });
        }

        const player = game.players[socket.id];
        if (!player) {
            return socket.emit('error', { i18nKey: 'error_not_in_game' });
        }

        const result = chessService.makeMove(gameId, socket.id, from, to, promotion);
        
        if (!result.success) {
            socket.emit('chessInvalidMove', { reason: result.reason });
        }
    });

    socket.on('chessResign', ({ gameId }) => {
        const game = chessGames[gameId];
        if (!game) return;
        
        const player = game.players[socket.id];
        if (!player) return;

        if (game.status === 'in_progress' && !game.winner) {
            chessService.resign(gameId, socket.id);
        }
    });

    socket.on('chessOfferDraw', ({ gameId }) => {
        const game = chessGames[gameId];
        if (!game) return;
        
        const player = game.players[socket.id];
        if (!player) return;

        chessService.offerDraw(gameId, socket.id);
    });

    socket.on('leaveChessLobby', ({ gameId }) => {
        const game = chessGames[gameId];
        if (!game || !game.players[socket.id] || game.status !== 'waiting') return;

        const player = game.players[socket.id];
        console.log(`[Chess] Player ${player.name} left lobby ${gameId}`);

        socket.leave(gameId);
        delete game.players[socket.id];
        game.playerOrder = game.playerOrder.filter(id => id !== socket.id);

        if (game.playerOrder.length > 0) {
            const humanIds = game.playerOrder.filter(id => game.players[id] && !game.players[id].isBot);
            if (humanIds.length === 0) {
                delete chessGames[gameId];
                io.emit('chessLobbyExpired', { lobbyId: gameId });
            } else {
                if (game.hostId === socket.id) {
                    game.hostId = humanIds[0];
                    chessService.logChessEvent(game, null, { 
                        i18nKey: 'chess_new_host', 
                        options: { name: game.players[game.hostId].name } 
                    });
                }

                io.to(gameId).emit('chessLobbyStateUpdate', {
                    players: Object.values(game.players).map(p => ({
                        id: p.id,
                        name: p.name,
                        rating: p.rating,
                        isVerified: p.isVerified,
                        isHost: p.id === game.hostId,
                        color: p.color
                    })),
                    hostId: game.hostId,
                    settings: game.settings
                });
            }
        } else {
            delete chessGames[gameId];
            io.emit('chessLobbyExpired', { lobbyId: gameId });
        }
        
        chessService.broadcastPublicChessLobbies();
    });

    socket.on('joinChessLobbyBrowser', () => {
        socket.join('chess_lobby_browser');
        const list = chessService.getPublicChessLobbies();
        socket.emit('chessLobbyListUpdate', list);
    });

    socket.on('getChessLobbyList', () => {
        const publicGames = chessService.getPublicChessLobbies();
        socket.emit('chessLobbyList', publicGames);
    });

    socket.on('leaveChessLobbyBrowser', () => {
        socket.leave('chess_lobby_browser');
    });

    socket.on('addChessBot', ({ gameId, difficulty }) => {
        const game = chessGames[gameId];
        if (!game || game.hostId !== socket.id || game.status !== 'waiting') return;
        if (game.playerOrder.length >= 2) return;

        const botId = `chess_bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const botNames = {
            beginner: 'Chess Noob 🤪',
            medium: 'Chess Bot ♟️',
            hard: 'Grandmaster 🤯'
        };

        game.players[botId] = {
            id: botId,
            name: botNames[difficulty] || 'Chess Bot',
            isBot: true,
            difficulty: difficulty,
            rating: difficulty === 'hard' ? 2000 : difficulty === 'medium' ? 1200 : 800,
            isVerified: true,
            color: 'black'
        };
        game.playerOrder.push(botId);

        io.to(gameId).emit('chessLobbyStateUpdate', {
            players: Object.values(game.players).map(p => ({
                id: p.id,
                name: p.name,
                rating: p.rating,
                isVerified: p.isVerified,
                isHost: p.id === game.hostId,
                isBot: p.isBot || false,
                color: p.color
            })),
            hostId: game.hostId,
            settings: game.settings
        });

        chessService.startChessGame(gameId);
        chessService.broadcastPublicChessLobbies();
    });
};
