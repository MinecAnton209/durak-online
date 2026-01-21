const express = require('express');
const router = express.Router();
const db = require('../db');
const { ensureAdmin } = require('../middlewares/authMiddleware');
const { logAdminAction } = require('../services/auditLogService');
const notificationService = require('../services/notificationService.js');

const isAdmin = (req, res, next) => {
    if (req.session?.user?.is_admin) {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Admin access required.' });
};

router.use(isAdmin);


router.get('/users/search', ensureAdmin, (req, res) => {
    const { query } = req.query;
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters long' });
    }

    const sql = `
        SELECT id, username, wins, losses, streak_count, last_played_date, is_verified, is_admin, is_banned, ban_reason, is_muted, rating, coins, device_id
        FROM users 
        WHERE username LIKE ? OR id = ?
        LIMIT 50
    `;

    const searchTerm = `%${query}%`;
    const searchId = isNaN(parseInt(query)) ? -1 : parseInt(query);

    db.all(sql, [searchTerm, searchId], (err, users) => {
        if (err) {
            console.error("Error searching users (admin):", err.message);
            return res.status(500).json({ error: 'Internal server error while searching users' });
        }
        res.json(users);
    });
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

        res.json({
            totalConnections: activeConnections.length,
            connections: activeConnections
        });
    } catch (error) {
        console.error("Error fetching active sockets:", error);
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

        if (!targetSocket) {
            return res.status(404).json({ error: 'Socket not found or already disconnected' });
        }

        const adminUsername = req.session.user?.username || 'Admin';
        const disconnectReason = reason || 'Disconnected by administrator';

        // Emit a message before disconnecting
        io.to(socketId).emit('systemMessage', {
            message: `You have been disconnected by ${adminUsername}. Reason: ${disconnectReason}`,
            type: 'error'
        });

        // Force disconnect
        io.in(socketId).disconnectSockets(true);

        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: adminUsername,
            actionType: 'FORCE_DISCONNECT_SOCKET',
            reason: `Socket ID: ${socketId}, Reason: ${disconnectReason}`
        });

        res.json({ message: `Socket ${socketId} disconnected successfully` });
    } catch (error) {
        console.error("Error disconnecting socket:", error);
        res.status(500).json({ error: 'Failed to disconnect socket' });
    }
});

router.get('/users', ensureAdmin, (req, res) => {
    const sql = `SELECT id, username, wins, losses, streak_count, last_played_date, is_verified, is_admin, is_banned, ban_reason, is_muted, rating, coins, device_id FROM users ORDER BY id ASC`;
    db.all(sql, [], (err, users) => {
        if (err) {
            console.error("Error fetching user list (admin):", err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(users);
    });
});

router.get('/users/clones', ensureAdmin, (req, res) => {
    const sql = `
        SELECT device_id, COUNT(*) as account_count, GROUP_CONCAT(username) as usernames, GROUP_CONCAT(id) as user_ids
        FROM users 
        WHERE device_id IS NOT NULL AND device_id != ''
        GROUP BY device_id 
        HAVING account_count > 1
        ORDER BY account_count DESC
        LIMIT 100
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error fetching user clones (admin):", err.message);
            return res.status(500).json({ error: 'Internal server error while searching for multi-accounts' });
        }

        // Parse the grouped strings into arrays for a cleaner API response
        const clones = rows.map(row => ({
            deviceId: row.device_id,
            count: row.account_count,
            usernames: row.usernames ? row.usernames.split(',') : [],
            userIds: row.user_ids ? row.user_ids.split(',').map(Number) : []
        }));

        res.json(clones);
    });
});

router.get('/users/:userId/details', ensureAdmin, async (req, res) => {
    const { userId } = req.params;
    try {
        const [userDetails, userGames, userAchievements] = await Promise.all([
            new Promise((resolve, reject) => {
                const sql = `SELECT id, username, wins, losses, streak_count, is_verified, is_admin, is_banned, ban_reason, is_muted, last_played_date, created_at FROM users WHERE id = ?`;
                db.get(sql, [userId], (err, row) => {
                    if (err) return reject(err);
                    if (!row) return reject(new Error('User not found'));
                    resolve(row);
                });
            }),
            new Promise((resolve, reject) => {
                const sql = `SELECT g.id, g.end_time, g.game_type, gp.outcome, gp.cards_at_end FROM game_participants gp JOIN games g ON gp.game_id = g.id WHERE gp.user_id = ? ORDER BY g.end_time DESC LIMIT 20`;
                db.all(sql, [userId], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            }),
            new Promise((resolve, reject) => {
                const sql = `SELECT ua.achievement_code, ua.unlocked_at, a.name_key, a.rarity FROM user_achievements ua JOIN achievements a ON ua.achievement_code = a.code WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`;
                db.all(sql, [userId], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            })
        ]);
        res.json({ details: userDetails, games: userGames, achievements: userAchievements });
    } catch (error) {
        console.error(`Error fetching details for user ${userId}:`, error.message);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

function handleUserAction(req, res, actionType, sql, params, successMessage) {
    const { userId } = req.params;
    const adminUser = req.session.user;
    const reason = req.body?.reason || null;

    if (parseInt(userId, 10) === adminUser.id && (actionType.includes('ADMIN') || actionType.includes('BAN'))) {
        return res.status(400).json({ error: "You cannot change your own critical status (admin/ban)." });
    }

    db.get('SELECT username FROM users WHERE id = ?', [userId], (err, targetUser) => {
        if (err) return res.status(500).json({ error: 'Database error fetching user' });
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        db.run(sql, params, function (updateErr) {
            if (updateErr) {
                console.error(`Error in action '${actionType}' for user ${userId}:`, updateErr.message);
                return res.status(500).json({ error: 'Database update failed' });
            }

            logAdminAction({
                adminId: adminUser.id,
                adminUsername: adminUser.username,
                actionType,
                targetUserId: userId,
                targetUsername: targetUser.username,
                reason
            });

            const io = req.app.get('socketio');
            const isBan = actionType.includes('BAN_USER');
            const isMute = actionType.includes('MUTE_USER');
            const isUnmute = actionType === 'UNMUTE_USER';

            if (io && (isBan || isMute || isUnmute)) {
                io.sockets.sockets.forEach((socket) => {
                    if (socket.request.session?.user?.id === parseInt(userId, 10)) {
                        if (isBan) {
                            const banUntil = actionType === 'BAN_USER_TEMPORARY' ? params[1] : null;
                            const options = { reason: reason };
                            if (banUntil) {
                                options.until = new Date(banUntil).toLocaleString();
                            }
                            socket.emit('forceDisconnect', {
                                i18nKey: banUntil ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                                options: options
                            });
                            socket.disconnect(true);
                        } else if (isMute || isUnmute) {
                            const isMuted = isMute && actionType !== 'UNMUTE_USER';
                            socket.request.session.user.is_muted = isMuted;
                            if (isMute && actionType === 'MUTE_USER_TEMPORARY') {
                                socket.request.session.user.mute_until = params[0];
                            } else {
                                socket.request.session.user.mute_until = null;
                            }
                            socket.request.session.save();
                            socket.emit('mutedStatusUpdate', { isMuted });
                        }
                    }
                });
            }
            res.json({ message: successMessage(targetUser.username) });
        });
    });
}

router.post('/users/:userId/ban', ensureAdmin, (req, res) => {
    const { reason } = req.body;
    const sql = `UPDATE users SET is_banned = 1, ban_reason = ?, ban_until = NULL WHERE id = ?`;

    handleUserAction(req, res, 'BAN_USER_PERMANENT', sql, [reason || null, req.params.userId], (username) =>
        `User ${username} has been banned permanently. Reason: ${reason || 'No reason specified'}`
    );
});

router.post('/users/:userId/tempban', ensureAdmin, (req, res) => {
    const { durationMinutes, reason } = req.body;
    const duration = parseInt(durationMinutes, 10) || 60;
    const banUntil = new Date(Date.now() + duration * 60000).toISOString();
    const sql = `UPDATE users SET is_banned = 1, ban_reason = ?, ban_until = ? WHERE id = ?`;

    handleUserAction(req, res, 'BAN_USER_TEMPORARY', sql, [reason || null, banUntil, req.params.userId], (username) =>
        `User ${username} has been banned until ${new Date(banUntil).toLocaleString()}. Reason: ${reason || 'No reason specified'}`
    );
});

router.post('/users/:userId/unban', ensureAdmin, (req, res) => {
    const sql = `UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?`;
    handleUserAction(req, res, 'UNBAN_USER', sql, [req.params.userId], (username) =>
        `User ${username} has been unbanned.`
    );
});
router.post('/users/:userId/set-admin', ensureAdmin, (req, res) => handleUserAction(req, res, 'SET_ADMIN_ROLE', 'UPDATE users SET is_admin = 1 WHERE id = ?', [req.params.userId], (name) => `User ${name} is now an admin.`));
router.post('/users/:userId/remove-admin', ensureAdmin, (req, res) => handleUserAction(req, res, 'REMOVE_ADMIN_ROLE', 'UPDATE users SET is_admin = 0 WHERE id = ?', [req.params.userId], (name) => `User ${name} is no longer an admin.`));
router.post('/users/:userId/verify', ensureAdmin, (req, res) => handleUserAction(req, res, 'VERIFY_USER', 'UPDATE users SET is_verified = 1 WHERE id = ?', [req.params.userId], (name) => `User ${name} has been verified.`));
router.post('/users/:userId/unverify', ensureAdmin, (req, res) => handleUserAction(req, res, 'UNVERIFY_USER', 'UPDATE users SET is_verified = 0 WHERE id = ?', [req.params.userId], (name) => `User ${name} verification removed.`));

router.put('/users/:userId', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const adminUser = req.session.user;

    // Fields allowed to be updated through this endpoint
    const allowedFields = {
        username: 'username = ?',
        wins: 'wins = ?',
        losses: 'losses = ?',
        coins: 'coins = ?',
        rating: 'rating = ?',
        is_verified: 'is_verified = ?',
        is_admin: 'is_admin = ?',
        is_banned: 'is_banned = ?',
        is_muted: 'is_muted = ?',
        ban_reason: 'ban_reason = ?'
    };

    const updates = [];
    const params = [];
    const fieldsToLog = [];

    // Filter and prepare the update query
    for (const [field, value] of Object.entries(req.body)) {
        if (allowedFields[field] !== undefined) {
            // Self-security check for critical roles
            if (parseInt(userId, 10) === adminUser.id && (field === 'is_admin' || field === 'is_banned')) {
                continue;
            }
            updates.push(allowedFields[field]);
            params.push(value);
            fieldsToLog.push(field);
        }
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid or allowed fields provided for update' });
    }

    params.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function (err) {
        if (err) {
            console.error(`[Admin] Error updating user ${userId}:`, err.message);
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: 'Internal server error while updating user account' });
        }

        logAdminAction({
            adminId: adminUser.id,
            adminUsername: adminUser.username,
            actionType: 'UPDATE_USER_ACCOUNT',
            targetUserId: userId,
            reason: `Updated fields: ${fieldsToLog.join(', ')}`
        });

        res.json({ message: 'User account updated successfully' });
    });
});


router.get('/games/active', ensureAdmin, (req, res) => {
    const activeGamesList = [];
    const games = req.app.get('activeGames');
    if (!games) { return res.status(500).json({ error: "Games object not found" }); }
    for (const gameId in games) {
        if (games.hasOwnProperty(gameId)) {
            const game = games[gameId];
            const playersInfo = game.playerOrder.map(playerId => { const player = game.players[playerId]; return { id: player.id, dbId: player.dbId, name: player.name, isGuest: player.isGuest }; });
            activeGamesList.push({ id: game.id, status: game.trumpSuit ? 'in_progress' : 'lobby', playerCount: game.playerOrder.length, maxPlayers: game.settings.maxPlayers, players: playersInfo, hostId: game.hostId, hostName: game.players[game.hostId] ? game.players[game.hostId].name : 'N/A', startTime: game.startTime ? game.startTime.toISOString() : null, settings: { deckSize: game.settings.deckSize } });
        }
    }
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

    if (!games || !io || !logEvent || !broadcastGameState || !i18n) { return res.status(500).json({ error: "Server components not found" }); }
    const game = games[gameId];
    if (!game) { return res.status(404).json({ error: `Game with ID "${gameId}" not found.` }); }

    const adminUsername = req.session.user?.username || 'Administrator';
    const terminationReasonText = reason || i18n.t('admin_termination_no_reason');

    game.winner = { reason: { i18nKey: 'game_over_terminated_by_admin', options: { reason: terminationReasonText } } };
    game.lastAction = 'admin_terminate';

    logAdminAction({ adminId: req.session.user.id, adminUsername: adminUsername, actionType: 'TERMINATE_GAME', reason: `Game ID: ${gameId}. Reason: ${terminationReasonText}` });
    logEvent(game, null, { i18nKey: 'log_game_terminated_by_admin_event', options: { admin: adminUsername, reason: terminationReasonText } });
    broadcastGameState(gameId);

    setTimeout(() => { if (games[gameId]) { delete games[gameId]; console.log(`Game ${gameId} was forcibly terminated and deleted.`); } }, 1000);
    res.json({ message: `Game ${gameId} has been terminated.` });
});

router.get('/games/history', ensureAdmin, (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;
    const offset = page * pageSize;
    const countSql = `SELECT COUNT(*) as total FROM games WHERE end_time IS NOT NULL`;
    db.get(countSql, [], (countErr, countRow) => {
        if (countErr) { return res.status(500).json({ error: 'Internal server error while fetching count.' }); }
        const totalRowCount = countRow ? countRow.total : 0;
        if (totalRowCount === 0) { return res.json({ rows: [], rowCount: 0 }); }
        const dataSql = `SELECT g.id, g.game_type, g.duration_seconds, g.end_time, winner.username as winner_username, loser.username as loser_username FROM games g LEFT JOIN users winner ON g.winner_user_id = winner.id LEFT JOIN users loser ON g.loser_user_id = loser.id WHERE g.end_time IS NOT NULL ORDER BY g.end_time DESC LIMIT ? OFFSET ?`;
        db.all(dataSql, [pageSize, offset], (dataErr, rows) => {
            if (dataErr) { return res.status(500).json({ error: 'Internal server error while fetching rows.' }); }
            res.json({ rows: rows || [], rowCount: totalRowCount });
        });
    });
});


router.get('/stats/dashboard-overview', ensureAdmin, async (req, res) => {
    const io = req.app.get('socketio');
    const games = req.app.get('activeGames');
    try {
        const usersCountPromise = new Promise((resolve, reject) => { db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => { if (err) return reject(err); resolve(row ? row.count : 0); }); });
        const todayStatsPromise = new Promise((resolve, reject) => { const today = new Date().toISOString().slice(0, 10); db.get("SELECT new_registrations, games_played FROM system_stats_daily WHERE date = ?", [today], (err, row) => { if (err) return reject(err); resolve(row || { new_registrations: 0, games_played: 0 }); }); });
        let onlineUsersCount = 0;
        if (io) { const sockets = await io.fetchSockets(); const uniqueUserIds = new Set(); sockets.forEach(socket => { if (socket.request.session?.user?.id) { uniqueUserIds.add(socket.request.session.user.id); } }); onlineUsersCount = uniqueUserIds.size; }
        const [totalUsers, todayStats] = await Promise.all([usersCountPromise, todayStatsPromise]);
        res.json({ totalUsers, activeGames: games ? Object.keys(games).length : 0, onlineUsers: onlineUsersCount, gamesPlayedToday: todayStats.games_played, newRegistrationsToday: todayStats.new_registrations });
    } catch (error) { console.error("Error fetching dashboard statistics:", error); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/stats/registrations-by-day', ensureAdmin, (req, res) => { const dbClient = process.env.DB_CLIENT || 'sqlite'; let sql; if (dbClient === 'postgres') { sql = `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count FROM users WHERE created_at >= current_date - interval '7 days' GROUP BY date ORDER BY date ASC;`; } else { sql = `SELECT STRFTIME('%Y-%m-%d', created_at) as date, COUNT(*) as count FROM users WHERE created_at >= DATE('now', '-7 days') GROUP BY date ORDER BY date ASC;`; } db.all(sql, [], (err, rows) => { if (err) { return res.status(500).json({ error: 'Internal server error' }); } const dataMap = new Map(rows.map(row => [row.date, row.count])); const last7Days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); }).reverse(); const result = last7Days.map(date => ({ date: date, count: dataMap.get(date) || 0 })); res.json(result); }); });
router.get('/stats/games-by-day', ensureAdmin, (req, res) => { const dbClient = process.env.DB_CLIENT || 'sqlite'; let sql; if (dbClient === 'postgres') { sql = `SELECT TO_CHAR(end_time, 'YYYY-MM-DD') as date, COUNT(*) as count FROM games WHERE end_time >= current_date - interval '7 days' GROUP BY date ORDER BY date ASC;`; } else { sql = `SELECT STRFTIME('%Y-%m-%d', end_time) as date, COUNT(*) as count FROM games WHERE end_time >= DATE('now', '-7 days') GROUP BY date ORDER BY date ASC;`; } db.all(sql, [], (err, rows) => { if (err) { return res.status(500).json({ error: 'Internal server error' }); } const dataMap = new Map(rows.map(row => [row.date, row.count])); const last7Days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); }).reverse(); const result = last7Days.map(date => ({ date: date, count: dataMap.get(date) || 0 })); res.json(result); }); });
router.get('/stats/leaderboard', ensureAdmin, (req, res) => { const type = req.query.type || 'rating'; const limit = parseInt(req.query.limit, 10) || 100; const allowedSortTypes = { rating: 'rating', wins: 'wins', losses: 'losses', win_streak: 'win_streak', streak_count: 'streak_count', games_played: '(wins + losses)' }; const orderByColumn = allowedSortTypes[type]; if (!orderByColumn) { return res.status(400).json({ error: 'Invalid leaderboard type specified.' }); } const safeLimit = Math.min(Math.max(1, limit), 200); const sql = `SELECT id, username, wins, losses, win_streak, streak_count, rating, (wins + losses) as games_played FROM users ORDER BY ${orderByColumn} DESC LIMIT ?`; db.all(sql, [safeLimit], (err, rows) => { if (err) { return res.status(500).json({ error: 'Internal server error' }); } res.json(rows); }); });

router.post('/users/:userId/mute', ensureAdmin, (req, res) => {
    const { reason } = req.body;
    const sql = `UPDATE users SET is_muted = 1, mute_until = NULL WHERE id = ?`;

    handleUserAction(req, res, 'MUTE_USER_PERMANENT', sql, [req.params.userId], (username) =>
        `User ${username} has been muted permanently. Reason: ${reason || 'No reason specified'}`
    );
});

router.post('/users/:userId/tempmute', ensureAdmin, (req, res) => {
    const { durationMinutes, reason } = req.body;
    const duration = parseInt(durationMinutes, 10) || 60;
    const muteUntil = new Date(Date.now() + duration * 60000).toISOString();
    const sql = `UPDATE users SET is_muted = 1, mute_until = ? WHERE id = ?`;

    handleUserAction(req, res, 'MUTE_USER_TEMPORARY', sql, [muteUntil, req.params.userId], (username) =>
        `User ${username} has been muted until ${new Date(muteUntil).toLocaleString()}. Reason: ${reason || 'No reason specified'}`
    );
});

router.post('/users/:userId/unmute', ensureAdmin, (req, res) => {
    const sql = `UPDATE users SET is_muted = 0, mute_until = NULL WHERE id = ?`;
    handleUserAction(req, res, 'UNMUTE_USER', sql, [req.params.userId], (username) =>
        `User ${username} has been unmuted.`
    );
});

router.get('/audit-log', ensureAdmin, (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;
    const offset = page * pageSize;

    const countSql = `SELECT COUNT(*) as total FROM admin_audit_log`;

    db.get(countSql, [], (countErr, countRow) => {
        if (countErr) {
            console.error("Error fetching audit log record count:", countErr.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        const totalRowCount = countRow ? countRow.total : 0;
        if (totalRowCount === 0) {
            return res.json({ rows: [], rowCount: 0 });
        }

        const dataSql = `
            SELECT * 
            FROM admin_audit_log
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        `;

        db.all(dataSql, [pageSize, offset], (dataErr, rows) => {
            if (dataErr) {
                console.error("Error fetching audit log:", dataErr.message);
                return res.status(500).json({ error: 'Internal server error' });
            }

            res.json({
                rows: rows || [],
                rowCount: totalRowCount
            });
        });
    });
});

router.get('/donations', ensureAdmin, (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const offset = page * pageSize;

    const countSql = `SELECT COUNT(*) as total, SUM(amount) as total_amount FROM donations`;

    db.get(countSql, [], (countErr, summary) => {
        if (countErr) {
            console.error("Error fetching donations summary:", countErr.message);
            return res.status(500).json({ error: 'Internal server error while fetching donation stats' });
        }

        const totalRowCount = summary ? summary.total : 0;
        const totalAmount = summary ? summary.total_amount : 0;

        if (totalRowCount === 0) {
            return res.json({ rows: [], rowCount: 0, totalAmount: 0 });
        }

        const dataSql = `
            SELECT d.*, u.username 
            FROM donations d
            LEFT JOIN users u ON d.user_id = u.id
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `;

        db.all(dataSql, [pageSize, offset], (dataErr, rows) => {
            if (dataErr) {
                console.error("Error fetching donations list:", dataErr.message);
                return res.status(500).json({ error: 'Internal server error while fetching donations' });
            }

            res.json({
                rows: rows || [],
                rowCount: totalRowCount,
                totalAmount: totalAmount || 0
            });
        });
    });
});

router.get('/chat/history', ensureAdmin, (req, res) => {
    const history = req.app.get('globalChatHistory') || [];
    res.json(history);
});

router.delete('/chat/history', ensureAdmin, (req, res) => {
    const history = req.app.get('globalChatHistory');
    const io = req.app.get('socketio');

    if (history) {
        history.length = 0; // Clear the array in place

        if (io) {
            io.emit('chatCleared', { admin: req.session.user.username });
            io.emit('systemMessage', { message: 'Global chat history has been cleared by administrator', type: 'info' });
        }

        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: req.session.user.username,
            actionType: 'CLEAR_CHAT_HISTORY',
            reason: 'Administrator cleared global chat history'
        });

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

        // Mark as deleted in history
        message.text = '[deleted by admin]';
        message.deleted = true;

        if (io) {
            io.to('global_chat').emit('chat:updateMessage', message);
        }

        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: req.session.user.username,
            actionType: 'DELETE_CHAT_MESSAGE',
            targetUserId: message.author.id,
            targetUsername: message.author.username,
            reason: `Administrator deleted message: "${messageId}"`
        });

        res.json({ message: 'Message deleted successfully' });
    } else {
        res.status(404).json({ error: 'Message not found' });
    }
});

router.get('/maintenance/status', ensureAdmin, (req, res) => {
    const maintenanceMode = req.app.get('maintenanceMode');
    res.json({
        enabled: maintenanceMode.enabled,
        message: maintenanceMode.enabled ? maintenanceMode.message : maintenanceMode.warningMessage,
        startTime: maintenanceMode.startTime
    });
});

router.post('/maintenance/enable', ensureAdmin, (req, res) => {
    const { message, minutesUntilStart = 0 } = req.body;
    const maintenanceMode = req.app.get('maintenanceMode');
    const io = req.app.get('socketio');

    const startTime = Date.now() + minutesUntilStart * 60 * 1000;
    maintenanceMode.startTime = startTime;
    maintenanceMode.warningMessage = message || "Scheduled maintenance will begin soon.";

    if (minutesUntilStart > 0) {
        io.emit('maintenanceWarning', {
            message: maintenanceMode.warningMessage,
            startTime: maintenanceMode.startTime
        });

        if (maintenanceMode.timer) clearTimeout(maintenanceMode.timer);
        maintenanceMode.timer = setTimeout(() => {
            maintenanceMode.enabled = true;
            maintenanceMode.message = maintenanceMode.warningMessage;
            console.log("MAINTENANCE MODE ENABLED.");
        }, minutesUntilStart * 60 * 1000);

        res.json({ status: 'warning_scheduled', message: `Maintenance scheduled in ${minutesUntilStart} minutes.` });
    } else {
        maintenanceMode.enabled = true;
        maintenanceMode.message = message || "The site is undergoing maintenance. Please come back later.";
        console.log("MAINTENANCE MODE ENABLED IMMEDIATELY.");
        res.json({ status: 'enabled', message: 'Maintenance mode enabled.' });
    }
});

router.post('/maintenance/disable', ensureAdmin, (req, res) => {
    const maintenanceMode = req.app.get('maintenanceMode');
    const io = req.app.get('socketio');

    maintenanceMode.enabled = false;
    maintenanceMode.startTime = null;
    maintenanceMode.warningMessage = "";
    if (maintenanceMode.timer) {
        clearTimeout(maintenanceMode.timer);
        maintenanceMode.timer = null;
    }

    io.emit('maintenanceCancelled');

    console.log("Maintenance mode disabled.");
    res.json({ status: 'disabled', message: 'Maintenance mode disabled.' });
});

router.post('/users/:id/send-push', ensureAdmin, async (req, res) => {
    const targetUserId = parseInt(req.params.id, 10);
    const { title, body, url } = req.body;

    if (!title || !body) {
        return res.status(400).json({ message: 'Title and body are required.' });
    }

    const payload = {
        title: title,
        body: body,
        url: url || '/'
    };

    const success = await notificationService.sendNotification(targetUserId, payload);

    if (success) {
        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: req.session.user.username,
            actionType: 'SEND_TEST_PUSH',
            targetUserId: targetUserId,
            reason: `Title: ${title}`
        });
        res.status(200).json({ message: 'Push notification sent successfully.' });
    } else {
        res.status(404).json({ message: 'Subscription not found or failed to send.' });
    }
});

router.post('/broadcast', ensureAdmin, (req, res) => {
    const { message, type = 'info' } = req.body;
    const io = req.app.get('socketio');

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    io.emit('systemMessage', { message, type });

    logAdminAction({
        adminId: req.session.user.id,
        adminUsername: req.session.user.username,
        actionType: 'BROADCAST_MESSAGE',
        reason: `Type: ${type}, Message: ${message}`
    });

    res.json({ message: 'Broadcast sent successfully' });
});

router.post('/broadcast-push', ensureAdmin, async (req, res) => {
    const { title, body, url } = req.body;

    if (!title || !body) {
        return res.status(400).json({ message: 'Title and body are required.' });
    }

    const payload = {
        title: title,
        body: body,
        url: url || '/'
    };

    const result = await notificationService.sendBroadcastNotification(payload);

    logAdminAction({
        adminId: req.session.user.id,
        adminUsername: req.session.user.username,
        actionType: 'BROADCAST_PUSH',
        reason: `Title: ${title}, Body: ${body}, Success: ${result.successCount}, Failed: ${result.failureCount}`
    });

    res.json({
        message: 'Push broadcast completed',
        ...result
    });
});
router.get('/chat/filters', ensureAdmin, (req, res) => {
    db.all('SELECT * FROM chat_filters ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
});

router.post('/chat/filters', ensureAdmin, (req, res) => {
    const { type, content } = req.body;
    if (!['word', 'regex'].includes(type) || !content) {
        return res.status(400).json({ error: 'Invalid type or content' });
    }

    const sql = 'INSERT INTO chat_filters (type, content) VALUES (?, ?)';
    db.run(sql, [type, content], function (err) {
        if (err) return res.status(500).json({ error: 'DB Error' });

        // Reload filters to sync memory
        if (global.loadChatFilters) {
            global.loadChatFilters();
        }

        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: req.session.user.username,
            actionType: 'ADD_CHAT_FILTER',
            reason: `Added ${type}: ${content}`
        });

        res.json({ id: this.lastID, type, content });
    });
});

router.delete('/chat/filters/:id', ensureAdmin, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM chat_filters WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: 'DB Error' });

        // Reload filters to sync memory
        if (global.loadChatFilters) {
            global.loadChatFilters();
        }

        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: req.session.user.username,
            actionType: 'REMOVE_CHAT_FILTER',
            reason: `Removed filter ID: ${id}`
        });

        res.json({ message: 'Filter deleted' });
    });
});

router.get('/chat/settings', ensureAdmin, (req, res) => {
    res.json(global.globalChatSettings || {});
});

router.post('/chat/settings', ensureAdmin, (req, res) => {
    const { slowModeInterval } = req.body;
    if (slowModeInterval !== undefined) {
        global.globalChatSettings.slowModeInterval = parseInt(slowModeInterval);

        logAdminAction({
            adminId: req.session.user.id,
            adminUsername: req.session.user.username,
            actionType: 'UPDATE_CHAT_SETTINGS',
            reason: `Slow Mode: ${slowModeInterval}s`
        });
    }
    res.json(global.globalChatSettings);
});

router.get('/chat/history/db', ensureAdmin, (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const offset = page * pageSize;

    const sql = `SELECT * FROM chat_messages WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) as total FROM chat_messages WHERE is_deleted = 0`;

    db.get(countSql, [], (err, countRow) => {
        if (err) return res.status(500).json({ error: 'DB Error' });

        db.all(sql, [pageSize, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'DB Error' });
            res.json({ rows, rowCount: countRow.total });
        });
    });
});

router.get('/chat/search', ensureAdmin, (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

    const sql = `SELECT * FROM chat_messages WHERE content LIKE ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 50`;
    db.all(sql, [`%${q}%`], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
});

router.post('/users/:userId/ban-device', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const { reason, durationMinutes } = req.body;

    db.get('SELECT device_id, username FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found or DB error' });
        if (!user.device_id) return res.status(400).json({ error: 'User has no device ID recorded' });

        // Check if already banned? Insert or Ignore.
        const banUntil = durationMinutes ? new Date(Date.now() + durationMinutes * 60000).toISOString() : null;

        // Use UPSERT syntax compatible with both PostgreSQL and SQLite
        const sql = `
            INSERT INTO banned_devices (device_id, reason, admin_id, ban_until) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET reason=excluded.reason, ban_until=excluded.ban_until, banned_at=CURRENT_TIMESTAMP
        `;

        db.run(sql, [user.device_id, reason || 'Admin Ban', req.session.user.id, banUntil], function (err) {
            if (err) return res.status(500).json({ error: 'DB Error banning device' });

            logAdminAction({
                adminId: req.session.user.id,
                adminUsername: req.session.user.username,
                actionType: 'BAN_DEVICE',
                targetUserId: userId,
                reason: `Banned Device ${user.device_id}. Reason: ${reason}`
            });

            res.json({ message: `Device ${user.device_id} banned successfully` });
        });
    });
});

router.get('/users/:userId/active-sessions', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    db.all('SELECT * FROM active_sessions WHERE user_id = ? ORDER BY last_active DESC', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
});

router.delete('/sessions/:sessionId', ensureAdmin, (req, res) => {
    const { sessionId } = req.params;
    const currentSessionId = req.sessionID || req.cookies['connect.sid']; // Fallback depends on session config

    // Check if the admin is trying to terminate their own CURRENT session
    // req.sessionID is usually set by express-session
    if (sessionId === req.sessionID) {
        return res.status(400).json({ error: "You cannot terminate your own current session." });
    }

    db.get('SELECT user_id FROM active_sessions WHERE id = ?', [sessionId], (err, session) => {
        if (err || !session) return res.status(404).json({ error: 'Session not found' });

        const userId = session.user_id;

        db.run('DELETE FROM active_sessions WHERE id = ?', [sessionId], function (err) {
            if (err) return res.status(500).json({ error: 'DB Error' });

            logAdminAction({
                adminId: req.session.user.id,
                adminUsername: req.session.user.username,
                actionType: 'TERMINATE_SESSION_ADMIN',
                reason: `Terminated session ${sessionId}`
            });

            // Notify user via socket
            const io = req.app.get('socketio');
            if (io) {
                // We emit to the user's room. 
                // Each socket joins a room named by their user ID in server.js (presumably)
                io.to(`user_${userId}`).emit('sessionTerminated', { sessionId });
            }

            res.json({ message: 'Session terminated' });
        });
    });
});

router.get('/devices/:deviceId', ensureAdmin, (req, res) => {
    const { deviceId } = req.params;

    const deviceSql = 'SELECT * FROM known_devices WHERE id = ?';
    const usersSql = `
        SELECT u.id, u.username, ud.last_used 
        FROM user_devices ud 
        JOIN users u ON ud.user_id = u.id 
        WHERE ud.device_id = ? 
        ORDER BY ud.last_used DESC
    `;

    db.get(deviceSql, [deviceId], (err, device) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        db.all(usersSql, [deviceId], (err2, users) => {
            if (err2) return res.status(500).json({ error: 'DB Error fetching users' });

            res.json({
                device,
                users
            });
        });
    });
});

router.get('/banned-devices', ensureAdmin, (req, res) => {
    db.all('SELECT * FROM banned_devices ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
});

router.delete('/banned-devices/:id', ensureAdmin, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM banned_devices WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json({ success: true, message: 'Device unbanned' });
    });
});

router.post('/devices/:deviceId/ban', ensureAdmin, (req, res) => {
    const { deviceId } = req.params;
    const { reason, until } = req.body;
    const adminId = req.session.user.id;

    const sql = 'INSERT INTO banned_devices (device_id, reason, admin_id, ban_until) VALUES (?, ?, ?, ?)';
    db.run(sql, [deviceId, reason || 'No reason', adminId, until || null], function (err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT' || err.code === '23505') {
                return res.status(400).json({ error: 'Device is already banned' });
            }
            return res.status(500).json({ error: 'DB Error' });
        }

        // Log the action
        db.run('INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
            [adminId, 'BAN_DEVICE', 'device', deviceId, JSON.stringify({ reason, until })]);

        res.json({ success: true, message: 'Device banned successfully' });
    });
});

router.get('/devices/:deviceId/ban-info', ensureAdmin, (req, res) => {
    const { deviceId } = req.params;
    db.get('SELECT * FROM banned_devices WHERE device_id = ?', [deviceId], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json({ banned: !!row, info: row });
    });
});

module.exports = router;
