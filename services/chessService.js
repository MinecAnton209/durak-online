const { Chess } = require('chess.js');
const prisma = require('../db/prisma');

let io;
let chessGames = {};

const TIMERS = {
    classical: 600000,
    rapid: 300000,
    blitz: 180000,
    bullet: 60000
};

function init(socketIo, activeChessGames) {
    io = socketIo;
    chessGames = activeChessGames;
}

function addPlayerToChessGame(socket, game, playerName) {
    const sessionUser = socket.request.session.user;
    const playerData = {
        id: socket.id,
        deviceId: socket.deviceId,
        name: sessionUser ? sessionUser.username : playerName,
        dbId: sessionUser ? sessionUser.id : null,
        isGuest: !sessionUser,
        rating: sessionUser ? Math.round(sessionUser.rating) : 0,
        isVerified: sessionUser ? sessionUser.isVerified : false,
        timeLeft: game.settings.timeControl || TIMERS[game.settings.timeType] || TIMERS.rapid,
        color: null
    };
    game.players[socket.id] = playerData;
    game.playerOrder.push(socket.id);
}

function logChessEvent(game, message, options = {}) {
    if (!game.log) game.log = [];
    const timestamp = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = { timestamp, ...options };
    if (typeof message === 'string' && !options.i18nKey) {
        logEntry.message = message;
    }
    game.log.push(logEntry);
    if (game.log.length > 50) game.log.shift();
    if (io) {
        io.to(game.id).emit('chessLogEntry', logEntry);
    }
}

function assignColors(game) {
    const players = game.playerOrder.slice(0, 2);
    if (players.length >= 2) {
        game.players[players[0]].color = 'white';
        game.players[players[1]].color = 'black';
    }
}

async function createChessGame(settings, hostSocket, playerName) {
    const crypto = require('crypto');
    const gameId = crypto.randomBytes(3).toString('hex').toUpperCase();

    const timeControl = TIMERS[settings.timeType] || TIMERS.rapid;
    const betAmount = settings.betAmount || 0;

    const game = {
        id: gameId,
        status: 'waiting',
        hostId: hostSocket.id,
        players: {},
        playerOrder: [],
        settings: {
            ...settings,
            timeControl
        },
        chess: new Chess(),
        board: null,
        turn: 'w',
        winner: null,
        log: [],
        betAmount,
        bank: 0,
        startTime: null,
        spectators: [],
        drawOffers: new Set(),
        lastMove: null
    };

    chessGames[gameId] = game;
    addPlayerToChessGame(hostSocket, game, playerName);
    game.players[hostSocket.id].color = 'white';

    console.log(`[Chess] Created game ${gameId} by ${playerName}`);
    return game;
}

async function startChessGame(gameId) {
    const game = chessGames[gameId];
    if (!game) return;

    if (game.playerOrder.length < 1) return;

    game.status = 'in_progress';
    game.startTime = new Date();

    assignColors(game);

    const whitePlayer = game.playerOrder.find(id => game.players[id]?.color === 'white');
    const blackPlayer = game.playerOrder.find(id => game.players[id]?.color === 'black');

    game.turn = 'w';

    logChessEvent(game, null, {
        i18nKey: 'chess_game_start',
        options: { 
            white: game.players[whitePlayer]?.name || 'White', 
            black: game.players[blackPlayer]?.name || 'Black' 
        }
    });

    broadcastChessGameState(gameId);
    broadcastPublicChessLobbies();
}

function validateMove(game, from, to, promotion) {
    const chess = game.chess;
    
    if (game.status !== 'in_progress') {
        return { valid: false, reason: 'game_not_in_progress' };
    }

    try {
        const move = chess.move({
            from,
            to,
            promotion: promotion || 'q'
        });

        if (move === null) {
            return { valid: false, reason: 'invalid_move' };
        }

        return { valid: true, move };
    } catch (error) {
        console.error('[Chess] Validate move error:', error.message);
        return { valid: false, reason: error.message };
    }
}

function makeMove(gameId, playerId, from, to, promotion = 'q') {
    const game = chessGames[gameId];
    if (!game) return { success: false, reason: 'game_not_found' };

    const player = game.players[playerId];
    if (!player) return { success: false, reason: 'player_not_in_game' };

    if (game.winner) return { success: false, reason: 'game_already_finished' };

    const playerColor = player.color;
    const currentTurn = game.chess.turn();
    const expectedColor = currentTurn === 'w' ? 'white' : 'black';

    if (playerColor !== expectedColor) {
        return { success: false, reason: 'not_your_turn' };
    }

    const validation = validateMove(game, from, to, promotion);
    if (!validation.valid) {
        return { success: false, reason: validation.reason };
    }

    game.lastMove = { from, to, promotion };

    const isCheck = game.chess.inCheck();
    const isCheckmate = game.chess.isCheckmate();
    const isDraw = game.chess.isDraw();
    const isStalemate = game.chess.isStalemate();
    const isThreefoldRepetition = game.chess.isThreefoldRepetition();

    if (isCheckmate) {
        game.status = 'finished';
        game.winner = {
            player: player,
            type: 'checkmate'
        };
        logChessEvent(game, null, {
            i18nKey: 'chess_checkmate',
            options: { winner: player.name }
        });
    } else if (isDraw || isStalemate || isThreefoldRepetition) {
        game.status = 'finished';
        game.winner = null;
        let drawReason = 'draw';
        if (isStalemate) drawReason = 'stalemate';
        if (isThreefoldRepetition) drawReason = 'threefold_repetition';
        logChessEvent(game, null, {
            i18nKey: 'chess_draw',
            options: { reason: drawReason }
        });
    } else if (isCheck) {
        logChessEvent(game, null, {
            i18nKey: 'chess_check',
            options: { king: game.chess.turn() === 'w' ? 'black' : 'white' }
        });
    }

    broadcastChessGameState(gameId);
    return { success: true };
}

function broadcastChessGameState(gameId) {
    const game = chessGames[gameId];
    if (!game || !io) return;

    const fen = game.chess.fen();
    const isCheck = game.chess.inCheck();
    const possibleMoves = game.chess.moves({ verbose: true });

    game.playerOrder.forEach(playerId => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            const player = game.players[playerId];
            const opponentId = game.playerOrder.find(id => id !== playerId);
            const opponent = game.players[opponentId];

            const stateForPlayer = {
                gameId: game.id,
                hostId: game.hostId,
                status: game.status,
                fen,
                isCheck,
                turn: game.chess.turn(),
                yourColor: player.color,
                isYourTurn: player.color === (game.chess.turn() === 'w' ? 'white' : 'black'),
                players: game.playerOrder.map(id => {
                    const p = game.players[id];
                    if (!p) return null;
                    return {
                        id: p.id,
                        name: p.name,
                        rating: p.rating,
                        isVerified: p.isVerified,
                        color: p.color,
                        timeLeft: p.timeLeft
                    };
                }).filter(p => p !== null),
                winner: game.winner,
                lastMove: game.lastMove,
                possibleMoves: player.color === (game.chess.turn() === 'w' ? 'white' : 'black') ? possibleMoves : [],
                drawOffers: Array.from(game.drawOffers),
                log: game.log.slice(-20)
            };
            playerSocket.emit('chessGameStateUpdate', stateForPlayer);
        }
    });

    game.spectators.forEach(spectatorSocketId => {
        const spectatorSocket = io.sockets.sockets.get(spectatorSocketId);
        if (spectatorSocket) {
            const stateForSpectator = {
                gameId: game.id,
                hostId: game.hostId,
                status: game.status,
                fen,
                isCheck,
                turn: game.chess.turn(),
                yourColor: null,
                isYourTurn: false,
                players: game.playerOrder.map(id => {
                    const p = game.players[id];
                    if (!p) return null;
                    return {
                        id: p.id,
                        name: p.name,
                        rating: p.rating,
                        isVerified: p.isVerified,
                        color: p.color,
                        timeLeft: p.timeLeft
                    };
                }).filter(p => p !== null),
                winner: game.winner,
                lastMove: game.lastMove,
                possibleMoves: [],
                drawOffers: Array.from(game.drawOffers),
                log: game.log.slice(-20)
            };
            spectatorSocket.emit('chessGameStateUpdate', stateForSpectator);
        }
    });
}

function broadcastPublicChessLobbies() {
    if (!io) return;
    const publicLobbies = Object.values(chessGames)
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
            maxPlayers: 2,
            betAmount: game.betAmount || 0,
            timeType: game.settings.timeType || 'rapid',
            timeControl: game.settings.timeControl || TIMELS[game.settings.timeType] || TIMERS.rapid
        }));

    io.to('chess_lobby_browser').emit('chessLobbyListUpdate', publicLobbies);
}

function handleChessPlayerDisconnect(socket, game) {
    const disconnectedPlayer = game.players[socket.id];
    if (!disconnectedPlayer) return;

    if (game.status === 'waiting') {
        console.log(`[Chess] Player ${disconnectedPlayer.name} leaving lobby ${game.id}`);

        delete game.players[socket.id];
        game.playerOrder = game.playerOrder.filter(id => id !== socket.id);

        if (game.playerOrder.length > 0) {
            const humanIds = game.playerOrder.filter(id => game.players[id] && !game.players[id].isBot);
            if (humanIds.length === 0) {
                delete chessGames[game.id];
                io.emit('chessLobbyExpired', { lobbyId: game.id });
            } else {
                if (game.hostId === socket.id) {
                    game.hostId = humanIds[0];
                    logChessEvent(game, null, { i18nKey: 'chess_new_host', options: { name: game.players[game.hostId].name } });
                }
                io.to(game.id).emit('chessLobbyStateUpdate', {
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
            delete chessGames[game.id];
            io.emit('chessLobbyExpired', { lobbyId: game.id });
        }
        broadcastPublicChessLobbies();
    } else if (game.status === 'in_progress' && !game.winner) {
        console.log(`[Chess] Player ${disconnectedPlayer.name} disconnected from game ${game.id}`);

        io.to(game.id).emit('chessPlayerDisconnected', {
            playerId: socket.id,
            timeout: 60
        });

        disconnectedPlayer.disconnected = true;
        disconnectedPlayer.disconnectTime = Date.now();

        disconnectedPlayer.reconnectTimeout = setTimeout(() => {
            const currentGame = chessGames[game.id];
            if (!currentGame || !currentGame.players[socket.id] || !currentGame.players[socket.id].disconnected) {
                return;
            }

            if (currentGame.status === 'finished') return;

            const playerWhoLeft = { ...currentGame.players[socket.id] };
            const opponentId = currentGame.playerOrder.find(id => id !== socket.id);

            delete currentGame.players[socket.id];
            currentGame.playerOrder = currentGame.playerOrder.filter(id => id !== socket.id);

            currentGame.winner = {
                player: currentGame.players[opponentId],
                type: 'disconnect'
            };
            currentGame.status = 'finished';

            logChessEvent(currentGame, null, {
                i18nKey: 'chess_player_left',
                options: { name: playerWhoLeft.name, winner: currentGame.players[opponentId]?.name }
            });

            broadcastChessGameState(game.id);
        }, 60000);
    }
}

function offerDraw(gameId, playerId) {
    const game = chessGames[gameId];
    if (!game || game.status !== 'in_progress') return false;

    game.drawOffers.add(playerId);
    const opponentId = game.playerOrder.find(id => id !== playerId);
    
    if (game.drawOffers.has(opponentId)) {
        game.status = 'finished';
        game.winner = null;
        logChessEvent(game, null, { i18nKey: 'chess_draw_accepted' });
        game.drawOffers.clear();
        broadcastChessGameState(gameId);
        return true;
    }

    broadcastChessGameState(gameId);
    return false;
}

function resign(gameId, playerId) {
    const game = chessGames[gameId];
    if (!game || game.status !== 'in_progress') return;

    const opponentId = game.playerOrder.find(id => id !== playerId);
    const winner = game.players[opponentId];

    game.status = 'finished';
    game.winner = {
        player: winner,
        type: 'resign'
    };

    logChessEvent(game, null, {
        i18nKey: 'chess_resign',
        options: { loser: game.players[playerId].name, winner: winner.name }
    });

    broadcastChessGameState(gameId);
}

function getChessGame(gameId) {
    return chessGames[gameId];
}

function getPublicChessLobbies() {
    return Object.values(chessGames)
        .filter(game => game.status === 'waiting' && game.settings.lobbyType === 'public')
        .map(game => ({
            gameId: game.id,
            hostName: game.players[game.hostId]?.name || 'Unknown',
            playerCount: game.playerOrder.length,
            maxPlayers: 2,
            betAmount: game.betAmount || 0,
            timeType: game.settings.timeType || 'rapid',
            timeControl: game.settings.timeControl || TIMERS[game.settings.timeType] || TIMERS.rapid
        }));
}

module.exports = {
    init,
    createChessGame,
    startChessGame,
    makeMove,
    broadcastChessGameState,
    broadcastPublicChessLobbies,
    handleChessPlayerDisconnect,
    offerDraw,
    resign,
    getChessGame,
    getPublicChessLobbies,
    logChessEvent,
    addPlayerToChessGame,
    TIMERS
};
