const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../db/prisma');
const crypto = require('crypto');
const router = express.Router();
const { signToken, setAuthCookie, clearAuthCookie } = require('../middlewares/jwtAuth');
const { validateUsername, validatePassword } = require('../utils/validation');
const { loginLimiter, registerLimiter, passwordChangeLimiter } = require('../middlewares/rateLimiters');
const saltRounds = 10;
const statsService = require('../services/statsService');

async function checkDeviceBan(deviceId) {
    if (!deviceId) return null;
    try {
        const ban = await prisma.bannedDevice.findUnique({ where: { device_id: deviceId } });
        if (ban) {
            if (ban.ban_until && new Date(ban.ban_until) < new Date()) {
                await prisma.bannedDevice.delete({ where: { device_id: deviceId } });
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
        const now = new Date();

        await prisma.knownDevice.upsert({
            where: { id: deviceId },
            update: {
                last_seen: now,
                login_count: isLogin ? { increment: 1 } : undefined,
                user_agent: ua,
                device_model: chModel ?? undefined,
                platform_version: chPlatformVersion ?? undefined,
                is_mobile: chMobile
            },
            create: {
                id: deviceId,
                user_agent: ua,
                first_seen: now,
                last_seen: now,
                login_count: 1,
                device_model: chModel,
                platform_version: chPlatformVersion,
                is_mobile: chMobile
            }
        });

        if (userId) {
            await prisma.userDevice.upsert({
                where: { user_id_device_id: { user_id: userId, device_id: deviceId } },
                update: { last_used: now },
                create: { user_id: userId, device_id: deviceId, last_used: now }
            });
            await prisma.user.update({ where: { id: userId }, data: { device_id: deviceId } });
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
            return res.status(403).json({ message: 'Your device is banned.', i18nKey: 'error_device_banned', options: { reason: deviceBanReason } });
        }

        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) return res.status(400).json({ message: usernameValidation.error });

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) return res.status(400).json({ message: passwordValidation.error });

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        await prisma.user.create({
            data: { username: usernameValidation.value, password: hashedPassword, device_id: deviceId || null }
        });

        await statsService.incrementDailyCounter('new_registrations');
        res.status(201).json({ message: 'Registration successful! You can now log in.' });

    } catch (error) {
        console.error(error);
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'This username is already taken.' });
        }
        res.status(500).json({ message: 'Internal server error.' });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password, deviceId } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'All fields are required.' });

        const deviceBanReason = await checkDeviceBan(deviceId);
        if (deviceBanReason) {
            return res.status(403).json({ message: 'Your device is banned.', i18nKey: 'error_device_banned', options: { reason: deviceBanReason } });
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return res.status(401).json({ message: 'Incorrect username or password.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect username or password.' });

        if (user.is_banned) {
            if (user.ban_until && new Date(user.ban_until) < new Date()) {
                await prisma.user.update({ where: { id: user.id }, data: { is_banned: false, ban_until: null, ban_reason: null } });
                user.is_banned = false;
                user.ban_until = null;
                user.ban_reason = null;
            } else {
                return res.status(403).json({
                    i18nKey: user.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                    options: { reason: user.ban_reason || null, until: user.ban_until ? new Date(user.ban_until).toLocaleString() : null }
                });
            }
        }

        const sessionId = crypto.randomUUID();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const ua = req.headers['user-agent'] || 'Unknown';
        let location = 'Unknown';

        try {
            const locRes = await fetch(`http://ip-api.com/json/${ip.split(',')[0].trim()}?fields=status,country,city`).then(r => r.json()).catch(() => null);
            if (locRes && locRes.status === 'success') location = `${locRes.city}, ${locRes.country}`;
        } catch (e) { }

        await prisma.activeSession.create({
            data: { id: sessionId, user_id: user.id, device_info: ua, ip_address: ip, location }
        });

        await recordDeviceActivity(user.id, deviceId, req, true);

        if (deviceId) {
            await prisma.user.update({ where: { id: user.id }, data: { device_id: deviceId } });
        }

        const payload = {
            id: user.id, username: user.username, wins: user.wins, losses: user.losses,
            streak: user.streak_count, coins: user.coins, is_admin: user.is_admin,
            is_banned: user.is_banned, ban_reason: user.ban_reason, ban_until: user.ban_until,
            is_muted: user.is_muted, mute_until: user.mute_until, rating: user.rating,
            card_back_style: user.card_back_style, isVerified: user.is_verified,
            pref_quick_deck_size: user.pref_quick_deck_size, pref_quick_max_players: user.pref_quick_max_players,
            pref_quick_game_mode: user.pref_quick_game_mode, pref_quick_is_betting: user.pref_quick_is_betting,
            pref_quick_bet_amount: user.pref_quick_bet_amount, sessionId
        };

        const token = signToken(payload);
        setAuthCookie(req, res, token);
        req.session = { user: payload, save() { }, destroy() { } };

        const inboxService = require('../services/inboxService');
        await inboxService.addMessage(user.id, {
            type: 'login_alert', titleKey: 'inbox.login_alert_title', contentKey: 'inbox.login_alert_content',
            contentParams: { ip, location, userAgent: ua, sessionId, deviceId }
        });

        res.status(200).json({ message: 'Login successful!', user: payload, token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

router.get('/sessions', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const sessions = await prisma.activeSession.findMany({
            where: { user_id: currentUser.id },
            orderBy: { last_active: 'desc' }
        });

        res.json(sessions.map(s => ({
            id: s.id, device: s.device_info, ip: s.ip_address, location: s.location,
            last_active: s.last_active, created_at: s.created_at, is_current: s.id === currentUser.sessionId
        })));
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching sessions' });
    }
});

router.delete('/sessions/:id', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    const targetId = req.params.id;

    try {
        const [targetSession, currentSession] = await Promise.all([
            prisma.activeSession.findUnique({ where: { id: targetId } }),
            prisma.activeSession.findUnique({ where: { id: currentUser.sessionId } })
        ]);

        if (!targetSession) return res.status(404).json({ message: 'Session not found' });
        if (targetSession.user_id !== currentUser.id) return res.status(403).json({ message: 'Forbidden' });

        if (targetId !== currentUser.sessionId) {
            const targetCreated = new Date(targetSession.created_at);
            const currentCreated = new Date(currentSession ? currentSession.created_at : 0);
            if (currentCreated > targetCreated) {
                return res.status(403).json({ message: 'New sessions cannot terminate older sessions.', i18nKey: 'error_session_terminate_too_new' });
            }
        }

        await prisma.activeSession.delete({ where: { id: targetId } });
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
        if (deviceId) {
            const deviceBanReason = await checkDeviceBan(deviceId);
            if (deviceBanReason) {
                return res.status(403).json({ isLoggedIn: false, message: 'Your device is banned.', i18nKey: 'error_device_banned', options: { reason: deviceBanReason } });
            }
            await recordDeviceActivity(currentUser.id, deviceId, req, false);
        }

        try {
            const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
            if (!user) return res.status(200).json({ isLoggedIn: false });

            const today = new Date();
            const lastPlayed = user.last_played_date ? new Date(user.last_played_date) : null;
            let currentStreak = user.streak_count;

            if (lastPlayed) {
                const todayMidnight = new Date(today); todayMidnight.setHours(0, 0, 0, 0);
                const lastMidnight = new Date(lastPlayed); lastMidnight.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((todayMidnight - lastMidnight) / (1000 * 60 * 60 * 24));
                if (diffDays > 1 && user.streak_count > 0) {
                    currentStreak = 0;
                    prisma.user.update({ where: { id: user.id }, data: { streak_count: 0 } }).catch(e => console.error(e));
                }
            }

            let isMuted = user.is_muted, muteUntil = user.mute_until;
            if (isMuted && muteUntil && new Date(muteUntil) < new Date()) {
                isMuted = false; muteUntil = null;
                prisma.user.update({ where: { id: user.id }, data: { is_muted: false, mute_until: null } }).catch(e => console.error(e));
            }

            let isBanned = user.is_banned, banUntil = user.ban_until, banReason = user.ban_reason;
            if (isBanned && banUntil && new Date(banUntil) < new Date()) {
                isBanned = false; banUntil = null; banReason = null;
                prisma.user.update({ where: { id: user.id }, data: { is_banned: false, ban_until: null, ban_reason: null } }).catch(e => console.error(e));
            }

            const sessionUser = {
                id: user.id, username: user.username, wins: user.wins, losses: user.losses,
                streak: currentStreak, coins: user.coins, card_back_style: user.card_back_style,
                isVerified: user.is_verified, is_admin: user.is_admin, is_banned: isBanned,
                ban_reason: banReason, ban_until: banUntil, is_muted: isMuted, mute_until: muteUntil,
                rating: user.rating, pref_quick_deck_size: user.pref_quick_deck_size,
                pref_quick_max_players: user.pref_quick_max_players, pref_quick_game_mode: user.pref_quick_game_mode,
                pref_quick_is_betting: user.pref_quick_is_betting, pref_quick_bet_amount: user.pref_quick_bet_amount
            };
            req.session = { user: sessionUser, save() { }, destroy() { } };
            res.status(200).json({ isLoggedIn: true, user: sessionUser });
        } catch (e) {
            console.error(e);
            res.status(200).json({ isLoggedIn: false });
        }
    } else {
        res.status(200).json({ isLoggedIn: false });
    }
});

router.post('/logout', (req, res) => {
    clearAuthCookie(req, res);
    res.status(200).json({ message: 'Successfully logged out' });
});

router.post('/update-settings', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    const { card_back_style, pref_quick_deck_size, pref_quick_max_players, pref_quick_game_mode, pref_quick_is_betting, pref_quick_bet_amount } = req.body;
    const userId = currentUser.id;

    if (card_back_style) {
        const allowedStyles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
        if (!allowedStyles.includes(card_back_style)) return res.status(400).json({ message: 'Invalid style' });
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                ...(card_back_style !== undefined && { card_back_style }),
                ...(pref_quick_deck_size !== undefined && { pref_quick_deck_size: parseInt(pref_quick_deck_size) }),
                ...(pref_quick_max_players !== undefined && { pref_quick_max_players: parseInt(pref_quick_max_players) }),
                ...(pref_quick_game_mode !== undefined && { pref_quick_game_mode }),
                ...(pref_quick_is_betting !== undefined && { pref_quick_is_betting }),
                ...(pref_quick_bet_amount !== undefined && { pref_quick_bet_amount: parseInt(pref_quick_bet_amount) }),
            }
        });
        if (req.session && req.session.user) {
            if (card_back_style) req.session.user.card_back_style = card_back_style;
            if (pref_quick_deck_size !== undefined) req.session.user.pref_quick_deck_size = pref_quick_deck_size;
            if (pref_quick_max_players !== undefined) req.session.user.pref_quick_max_players = pref_quick_max_players;
            if (pref_quick_game_mode !== undefined) req.session.user.pref_quick_game_mode = pref_quick_game_mode;
            if (pref_quick_is_betting !== undefined) req.session.user.pref_quick_is_betting = pref_quick_is_betting;
            if (pref_quick_bet_amount !== undefined) req.session.user.pref_quick_bet_amount = pref_quick_bet_amount;
        }
        res.status(200).json({ message: 'Settings saved!' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Error updating settings' });
    }
});

router.post('/change-password', passwordChangeLimiter, async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'All fields are required.' });

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) return res.status(400).json({ message: passwordValidation.error });

    try {
        const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { password: true } });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect current password.' });

        const hashed = await bcrypt.hash(newPassword, saltRounds);
        await prisma.user.update({ where: { id: currentUser.id }, data: { password: hashed } });
        res.status(200).json({ message: 'Password updated.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;
