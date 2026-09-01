import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import db from '../db/drizzle.js';
import { user, game, gameParticipant, achievement, userAchievement, activeSession, knownDevice, bannedDevice, chatMessage, chatFilter, profile, inboxMessage, donation, adminAuditLog, friend, systemStatsDaily } from '../db/schema.ts';
import { ensureAdmin } from '../middlewares/authMiddleware.js';
import { logAdminAction } from '../services/auditLogService.js';
import notificationService from '../services/notificationService.js';
import maintenanceService from '../services/maintenanceService.js';
import inboxService from '../services/inboxService.js';
import { eq, or, like, and, count, desc, sql, isNotNull } from 'drizzle-orm';
import type { GameState } from '../types/index.js';

const router = express.Router();

const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (req.session?.user?.is_admin) return next();
    res.status(403).json({ message: 'Forbidden: Admin access required.' });
};

router.use(isAdmin);

router.get('/users/search', ensureAdmin, async (req: Request, res: Response) => {
    const { query } = req.query as { query?: string };
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
    }
    try {
        const searchId = isNaN(parseInt(query)) ? -1 : parseInt(query);
        const users = await db.query.user.findMany({
            where: or(like(user.username, `%${query}%`), eq(user.id, searchId)),
            columns: { id: true, username: true, wins: true, losses: true, streak_count: true, last_played_date: true, is_verified: true, is_admin: true, is_banned: true, ban_reason: true, is_muted: true, rating: true, coins: true, device_id: true },
            limit: 50
        });
        res.json(users);
    } catch (err: any) {
        console.error('[Admin] Error searching users:', err.message);
        res.status(500).json({ error: 'Internal server error while searching users' });
    }
});

router.get('/users', ensureAdmin, async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 0;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    try {
        const [total, users] = await Promise.all([
            db.select({ value: count() }).from(user).then((r: any) => r[0]?.value ?? 0),
            db.query.user.findMany({
                columns: { id: true, username: true, wins: true, losses: true, streak_count: true, last_played_date: true, is_verified: true, is_admin: true, is_banned: true, ban_reason: true, is_muted: true, rating: true, coins: true, device_id: true },
                orderBy: { id: 'asc' },
                offset: page * limit,
                limit
            })
        ]);
        res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err: any) {
        console.error('[Admin] Error fetching user list:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/users/clones', ensureAdmin, async (req: Request, res: Response) => {
    try {
        const cloneGroups = await db.$client.unsafe(`
            SELECT device_id, COUNT(*) as account_count,
                   STRING_AGG(username, ',') as usernames,
                   STRING_AGG(CAST(id AS TEXT), ',') as user_ids
            FROM "User"
            WHERE device_id IS NOT NULL AND device_id != ''
            GROUP BY device_id
            HAVING COUNT(*) > 1
            ORDER BY account_count DESC
            LIMIT 100
        `);

        const clones = (cloneGroups as any[]).map((row: any) => ({
            deviceId: row.device_id,
            count: Number(row.account_count),
            usernames: row.usernames ? row.usernames.split(',') : [],
            userIds: row.user_ids ? row.user_ids.split(',').map((v: string) => parseInt(v)) : []
        }));
        res.json(clones);
    } catch (err: any) {
        console.error('[Admin] Error fetching user clones:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/users/:userId/details', ensureAdmin, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId as string, 10);
    try {
        const [userDetails, userGames, userAchievements] = await Promise.all([
            db.query.user.findFirst({
                where: { id: userId },
                columns: { id: true, username: true, wins: true, losses: true, streak_count: true, is_verified: true, is_admin: true, is_banned: true, ban_reason: true, is_muted: true, last_played_date: true, created_at: true }
            }),
            db.select({
                game_id: gameParticipant.game_id,
                outcome: gameParticipant.outcome,
                cards_at_end: gameParticipant.cards_at_end,
                game_id_col: game.id,
                end_time: game.end_time,
                game_type: game.game_type,
            })
                .from(gameParticipant)
                .leftJoin(game, eq(gameParticipant.game_id, game.id))
                .where(eq(gameParticipant.user_id, userId))
                .orderBy(sql`end_time desc`)
                .limit(20),
            db.select({
                achievement_code: userAchievement.achievement_code,
                unlocked_at: userAchievement.unlocked_at,
                name_key: achievement.name_key,
                rarity: achievement.rarity,
            })
                .from(userAchievement)
                .leftJoin(achievement, eq(userAchievement.achievement_code, achievement.code))
                .where(eq(userAchievement.user_id, userId))
                .orderBy(sql`unlocked_at desc`)
        ]);

        if (!userDetails) return res.status(404).json({ error: 'User not found' });

        const games = (userGames as any[]).map((p: any) => ({
            id: p.game_id_col,
            end_time: p.end_time,
            game_type: p.game_type,
            outcome: p.outcome,
            cards_at_end: p.cards_at_end
        }));
        const achievements = (userAchievements as any[]).map((ua: any) => ({
            achievement_code: ua.achievement_code,
            unlocked_at: ua.unlocked_at,
            name_key: ua.name_key,
            rarity: ua.rarity
        }));

        res.json({ details: userDetails, games, achievements });
    } catch (error: any) {
        console.error(`[Admin] Error fetching details for user ${userId}:`, error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function handleUserAction(req: Request, res: Response, actionType: string, updateData: any, successMessage: (name: any) => string) {
    const userId = parseInt(req.params.userId as string, 10);
    const adminUser = req.session!.user!;
    const reason = req.body?.reason || null;

    if (userId === adminUser.id && (actionType.includes('ADMIN') || actionType.includes('BAN'))) {
        return res.status(400).json({ error: "You cannot change your own critical status (admin/ban)." });
    }

    try {
        const targetUser = await db.query.user.findFirst({ where: { id: userId }, columns: { id: true, username: true } });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        await db.update(user).set(updateData).where(eq(user.id, userId));

        logAdminAction({ adminId: adminUser.id, adminUsername: adminUser.username, actionType, targetUserId: userId, targetUsername: targetUser.username, reason });

        const io = req.app.get('socketio');
        const isBan = actionType.includes('BAN_USER');
        const isMute = actionType.includes('MUTE_USER');
        const isUnmute = actionType === 'UNMUTE_USER';

        if (io && (isBan || isMute || isUnmute)) {
            io.sockets.sockets.forEach((socket: any) => {
                if (socket.request.session?.user?.id === userId) {
                    if (isBan) {
                        const banUntil = actionType === 'BAN_USER_TEMPORARY' ? updateData.ban_until : null;
                        const options: any = { reason };
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
    } catch (err: any) {
        console.error(`[Admin] Error in action '${actionType}' for user ${userId}:`, err.message);
        res.status(500).json({ error: 'Database update failed' });
    }
}

router.post('/users/:userId/ban', ensureAdmin, (req: Request, res: Response) => {
    const { reason } = req.body;
    handleUserAction(req, res, 'BAN_USER_PERMANENT', { is_banned: true, ban_reason: reason || null, ban_until: null }, (name: any) => `User ${name} has been banned permanently.`);
});

router.post('/users/:userId/tempban', ensureAdmin, (req: Request, res: Response) => {
    const { durationMinutes, reason } = req.body;
    const duration = parseInt(durationMinutes, 10) || 60;
    const ban_until = new Date(Date.now() + duration * 60000);
    handleUserAction(req, res, 'BAN_USER_TEMPORARY', { is_banned: true, ban_reason: reason || null, ban_until }, (name: any) => `User ${name} has been banned until ${ban_until.toLocaleString()}.`);
});

router.post('/users/:userId/unban', ensureAdmin, (req: Request, res: Response) => {
    handleUserAction(req, res, 'UNBAN_USER', { is_banned: false, ban_reason: null, ban_until: null }, (name: any) => `User ${name} has been unbanned.`);
});

router.post('/users/:userId/mute', ensureAdmin, (req: Request, res: Response) => {
    handleUserAction(req, res, 'MUTE_USER_PERMANENT', { is_muted: true, mute_until: null }, (name: any) => `User ${name} has been muted permanently.`);
});

router.post('/users/:userId/tempmute', ensureAdmin, (req: Request, res: Response) => {
    const { durationMinutes } = req.body;
    const duration = parseInt(durationMinutes, 10) || 60;
    const mute_until = new Date(Date.now() + duration * 60000);
    handleUserAction(req, res, 'MUTE_USER_TEMPORARY', { is_muted: true, mute_until }, (name: any) => `User ${name} has been muted until ${mute_until.toLocaleString()}.`);
});

router.post('/users/:userId/unmute', ensureAdmin, (req: Request, res: Response) => {
    handleUserAction(req, res, 'UNMUTE_USER', { is_muted: false, mute_until: null }, (name: any) => `User ${name} has been unmuted.`);
});

router.post('/users/:userId/set-admin', ensureAdmin, (req: Request, res: Response) => handleUserAction(req, res, 'SET_ADMIN_ROLE', { is_admin: true }, (name: any) => `User ${name} is now an admin.`));
router.post('/users/:userId/remove-admin', ensureAdmin, (req: Request, res: Response) => handleUserAction(req, res, 'REMOVE_ADMIN_ROLE', { is_admin: false }, (name: any) => `User ${name} is no longer an admin.`));
router.post('/users/:userId/verify', ensureAdmin, (req: Request, res: Response) => handleUserAction(req, res, 'VERIFY_USER', { is_verified: true }, (name: any) => `User ${name} has been verified.`));
router.post('/users/:userId/unverify', ensureAdmin, (req: Request, res: Response) => handleUserAction(req, res, 'UNVERIFY_USER', { is_verified: false }, (name: any) => `User ${name} verification removed.`));

router.put('/users/:userId', ensureAdmin, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId as string, 10);
    const adminUser = req.session!.user!;

    const allowedFields = ['username', 'wins', 'losses', 'coins', 'rating', 'is_verified', 'is_admin', 'is_banned', 'is_muted', 'ban_reason'];
    const updateData: Record<string, any> = {};
    const fieldsToLog: string[] = [];

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
        await db.update(user).set(updateData).where(eq(user.id, userId));

        logAdminAction({ adminId: adminUser.id, adminUsername: adminUser.username, actionType: 'UPDATE_USER_ACCOUNT', targetUserId: userId, reason: `Updated fields: ${fieldsToLog.join(', ')}` });

        if (req.body.coins !== undefined) {
            inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_coins_added_title', contentKey: 'inbox.admin_coins_added_content', contentParams: { amount: req.body.coins, reason: 'Admin Adjustment' } });
        }

        res.json({ message: 'User account updated successfully' });
    } catch (err: any) {
        console.error(`[Admin] Error updating user ${userId}:`, err.message);
        if (err.code === 'P2002') return res.status(400).json({ error: 'Username already exists' });
        res.status(500).json({ error: 'Internal server error while updating user account' });
    }
});

router.get('/system/sockets', ensureAdmin, async (req: Request, res: Response) => {
    try {
        const io = req.app.get('socketio');
        if (!io) return res.status(500).json({ error: 'Socket.io instance not found' });

        const sockets = await io.fetchSockets();
        const activeConnections = sockets.map((socket: any) => {
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

router.post('/system/sockets/:socketId/disconnect', ensureAdmin, async (req: Request, res: Response) => {
    const { socketId } = req.params as { socketId: string };
    const { reason } = req.body as { reason?: string };
    const io = req.app.get('socketio');

    try {
        const sockets = await io.fetchSockets();
        const targetSocket = sockets.find((s: any) => s.id === socketId);
        if (!targetSocket) return res.status(404).json({ error: 'Socket not found or already disconnected' });

        const adminUsername = req.session!.user?.username || 'Admin';
        const disconnectReason = reason || 'Disconnected by administrator';

        io.to(socketId).emit('systemMessage', { message: `You have been disconnected by ${adminUsername}. Reason: ${disconnectReason}`, type: 'error' });
        io.in(socketId).disconnectSockets(true);

        logAdminAction({ adminId: req.session!.user!.id, adminUsername, actionType: 'FORCE_DISCONNECT_SOCKET', reason: `Socket ID: ${socketId}, Reason: ${disconnectReason}` });

        res.json({ message: `Socket ${socketId} disconnected successfully` });
    } catch (error) {
        console.error('[Admin] Error disconnecting socket:', error);
        res.status(500).json({ error: 'Failed to disconnect socket' });
    }
});

router.get('/games/active', ensureAdmin, (req: Request, res: Response) => {
    const games = req.app.get('activeGames') as Record<string, GameState>;
    if (!games) return res.status(500).json({ error: "Games object not found" });

    const activeGamesList = Object.values(games).map((game: GameState) => {
        const playersInfo = game.playerOrder.map((playerId: string) => {
            const player = game.players[playerId];
            if (!player) return { id: '', dbId: null, name: 'Unknown', isGuest: true };
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

router.post('/games/:gameId/end', ensureAdmin, (req: Request, res: Response) => {
    const { gameId } = req.params as { gameId: string };
    const reason = req.body?.reason as string;
    const games = req.app.get('activeGames') as Record<string, GameState>;
    const io = req.app.get('socketio');
    const logEvent = req.app.get('logEvent') as ((game: GameState, player: any, entry: any) => void);
    const broadcastGameState = req.app.get('broadcastGameState') as ((gameId: string) => void);
    const i18n = req.app.get('i18next') as { t: (key: string, options?: any) => string };

    if (!games || !io || !logEvent || !broadcastGameState || !i18n) return res.status(500).json({ error: "Server components not found" });
    const game = games[gameId];
    if (!game) return res.status(404).json({ error: `Game with ID "${gameId}" not found.` });

    const adminUsername = req.session!.user?.username || 'Administrator';
    const terminationReasonText = reason || i18n.t('admin_termination_no_reason', {});

    game.winner = { reason: { i18nKey: 'game_over_terminated_by_admin', options: { reason: terminationReasonText } } } as any;
    game.lastAction = 'admin_terminate';

    logAdminAction({ adminId: req.session!.user!.id, adminUsername, actionType: 'TERMINATE_GAME', reason: `Game ID: ${gameId}. Reason: ${terminationReasonText}` });
    logEvent(game, null, { i18nKey: 'log_game_terminated_by_admin_event', options: { admin: adminUsername, reason: terminationReasonText } });
    broadcastGameState(gameId);

    setTimeout(() => { if (games[gameId]) { delete games[gameId]; console.log(`[Admin] Game ${gameId} forcibly terminated and deleted.`); } }, 1000);
    res.json({ message: `Game ${gameId} has been terminated.` });
});

router.get('/games/history', ensureAdmin, async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 0;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 25;

    try {
        const [total, rows] = await Promise.all([
            db.select({ value: count() }).from(game).where(isNotNull(game.end_time)).then((r: any) => r[0]?.value ?? 0),
            db.query.game.findMany({
                where: isNotNull(game.end_time),
                columns: {
                    id: true, game_type: true, duration_seconds: true, end_time: true,
                    winner_user_id: true, loser_user_id: true
                },
                orderBy: { end_time: 'desc' },
                offset: page * pageSize,
                limit: pageSize
            })
        ]);
        if (total === 0) return res.json({ rows: [], rowCount: 0 });
        res.json({ rows, rowCount: total });
    } catch (err: any) {
        console.error('[Admin] Error fetching game history:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/dashboard-overview', ensureAdmin, async (req: Request, res: Response) => {
    const io = req.app.get('socketio');
    const games = req.app.get('activeGames') as Record<string, GameState> | null;
    try {
        const today = new Date().toISOString().slice(0, 10);
        const [totalUsers, todayStats] = await Promise.all([
            db.select({ value: count() }).from(user).then((r: any) => r[0]?.value ?? 0),
            db.select().from(systemStatsDaily).where(eq(systemStatsDaily.date, today)).limit(1).then((r: any) => r[0] ?? null) as any[]
        ]);

        let onlineUsersCount = 0;
        if (io) {
            const sockets = await io.fetchSockets();
            const uniqueUserIds = new Set<any>();
            sockets.forEach((socket: any) => { if (socket.request.session?.user?.id) uniqueUserIds.add(socket.request.session.user.id); });
            onlineUsersCount = uniqueUserIds.size;
        }

        res.json({
            totalUsers,
            activeGames: games ? Object.keys(games).length : 0,
            onlineUsers: onlineUsersCount,
            gamesPlayedToday: (todayStats as any)?.games_played || 0,
            newRegistrationsToday: (todayStats as any)?.new_registrations || 0
        });
    } catch (error) {
        console.error('[Admin] Error fetching dashboard statistics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/registrations-by-day', ensureAdmin, async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 7;

        const query = `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count
               FROM "User"
               WHERE created_at > CURRENT_DATE - INTERVAL '${days} days'
               GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
               ORDER BY date ASC`;

        const stats = await db.$client.unsafe(query);
        res.json(stats);
    } catch (err: any) {
        console.error('[Admin] Error fetching registration stats:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/games-by-day', ensureAdmin, async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 7;

        const query = `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count
               FROM "Game"
               WHERE (status = 'finished' OR status = 'ended')
               AND created_at > CURRENT_DATE - INTERVAL '${days} days'
               GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
               ORDER BY date ASC`;

        const stats = await db.$client.unsafe(query);
        res.json(stats);
    } catch (err: any) {
        console.error('[Admin] Error fetching game stats:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats/leaderboard', ensureAdmin, async (req: Request, res: Response) => {
    const type = req.query.type as string || 'rating';
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 100), 200);
    const allowedSortTypes: Record<string, any> = { rating: { rating: 'desc' }, wins: { wins: 'desc' }, losses: { losses: 'desc' }, win_streak: { win_streak: 'desc' }, streak_count: { streak_count: 'desc' } };

    if (!allowedSortTypes[type]) return res.status(400).json({ error: 'Invalid leaderboard type specified.' });

    try {
        const rows = await db.query.user.findMany({
            columns: { id: true, username: true, wins: true, losses: true, win_streak: true, streak_count: true, rating: true },
            orderBy: allowedSortTypes[type],
            limit
        });
        res.json(rows);
    } catch (err: any) {
        console.error('[Admin] Error fetching leaderboard:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/audit-log', ensureAdmin, async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 0;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 25;

    try {
        const [total, rows] = await Promise.all([
            db.select({ value: count() }).from(adminAuditLog).then((r: any) => r[0]?.value ?? 0),
            db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.timestamp)).offset(page * pageSize).limit(pageSize)
        ]);
        res.json({ rows, rowCount: total });
    } catch (err: any) {
        console.error('[Admin] Error fetching audit log:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/donations', ensureAdmin, async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 0;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;

    try {
        const [total, rows] = await Promise.all([
            db.select({ value: count() }).from(donation).then((r: any) => r[0]?.value ?? 0),
            db.query.donation.findMany({
                with: { user: { columns: { username: true } } },
                orderBy: { created_at: 'desc' },
                offset: page * pageSize,
                limit: pageSize
            })
        ]);

        const sumRows = await db.select({ sum: sql`sum(${donation.amount})` }).from(donation);
        const totalAmount = Number((sumRows as any[])[0]?.sum) || 0;

        if (total === 0) return res.json({ rows: [], rowCount: 0, totalAmount: 0 });
        res.json({ rows, rowCount: total, totalAmount });
    } catch (err: any) {
        console.error('[Admin] Error fetching donations:', err.message);
        res.status(500).json({ error: 'Internal server error while fetching donations' });
    }
});

router.get('/chat/history', ensureAdmin, (req: Request, res: Response) => {
    res.json((req.app.get('globalChatHistory') as any) || []);
});

router.delete('/chat/history', ensureAdmin, (req: Request, res: Response) => {
    const history = req.app.get('globalChatHistory') as any[];
    const io = req.app.get('socketio');

    if (history) {
        history.length = 0;
        if (io) {
            io.emit('chatCleared', { admin: req.session!.user!.username });
            io.emit('systemMessage', { message: 'Global chat history has been cleared by administrator', type: 'info' });
        }
        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'CLEAR_CHAT_HISTORY', reason: 'Administrator cleared global chat history' });
        res.json({ message: 'Chat history cleared successfully' });
    } else {
        res.status(500).json({ error: 'Chat history not initialized' });
    }
});

router.delete('/chat/messages/:messageId', ensureAdmin, (req: Request, res: Response) => {
    const { messageId } = req.params;
    const history = req.app.get('globalChatHistory') as any[];
    const io = req.app.get('socketio');

    if (!history) return res.status(500).json({ error: 'Chat history not initialized' });

    const messageIndex = history.findIndex((msg: any) => msg.id === messageId);
    if (messageIndex > -1) {
        const message = history[messageIndex];
        message.text = '[deleted by admin]';
        message.deleted = true;
        if (io) io.to('global_chat').emit('chat:updateMessage', message);

        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'DELETE_CHAT_MESSAGE', targetUserId: message.author?.id, targetUsername: message.author?.username, reason: `Administrator deleted message: "${messageId}"` });
        res.json({ message: 'Message deleted successfully' });
    } else {
        res.status(404).json({ error: 'Message not found' });
    }
});

router.get('/chat/history/db', ensureAdmin, async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 0;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;

    try {
        const [total, rows] = await Promise.all([
            db.select({ value: count() }).from(chatMessage).where(eq(chatMessage.is_deleted, false)).then((r: any) => r[0]?.value ?? 0),
            db.select().from(chatMessage).where(eq(chatMessage.is_deleted, false)).orderBy(desc(chatMessage.created_at)).offset(page * pageSize).limit(pageSize)
        ]);
        res.json({ rows, rowCount: total });
    } catch (err: any) {
        console.error('[Admin] Error fetching chat history from DB:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/chat/search', ensureAdmin, async (req: Request, res: Response) => {
    const { q } = req.query as { q?: string };
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

    try {
        const rows = await db.select().from(chatMessage).where(and(like(chatMessage.content, `%${q}%`), eq(chatMessage.is_deleted, false))).orderBy(desc(chatMessage.created_at)).limit(50);
        res.json(rows);
    } catch (err: any) {
        console.error('[Admin] Error searching chat:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/chat/filters', ensureAdmin, async (req: Request, res: Response) => {
    try {
        const rows = await db.select().from(chatFilter).orderBy(desc(chatFilter.created_at));
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.post('/chat/filters', ensureAdmin, async (req: Request, res: Response) => {
    const { type, content } = req.body as { type: string; content: string };
    if (!['word', 'regex'].includes(type) || !content) return res.status(400).json({ error: 'Invalid type or content' });

    try {
        const [filter] = await db.insert(chatFilter).values({ type, content }).returning();
        if ((global as any).loadChatFilters) (global as any).loadChatFilters();
        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'ADD_CHAT_FILTER', reason: `Added ${type}: ${content}` });
        res.json(filter);
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.delete('/chat/filters/:id', ensureAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    try {
        await db.delete(chatFilter).where(eq(chatFilter.id, id));
        if ((global as any).loadChatFilters) (global as any).loadChatFilters();
        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'REMOVE_CHAT_FILTER', reason: `Removed filter ID: ${id}` });
        res.json({ message: 'Filter deleted' });
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.get('/chat/settings', ensureAdmin, (req: Request, res: Response) => res.json((global as any).globalChatSettings || {}));

router.post('/chat/settings', ensureAdmin, (req: Request, res: Response) => {
    const { slowModeInterval } = req.body as { slowModeInterval?: string };
    if (slowModeInterval !== undefined) {
        (global as any).globalChatSettings.slowModeInterval = parseInt(slowModeInterval);
        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'UPDATE_CHAT_SETTINGS', reason: `Slow Mode: ${slowModeInterval}s` });
    }
    res.json((global as any).globalChatSettings);
});

router.get('/maintenance/status', ensureAdmin, (req: Request, res: Response) => {
    const mm = maintenanceService.getMaintenanceMode();
    res.json({ enabled: mm.enabled, message: mm.enabled ? mm.message : mm.warningMessage, startTime: mm.startTime });
});

router.post('/maintenance/enable', ensureAdmin, (req: Request, res: Response) => {
    const { message, minutesUntilStart = 0 } = req.body as { message?: string; minutesUntilStart?: number };
    const startTime = Date.now() + minutesUntilStart * 60 * 1000;

    if (minutesUntilStart > 0) {
        maintenanceService.scheduleMaintenance(message || "Scheduled maintenance will begin soon.", startTime);
        maintenanceService.setMaintenanceMode({ startTime, warningMessage: message || "Scheduled maintenance will begin soon." });
        setTimeout(() => {
            maintenanceService.setMaintenanceMode({ enabled: true, message: message || "The site is undergoing maintenance. Please come back later." });
            console.log('[Admin] Maintenance mode ENABLED.');
        }, minutesUntilStart * 60 * 1000);
        res.json({ status: 'warning_scheduled', message: `Maintenance scheduled in ${minutesUntilStart} minutes.` });
    } else {
        maintenanceService.setMaintenanceMode({
            enabled: true,
            message: message || "The site is undergoing maintenance. Please come back later."
        });
        console.log('[Admin] Maintenance mode ENABLED IMMEDIATELY.');
        res.json({ status: 'enabled', message: 'Maintenance mode enabled.' });
    }
});

router.put('/maintenance/update', ensureAdmin, (req: Request, res: Response) => {
    const { message } = req.body as { message: string };
    if (!message) return res.status(400).json({ error: 'Message is required' });
    maintenanceService.setMaintenanceMode({ message, warningMessage: message });
    console.log('[Admin] Maintenance message updated.');
    res.json({ status: 'updated', message: 'Maintenance message updated.' });
});

router.post('/maintenance/disable', ensureAdmin, (req: Request, res: Response) => {
    maintenanceService.setMaintenanceMode({ enabled: false });
    maintenanceService.cancelMaintenance();
    console.log('[Admin] Maintenance mode disabled.');
    res.json({ status: 'disabled', message: 'Maintenance mode disabled.' });
});

router.post('/users/:id/send-push', ensureAdmin, async (req: Request, res: Response) => {
    const targetUserId = parseInt(req.params.id as string, 10);
    const { title, body, url } = req.body as { title?: string; body?: string; url?: string };
    if (!title || !body) return res.status(400).json({ message: 'Title and body are required.' });

    const success = await notificationService.sendNotification(targetUserId, { title, body, url: url || '/' });
    if (success) {
        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'SEND_TEST_PUSH', targetUserId, reason: `Title: ${title}` });
        res.status(200).json({ message: 'Push notification sent successfully.' });
    } else {
        res.status(404).json({ message: 'Subscription not found or failed to send.' });
    }
});

router.post('/broadcast', ensureAdmin, (req: Request, res: Response) => {
    const { message, type = 'info' } = req.body as { message?: string; type?: string };
    const io = req.app.get('socketio');
    if (!message) return res.status(400).json({ error: 'Message is required' });
    io.emit('systemMessage', { message, type });
    logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'BROADCAST_MESSAGE', reason: `Type: ${type}, Message: ${message}` });
    res.json({ message: 'Broadcast sent successfully' });
});

router.post('/broadcast-push', ensureAdmin, async (req: Request, res: Response) => {
    const { title, body, url } = req.body as { title: string; body: string; url?: string };
    if (!title || !body) return res.status(400).json({ message: 'Title and body are required.' });
    const result = await notificationService.sendBroadcastNotification({ title, body, url: url || '/' });
    logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'BROADCAST_PUSH', reason: `Title: ${title}, Success: ${result.successCount}, Failed: ${result.failureCount}` });
    res.json({ message: 'Push broadcast completed', ...result });
});

router.post('/users/:userId/ban-device', ensureAdmin, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId as string, 10);
    const { reason, durationMinutes } = req.body as { reason?: string; durationMinutes?: number };

    try {
        const userRec = await db.query.user.findFirst({ where: { id: userId }, columns: { device_id: true, username: true } });
        if (!userRec) return res.status(404).json({ error: 'User not found' });
        if (!userRec.device_id) return res.status(400).json({ error: 'User has no device ID recorded' });

        const ban_until = durationMinutes ? new Date(Date.now() + durationMinutes * 60000) : null;

        await db.insert(bannedDevice).values({
            device_id: userRec.device_id,
            reason: reason || 'Admin Ban',
            admin_id: req.session!.user!.id,
            ban_until
        }).onConflictDoUpdate({
            target: bannedDevice.device_id,
            set: {
                reason: reason || 'Admin Ban',
                admin_id: req.session!.user!.id,
                ban_until
            }
        });

        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'BAN_DEVICE', targetUserId: userId, reason: `Banned Device ${userRec.device_id}. Reason: ${reason}` });
        res.json({ message: `Device ${userRec.device_id} banned successfully` });
    } catch (err: any) {
        console.error('[Admin] Error banning device:', err.message);
        res.status(500).json({ error: 'DB Error banning device' });
    }
});

router.get('/users/:userId/active-sessions', ensureAdmin, async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId as string, 10);
    try {
        const rows = await db.query.activeSession.findMany({ where: { user_id: userId }, orderBy: { last_active: 'desc' } });
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.delete('/sessions/:sessionId', ensureAdmin, async (req: Request, res: Response) => {
    const { sessionId } = req.params as { sessionId: string };
    if (sessionId === req.sessionID) return res.status(400).json({ error: "You cannot terminate your own current session." });

    try {
        const session = await db.query.activeSession.findFirst({ where: { id: sessionId }, columns: { user_id: true } });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        await db.delete(activeSession).where(eq(activeSession.id, sessionId));

        logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'TERMINATE_SESSION_ADMIN', reason: `Terminated session ${sessionId}` });

        const io = req.app.get('socketio');
        if (io) io.to(`user_${session.user_id}`).emit('sessionTerminated', { sessionId });

        inboxService.addMessage(session.user_id, { type: 'admin_action', titleKey: 'inbox.admin_session_terminated_title', contentKey: 'inbox.admin_session_terminated_content' });

        res.json({ message: 'Session terminated' });
    } catch (err: any) {
        console.error('[Admin] Error terminating session:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/devices/:deviceId', ensureAdmin, async (req: Request, res: Response) => {
    const { deviceId } = req.params as { deviceId: string };
    try {
        const device = await db.query.knownDevice.findFirst({
            where: { id: deviceId },
            with: {
                users: {
                    with: { user: { columns: { id: true, username: true } } },
                    orderBy: { last_used: 'desc' }
                }
            }
        }) as any;
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const users = device.users.map((ud: any) => ({ id: ud.user.id, username: ud.user.username, last_used: ud.last_used }));
        res.json({ device, users });
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.get('/banned-devices', ensureAdmin, async (req: Request, res: Response) => {
    try {
        const rows = await db.select().from(bannedDevice).orderBy(desc(bannedDevice.created_at));
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.delete('/banned-devices/:id', ensureAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    try {
        await db.delete(bannedDevice).where(eq(bannedDevice.id, id));
        res.json({ success: true, message: 'Device unbanned' });
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.post('/devices/:deviceId/ban', ensureAdmin, async (req: Request, res: Response) => {
    const { deviceId } = req.params as { deviceId: string };
    const { reason, until } = req.body as { reason?: string; until?: string };

    try {
        await db.insert(bannedDevice).values({
            device_id: deviceId,
            reason: reason || 'No reason',
            admin_id: req.session!.user!.id,
            ban_until: until ? new Date(until) : null
        }).returning();
        res.json({ success: true, message: 'Device banned successfully' });
    } catch (err: any) {
        if (err.code === '23505') return res.status(400).json({ error: 'Device is already banned' });
        res.status(500).json({ error: 'DB Error' });
    }
});

router.get('/devices/:deviceId/ban-info', ensureAdmin, async (req: Request, res: Response) => {
    const { deviceId } = req.params as { deviceId: string };
    try {
        const [row] = await db.select().from(bannedDevice).where(eq(bannedDevice.device_id, deviceId)).limit(1);
        res.json({ banned: !!row, info: row });
    } catch (err: any) { res.status(500).json({ error: 'DB Error' }); }
});

router.post('/inbox/send', ensureAdmin, async (req: Request, res: Response) => {
    const { userId, message, isBroadcast } = req.body as { userId?: number; message?: string; isBroadcast?: boolean };
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        if (isBroadcast) {
            await inboxService.broadcastMessage({ type: 'admin_action', titleKey: 'inbox.admin_message_title', contentKey: 'inbox.admin_message_content', contentParams: { text: message } });
            logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'BROADCAST_INBOX', reason: `Message: ${message}` });
            res.json({ message: 'Broadcast inbox message sent successfully' });
        } else {
            if (!userId) return res.status(400).json({ error: 'User ID is required for direct message' });
            await inboxService.addMessage(userId, { type: 'admin_action', titleKey: 'inbox.admin_message_title', contentKey: 'inbox.admin_message_content', contentParams: { text: message } });
            logAdminAction({ adminId: req.session!.user!.id, adminUsername: req.session!.user!.username, actionType: 'SEND_INBOX_MESSAGE', targetUserId: userId, reason: `Message: ${message}` });
            res.json({ message: 'Inbox message sent successfully' });
        }
    } catch (error) {
        console.error('[Admin] Error sending inbox message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router;
