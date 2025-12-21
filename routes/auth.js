const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const util = require('util');
const dbRun = util.promisify(db.run.bind(db));
const router = express.Router();
const { signToken, setAuthCookie, clearAuthCookie } = require('../middlewares/jwtAuth');
const { validateUsername, validatePassword } = require('../utils/validation');
const { loginLimiter, registerLimiter, passwordChangeLimiter } = require('../middlewares/rateLimiters');
const saltRounds = 10;
const statsService = require('../services/statsService');

router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, password, deviceId } = req.body;

        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return res.status(400).json({ message: usernameValidation.error });
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ message: passwordValidation.error });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await dbRun(
            'INSERT INTO users (username, password, device_id) VALUES (?, ?, ?)',
            [usernameValidation.value, hashedPassword, deviceId || null]
        );

        await statsService.incrementDailyCounter('new_registrations');
        res.status(201).json({ message: 'Registration successful! You can now log in.' });

    } catch (error) {
        console.error(error);
        if (error.code === 'SQLITE_CONSTRAINT' || error.code === '23505') {
            return res.status(409).json({ message: 'This username is already taken.' });
        }
        res.status(500).json({ message: 'Internal server error.' });
    }
});

router.post('/login', loginLimiter, (req, res) => {
    try {
        const { username, password, deviceId } = req.body;
        if (!username || !password) { return res.status(400).json({ message: 'All fields are required.' }); }
        const sql = `SELECT * FROM users WHERE username = ?`;
        db.get(sql, [username], async (err, user) => {
            if (err) { console.error(err.message); return res.status(500).json({ message: 'Database error.' }); }
            if (!user) { return res.status(401).json({ message: 'Incorrect username or password.' }); }
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                if (user.is_banned) {
                    return res.status(403).json({ i18nKey: 'error_account_banned_with_reason', options: { reason: user.ban_reason || 'Не вказано' } });
                }
                const payload = {
                    id: user.id,
                    username: user.username,
                    wins: user.wins,
                    losses: user.losses,
                    streak: user.streak_count,
                    coins: user.coins,
                    is_admin: user.is_admin,
                    is_banned: user.is_banned,
                    ban_reason: user.ban_reason,
                    is_muted: user.is_muted,
                    rating: user.rating,
                    card_back_style: user.card_back_style,
                    isVerified: user.is_verified,
                }
                if (deviceId) {
                    await dbRun('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, user.id]);
                }
                const token = signToken(payload)
                setAuthCookie(req, res, token)
                req.session = { user: payload, save() { }, destroy() { } }
                res.status(200).json({ message: 'Login successful!', user: payload, token });
            } else {
                res.status(401).json({ message: 'Incorrect username or password.' });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

router.get('/check-session', (req, res) => {
    const currentUser = req.session?.user || null;
    if (currentUser && currentUser.id) {
        const sql = `SELECT * FROM users WHERE id = ?`;
        db.get(sql, [currentUser.id], (err, user) => {
            if (err || !user) { return res.status(200).json({ isLoggedIn: false }); }

            const today = new Date();
            const lastPlayed = user.last_played_date ? new Date(user.last_played_date) : null;
            let currentStreak = user.streak_count;

            if (lastPlayed) {
                today.setHours(0, 0, 0, 0);
                lastPlayed.setHours(0, 0, 0, 0);

                const diffTime = today - lastPlayed;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 1) {
                    currentStreak = 0;
                    db.run(`UPDATE users SET streak_count = 0 WHERE id = ?`, [user.id], (updateErr) => {
                        if (updateErr) console.error("Error resetting streak for user:", user.id, updateErr.message);
                        else console.log(`Streak for user ${user.username} (ID: ${user.id}) reset due to inactivity.`);
                    });
                }
            }

            const sessionUser = {
                id: user.id,
                username: user.username,
                wins: user.wins,
                losses: user.losses,
                streak: currentStreak,
                coins: user.coins,
                card_back_style: user.card_back_style,
                isVerified: user.is_verified,
                is_admin: user.is_admin,
                is_banned: user.is_banned,
                ban_reason: user.ban_reason,
                is_muted: user.is_muted,
                rating: user.rating
            };
            req.session = { user: sessionUser, save() { }, destroy() { } };
            res.status(200).json({ isLoggedIn: true, user: sessionUser });
        });
    } else {
        res.status(200).json({ isLoggedIn: false });
    }
});

router.post('/logout', (req, res) => {
    clearAuthCookie(req, res);
    res.status(200).json({ message: 'Successfully logged out' });
});

router.post('/update-settings', (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) { return res.status(401).json({ message: 'Unauthorized' }); }
    const { card_back_style } = req.body;
    const userId = currentUser.id;
    const allowedStyles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
    if (!allowedStyles.includes(card_back_style)) { return res.status(400).json({ message: 'Invalid style' }); }
    const sql = `UPDATE users SET card_back_style = ? WHERE id = ?`;
    db.run(sql, [card_back_style, userId], (err) => {
        if (err) { console.error(err.message); return res.status(500).json({ message: 'Error updating settings' }); }
        if (req.session && req.session.user) {
            req.session.user.card_back_style = card_back_style;
        }
        res.status(200).json({ message: 'Settings saved!' });
    });
});

router.post('/change-password', passwordChangeLimiter, (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.error });
    }

    const userId = currentUser.id;
    const sqlGet = `SELECT password FROM users WHERE id = ?`;
    db.get(sqlGet, [userId], async (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ message: 'Database error.' });
        }
        if (!row || !row.password) {
            return res.status(404).json({ message: 'User not found.' });
        }
        try {
            const isMatch = await bcrypt.compare(currentPassword, row.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Incorrect current password.' });
            }
            const hashed = await bcrypt.hash(newPassword, saltRounds);
            const sqlUpdate = `UPDATE users SET password = ? WHERE id = ?`;
            db.run(sqlUpdate, [hashed, userId], (updateErr) => {
                if (updateErr) {
                    console.error(updateErr.message);
                    return res.status(500).json({ message: 'Password update error.' });
                }
                return res.status(200).json({ message: 'Password updated.' });
            });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: 'Internal server error.' });
        }
    });
});

module.exports = router;
