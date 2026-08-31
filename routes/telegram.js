import express from 'express';
import db from '../db/drizzle.js';
import { user, activeSession } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { authMiddleware, signToken, setAuthCookie, clearAuthCookie } from '../middlewares/jwtAuth.js';

const router = express.Router();

async function createSession(req, userId) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || 'Unknown';

    // Check if there's already an active session from this device/IP
    const existingSession = await db.query.activeSession.findFirst({
        where: {
            user_id: userId,
            ip_address: ip,
            device_info: ua
        },
        orderBy: { created_at: 'desc' }
    });

    if (existingSession) {
        // Update last_active timestamp
        await db.update(activeSession).set({ last_active: new Date() }).where(eq(activeSession.id, existingSession.id));
        return existingSession.id;
    }

    // Create new session if none exists
    const sessionId = crypto.randomUUID();
    let location = 'Unknown';

    try {
        const locRes = await fetch(`http://ip-api.com/json/${ip.split(',')[0].trim()}?fields=status,country,city`).then(r => r.json()).catch(() => null);
        if (locRes && locRes.status === 'success') {
            location = `${locRes.city}, ${locRes.country}`;
        }
    } catch (e) { }

    await db.insert(activeSession).values({
        id: sessionId,
        user_id: userId,
        device_info: ua,
        ip_address: ip,
        location: location
    });
    return sessionId;
}

function verifyTelegramWebAppData(telegramInitData) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN not found in env");

    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => `${key}=${val}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === hash;
}

router.post('/auth', async (req, res) => {
    const { initData, deviceId } = req.body;
    if (!initData) return res.status(400).json({ message: "initData is required" });

    try {
        if (!verifyTelegramWebAppData(initData)) {
            return res.status(403).json({ message: "Invalid Telegram signature" });
        }
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }

    try {
        const urlParams = new URLSearchParams(initData);
        const tgUser = JSON.parse(urlParams.get('user'));
        const telegramId = tgUser.id.toString();

        let userRec = await db.query.user.findFirst({ where: { telegram_id: telegramId } });

        if (!userRec) {
            const baseUsername = tgUser.username || `${tgUser.first_name || 'user'}${tgUser.id.toString().slice(-4)}`;
            let finalUsername = baseUsername;
            let attempts = 0;

            while (await db.query.user.findFirst({ where: { username: finalUsername } })) {
                attempts++;
                finalUsername = `${baseUsername}_${attempts}`;
            }

            const [created] = await db.insert(user).values({
                username: finalUsername,
                password: 'telegram_user',
                telegram_id: telegramId,
                device_id: deviceId || null
            }).returning();
            userRec = created;
        } else {
            if (deviceId) {
                await db.update(user).set({ device_id: deviceId }).where(eq(user.id, userRec.id));
                userRec = await db.query.user.findFirst({ where: { id: userRec.id } });
            }
        }

        if (userRec.is_banned) {
            if (userRec.ban_until && new Date(userRec.ban_until) < new Date()) {
                await db.update(user).set({ is_banned: false, ban_until: null, ban_reason: null }).where(eq(user.id, userRec.id));
                userRec = await db.query.user.findFirst({ where: { id: userRec.id } });
            } else {
                return res.status(403).json({
                    i18nKey: userRec.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                    options: {
                        reason: userRec.ban_reason || null,
                        until: userRec.ban_until ? new Date(userRec.ban_until).toLocaleString() : null
                    }
                });
            }
        }

        const sessionId = await createSession(req, userRec.id);

        const jwtToken = signToken({
            id: userRec.id,
            username: userRec.username,
            isAdmin: !!userRec.is_admin,
            sessionId: sessionId
        });
        setAuthCookie(req, res, jwtToken);

        const responseUser = { ...userRec };
        delete responseUser.password;
        res.json({ user: responseUser });

    } catch (e) {
        console.error("Telegram auth error:", e);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

router.post('/link', authMiddleware, async (req, res) => {
    if (!req.user) return res.status(401).json({ i18nKey: 'error_unauthorized' });

    const { initData } = req.body;
    if (!initData) return res.status(400).json({ message: "No initData provided" });

    try {
        if (!verifyTelegramWebAppData(initData)) {
            return res.status(403).json({ message: "Invalid Telegram signature" });
        }
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }

    try {
        const urlParams = new URLSearchParams(initData);
        const tgUser = JSON.parse(urlParams.get('user'));
        const telegramId = tgUser.id.toString();
        const currentUserId = req.user.id;

        const existingUser = await db.query.user.findFirst({ where: { telegram_id: telegramId } });

        if (existingUser) {
            if (existingUser.id === currentUserId) {
                return res.json({ success: true, message: "Already linked" });
            }

            const totalGames = (existingUser.wins || 0) + (existingUser.losses || 0);
            const isLowRank = (existingUser.rating || 0) < 100;
            const isDummy = totalGames < 5 && isLowRank &&
                (existingUser.password === 'telegram_user' || existingUser.password === 'telegram_user_widget');

            if (isDummy) {
                console.log(`Deleting dummy account ID ${existingUser.id} to free Telegram ID ${telegramId}`);
                await db.delete(user).where(eq(user.id, existingUser.id));
            } else {
                return res.status(409).json({ message: "This Telegram is already linked to another active account." });
            }
        }

        const [updatedUser] = await db.update(user).set({ telegram_id: telegramId }).where(eq(user.id, currentUserId)).returning();

        const responseUser = { ...updatedUser };
        delete responseUser.password;

        res.json({ success: true, user: responseUser });

    } catch (e) {
        console.error("Telegram link error:", e);
        res.status(500).json({ message: "Database error" });
    }
});

router.post('/unlink', authMiddleware, async (req, res) => {
    if (!req.user) return res.status(401).json({ i18nKey: 'error_unauthorized' });

    try {
        const userRec = await db.query.user.findFirst({ where: { id: req.user.id } });
        if (!userRec) return res.status(404).json({ message: "User not found" });

        const isTelegramOnly = userRec.password === 'telegram_user' || userRec.password === 'telegram_user_widget';

        if (isTelegramOnly) {
            console.log(`Deleting account ${userRec.username} because Telegram unlinked and no password.`);
            await db.delete(user).where(eq(user.id, userRec.id));

            clearAuthCookie(req, res);

            return res.json({ success: true, deleted: true, message: "Account deleted (no password)" });
        } else {
            const [updatedUser] = await db.update(user).set({ telegram_id: null }).where(eq(user.id, userRec.id)).returning();

            const responseUser = { ...updatedUser };
            delete responseUser.password;

            res.json({ success: true, user: responseUser, deleted: false });
        }

    } catch (e) {
        console.error("Telegram unlink error:", e);
        res.status(500).json({ message: "Database error" });
    }
});

router.post('/widget-auth', async (req, res) => {
    const authData = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) return res.status(500).json({ message: "Server config error" });

    const { deviceId } = authData;

    const dataCheckString = Object.keys(authData)
        .filter(key => key !== 'hash' && key !== 'deviceId')
        .sort()
        .map(key => `${key}=${authData[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(token).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (hmac !== authData.hash) {
        return res.status(403).json({ message: "Invalid data signature" });
    }

    try {
        const telegramId = authData.id.toString();
        let userRec = await db.query.user.findFirst({ where: { telegram_id: telegramId } });

        if (!userRec) {
            const baseUsername = authData.username || `${authData.first_name || 'user'}${authData.id.toString().slice(-4)}`;
            let finalUsername = baseUsername;
            let attempts = 0;
            while (await db.query.user.findFirst({ where: { username: finalUsername } })) {
                attempts++;
                finalUsername = `${baseUsername}_${attempts}`;
            }

            const [created] = await db.insert(user).values({
                username: finalUsername,
                password: 'telegram_user_widget',
                telegram_id: telegramId,
                device_id: deviceId || null
            }).returning();
            userRec = created;
        } else {
            if (deviceId) {
                await db.update(user).set({ device_id: deviceId }).where(eq(user.id, userRec.id));
                userRec = await db.query.user.findFirst({ where: { id: userRec.id } });
            }
        }

        if (userRec.is_banned) {
            if (userRec.ban_until && new Date(userRec.ban_until) < new Date()) {
                await db.update(user).set({ is_banned: false, ban_until: null, ban_reason: null }).where(eq(user.id, userRec.id));
                userRec = await db.query.user.findFirst({ where: { id: userRec.id } });
            } else {
                return res.status(403).json({
                    i18nKey: userRec.ban_until ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                    options: {
                        reason: userRec.ban_reason || null,
                        until: userRec.ban_until ? new Date(userRec.ban_until).toLocaleString() : null
                    }
                });
            }
        }

        const sessionId = await createSession(req, userRec.id);

        const jwtToken = signToken({
            id: userRec.id,
            username: userRec.username,
            isAdmin: !!userRec.is_admin,
            sessionId: sessionId
        });
        setAuthCookie(req, res, jwtToken);

        const responseUser = { ...userRec };
        delete responseUser.password;
        res.json({ user: responseUser });

    } catch (e) {
        console.error("Widget auth error:", e);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

export default router;
