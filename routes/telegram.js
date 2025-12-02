const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware, signToken, setAuthCookie, clearAuthCookie } = require('../middlewares/jwtAuth');

const util = require('util');
const dbGet = db.get.constructor.name === 'AsyncFunction' ? db.get : util.promisify(db.get.bind(db));
const dbRun = db.run.constructor.name === 'AsyncFunction' ? db.run : util.promisify(db.run.bind(db));


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

        let user = await dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);

        if (!user) {
            const baseUsername = tgUser.username || `${tgUser.first_name || 'user'}${tgUser.id.toString().slice(-4)}`;
            let finalUsername = baseUsername;
            let attempts = 0;

            while (await dbGet('SELECT id FROM users WHERE username = ?', [finalUsername])) {
                attempts++;
                finalUsername = `${baseUsername}_${attempts}`;
            }

            await dbRun(
                'INSERT INTO users (username, password, telegram_id, device_id) VALUES (?, ?, ?, ?)',
                [finalUsername, 'telegram_user', telegramId, deviceId || null]
            );

            user = await dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
        } else {
            if (deviceId) {
                await dbRun('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, user.id]);
            }
        }

        delete user.password;
        const jwtToken = signToken({
            id: user.id,
            username: user.username,
            isAdmin: !!user.is_admin
        });
        setAuthCookie(req, res, jwtToken);

        res.json({ user });

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

        const existingUser = await dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);

        if (existingUser) {
            if (existingUser.id === currentUserId) {
                return res.json({ success: true, message: "Вже прив'язано" });
            }

            const totalGames = (existingUser.wins || 0) + (existingUser.losses || 0);
            const isLowRank = (existingUser.rating || 1500) < 1550;
            const isDummy = totalGames < 5 && isLowRank &&
                (existingUser.password === 'telegram_user' || existingUser.password === 'telegram_user_widget');

            if (isDummy) {
                console.log(`Deleting dummy account ID ${existingUser.id} to free Telegram ID ${telegramId}`);
                await dbRun('DELETE FROM users WHERE id = ?', [existingUser.id]);
            } else {
                return res.status(409).json({ message: "Цей Telegram вже прив'язаний до іншого активного акаунта." });
            }
        }

        await dbRun('UPDATE users SET telegram_id = ? WHERE id = ?', [telegramId, currentUserId]);

        const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [currentUserId]);
        delete updatedUser.password;

        res.json({ success: true, user: updatedUser });

    } catch (e) {
        console.error("Telegram link error:", e);
        res.status(500).json({ message: "Database error" });
    }
});


router.post('/unlink', authMiddleware, async (req, res) => {
    if (!req.user) return res.status(401).json({ i18nKey: 'error_unauthorized' });

    try {
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isTelegramOnly = user.password === 'telegram_user' || user.password === 'telegram_user_widget';

        if (isTelegramOnly) {
            console.log(`Deleting account ${user.username} because Telegram unlinked and no password.`);
            await dbRun('DELETE FROM users WHERE id = ?', [user.id]);

            clearAuthCookie(req, res);

            return res.json({ success: true, deleted: true, message: "Акаунт видалено (немає пароля)" });
        } else {
            await dbRun('UPDATE users SET telegram_id = NULL WHERE id = ?', [user.id]);

            const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
            delete updatedUser.password;

            res.json({ success: true, user: updatedUser, deleted: false });
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

    const dataCheckString = Object.keys(authData)
        .filter(key => key !== 'hash')
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
        let user = await dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);

        if (!user) {
            const baseUsername = authData.username || `${authData.first_name || 'user'}${authData.id.toString().slice(-4)}`;
            let finalUsername = baseUsername;
            let attempts = 0;
            while (await dbGet('SELECT id FROM users WHERE username = ?', [finalUsername])) {
                attempts++;
                finalUsername = `${baseUsername}_${attempts}`;
            }

            await dbRun(
                'INSERT INTO users (username, password, telegram_id, device_id) VALUES (?, ?, ?, ?)',
                [finalUsername, 'telegram_user_widget', telegramId, deviceId || null]
            );

            user = await dbGet('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
        } else {
            if (deviceId) {
                await dbRun('UPDATE users SET device_id = ? WHERE id = ?', [deviceId, user.id]);
            }
        }

        delete user.password;
        const jwtToken = signToken({
            id: user.id,
            username: user.username
        });
        setAuthCookie(req, res, jwtToken);

        res.json({ user });

    } catch (e) {
        console.error("Widget auth error:", e);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports = router;