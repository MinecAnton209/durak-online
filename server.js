import 'dotenv/config';

import express from 'express';
import http from 'node:http';
import { Server as socketIo } from 'socket.io';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import cors from 'cors';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import expressStaticGzip from 'express-static-gzip';
import webpush from 'web-push';
import util from 'node:util';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';

import db, { initializeDb } from './db/drizzle.js';
import { user as userTable, game as gameTable } from './db/schema.ts';
import { eq, and, sql, desc, isNotNull } from 'drizzle-orm';

import authRoutes from './routes/auth.js';
import telegramRoutes from './routes/telegram.js';
import publicRoutes from './routes/public.js';
import achievementRoutes from './routes/achievements.js';
import adminRoutes from './routes/admin.js';
import friendsRoutes from './routes/friends.js';
import notificationsRoutes from './routes/notifications.js';
import inboxRoutes from './routes/inbox.js';
import myGamesRoutes from './routes/myGames.js';
import profileRoutes from './routes/profile.js';

import { seedAchievements } from './db/seed.js';
import achievementService from './services/achievementService.js';
import ratingService from './services/ratingService.js';
import statsService from './services/statsService.js';
import notificationService from './services/notificationService.js';
import economyService from './services/economyService.js';
import inboxService from './services/inboxService.js';
import telegramBot from './services/telegramBot.js';
import botLogic from './services/botLogic.js';
import chatService from './services/chatService.js';
import gameService from './services/gameService.js';
import systemService from './services/systemService.js';
import rouletteService from './services/rouletteService.js';
import maintenanceService from './services/maintenanceService.js';

import { attachUserFromToken, socketAttachUser } from './middlewares/jwtAuth.js';
import maintenanceMiddleware from './middlewares/maintenanceMiddleware.js';

import { escapeHtml, validateLobbySettings, validateCard, validateGameId } from './utils/validation.js';
import { RANK_VALUES, createDeck, canBeat, getNextPlayerIndex, updateTurn, checkGameOver } from './utils/gameLogic.js';

import registerLobbyHandlers from './handlers/lobbyHandlers.js';
import registerGameHandlers from './handlers/gameHandlers.js';
import registerRouletteHandlers from './handlers/rouletteHandlers.js';
import registerChatHandlers from './handlers/chatHandlers.js';
import registerFriendHandlers from './handlers/friendHandlers.js';
import registerHealthHandlers from './handlers/healthHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

initializeDb(process.env.DATABASE_URL);

db.update(gameTable).set({ status: 'cancelled' }).where(eq(gameTable.status, 'waiting'))
    .then(() => console.log('🧹 DB cleaned: Stale lobbies cancelled.'))
    .catch(err => console.error('DB Clean error:', err));

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://durak.minecanton209.pp.ua',
    'https://durak.crushtalm.pp.ua'
];

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log("Web Push (VAPID) initialized.");
} else {
    console.warn("VAPID keys not found in .env file. Push notifications will not work.");
}

const app = express();
const server = http.createServer(app);
const io = new socketIo(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

io.use(socketAttachUser);
chatService.loadChatFilters();
setTimeout(chatService.loadChatFilters, 3000); // Initial load fallback

// Chat filters moved to services/chatService.js

let games = {};

const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

app.set('socketio', io);
app.set('activeGames', games);
app.set('onlineUsers', onlineUsers);
app.set('i18next', i18next);
app.set('globalChatHistory', chatService.getChatHistory());

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

setTimeout(() => seedAchievements(), 1000);
achievementService.init(io);
inboxService.init(io);
rouletteService.init(io, onlineUsers);
maintenanceService.init(io);
gameService.init(io, games);

app.set('trust proxy', 1);

app.use((req, res, next) => {
    res.set('Accept-CH', 'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model');
    res.set('Critical-CH', 'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model');
    next();
});

app.use(cookieParser());
app.use(attachUserFromToken);

app.use(maintenanceMiddleware);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...allowedOrigins],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", "https://*.telegram.org"],
            frameAncestors: ["'self'", "https://*.telegram.org", "https://*.t.me"],
        },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: false,
}));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json());

app.use('/', authRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/my-games', myGamesRoutes);
app.use('/api/profile', profileRoutes);

app.use(expressStaticGzip(path.join(__dirname, 'public'), {
  enableBrotli: true,
  enableGzip: true,
  customCompressions: [{
    encodingName: 'gzip',
    fileExtension: '.gz',
  }],
}));

app.get('/maintenance', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'maintenance.html'));
});

app.get(/.*/, (req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBot.init(process.env.TELEGRAM_BOT_TOKEN, () => systemService.getSystemStats(onlineUsers, games));
}

io.use(socketAttachUser);

async function checkBanStatus(userId) {
    try {
        const dbUser = await db.query.user.findFirst({
            where: { id: userId },
            select: { is_banned: true, ban_reason: true, ban_until: true }
        });
        if (dbUser && dbUser.is_banned) {
            if (dbUser.ban_until && new Date(dbUser.ban_until) < new Date()) {
                await db.update(userTable).set({ is_banned: false, ban_until: null, ban_reason: null }).where(eq(userTable.id, userId));
                return null;
            }
            return dbUser.ban_reason || 'Account banned';
        }
        return null;
    } catch (error) {
        console.error("Error in checkBanStatus:", error);
        return null;
    }
}

// Game state management functions moved to services/gameService.js
// Roulette logic moved to services/rouletteService.js
// Roulette win check moved to services/rouletteService.js

io.on('connection', (socket) => {
    const session = socket.request.session;
    const sessionUser = session?.user;
    if (sessionUser && sessionUser.id) {
        const userId = parseInt(sessionUser.id, 10);
        onlineUsers.set(userId, socket.id);
        socket.join(`user_${userId}`); // Join user-specific room

        economyService.checkAndAwardDailyBonus(userId, io, socket.id);
        console.log(`[Online Status] User connected: ${sessionUser.username} (ID: ${sessionUser.id}). Total online: ${onlineUsers.size}`);
        db.query.user.findFirst({
            where: { id: userId },
            select: { is_banned: true, ban_reason: true, ban_until: true }
        }).then(async (dbUser) => {
            if (dbUser && dbUser.is_banned) {
                if (dbUser.ban_until && new Date(dbUser.ban_until) < new Date()) {
                    await db.update(userTable).set({ is_banned: false, ban_until: null, ban_reason: null }).where(eq(userTable.id, userId));
                    console.log(`[Ban] Ban expired for user ${sessionUser.username}`);
                } else {
                    const reasonText = dbUser.ban_reason || i18next.t('ban_reason_not_specified');
                    const options = { reason: reasonText };
                    if (dbUser.ban_until) {
                        options.until = new Date(dbUser.ban_until).toLocaleString();
                    }
                    socket.emit('forceDisconnect', {
                        i18nKey: dbUser.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                        options: options
                    });
                    socket.disconnect(true);
                }
            }
        }).catch(err => {
            console.error(`[Ban] Error checking ban status for ${sessionUser.username}:`, err.message);
            socket.disconnect(true);
        });
    } else {
        console.log(`Client connected: ${socket.id} (guest)`);
    }
    registerLobbyHandlers(io, socket, {
        games,
        addPlayerToGame: gameService.addPlayerToGame,
        broadcastPublicLobbies: gameService.broadcastPublicLobbies,
        logEvent: gameService.logEvent,
        checkBanStatus
    });
    registerRouletteHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerGameHandlers(io, socket, { games, gameService, achievementService, escapeHtml });
    registerFriendHandlers(io, socket, { games, onlineUsers });
    registerHealthHandlers(io, socket, { onlineUsers, games });

    socket.on('disconnect', () => {
        let disconnectedUserId = null;

        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                onlineUsers.delete(userId);
                break;
            }
        }

        if (disconnectedUserId) {
            console.log(`[Online Status] User ID ${disconnectedUserId} disconnected. Total online: ${onlineUsers.size}`);
        } else {
            console.log(`[Disconnect] Guest client disconnected: ${socket.id}`);
        }

        for (const gameId in games) {
            const game = games[gameId];

            if (game.spectators.includes(socket.id)) {
                game.spectators = game.spectators.filter(id => id !== socket.id);
                console.log(`[Spectator] Spectator left game ${gameId}`);
                break;
            }

            if (game.players[socket.id]) {
                gameService.handlePlayerDisconnect(socket, game);
                break;
            }
        }

    });
    socket.on('adminSpectateGame', ({ gameId }) => {
        const sessionUser = socket.request.session.user;
        if (!sessionUser || !sessionUser.is_admin) {
            return socket.emit('error', { i18nKey: 'error_forbidden_admin_only' });
        }
        const game = games[gameId];
        if (!game) {
            return socket.emit('error', { i18nKey: 'error_game_not_found', text: gameId });
        }
        if (game.players[socket.id]) {
            return socket.emit('error', { i18nKey: 'error_already_in_game_as_player' });
        }
        if (game.spectators.includes(socket.id)) {
            gameService.broadcastGameState(gameId);
            return;
        }
        game.spectators.push(socket.id);
        socket.join(gameId);
        console.log(`Admin ${sessionUser.username} started spectating game ${gameId}`);
        gameService.logEvent(game, null, { i18nKey: 'log_admin_spectating', options: { adminName: sessionUser.username } });
        gameService.broadcastGameState(gameId);
        socket.emit('spectateSuccess', { gameId });
    });
    socket.on('hostChangeTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        console.log(`[Music] Host of game ${gameId} changed track to: ${trackTitle} (ID: ${trackId})`);
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
        console.log(`[Music] Host of game ${gameId} changed playback state to: ${isPlaying}`);
        game.musicState.isPlaying = isPlaying;
        game.musicState.stateChangeTimestamp = Date.now();
        game.musicState.seekTimestamp = currentTime || 0;
        io.to(gameId).emit('musicStateUpdate', game.musicState);
    });
    socket.on('suggestTrack', ({ gameId, trackId, trackTitle }) => {
        const game = games[gameId];
        const suggester = game ? game.players[socket.id] : null;
        if (!game || !game.hostId || !suggester) return;
        if (socket.id === game.hostId) return;
        const hostSocket = io.sockets.sockets.get(game.hostId);
        if (hostSocket) {
            hostSocket.emit('trackSuggested', { trackId, trackTitle, suggesterName: suggester.name });
        }
    });
    // Maintenance socket listeners removed (deprecated/handled by service)
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
                url: `/game/${gameId}`
            };

            await notificationService.sendNotification(targetUserId, payload);

            // Add to Inbox
            await inboxService.addMessage(targetUserId, {
                type: 'game_invite',
                titleKey: 'inbox.game_invite_title',
                contentKey: 'inbox.game_invite_content',
                contentParams: {
                    fromUserId: sessionUser.id,
                    fromUsername: sessionUser.username,
                    lobbyId: gameId
                }
            });
        } catch (error) {
            console.error(`[Invites] Failed to send push/inbox notification for user ${targetUserId}:`, error);
        }
    });
    // Roulette handlers moved to handlers/rouletteHandlers.js
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
            await db.update(gameTable).set({ status: 'in_progress' }).where(eq(gameTable.id, gameId));
            gameService.startGame(gameId);
            broadcastPublicLobbies();
        } catch (e) {
            console.error(`[Game] Error starting game ${gameId}:`, e);
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
                db.update(gameTable).set({ status: 'cancelled' }).where(eq(gameTable.id, gameId)).catch(() => { });
                io.emit('lobbyExpired', { lobbyId: gameId });
            } else {
                if (game.hostId === socket.id) {
                    game.hostId = humanIds[0];
                    console.log(`[Lobby] New host for ${gameId}: ${game.players[game.hostId].name}`);
                    gameService.logEvent(game, null, { i18nKey: 'log_new_host', options: { name: game.players[game.hostId].name } });
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
            db.update(gameTable).set({ status: 'cancelled' }).where(eq(gameTable.id, gameId)).catch(() => { });
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
            await db.update(gameTable).set({ game_settings: JSON.stringify(game.settings), max_players: game.settings.maxPlayers }).where(eq(gameTable.id, gameId));

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
        // Initial lobby list update when joining the browser
        const list = Object.values(games)
            .filter(game => game.status === 'waiting' && game.settings.lobbyType === 'public' && game.playerOrder.length > 0 && !game.host?.is_shadow_banned)
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
            .filter(g => g.status === 'waiting' && g.settings.lobbyType === 'public' && !g.host?.is_shadow_banned)
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

    socket.on('reconnectAttempt', async (payload) => {
        const requestedGameId = payload && payload.gameId;
        const sessionUser = socket.request.session?.user;
        const deviceId = socket.deviceId;

        console.log(`[Reconnect] Attempt from UserID: ${sessionUser?.id}, DeviceID: ${deviceId}`);

        if (!requestedGameId || !games[requestedGameId]) {
            return socket.emit('reconnectFailed');
        }
        const gameId = requestedGameId;
        const game = games[gameId];
        if (game.status !== 'in_progress') {
            return socket.emit('reconnectFailed');
        }

        let oldPlayerSocketId = null;
        let oldPlayerData = null;

        for (const [socketId, player] of Object.entries(game.players)) {
            if (player.disconnected) {
                if (sessionUser && player.dbId === sessionUser.id) {
                    oldPlayerSocketId = socketId;
                    oldPlayerData = player;
                    break;
                }
                if (!sessionUser && player.isGuest && player.deviceId === deviceId) {
                    oldPlayerSocketId = socketId;
                    oldPlayerData = player;
                    break;
                }
            }
        }

        // If no disconnected player found, try matching by dbId for authenticated users
        // This handles page refreshes where the old socket wasn't marked as disconnected
        if (!oldPlayerSocketId && sessionUser) {
            for (const [socketId, player] of Object.entries(game.players)) {
                if (player.dbId === sessionUser.id) {
                    // Disconnect old socket if still connected
                    const oldSocket = io.sockets.sockets.get(socketId);
                    if (oldSocket) {
                        oldSocket.leave(gameId);
                    }
                    oldPlayerSocketId = socketId;
                    oldPlayerData = player;
                    break;
                }
            }
        }

        if (oldPlayerSocketId && oldPlayerData) {
            console.log(`[Reconnect] Player ${oldPlayerData.name} found in game ${gameId}. Reconnecting...`);
            clearTimeout(oldPlayerData.reconnectTimeout);

            const newPlayerId = socket.id;
            game.players[newPlayerId] = oldPlayerData;

            // Reconnect logic moved to gameService.js
            const playerIndex = game.playerOrder.indexOf(oldPlayerSocketId);
            if (playerIndex > -1) {
                game.playerOrder[playerIndex] = newPlayerId;
            }

            if (game.hostId === oldPlayerSocketId) {
                game.hostId = newPlayerId;
            }

            if (game.attackerId === oldPlayerSocketId) {
                game.attackerId = newPlayerId;
            }
            if (game.defenderId === oldPlayerSocketId) {
                game.defenderId = newPlayerId;
            }
            if (game.turn === oldPlayerSocketId) {
                game.turn = newPlayerId;
            }

            delete game.players[oldPlayerSocketId];

            socket.join(gameId);

            io.to(gameId).emit('playerReconnected', {
                playerId: newPlayerId,
                oldPlayerId: oldPlayerSocketId,
                name: oldPlayerData.name
            });
            gameService.logEvent(game, null, { i18nKey: 'log_player_reconnected', options: { name: oldPlayerData.name } });

            gameService.broadcastGameState(gameId);

            return;
        }
        socket.emit('reconnectFailed');
    });
    socket.on('requestGameState', ({ gameId }) => {
        const game = games[gameId];
        if (game) {
            // Check by socket id first
            if (game.players[socket.id]) {
                gameService.broadcastGameState(gameId);
                return;
            }
            // Check by dbId for authenticated players who got a new socket
            const sessionUser = socket.request.session?.user;
            if (sessionUser) {
                for (const [sid, player] of Object.entries(game.players)) {
                    if (player.dbId === sessionUser.id) {
                        game.players[socket.id] = player;
                        const idx = game.playerOrder.indexOf(sid);
                        if (idx > -1) game.playerOrder[idx] = socket.id;
                        if (game.hostId === sid) game.hostId = socket.id;
                        if (game.attackerId === sid) game.attackerId = socket.id;
                        if (game.defenderId === sid) game.defenderId = socket.id;
                        if (game.turn === sid) game.turn = socket.id;
                        delete game.players[sid];
                        socket.join(gameId);
                        gameService.broadcastGameState(gameId);
                        return;
                    }
                }
            }
        }
    });
    socket.on('addBot', ({ gameId, difficulty }) => {

        const game = games[gameId];

        if (!game) {
            console.error(`[AddBot] Error: Game ${gameId} not found in memory.`);
            return;
        }
        if (game.hostId !== socket.id) {
            console.error(`[AddBot] Error: User is not the host.`);
            return;
        }
        if (game.status !== 'waiting') {
            console.error(`[AddBot] Error: Game has already started.`);
            return;
        }
        if (Object.keys(game.players).length >= game.settings.maxPlayers) {
            console.error(`[AddBot] Error: Lobby is full.`);
            return;
        }

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
            isVerified: true
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
    // Global chat events moved to handlers/chatHandlers.js
    // Health status events kept for now
    socket.on('health:subscribe', () => {
        socket.join('health_status');
        console.log(`[Health] Socket ${socket.id} subscribed to health updates`);
    });

    socket.on('health:unsubscribe', () => {
        socket.leave('health_status');
        console.log(`[Health] Socket ${socket.id} unsubscribed from health updates`);
    });
});

// Legcy roulette intervals removed, handled by rouletteService

setInterval(() => {
    let hasChanges = false;
    for (const gameId in games) {
        const game = games[gameId];
        if (game.status === 'waiting' && (!game.playerOrder || game.playerOrder.length === 0)) {
            console.log(`[GC] Removing zombie lobby: ${gameId}`);
            delete games[gameId];
            db.update(gameTable).set({ status: 'cancelled' }).where(eq(gameTable.id, gameId)).catch(() => { });
            io.emit('lobbyExpired', { lobbyId: gameId });
            hasChanges = true;
        }
    }
    if (hasChanges) {
        gameService.broadcastPublicLobbies();
    }
}, 30000);

async function broadcastHealthStatus() {
    const stats = await systemService.getSystemStats(onlineUsers, games);
    if (stats) {
        io.to('health_status').emit('health:update', stats);
    }
}

setInterval(broadcastHealthStatus, 1000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

let isShuttingDown = false;

const SHUTDOWN_TIMEOUT = 5000;

async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log("Shutdown already in progress...");
        return;
    }

    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
        console.error("Shutdown timeout exceeded. Force exit.");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
        console.log("Stopping HTTP server...");
        await new Promise((resolve) => {
            server.close(() => {
                console.log("HTTP server closed");
                resolve();
            });

            server.getConnections((_, count) => {
                if (count > 0) {
                    server.closeIdleConnections?.();
                    server.closeAllConnections?.();
                }
            });
        });

        console.log("Closing Socket.IO...");
        const sockets = await io.fetchSockets();
        for (const socket of sockets) {
            socket.disconnect(true);
        }
        io.close();
        console.log("Socket.IO closed");

        if (telegramBot && telegramBot.stop) {
            console.log("Stopping Telegram bot...");
            try {
                await telegramBot.stop();
            } catch (e) {
                console.error("Telegram stop error:", e);
            }
            console.log("Telegram bot stopped");
        }

        console.log("Closing database connection...");
        await db.$client.end();
        console.log("Database disconnected");

        clearTimeout(forceExitTimer);

        console.log("Graceful shutdown completed");
        process.exit(0);

    } catch (err) {
        clearTimeout(forceExitTimer);
        console.error("Error during shutdown:", err);
        process.exit(1);
    }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, p) => {
    console.error("Unhandled Rejection:", reason);
});
