const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const util = require('util');
const crypto = require('crypto');
const dbRun = util.promisify(db.run.bind(db));
const dbGet = util.promisify(db.get.bind(db));
const dbAll = util.promisify(db.all.bind(db));
const router = express.Router();
const { signToken, setAuthCookie, clearAuthCookie } = require('../middlewares/jwtAuth');
const { validateUsername, validatePassword } = require('../utils/validation');
const { loginLimiter, registerLimiter, passwordChangeLimiter } = require('../middlewares/rateLimiters');
const saltRounds = 10;
const statsService = require('../services/statsService');

async function checkDeviceBan(deviceId) {
    if (!deviceId) return null;
    try {
        const ban = await dbGet('SELECT reason, ban_until FROM banned_devices WHERE device_id = ?', [deviceId]);
        if (ban) {
            if (ban.ban_until && new Date(ban.ban_until) < new Date()) {
                // Ban expired
                await dbRun('DELETE FROM banned_devices WHERE device_id = ?', [deviceId]);
                return null;
            }
            return ban.reason || 'Device suspended';
        }
    } catch (e) {
        console.error('Device ban check error:', e);
    }
    return null;
}

async function recordDeviceActivity(userId, deviceId, req, isLogin = false) {
    if (!deviceId) return;

    try {
        const ua = req.headers['user-agent'] || 'Unknown';
        const chModel = req.get('Sec-CH-UA-Model') ? req.get('Sec-CH-UA-Model').replace(/"/g, '') : null;
        const chPlatformVersion = req.get('Sec-CH-UA-Platform-Version') ? req.get('Sec-CH-UA-Platform-Version').replace(/"/g, '') : null;
        const chMobile = req.get('Sec-CH-UA-Mobile') ? (req.get('Sec-CH-UA-Mobile') === '?1') : false;
        const now = new Date().toISOString();

        // 1. Update/Insert known_devices
        const existingDevice = await dbGet('SELECT * FROM known_devices WHERE id = ?', [deviceId]);
        if (existingDevice) {
            await dbRun(
                `UPDATE known_devices SET 
                    last_seen = ?, 
                    login_count = login_count + ?, 
                    user_agent = ?, 
                    device_model = COALESCE(?, device_model), 
                    platform_version = COALESCE(?, platform_version), 
                    is_mobile = ? 
                WHERE id = ?`,
                [now, isLogin ? 1 : 0, ua, chModel, chPlatformVersion, chMobile, deviceId]
            );
        } else {
            await dbRun(
                'INSERT INTO known_devices (id, user_agent, first_seen, last_seen, login_count, device_model, platform_version, is_mobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [deviceId, ua, now, now, isLogin ? 1 : 1, chModel, chPlatformVersion, chMobile]
            );
        }

        // 2. Link User to Device
        if (userId) {
            const existingLink = await dbGet('SELECT * FROM user_devices WHERE user_id = ? AND device_id = ?', [userId, deviceId]);
            if (existingLink) {
                await dbRun('UPDATE user_devices SET last_used = ? WHERE user_id = ? AND device_id = ?', [now, userId, deviceId]);
            } else {
                await dbRun('INSERT INTO user_devices (user_id, device_id, last_used) VALUES (?, ?, ?)', [userId, deviceId, now]);
            }

            // Sync user's device_id in the main users table if needed
            await dbRun('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, userId]);
        }
    } catch (e) {
        console.error('Error tracking device activity:', e);
    }
}

router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, password, deviceId } = req.body;

        const deviceBanReason = await checkDeviceBan(deviceId);
        if (deviceBanReason) {
            return res.status(403).json({
                message: 'Your device is banned.',
                i18nKey: 'error_device_banned',
                options: { reason: deviceBanReason }
            });
        }

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

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password, deviceId } = req.body;
        if (!username || !password) { return res.status(400).json({ message: 'All fields are required.' }); }

        const deviceBanReason = await checkDeviceBan(deviceId);
        if (deviceBanReason) {
            return res.status(403).json({
                message: 'Your device is banned.',
                i18nKey: 'error_device_banned',
                options: { reason: deviceBanReason }
            });
        }

        const sql = `SELECT * FROM users WHERE username = ?`;
        db.get(sql, [username], async (err, user) => {
            if (err) { console.error(err.message); return res.status(500).json({ message: 'Database error.' }); }
            if (!user) { return res.status(401).json({ message: 'Incorrect username or password.' }); }
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                if (user.is_banned) {
                    if (user.ban_until && new Date(user.ban_until) < new Date()) {
                        await dbRun('UPDATE users SET is_banned = false, ban_until = NULL, ban_reason = NULL WHERE id = ?', [user.id]);
                        user.is_banned = false;
                        user.ban_until = null;
                        user.ban_reason = null;
                    } else {
                        return res.status(403).json({
                            i18nKey: user.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                            options: {
                                reason: user.ban_reason || null,
                                until: user.ban_until ? new Date(user.ban_until).toLocaleString() : null
                            }
                        });
                    }
                }

                // Session Management
                const sessionId = crypto.randomUUID();
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
                const ua = req.headers['user-agent'] || 'Unknown';
                let location = 'Unknown';

                try {
                    // Try fetch location (fire and forget logic or swift await)
                    // Simple free service
                    const locRes = await fetch(`http://ip-api.com/json/${ip.split(',')[0].trim()}?fields=status,country,city`).then(r => r.json()).catch(() => null);
                    if (locRes && locRes.status === 'success') {
                        location = `${locRes.city}, ${locRes.country}`;
                    }
                } catch (e) { }

                await dbRun('INSERT INTO active_sessions (id, user_id, device_info, ip_address, location) VALUES (?, ?, ?, ?, ?)',
                    [sessionId, user.id, ua, ip, location]);

                // Track Device Activity
                await recordDeviceActivity(user.id, deviceId, req, true);

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
                    ban_until: user.ban_until,
                    is_muted: user.is_muted,
                    mute_until: user.mute_until,
                    rating: user.rating,
                    card_back_style: user.card_back_style,
                    isVerified: user.is_verified,
                    pref_quick_deck_size: user.pref_quick_deck_size,
                    pref_quick_max_players: user.pref_quick_max_players,
                    pref_quick_game_mode: user.pref_quick_game_mode,
                    pref_quick_is_betting: user.pref_quick_is_betting,
                    pref_quick_bet_amount: user.pref_quick_bet_amount,
                    sessionId: sessionId // Add Session ID
                }
                if (deviceId) {
                    await dbRun('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, user.id]);
                }
                const token = signToken(payload)
                setAuthCookie(req, res, token)
                req.session = { user: payload, save() { }, destroy() { } }

                const inboxService = require('../services/inboxService');
                await inboxService.addMessage(user.id, {
                    type: 'login_alert',
                    titleKey: 'inbox.login_alert_title',
                    contentKey: 'inbox.login_alert_content',
                    contentParams: {
                        ip: ip,
                        location: location,
                        userAgent: ua,
                        sessionId: sessionId,
                        deviceId: deviceId
                    }
                });

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

router.get('/sessions', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const sessions = await dbAll('SELECT * FROM active_sessions WHERE user_id = ? ORDER BY last_active DESC', [currentUser.id]);

        const result = sessions.map(s => ({
            id: s.id,
            device: s.device_info,
            ip: s.ip_address,
            location: s.location,
            last_active: s.last_active,
            created_at: s.created_at,
            is_current: s.id === currentUser.sessionId
        }));
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching sessions' });
    }
});

router.delete('/sessions/:id', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    const targetId = req.params.id;

    // Self-termination is allowed (Logout).

    try {
        const targetSession = await dbGet('SELECT * FROM active_sessions WHERE id = ?', [targetId]);
        const currentSession = await dbGet('SELECT * FROM active_sessions WHERE id = ?', [currentUser.sessionId]);

        if (!targetSession) return res.status(404).json({ message: 'Session not found' });
        if (targetSession.user_id !== currentUser.id) return res.status(403).json({ message: 'Forbidden' });

        if (targetId !== currentUser.sessionId) {
            // Check ages
            const targetCreated = new Date(targetSession.created_at);
            const currentCreated = new Date(currentSession ? currentSession.created_at : 0); // If current missing, assume very old or broken

            // If current is NEWER than target (created AFTER target), BLOCK
            // "Cannot terminate older sessions" -> if I am newer, I cannot kill older.
            // If currentCreated > targetCreated -> I am newer.
            if (currentCreated > targetCreated) {
                return res.status(403).json({
                    message: 'New sessions cannot terminate older sessions.',
                    i18nKey: 'error_session_terminate_too_new'
                });
            }
        }

        await dbRun('DELETE FROM active_sessions WHERE id = ?', [targetId]);
        res.json({ message: 'Session terminated' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error terminating session' });
    }
});

router.get('/check-session', async (req, res) => {
    const currentUser = req.session?.user || null;
    const deviceId = req.query.deviceId;

    if (currentUser && currentUser.id) {
        // Update device stats on session check to ensure we always have up-to-date data
        if (deviceId) {
            const deviceBanReason = await checkDeviceBan(deviceId);
            if (deviceBanReason) {
                return res.status(403).json({
                    isLoggedIn: false,
                    message: 'Your device is banned.',
                    i18nKey: 'error_device_banned',
                    options: { reason: deviceBanReason }
                });
            }
            await recordDeviceActivity(currentUser.id, deviceId, req, false);
        }

        const sql = `SELECT * FROM users WHERE id = ?`;
        db.get(sql, [currentUser.id], async (err, user) => {
            if (err || !user) { return res.status(200).json({ isLoggedIn: false }); }

            const today = new Date();
            const lastPlayed = user.last_played_date ? new Date(user.last_played_date) : null;
            let currentStreak = user.streak_count;

            if (lastPlayed) {
                today.setHours(0, 0, 0, 0);
                lastPlayed.setHours(0, 0, 0, 0);

                const diffTime = today - lastPlayed;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 1 && user.streak_count > 0) {
                    currentStreak = 0;
                    await dbRun(`UPDATE users SET streak_count = false WHERE id = ?`, [user.id]).catch(e => console.error(e));
                }
            }

            let isMuted = user.is_muted;
            let muteUntil = user.mute_until;

            if (isMuted && muteUntil && new Date(muteUntil) < new Date()) {
                isMuted = false;
                muteUntil = null;
                await dbRun('UPDATE users SET is_muted = false, mute_until = NULL WHERE id = ?', [user.id]).catch(e => console.error(e));
            }

            let isBanned = user.is_banned;
            let banUntil = user.ban_until;
            let banReason = user.ban_reason;

            if (isBanned && banUntil && new Date(banUntil) < new Date()) {
                isBanned = false;
                banUntil = null;
                banReason = null;
                await dbRun('UPDATE users SET is_banned = false, ban_until = NULL, ban_reason = NULL WHERE id = ?', [user.id]).catch(e => console.error(e));
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
                is_banned: isBanned,
                ban_reason: banReason,
                ban_until: banUntil,
                is_muted: isMuted,
                mute_until: muteUntil,
                rating: user.rating,
                pref_quick_deck_size: user.pref_quick_deck_size,
                pref_quick_max_players: user.pref_quick_max_players,
                pref_quick_game_mode: user.pref_quick_game_mode,
                pref_quick_is_betting: user.pref_quick_is_betting,
                pref_quick_bet_amount: user.pref_quick_bet_amount
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

    const {
        card_back_style,
        pref_quick_deck_size,
        pref_quick_max_players,
        pref_quick_game_mode,
        pref_quick_is_betting,
        pref_quick_bet_amount
    } = req.body;

    const userId = currentUser.id;

    if (card_back_style) {
        const allowedStyles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
        if (!allowedStyles.includes(card_back_style)) { return res.status(400).json({ message: 'Invalid style' }); }
    }

    const sql = `UPDATE users SET 
        card_back_style = COALESCE(?, card_back_style),
        pref_quick_deck_size = COALESCE(?, pref_quick_deck_size),
        pref_quick_max_players = COALESCE(?, pref_quick_max_players),
        pref_quick_game_mode = COALESCE(?, pref_quick_game_mode),
        pref_quick_is_betting = COALESCE(?, pref_quick_is_betting),
        pref_quick_bet_amount = COALESCE(?, pref_quick_bet_amount)
    WHERE id = ?`;

    db.run(sql, [
        card_back_style,
        pref_quick_deck_size,
        pref_quick_max_players,
        pref_quick_game_mode,
        pref_quick_is_betting,
        pref_quick_bet_amount,
        userId
    ], (err) => {
        if (err) { console.error(err.message); return res.status(500).json({ message: 'Error updating settings' }); }
        if (req.session && req.session.user) {
            if (card_back_style) req.session.user.card_back_style = card_back_style;
            if (pref_quick_deck_size !== undefined) req.session.user.pref_quick_deck_size = pref_quick_deck_size;
            if (pref_quick_max_players !== undefined) req.session.user.pref_quick_max_players = pref_quick_max_players;
            if (pref_quick_game_mode !== undefined) req.session.user.pref_quick_game_mode = pref_quick_game_mode;
            if (pref_quick_is_betting !== undefined) req.session.user.pref_quick_is_betting = pref_quick_is_betting;
            if (pref_quick_bet_amount !== undefined) req.session.user.pref_quick_bet_amount = pref_quick_bet_amount;
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
