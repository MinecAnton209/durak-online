const express = require('express');
const router = express.Router();
const db = require('../db');
const { ensureAdmin } = require('../middlewares/authMiddleware');

router.get('/users', ensureAdmin, (req, res) => {
    const sql = `SELECT id, username, wins, losses, streak_count, last_played_date, is_verified, is_admin, is_banned, ban_reason, is_muted FROM users ORDER BY id ASC`;    db.all(sql, [], (err, users) => {
        if (err) {
            console.error("Помилка отримання списку користувачів (адмін):", err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(users);
    });
});

router.post('/users/:userId/ban', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;
    const io = req.app.get('socketio');

    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const sql = `UPDATE users SET is_banned = TRUE, ban_reason = ? WHERE id = ?`;
    db.run(sql, [reason || null, userId], function(err) {
        if (err) {
            console.error(`Помилка бану користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (process.env.DB_CLIENT === 'postgres' && process.env.DATABASE_URL && db.pool) {
            const deleteSessionsSql = `DELETE FROM "user_sessions" WHERE sess->'user'->>'id' = $1::text`;
            db.pool.query(deleteSessionsSql, [userId], (delErr, delRes) => {
                if (delErr) {
                    console.error(`Помилка видалення сесій для забаненого користувача ${userId}:`, delErr.message);
                } else {
                    console.log(`Видалено ${delRes.rowCount} активних сесій для користувача ${userId}.`);
                }
            });
        }
        io.sockets.sockets.forEach((socket) => {
            if (socket.request.session.user && socket.request.session.user.id === parseInt(userId, 10)) {
                socket.emit('forceDisconnect', {
                    i18nKey: 'error_account_banned_with_reason',
                    options: { reason: reason || i18next.t('ban_reason_not_specified', { ns: 'translation'}) }
                });
                socket.disconnect(true);
            }
        });
        res.json({ message: `User ${userId} has been banned. Reason: ${reason || 'Not specified'}` });
    });
});

router.post('/users/:userId/unban', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const sql = `UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка розбану користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: `User ${userId} has been unbanned.` });
    });
});

router.post('/users/:userId/mute', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const io = req.app.get('socketio');
    const games = req.app.get('activeGames');

    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const sql = `UPDATE users SET is_muted = TRUE WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка муту користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const io = req.app.get('socketio');
        if (io) {
            io.sockets.sockets.forEach((socket) => {
                if (socket.request.session.user && socket.request.session.user.id === parseInt(userId, 10)) {
                    socket.request.session.user.is_muted = true;
                    socket.request.session.save();

                    for (const gameId in games) {
                        if (games[gameId] && games[gameId].players[socket.id]) {
                            games[gameId].players[socket.id].is_muted = true;
                            break;
                        }
                    }
                    socket.emit('mutedStatusUpdate', { isMuted: true, reason: 'admin_action' });
                }
            });
        }
        res.json({ message: `User ${userId} has been muted.` });
    });
});

router.post('/users/:userId/unmute', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const io = req.app.get('socketio');
    const games = req.app.get('activeGames');

    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const sql = `UPDATE users SET is_muted = FALSE WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка анмуту користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const io = req.app.get('socketio');
        if (io) {
            io.sockets.sockets.forEach((socket) => {
                if (socket.request.session.user && socket.request.session.user.id === parseInt(userId, 10)) {
                    socket.request.session.user.is_muted = false;
                    socket.request.session.save();

                    for (const gameId in games) {
                        if (games[gameId] && games[gameId].players[socket.id]) {
                            games[gameId].players[socket.id].is_muted = false;
                            break;
                        }
                    }
                    socket.emit('mutedStatusUpdate', { isMuted: false });
                }
            });
        }
        res.json({ message: `User ${userId} has been unmuted.` });
    });
});

router.get('/games/active', ensureAdmin, (req, res) => {
    const activeGamesList = [];
    const games = req.app.get('activeGames');

    if (!games) {
        console.error("Об'єкт 'games' не знайдено в req.app");
        return res.status(500).json({ error: "Internal server error: Games object not found" });
    }

    for (const gameId in games) {
        if (games.hasOwnProperty(gameId)) {
            const game = games[gameId];

            const playersInfo = game.playerOrder.map(playerId => {
                const player = game.players[playerId];
                return {
                    id: player.id,
                    dbId: player.dbId,
                    name: player.name,
                    isGuest: player.isGuest
                };
            });

            activeGamesList.push({
                id: game.id,
                status: game.trumpSuit ? 'in_progress' : 'lobby',
                playerCount: game.playerOrder.length,
                maxPlayers: game.settings.maxPlayers,
                players: playersInfo,
                hostId: game.hostId,
                hostName: game.players[game.hostId] ? game.players[game.hostId].name : 'N/A',
                startTime: game.startTime ? game.startTime.toISOString() : null,
                settings: {
                    deckSize: game.settings.deckSize,
                }
            });
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

    if (!games) {
        return res.status(500).json({ error: "Internal server error: Games object not found" });
    }
    if (!io) {
        return res.status(500).json({ error: "Internal server error: Socket.IO object not found" });
    }

    const game = games[gameId];

    if (!game) {
        return res.status(404).json({ error: `Game with ID "${gameId}" not found.` });
    }

    const adminUsername = (req.session.user && req.session.user.username) ? req.session.user.username : (i18n ? i18n.t('text_administrator', { ns: 'translation' }) : 'Адміністратор');
    let terminationReason = i18n ? i18n.t('log_game_terminated_by_admin_default', { ns: 'translation', admin: adminUsername }) : `Гра завершена адміністратором ${adminUsername}.`;
    if (reason) {
        terminationReason = i18n ? i18n.t('log_game_terminated_by_admin_with_reason', { ns: 'translation', admin: adminUsername, reason: reason }) : `Гра завершена адміністратором ${adminUsername}. Причина: ${reason}`;
    }

    game.winner = {
        reason: {
            i18nKey: 'game_over_terminated_by_admin',
            options: { reason: reason || (i18n ? i18n.t('admin_termination_no_reason', { ns: 'translation' }) : 'причина не вказана') }
        }
    };
    game.lastAction = 'admin_terminate';

    logEvent(game, null, { i18nKey: 'log_game_terminated_by_admin_event', options: { admin: adminUsername, reason: reason || (i18n ? i18n.t('admin_termination_no_reason_log', { ns: 'translation'}) : 'причина не вказана') }});

    broadcastGameState(gameId);

    setTimeout(() => {
        if (games[gameId]) {
            delete games[gameId];
            console.log(`Гра ${gameId} була примусово завершена адміністратором ${adminUsername} і видалена з активних.`);
        }
    }, 1000);

    res.json({ message: `Game ${gameId} has been terminated by admin. ${terminationReason}` });
});

router.get('/stats/dashboard-overview', ensureAdmin, async (req, res) => {
    const io = req.app.get('socketio');
    const games = req.app.get('activeGames');

    try {
        const usersCountPromise = new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
                if (err) return reject(err);
                resolve(row ? row.count : 0);
            });
        });

        const todayStatsPromise = new Promise((resolve, reject) => {
            const today = new Date().toISOString().slice(0, 10);
            db.get("SELECT new_registrations, games_played FROM system_stats_daily WHERE date = ?", [today], (err, row) => {
                if (err) return reject(err);
                resolve(row || { new_registrations: 0, games_played: 0 });
            });
        });

        const activeGamesCount = games ? Object.keys(games).length : 0;

        let onlineUsersCount = 0;
        if (io) {
            const sockets = await io.fetchSockets();
            const uniqueUserIds = new Set();
            sockets.forEach(socket => {
                if (socket.request.session?.user?.id) {
                    uniqueUserIds.add(socket.request.session.user.id);
                }
            });
            onlineUsersCount = uniqueUserIds.size;
        }

        const [totalUsers, todayStats] = await Promise.all([
            usersCountPromise,
            todayStatsPromise
        ]);

        res.json({
            totalUsers,
            activeGames: activeGamesCount,
            onlineUsers: onlineUsersCount,
            gamesPlayedToday: todayStats.games_played,
            newRegistrationsToday: todayStats.new_registrations
        });

    } catch (error) {
        console.error("Помилка отримання статистики для дашборду:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/games/history', ensureAdmin, (req, res) => {
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;
    const offset = page * pageSize;

    const countSql = `SELECT COUNT(*) as total FROM games WHERE end_time IS NOT NULL`;

    db.get(countSql, [], (countErr, countRow) => {
        if (countErr) {
            console.error("Помилка отримання кількості ігор в історії:", countErr.message);
            return res.status(500).json({ error: 'Internal server error while fetching count.' });
        }

        const totalRowCount = countRow ? countRow.total : 0;

        if (totalRowCount === 0) {
            return res.json({ rows: [], rowCount: 0 });
        }

        const dataSql = `
            SELECT g.id, g.game_type, g.duration_seconds, g.end_time,
                   winner.username as winner_username,
                   loser.username as loser_username
            FROM games g
            LEFT JOIN users winner ON g.winner_user_id = winner.id
            LEFT JOIN users loser ON g.loser_user_id = loser.id
            WHERE g.end_time IS NOT NULL
            ORDER BY g.end_time DESC
            LIMIT ? OFFSET ?
        `;

        db.all(dataSql, [pageSize, offset], (dataErr, rows) => {
            if (dataErr) {
                console.error("Помилка отримання історії ігор:", dataErr.message);
                return res.status(500).json({ error: 'Internal server error while fetching rows.' });
            }

            res.json({
                rows: rows || [],
                rowCount: totalRowCount
            });
        });
    });
});

router.get('/users/:userId/details', ensureAdmin, async (req, res) => {
    const { userId } = req.params;

    try {
        const [userDetails, userGames, userAchievements] = await Promise.all([
            new Promise((resolve, reject) => {
                const sql = `SELECT id, username, wins, losses, streak_count, is_verified, is_admin, is_banned, ban_reason, is_muted, last_played_date FROM users WHERE id = ?`;
                db.get(sql, [userId], (err, row) => {
                    if (err) return reject(err);
                    if (!row) return reject(new Error('User not found'));
                    resolve(row);
                });
            }),
            new Promise((resolve, reject) => {
                const sql = `
                    SELECT g.id, g.end_time, g.game_type, gp.outcome, gp.cards_at_end
                    FROM game_participants gp
                    JOIN games g ON gp.game_id = g.id
                    WHERE gp.user_id = ?
                    ORDER BY g.end_time DESC
                    LIMIT 20
                `;
                db.all(sql, [userId], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            }),
            new Promise((resolve, reject) => {
                const sql = `
                    SELECT ua.achievement_code, ua.unlocked_at, a.name_key, a.rarity
                    FROM user_achievements ua
                    JOIN achievements a ON ua.achievement_code = a.code
                    WHERE ua.user_id = ?
                    ORDER BY ua.unlocked_at DESC
                `;
                db.all(sql, [userId], (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            })
        ]);

        res.json({
            details: userDetails,
            games: userGames,
            achievements: userAchievements
        });

    } catch (error) {
        console.error(`Помилка отримання деталей для користувача ${userId}:`, error.message);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/users/:userId/set-admin', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const requestingAdminId = req.session.user.id;

    if (parseInt(userId, 10) === requestingAdminId) {
        return res.status(400).json({ error: "You cannot change your own admin status." });
    }

    const sql = `UPDATE users SET is_admin = TRUE WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка призначення адміном користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: `User ${userId} is now an admin.` });
    });
});

router.post('/users/:userId/remove-admin', ensureAdmin, (req, res) => {
    const { userId } = req.params;
    const requestingAdminId = req.session.user.id;

    if (parseInt(userId, 10) === requestingAdminId) {
        return res.status(400).json({ error: "You cannot change your own admin status." });
    }

    const sql = `UPDATE users SET is_admin = FALSE WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка зняття прав адміна у користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: `User ${userId} is no longer an admin.` });
    });
});

router.post('/users/:userId/verify', ensureAdmin, (req, res) => {
    const { userId } = req.params;

    const sql = `UPDATE users SET is_verified = TRUE WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка верифікації користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: `User ${userId} has been verified.` });
    });
});

router.post('/users/:userId/unverify', ensureAdmin, (req, res) => {
    const { userId } = req.params;

    const sql = `UPDATE users SET is_verified = FALSE WHERE id = ?`;
    db.run(sql, [userId], function(err) {
        if (err) {
            console.error(`Помилка зняття верифікації у користувача ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: `User ${userId} verification removed.` });
    });
});

module.exports = router;