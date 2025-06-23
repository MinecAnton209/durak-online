const express = require('express');
const router = express.Router();
const db = require('../db');
const { ensureAdmin } = require('../middlewares/authMiddleware');

router.get('/users', ensureAdmin, (req, res) => {
    const sql = `SELECT id, username, wins, losses, streak_count, last_played_date, is_verified, is_admin FROM users ORDER BY id ASC`;
    db.all(sql, [], (err, users) => {
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

module.exports = router;