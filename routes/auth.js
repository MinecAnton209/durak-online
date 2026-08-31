import express from 'express';
import bcrypt from 'bcrypt';
import db from '../db/drizzle.js';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { signToken, setAuthCookie, clearAuthCookie } from '../middlewares/jwtAuth.js';
import { validateUsername, validatePassword } from '../utils/validation.js';
import { loginLimiter, registerLimiter, passwordChangeLimiter } from '../middlewares/rateLimiters.js';
import statsService from '../services/statsService.js';
import inboxService from '../services/inboxService.js';
import { user, activeSession, bannedDevice, knownDevice, userDevice } from '../db/schema.ts';

const router = express.Router();
const saltRounds = 10;

async function checkDeviceBan(deviceId) {
    if (!deviceId) return null;
    try {
        const [ban] = await db.select().from(bannedDevice).where(eq(bannedDevice.device_id, deviceId)).limit(1);
        if (ban) {
            if (ban.ban_until && new Date(ban.ban_until) < new Date()) {
                await db.delete(bannedDevice).where(eq(bannedDevice.device_id, deviceId));
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

        const createObj = {
            id: deviceId,
            user_agent: ua,
            first_seen: now,
            last_seen: now,
            login_count: 1,
            device_model: chModel,
            platform_version: chPlatformVersion,
            is_mobile: chMobile
        };
        const updateObj = {
            last_seen: now,
            user_agent: ua,
            device_model: chModel ?? undefined,
            platform_version: chPlatformVersion ?? undefined,
            is_mobile: chMobile,
            ...(isLogin ? { login_count: sql`${knownDevice.login_count} + 1` } : {})
        };
        await db.insert(knownDevice).values(createObj).onConflictDoUpdate({
            target: knownDevice.id,
            set: updateObj
        });

        if (userId) {
            await db.insert(userDevice).values({ user_id: userId, device_id: deviceId, last_used: now })
                .onConflictDoUpdate({
                    target: [userDevice.user_id, userDevice.device_id],
                    set: { last_used: now }
                });
            await db.update(user).set({ device_id: deviceId }).where(eq(user.id, userId));
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

        await db.insert(user).values({ username: usernameValidation.value, password: hashedPassword, device_id: deviceId || null });

        await statsService.incrementDailyCounter('new_registrations');
        res.status(201).json({ message: 'Registration successful! You can now log in.' });

    } catch (error) {
        console.error(error);
        if (error.code === '23505') {
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

        const userRecord = await db.query.user.findFirst({ where: { username } });
        if (!userRecord) return res.status(401).json({ message: 'Incorrect username or password.' });

        const isMatch = await bcrypt.compare(password, userRecord.password);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect username or password.' });

        if (userRecord.is_banned) {
            if (userRecord.ban_until && new Date(userRecord.ban_until) < new Date()) {
                await db.update(user).set({ is_banned: false, ban_until: null, ban_reason: null }).where(eq(user.id, userRecord.id));
                userRecord.is_banned = false;
                userRecord.ban_until = null;
                userRecord.ban_reason = null;
            } else {
                return res.status(403).json({
                    i18nKey: userRecord.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                    options: { reason: userRecord.ban_reason || null, until: userRecord.ban_until ? new Date(userRecord.ban_until).toLocaleString() : null }
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

        await db.insert(activeSession).values({ id: sessionId, user_id: userRecord.id, device_info: ua, ip_address: ip, location });

        await recordDeviceActivity(userRecord.id, deviceId, req, true);

        if (deviceId) {
            await db.update(user).set({ device_id: deviceId }).where(eq(user.id, userRecord.id));
        }

        const payload = {
            id: userRecord.id, username: userRecord.username, wins: userRecord.wins, losses: userRecord.losses,
            streak: userRecord.streak_count, coins: userRecord.coins, is_admin: userRecord.is_admin,
            is_banned: userRecord.is_banned, ban_reason: userRecord.ban_reason, ban_until: userRecord.ban_until,
            is_muted: userRecord.is_muted, mute_until: userRecord.mute_until, rating: userRecord.rating,
            card_back_style: userRecord.card_back_style, isVerified: userRecord.is_verified,
            pref_quick_deck_size: userRecord.pref_quick_deck_size, pref_quick_max_players: userRecord.pref_quick_max_players,
            pref_quick_game_mode: userRecord.pref_quick_game_mode, pref_quick_is_betting: userRecord.pref_quick_is_betting,
            pref_quick_bet_amount: userRecord.pref_quick_bet_amount, sessionId
        };

        const token = signToken(payload);
        setAuthCookie(req, res, token);
        req.session = { user: payload, save() { }, destroy() { } };

        await inboxService.addMessage(userRecord.id, {
            type: 'login_alert', titleKey: 'inbox.login_alert_title', contentKey: 'inbox.login_alert_content',
            contentParams: { ip, location, userAgent: ua, sessionId, deviceId }
        });

        res.status(200).json({ message: 'Login successful!', user: payload, token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

router.get('/api/auth/sessions', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const sessions = await db.query.activeSession.findMany({
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

router.delete('/api/auth/sessions/:id', async (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) return res.status(401).json({ message: 'Unauthorized' });

    const targetId = req.params.id;

    try {
        const [targetSession, currentSession] = await Promise.all([
            db.query.activeSession.findFirst({ where: { id: targetId } }),
            db.query.activeSession.findFirst({ where: { id: currentUser.sessionId } })
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

        await db.delete(activeSession).where(eq(activeSession.id, targetId));
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
            const userRecord = await db.query.user.findFirst({ where: { id: currentUser.id } });
            if (!userRecord) return res.status(200).json({ isLoggedIn: false });

            const today = new Date();
            const lastPlayed = userRecord.last_played_date ? new Date(userRecord.last_played_date) : null;
            let currentStreak = userRecord.streak_count;

            if (lastPlayed) {
                const todayMidnight = new Date(today); todayMidnight.setHours(0, 0, 0, 0);
                const lastMidnight = new Date(lastPlayed); lastMidnight.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((todayMidnight - lastMidnight) / (1000 * 60 * 60 * 24));
                if (diffDays > 1 && userRecord.streak_count > 0) {
                    currentStreak = 0;
                    db.update(user).set({ streak_count: 0 }).where(eq(user.id, userRecord.id)).catch(e => console.error(e));
                }
            }

            let isMuted = userRecord.is_muted, muteUntil = userRecord.mute_until;
            if (isMuted && muteUntil && new Date(muteUntil) < new Date()) {
                isMuted = false; muteUntil = null;
                db.update(user).set({ is_muted: false, mute_until: null }).where(eq(user.id, userRecord.id)).catch(e => console.error(e));
            }

            let isBanned = userRecord.is_banned, banUntil = userRecord.ban_until, banReason = userRecord.ban_reason;
            if (isBanned && banUntil && new Date(banUntil) < new Date()) {
                isBanned = false; banUntil = null; banReason = null;
                db.update(user).set({ is_banned: false, ban_until: null, ban_reason: null }).where(eq(user.id, userRecord.id)).catch(e => console.error(e));
            }

            const sessionUser = {
                id: userRecord.id, username: userRecord.username, wins: userRecord.wins, losses: userRecord.losses,
                streak: currentStreak, coins: userRecord.coins, card_back_style: userRecord.card_back_style,
                isVerified: userRecord.is_verified, is_admin: userRecord.is_admin, is_banned: isBanned,
                ban_reason: banReason, ban_until: banUntil, is_muted: isMuted, mute_until: muteUntil,
                rating: userRecord.rating, pref_quick_deck_size: userRecord.pref_quick_deck_size,
                pref_quick_max_players: userRecord.pref_quick_max_players, pref_quick_game_mode: userRecord.pref_quick_game_mode,
                pref_quick_is_betting: userRecord.pref_quick_is_betting, pref_quick_bet_amount: userRecord.pref_quick_bet_amount
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
        await db.update(user).set({
            ...(card_back_style !== undefined && { card_back_style }),
            ...(pref_quick_deck_size !== undefined && { pref_quick_deck_size: parseInt(pref_quick_deck_size) }),
            ...(pref_quick_max_players !== undefined && { pref_quick_max_players: parseInt(pref_quick_max_players) }),
            ...(pref_quick_game_mode !== undefined && { pref_quick_game_mode }),
            ...(pref_quick_is_betting !== undefined && { pref_quick_is_betting }),
            ...(pref_quick_bet_amount !== undefined && { pref_quick_bet_amount: parseInt(pref_quick_bet_amount) }),
        }).where(eq(user.id, userId));
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
        const userRecord = await db.query.user.findFirst({ where: { id: currentUser.id } });
        if (!userRecord) return res.status(404).json({ message: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, userRecord.password);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect current password.' });

        const hashed = await bcrypt.hash(newPassword, saltRounds);
        await db.update(user).set({ password: hashed }).where(eq(user.id, currentUser.id));
        res.status(200).json({ message: 'Password updated.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

export default router;
