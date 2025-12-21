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


router.get('/users', ensureAdmin, (req, res) => {
    const sql = `SELECT id, username, wins, losses, streak_count, last_played_date, is_verified, is_admin, is_banned, ban_reason, is_muted, rating, rd, vol FROM users ORDER BY id ASC`;
    db.all(sql, [], (err, users) => {
        if (err) {
            console.error("Error fetching user list (admin):", err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(users);
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
            if (io && (actionType === 'BAN_USER' || actionType === 'MUTE_USER' || actionType === 'UNMUTE_USER')) {
                const isBanned = actionType === 'BAN_USER';
                const isMuted = actionType === 'MUTE_USER';

                io.sockets.sockets.forEach((socket) => {
                    if (socket.request.session?.user?.id === parseInt(userId, 10)) {
                        if (isBanned) {
                            socket.emit('forceDisconnect', { i18nKey: 'error_account_banned_with_reason', options: { reason } });
                            socket.disconnect(true);
                        } else {
                            socket.request.session.user.is_muted = isMuted;
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

router.post('/users/:userId/ban', ensureAdmin, (req, res) => handleUserAction(req, res, 'BAN_USER', 'UPDATE users SET is_banned = TRUE, ban_reason = ? WHERE id = ?', [req.body?.reason || null, req.params.userId], (name) => `User ${name} has been banned.`));
router.post('/users/:userId/unban', ensureAdmin, (req, res) => handleUserAction(req, res, 'UNBAN_USER', 'UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE id = ?', [req.params.userId], (name) => `User ${name} has been unbanned.`));
router.post('/users/:userId/mute', ensureAdmin, (req, res) => handleUserAction(req, res, 'MUTE_USER', 'UPDATE users SET is_muted = TRUE WHERE id = ?', [req.params.userId], (name) => `User ${name} has been muted.`));
router.post('/users/:userId/unmute', ensureAdmin, (req, res) => handleUserAction(req, res, 'UNMUTE_USER', 'UPDATE users SET is_muted = FALSE WHERE id = ?', [req.params.userId], (name) => `User ${name} is no longer muted.`));
router.post('/users/:userId/set-admin', ensureAdmin, (req, res) => handleUserAction(req, res, 'SET_ADMIN_ROLE', 'UPDATE users SET is_admin = TRUE WHERE id = ?', [req.params.userId], (name) => `User ${name} is now an admin.`));
router.post('/users/:userId/remove-admin', ensureAdmin, (req, res) => handleUserAction(req, res, 'REMOVE_ADMIN_ROLE', 'UPDATE users SET is_admin = FALSE WHERE id = ?', [req.params.userId], (name) => `User ${name} is no longer an admin.`));
router.post('/users/:userId/verify', ensureAdmin, (req, res) => handleUserAction(req, res, 'VERIFY_USER', 'UPDATE users SET is_verified = TRUE WHERE id = ?', [req.params.userId], (name) => `User ${name} has been verified.`));
router.post('/users/:userId/unverify', ensureAdmin, (req, res) => handleUserAction(req, res, 'UNVERIFY_USER', 'UPDATE users SET is_verified = FALSE WHERE id = ?', [req.params.userId], (name) => `User ${name} verification removed.`));


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

router.post('/users/:id/send-push', async (req, res) => {
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
        logAdminAction(req.session.user.id, req.session.user.username, 'SEND_TEST_PUSH', targetUserId, null, `Title: ${title}`);
        res.status(200).json({ message: 'Push notification sent successfully.' });
    } else {
        res.status(404).json({ message: 'Subscription not found or failed to send.' });
    }
});


module.exports = router;