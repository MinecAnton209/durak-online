const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { ensureAdmin } = require('../middlewares/authMiddleware');
const { logAdminAction } = require('../services/auditLogService');
const notificationService = require('../services/notificationService.js');
const maintenanceService = require('../services/maintenanceService');

const isAdmin = (req, res, next) => {
    if (req.session?.user?.is_admin) return next();
    res.status(403).json({ message: 'Forbidden: Admin access required.' });
};

router.use(isAdmin);

router.get('/users/search', ensureAdmin, async (req, res) => {
    const { query } = req.query;
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
    }
    try {
        const searchId = isNaN(parseInt(query)) ? -1 : parseInt(query);
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { username: { contains: query } },
                    { id: searchId }
                ]
            },
            select: { id: true, username: true, wins: true, losses: true, streak_count: true, last_played_date: true, is_verified: true, is_admin: true, is_banned: true, ban_reason: true, is_muted: true, rating: true, coins: true, device_id: true },
            take: 50
        });
        res.json(users);
    } catch (err) {
        console.error('[Admin] Error searching users:', err.message);
        res.status(500).json({ error: 'Internal server error while searching users' });
    }
});

router.get('/users', ensureAdmin, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 20;

    try {
        const [total, users] = await Promise.all([
            prisma.user.count(),
            prisma.user.findMany({
                select: { id: true, username: true, wins: true, losses: true, streak_count: true, last_played_date: true, is_verified: true, is_admin: true, is_banned: true, ban_reason: true, is_muted: true, rating: true, coins: true, device_id: true },
                orderBy: { id: 'asc' },
                skip: page * limit,
                take: limit
            })
        ]);
        res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('[Admin] Error fetching user list:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/users/clones', ensureAdmin, async (req, res) => {
    try {
        const isPostgres = prisma.getDbProvider() === 'postgresql';

        // Define DB-specific functions
        const groupConcat = isPostgres ? 'STRING_AGG(username, \',\')' : 'GROUP_CONCAT(username)';
        const groupIds = isPostgres ? 'STRING_AGG(CAST(id AS TEXT), \',\')' : 'GROUP_CONCAT(id)';
        const table = isPostgres ? '"User"' : 'User'; // Postgres is case-sensitive with quotes

        const cloneGroups = await prisma.$queryRawUnsafe(`
            SELECT device_id, COUNT(*) as account_count,
                   ${groupConcat} as usernames,
                   ${groupIds} as user_ids
            FROM ${table}
            WHERE device_id IS NOT NULL AND device_id != ''
            GROUP BY device_id
            HAVING COUNT(*) > 1
            ORDER BY account_count DESC
            LIMIT 100
        `);

        const clones = cloneGroups.map(row => ({
            deviceId: row.device_id,
            count: Number(row.account_count),
            usernames: row.usernames ? row.usernames.split(',') : [],
            userIds: row.user_ids ? row.user_ids.split(',').map(v => parseInt(v)) : []
        }));
        res.json(clones);
    } catch (err) {
        console.error('[Admin] Error fetching user clones:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/users/:userId/details', ensureAdmin, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    try {
        const [userDetails, userGames, userAchievements] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, username: true, wins: true, losses: true, streak_count: true, is_verified: true, is_admin: true, is_banned: true, ban_reason: true, is_muted: true, last_played_date: true, created_at: true }
            }),
            prisma.gameParticipant.findMany({
                where: { user_id: userId },
                include: { game: { select: { id: true, end_time: true, game_type: true } } },
                orderBy: { game: { end_time: 'desc' } },
                take: 20
            }),
            prisma.userAchievement.findMany({
                where: { user_id: userId },
                include: { achievement: { select: { name_key: true, rarity: true } } },
                orderBy: { unlocked_at: 'desc' }
            })
        ]);

        if (!userDetails) return res.status(404).json({ error: 'User not found' });

        const games = userGames.map(p => ({
            id: p.game.id,
            end_time: p.game.end_time,
            game_type: p.game.game_type,
            outcome: p.outcome,
            cards_at_end: p.cards_at_end
        }));
        const achievements = userAchievements.map(ua => ({
            achievement_code: ua.achievement_code,
            unlocked_at: ua.unlocked_at,
            name_key: ua.achievement.name_key,
            rarity: ua.achievement.rarity
        }));

        res.json({ details: userDetails, games, achievements });
    } catch (error) {
        console.error(`[Admin] Error fetching details for user ${userId}:`, error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function handleUserAction(req, res, actionType, updateData, successMessage) {
    const userId = parseInt(req.params.userId, 10);
    const adminUser = req.session.user;
    const reason = req.body?.reason || null;

    if (userId === adminUser.id && (actionType.includes('ADMIN') || actionType.includes('BAN'))) {
        return res.status(400).json({ error: "You cannot change your own critical status (admin/ban)." });
    }

    try {
        const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        await prisma.user.update({ where: { id: userId }, data: updateData });

        logAdminAction({ adminId: adminUser.id, adminUsername: adminUser.username, actionType, targetUserId: userId, targetUsername: targetUser.username, reason });

        const io = req.app.get('socketio');
        const isBan = actionType.includes('BAN_USER');
        const isMute = actionType.includes('MUTE_USER');
        const isUnmute = actionType === 'UNMUTE_USER';

        if (io && (isBan || isMute || isUnmute)) {
            io.sockets.sockets.forEach((socket) => {
                if (socket.request.session?.user?.id === userId) {
                    if (isBan) {
                        const banUntil = actionType === 'BAN_USER_TEMPORARY' ? updateData.ban_until : null;
                        const options = { reason };
                        if (banUntil) options.until = new Date(banUntil).toLocaleString();
                        socket.emit('forceDisconnect', {
                            i18nKey: banUntil ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                            options
                        });
                        socket.disconnect(true);
                    } else if (isMute || isUnmute) {
                        socket.request.session.user.is_muted = isMute && actionType !== 'UNMUTE_USER';
                        socket.request.session.user.mute_until = isMute && actionType === 'MUTE_USER_TEMPORARY' ? updateData.mute_until : null;
                        socket.request.session.save();
                        socket.emit('mutedStatusUpdate', { isMuted: socket.request.session.user.is_muted });
                    }
                }
            });
        }

        const inboxService = require('../services/inboxService');
        if (isBan) {
            inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_ban_title', contentKey: 'inbox.admin_ban_content', contentParams: { reason: reason || 'Violation of rules', until: actionType === 'BAN_USER_TEMPORARY' ? ` (until ${new Date(updateData.ban_until).toLocaleString()})` : '' } });
        } else if (actionType === 'UNBAN_USER') {
            inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_unban_title', contentKey: 'inbox.admin_unban_content' });
        } else if (isMute) {
            inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_mute_title', contentKey: 'inbox.admin_mute_content', contentParams: { reason: reason || 'Spam/Abuse', until: actionType === 'MUTE_USER_TEMPORARY' ? ` (until ${new Date(updateData.mute_until).toLocaleString()})` : '' } });
        } else if (isUnmute) {
            inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_unmute_title', contentKey: 'inbox.admin_unmute_content' });
        }

        res.json({ message: successMessage(targetUser.username) });
    } catch (err) {
        console.error(`[Admin] Error in action '${actionType}' for user ${userId}:`, err.message);
        res.status(500).json({ error: 'Database update failed' });
    }
}

router.post('/users/:userId/ban', ensureAdmin, (req, res) => {
    const { reason } = req.body;
    handleUserAction(req, res, 'BAN_USER_PERMANENT', { is_banned: true, ban_reason: reason || null, ban_until: null }, (name) => `User ${name} has been banned permanently.`);
});

router.post('/users/:userId/tempban', ensureAdmin, (req, res) => {
    const { durationMinutes, reason } = req.body;
    const duration = parseInt(durationMinutes, 10) || 60;
    const ban_until = new Date(Date.now() + duration * 60000);
    handleUserAction(req, res, 'BAN_USER_TEMPORARY', { is_banned: true, ban_reason: reason || null, ban_until }, (name) => `User ${name} has been banned until ${ban_until.toLocaleString()}.`);
});

router.post('/users/:userId/unban', ensureAdmin, (req, res) => {
    handleUserAction(req, res, 'UNBAN_USER', { is_banned: false, ban_reason: null, ban_until: null }, (name) => `User ${name} has been unbanned.`);
});

router.post('/users/:userId/mute', ensureAdmin, (req, res) => {
    handleUserAction(req, res, 'MUTE_USER_PERMANENT', { is_muted: true, mute_until: null }, (name) => `User ${name} has been muted permanently.`);
});

router.post('/users/:userId/tempmute', ensureAdmin, (req, res) => {
    const { durationMinutes } = req.body;
    const duration = parseInt(durationMinutes, 10) || 60;
    const mute_until = new Date(Date.now() + duration * 60000);
    handleUserAction(req, res, 'MUTE_USER_TEMPORARY', { is_muted: true, mute_until }, (name) => `User ${name} has been muted until ${mute_until.toLocaleString()}.`);
});

router.post('/users/:userId/unmute', ensureAdmin, (req, res) => {
    handleUserAction(req, res, 'UNMUTE_USER', { is_muted: false, mute_until: null }, (name) => `User ${name} has been unmuted.`);
});

router.post('/users/:userId/set-admin', ensureAdmin, (req, res) => handleUserAction(req, res, 'SET_ADMIN_ROLE', { is_admin: true }, (name) => `User ${name} is now an admin.`));
router.post('/users/:userId/remove-admin', ensureAdmin, (req, res) => handleUserAction(req, res, 'REMOVE_ADMIN_ROLE', { is_admin: false }, (name) => `User ${name} is no longer an admin.`));
router.post('/users/:userId/verify', ensureAdmin, (req, res) => handleUserAction(req, res, 'VERIFY_USER', { is_verified: true }, (name) => `User ${name} has been verified.`));
router.post('/users/:userId/unverify', ensureAdmin, (req, res) => handleUserAction(req, res, 'UNVERIFY_USER', { is_verified: false }, (name) => `User ${name} verification removed.`));

router.put('/users/:userId', ensureAdmin, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const adminUser = req.session.user;

    const allowedFields = ['username', 'wins', 'losses', 'coins', 'rating', 'is_verified', 'is_admin', 'is_banned', 'is_muted', 'ban_reason'];
    const updateData = {};
    const fieldsToLog = [];

    for (const [field, value] of Object.entries(req.body)) {
        if (!allowedFields.includes(field)) continue;
        if (userId === adminUser.id && (field === 'is_admin' || field === 'is_banned')) continue;
        updateData[field] = value;
        fieldsToLog.push(field);
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid or allowed fields provided for update' });
    }

    try {
        await prisma.user.update({ where: { id: userId }, data: updateData });

        logAdminAction({ adminId: adminUser.id, adminUsername: adminUser.username, actionType: 'UPDATE_USER_ACCOUNT', targetUserId: userId, reason: `Updated fields: ${fieldsToLog.join(', ')}` });

        if (req.body.coins !== undefined) {
            const inboxService = require('../services/inboxService');
            inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_coins_added_title', contentKey: 'inbox.admin_coins_added_content', contentParams: { amount: req.body.coins, reason: 'Admin Adjustment' } });
        }

        res.json({ message: 'User account updated successfully' });
    } catch (err) {
        console.error(`[Admin] Error updating user ${userId}:`, err.message);
        if (err.code === 'P2002') return res.status(400).json({ error: 'Username already exists' });
        res.status(500).json({ error: 'Internal server error while updating user account' });
    }
});

router.get('/system/sockets', ensureAdmin, async (req, res) => {
    try {
        const io = req.app.get('socketio');
        if (!io) return res.status(500).json({ error: 'Socket.io instance not found' });

        const sockets = await io.fetchSockets();
        const activeConnections = sockets.map(socket => {
            const session = socket.request.session;
            return {
                socketId: socket.id,
                userId: session?.user?.id || null,
                username: session?.user?.username || 'Guest',
                ip: socket.handshake.address,
                connectedAt: socket.handshake.time,
                userAgent: socket.handshake.headers['user-agent'],
                isAdmin: !!session?.user?.is_admin,
                rooms: Array.from(socket.rooms)
            };
        });

        res.json({ totalConnections: activeConnections.length, connections: activeConnections });
    } catch (error) {
        console.error('[Admin] Error fetching active sockets:', error);
        res.status(500).json({ error: 'Internal server error while fetching active connections' });
    }
});

router.post('/system/sockets/:socketId/disconnect', ensureAdmin, async (req, res) => {
    const { socketId } = req.params;
    const { reason } = req.body;
    const io = req.app.get('socketio');

    try {
        const sockets = await io.fetchSockets();
        const targetSocket = sockets.find(s => s.id === socketId);
        if (!targetSocket) return res.status(404).json({ error: 'Socket not found or already disconnected' });

        const adminUsername = req.session.user?.username || 'Admin';
        const disconnectReason = reason || 'Disconnected by administrator';

        io.to(socketId).emit('systemMessage', { message: `You have been disconnected by ${adminUsername}. Reason: ${disconnectReason}`, type: 'error' });
        io.in(socketId).disconnectSockets(true);

        logAdminAction({ adminId: req.session.user.id, adminUsername, actionType: 'FORCE_DISCONNECT_SOCKET', reason: `Socket ID: ${socketId}, Reason: ${disconnectReason}` });

        res.json({ message: `Socket ${socketId} disconnected successfully` });
    } catch (error) {
        console.error('[Admin] Error disconnecting socket:', error);
        res.status(500).json({ error: 'Failed to disconnect socket' });
    }
});

router.get('/games/active', ensureAdmin, (req, res) => {
    const games = req.app.get('activeGames');
    if (!games) return res.status(500).json({ error: "Games object not found" });

    const activeGamesList = Object.values(games).map(game => {
        const playersInfo = game.playerOrder.map(playerId => {
            const player = game.players[playerId];
            return { id: player.id, dbId: player.dbId, name: player.name, isGuest: player.isGuest };
        });
        return {
            id: game.id,
            status: game.trumpSuit ? 'in_progress' : 'lobby',
            playerCount: game.playerOrder.length,
            maxPlayers: game.settings.maxPlayers,
            players: playersInfo,
            hostId: game.hostId,
            hostName: game.players[game.hostId]?.name || 'N/A',
            startTime: game.startTime ? game.startTime.toISOString() : null,
            settings: { deckSize: game.settings.deckSize }
        };
    });
    res.json(activeGamesList);
});

router.post('/games/:gameId/end', ensureAdmin, (req, res) => {
    const { gameId } = req.params;
    const reason = req.body?.reason;
    const games = req.app.get('activeGames');
    const io = req.app.get('socketio');
    const logEvent = req.app.get('logEvent');
    const broadcastGameState = req.app.get('broadcastGameState');
    const i18n = req.app.get('i18next');

    if (!games || !io || !logEvent || !broadcastGameState || !i18n) return res.status(500).json({ error: "Server components not found" });
    const game = games[gameId];
    if (!game) return res.status(404).json({ error: `Game with ID "${gameId}" not found.` });

    const adminUsername = req.session.user?.username || 'Administrator';
    const terminationReasonText = reason || i18n.t('admin_termination_no_reason');

    game.winner = { reason: { i18nKey: 'game_over_terminated_by_admin', options: { reason: terminationReasonText } } };
    game.lastAction = 'admin_terminate';

    logAdminAction({ adminId: req.session.user.id, adminUsername, actionType: 'TERMINATE_GAME', reason: `Game ID: ${gameId}. Reason: ${terminationReasonText}` });
    logEvent(game, null, { i18nKey: 'log_game_terminated_by_admin_event', options: { admin: adminUsername, reason: terminationReasonText } });
    broadcastGameState(gameId);

    setTimeout(() => { if (games[gameId]) { delete games[gameId]; console.log(`[Admin] Game ${gameId} forcibly terminated and deleted.`); } }, 1000);
    res.json({ message: `Game ${gameId} has been terminated.` });
});

router.get('/games/history', ensureAdmin, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;

    try {
        const [total, rows] = await Promise.all([
            prisma.game.count({ where: { end_time: { not: null } } }),
            prisma.game.findMany({
                where: { end_time: { not: null } },
                select: {
                    id: true, game_type: true, duration_seconds: true, end_time: true,
                    winner_user_id: true, loser_user_id: true
                },
                orderBy: { end_time: 'desc' },
                skip: page * pageSize,
                take: pageSize
            })
        ]);
        if (total === 0) return res.json({ rows: [], rowCount: 0 });
        res.json({ rows, rowCount: total });
    } catch (err) {
        console.error('[Admin] Error fetching game history:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/dashboard-overview', ensureAdmin, async (req, res) => {
    const io = req.app.get('socketio');
    const games = req.app.get('activeGames');
    try {
        const today = new Date().toISOString().slice(0, 10);
        const [totalUsers, todayStats] = await Promise.all([
            prisma.user.count(),
            prisma.systemStatsDaily.findUnique({ where: { date: today } })
        ]);

        let onlineUsersCount = 0;
        if (io) {
            const sockets = await io.fetchSockets();
            const uniqueUserIds = new Set();
            sockets.forEach(socket => { if (socket.request.session?.user?.id) uniqueUserIds.add(socket.request.session.user.id); });
            onlineUsersCount = uniqueUserIds.size;
        }

        res.json({
            totalUsers,
            activeGames: games ? Object.keys(games).length : 0,
            onlineUsers: onlineUsersCount,
            gamesPlayedToday: todayStats?.games_played || 0,
            newRegistrationsToday: todayStats?.new_registrations || 0
        });
    } catch (error) {
        console.error('[Admin] Error fetching dashboard statistics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/registrations-by-day', ensureAdmin, async (req, res) => {
    try {
        const isPostgres = prisma.getDbProvider() === 'postgresql';
        const days = parseInt(req.query.days) || 7;

        // Postgres-specific date truncation and intervals
        const sql = isPostgres
            ? `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count 
               FROM "User" 
               WHERE created_at > CURRENT_DATE - INTERVAL '${days} days'
               GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') 
               ORDER BY date ASC`
            : `SELECT STRFTIME('%Y-%m-%d', created_at) as date, COUNT(*) as count 
               FROM User 
               WHERE created_at > DATE('now', '-${days} days')
               GROUP BY date 
               ORDER BY date ASC`;

        const stats = await prisma.$queryRawUnsafe(sql);
        res.json(stats);
    } catch (err) {
        console.error('[Admin] Error fetching registration stats:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/games-by-day', ensureAdmin, async (req, res) => {
    try {
        const isPostgres = prisma.getDbProvider() === 'postgresql';
        const days = parseInt(req.query.days) || 7;

        const sql = isPostgres
            ? `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count
               FROM "Game"
               WHERE (status = 'finished' OR status = 'ended')
               AND created_at > CURRENT_DATE - INTERVAL '${days} days'
               GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
               ORDER BY date ASC`
            : `SELECT STRFTIME('%Y-%m-%d', created_at) as date, COUNT(*) as count
               FROM Game
               WHERE (status = 'finished' OR status = 'ended')
               AND created_at > DATE('now', '-${days} days')
               GROUP BY date
               ORDER BY date ASC`;

        const stats = await prisma.$queryRawUnsafe(sql);
        res.json(stats);
    } catch (err) {
        console.error('[Admin] Error fetching game stats:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/leaderboard', ensureAdmin, async (req, res) => {
    const type = req.query.type || 'rating';
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 200);
    const allowedSortTypes = { rating: { rating: 'desc' }, wins: { wins: 'desc' }, losses: { losses: 'desc' }, win_streak: { win_streak: 'desc' }, streak_count: { streak_count: 'desc' } };

    if (!allowedSortTypes[type]) return res.status(400).json({ error: 'Invalid leaderboard type specified.' });

    try {
        const rows = await prisma.user.findMany({
            select: { id: true, username: true, wins: true, losses: true, win_streak: true, streak_count: true, rating: true },
            orderBy: allowedSortTypes[type],
            take: limit
        });
        res.json(rows);
    } catch (err) {
        console.error('[Admin] Error fetching leaderboard:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/audit-log', ensureAdmin, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;

    try {
        const [total, rows] = await Promise.all([
            prisma.adminAuditLog.count(),
            prisma.adminAuditLog.findMany({
                orderBy: { timestamp: 'desc' },
                skip: page * pageSize,
                take: pageSize
            })
        ]);
        res.json({ rows, rowCount: total });
    } catch (err) {
        console.error('[Admin] Error fetching audit log:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/donations', ensureAdmin, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;

    try {
        const [total, rows, aggregate] = await Promise.all([
            prisma.donation.count(),
            prisma.donation.findMany({
                include: { user: { select: { username: true } } },
                orderBy: { created_at: 'desc' },
                skip: page * pageSize,
                take: pageSize
            }),
            prisma.donation.aggregate({ _sum: { amount: true } })
        ]);
        if (total === 0) return res.json({ rows: [], rowCount: 0, totalAmount: 0 });
        res.json({ rows, rowCount: total, totalAmount: aggregate._sum.amount || 0 });
    } catch (err) {
        console.error('[Admin] Error fetching donations:', err.message);
        res.status(500).json({ error: 'Internal server error while fetching donations' });
    }
});

router.get('/chat/history', ensureAdmin, (req, res) => {
    res.json(req.app.get('globalChatHistory') || []);
});

router.delete('/chat/history', ensureAdmin, (req, res) => {
    const history = req.app.get('globalChatHistory');
    const io = req.app.get('socketio');

    if (history) {
        history.length = 0;
        if (io) {
            io.emit('chatCleared', { admin: req.session.user.username });
            io.emit('systemMessage', { message: 'Global chat history has been cleared by administrator', type: 'info' });
        }
        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'CLEAR_CHAT_HISTORY', reason: 'Administrator cleared global chat history' });
        res.json({ message: 'Chat history cleared successfully' });
    } else {
        res.status(500).json({ error: 'Chat history not initialized' });
    }
});

router.delete('/chat/messages/:messageId', ensureAdmin, (req, res) => {
    const { messageId } = req.params;
    const history = req.app.get('globalChatHistory');
    const io = req.app.get('socketio');

    if (!history) return res.status(500).json({ error: 'Chat history not initialized' });

    const messageIndex = history.findIndex(msg => msg.id === messageId);
    if (messageIndex > -1) {
        const message = history[messageIndex];
        message.text = '[deleted by admin]';
        message.deleted = true;
        if (io) io.to('global_chat').emit('chat:updateMessage', message);

        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'DELETE_CHAT_MESSAGE', targetUserId: message.author?.id, targetUsername: message.author?.username, reason: `Administrator deleted message: "${messageId}"` });
        res.json({ message: 'Message deleted successfully' });
    } else {
        res.status(404).json({ error: 'Message not found' });
    }
});

router.get('/chat/history/db', ensureAdmin, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;

    try {
        const [total, rows] = await Promise.all([
            prisma.chatMessage.count({ where: { is_deleted: false } }),
            prisma.chatMessage.findMany({
                where: { is_deleted: false },
                orderBy: { created_at: 'desc' },
                skip: page * pageSize,
                take: pageSize
            })
        ]);
        res.json({ rows, rowCount: total });
    } catch (err) {
        console.error('[Admin] Error fetching chat history from DB:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/chat/search', ensureAdmin, async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

    try {
        const rows = await prisma.chatMessage.findMany({
            where: { content: { contains: q }, is_deleted: false },
            orderBy: { created_at: 'desc' },
            take: 50
        });
        res.json(rows);
    } catch (err) {
        console.error('[Admin] Error searching chat:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/chat/filters', ensureAdmin, async (req, res) => {
    try {
        const rows = await prisma.chatFilter.findMany({ orderBy: { created_at: 'desc' } });
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.post('/chat/filters', ensureAdmin, async (req, res) => {
    const { type, content } = req.body;
    if (!['word', 'regex'].includes(type) || !content) return res.status(400).json({ error: 'Invalid type or content' });

    try {
        const filter = await prisma.chatFilter.create({ data: { type, content } });
        if (global.loadChatFilters) global.loadChatFilters();
        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'ADD_CHAT_FILTER', reason: `Added ${type}: ${content}` });
        res.json(filter);
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.delete('/chat/filters/:id', ensureAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        await prisma.chatFilter.delete({ where: { id } });
        if (global.loadChatFilters) global.loadChatFilters();
        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'REMOVE_CHAT_FILTER', reason: `Removed filter ID: ${id}` });
        res.json({ message: 'Filter deleted' });
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.get('/chat/settings', ensureAdmin, (req, res) => res.json(global.globalChatSettings || {}));

router.post('/chat/settings', ensureAdmin, (req, res) => {
    const { slowModeInterval } = req.body;
    if (slowModeInterval !== undefined) {
        global.globalChatSettings.slowModeInterval = parseInt(slowModeInterval);
        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'UPDATE_CHAT_SETTINGS', reason: `Slow Mode: ${slowModeInterval}s` });
    }
    res.json(global.globalChatSettings);
});

router.get('/maintenance/status', ensureAdmin, (req, res) => {
    const mm = maintenanceService.getMaintenanceMode();
    res.json({ enabled: mm.enabled, message: mm.enabled ? mm.message : mm.warningMessage, startTime: mm.startTime });
});

router.post('/maintenance/enable', ensureAdmin, (req, res) => {
    const { message, minutesUntilStart = 0 } = req.body;
    const mm = req.app.get('maintenanceMode');
    const io = req.app.get('socketio');
    const startTime = Date.now() + minutesUntilStart * 60 * 1000;
    mm.startTime = startTime;
    mm.warningMessage = message || "Scheduled maintenance will begin soon.";

    if (minutesUntilStart > 0) {
        io.emit('maintenanceWarning', { message: mm.warningMessage, startTime: mm.startTime });
        if (mm.timer) clearTimeout(mm.timer);
        mm.timer = setTimeout(() => { mm.enabled = true; mm.message = mm.warningMessage; console.log('[Admin] Maintenance mode ENABLED.'); }, minutesUntilStart * 60 * 1000);
        res.json({ status: 'warning_scheduled', message: `Maintenance scheduled in ${minutesUntilStart} minutes.` });
    } else {
        mm.enabled = true;
        mm.message = message || "The site is undergoing maintenance. Please come back later.";
        console.log('[Admin] Maintenance mode ENABLED IMMEDIATELY.');
        res.json({ status: 'enabled', message: 'Maintenance mode enabled.' });
    }
});

router.post('/maintenance/disable', ensureAdmin, (req, res) => {
    maintenanceService.setMaintenanceMode({ enabled: false });
    maintenanceService.cancelMaintenance();
    console.log('[Admin] Maintenance mode disabled.');
    res.json({ status: 'disabled', message: 'Maintenance mode disabled.' });
});

router.post('/users/:id/send-push', ensureAdmin, async (req, res) => {
    const targetUserId = parseInt(req.params.id, 10);
    const { title, body, url } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'Title and body are required.' });

    const success = await notificationService.sendNotification(targetUserId, { title, body, url: url || '/' });
    if (success) {
        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'SEND_TEST_PUSH', targetUserId, reason: `Title: ${title}` });
        res.status(200).json({ message: 'Push notification sent successfully.' });
    } else {
        res.status(404).json({ message: 'Subscription not found or failed to send.' });
    }
});

router.post('/broadcast', ensureAdmin, (req, res) => {
    const { message, type = 'info' } = req.body;
    const io = req.app.get('socketio');
    if (!message) return res.status(400).json({ error: 'Message is required' });
    io.emit('systemMessage', { message, type });
    logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'BROADCAST_MESSAGE', reason: `Type: ${type}, Message: ${message}` });
    res.json({ message: 'Broadcast sent successfully' });
});

router.post('/broadcast-push', ensureAdmin, async (req, res) => {
    const { title, body, url } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'Title and body are required.' });
    const result = await notificationService.sendBroadcastNotification({ title, body, url: url || '/' });
    logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'BROADCAST_PUSH', reason: `Title: ${title}, Success: ${result.successCount}, Failed: ${result.failureCount}` });
    res.json({ message: 'Push broadcast completed', ...result });
});

router.post('/users/:userId/ban-device', ensureAdmin, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const { reason, durationMinutes } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { device_id: true, username: true } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.device_id) return res.status(400).json({ error: 'User has no device ID recorded' });

        const ban_until = durationMinutes ? new Date(Date.now() + durationMinutes * 60000) : null;

        await prisma.bannedDevice.upsert({
            where: { device_id: user.device_id },
            update: { reason: reason || 'Admin Ban', admin_id: req.session.user.id, ban_until },
            create: { device_id: user.device_id, reason: reason || 'Admin Ban', admin_id: req.session.user.id, ban_until }
        });

        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'BAN_DEVICE', targetUserId: userId, reason: `Banned Device ${user.device_id}. Reason: ${reason}` });
        res.json({ message: `Device ${user.device_id} banned successfully` });
    } catch (err) {
        console.error('[Admin] Error banning device:', err.message);
        res.status(500).json({ error: 'DB Error banning device' });
    }
});

router.get('/users/:userId/active-sessions', ensureAdmin, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    try {
        const rows = await prisma.activeSession.findMany({ where: { user_id: userId }, orderBy: { last_active: 'desc' } });
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.delete('/sessions/:sessionId', ensureAdmin, async (req, res) => {
    const { sessionId } = req.params;
    if (sessionId === req.sessionID) return res.status(400).json({ error: "You cannot terminate your own current session." });

    try {
        const session = await prisma.activeSession.findUnique({ where: { id: sessionId }, select: { user_id: true } });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        await prisma.activeSession.delete({ where: { id: sessionId } });

        logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'TERMINATE_SESSION_ADMIN', reason: `Terminated session ${sessionId}` });

        const io = req.app.get('socketio');
        if (io) io.to(`user_${session.user_id}`).emit('sessionTerminated', { sessionId });

        const inboxService = require('../services/inboxService');
        inboxService.addMessage(session.user_id, { type: 'admin_action', titleKey: 'inbox.admin_session_terminated_title', contentKey: 'inbox.admin_session_terminated_content' });

        res.json({ message: 'Session terminated' });
    } catch (err) {
        console.error('[Admin] Error terminating session:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/devices/:deviceId', ensureAdmin, async (req, res) => {
    const { deviceId } = req.params;
    try {
        const device = await prisma.knownDevice.findUnique({
            where: { id: deviceId },
            include: { users: { include: { user: { select: { id: true, username: true } } }, orderBy: { last_used: 'desc' } } }
        });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const users = device.users.map(ud => ({ id: ud.user.id, username: ud.user.username, last_used: ud.last_used }));
        res.json({ device, users });
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.get('/banned-devices', ensureAdmin, async (req, res) => {
    try {
        const rows = await prisma.bannedDevice.findMany({ orderBy: { created_at: 'desc' } });
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.delete('/banned-devices/:id', ensureAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        await prisma.bannedDevice.delete({ where: { id } });
        res.json({ success: true, message: 'Device unbanned' });
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.post('/devices/:deviceId/ban', ensureAdmin, async (req, res) => {
    const { deviceId } = req.params;
    const { reason, until } = req.body;

    try {
        await prisma.bannedDevice.create({
            data: { device_id: deviceId, reason: reason || 'No reason', admin_id: req.session.user.id, ban_until: until ? new Date(until) : null }
        });
        res.json({ success: true, message: 'Device banned successfully' });
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ error: 'Device is already banned' });
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/devices/:deviceId/ban-info', ensureAdmin, async (req, res) => {
    const { deviceId } = req.params;
    try {
        const row = await prisma.bannedDevice.findUnique({ where: { device_id: deviceId } });
        res.json({ banned: !!row, info: row });
    } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

router.post('/inbox/send', ensureAdmin, async (req, res) => {
    const { userId, message, isBroadcast } = req.body;
    const inboxService = require('../services/inboxService');
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        if (isBroadcast) {
            await inboxService.broadcastMessage({ type: 'admin_action', titleKey: 'inbox.admin_message_title', contentKey: 'inbox.admin_message_content', contentParams: { text: message } });
            logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'BROADCAST_INBOX', reason: `Message: ${message}` });
            res.json({ message: 'Broadcast inbox message sent successfully' });
        } else {
            if (!userId) return res.status(400).json({ error: 'User ID is required for direct message' });
            await inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_message_title', contentKey: 'inbox.admin_message_content', contentParams: { text: message } });
            logAdminAction({ adminId: req.session.user.id, adminUsername: req.session.user.username, actionType: 'SEND_INBOX_MESSAGE', targetUserId: userId, reason: `Message: ${message}` });
            res.json({ message: 'Inbox message sent successfully' });
        }
    } catch (error) {
        console.error('[Admin] Error sending inbox message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

module.exports = router;
