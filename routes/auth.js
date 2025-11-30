const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();
const { signToken, setAuthCookie, clearAuthCookie } = require('../middlewares/jwtAuth');
const saltRounds = 10;
const statsService = require('../services/statsService');

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) { return res.status(400).json({ message: 'Всі поля обов\'язкові.' }); }
        if (password.length < 4) { return res.status(400).json({ message: 'Пароль має містити щонайменше 4 символи.' }); }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const sql = `INSERT INTO users (username, password) VALUES (?, ?)`;
        db.run(sql, [username, hashedPassword], function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') { return res.status(409).json({ message: 'Це ім\'я користувача вже зайняте.' }); }
                console.error(err.message);
                return res.status(500).json({ message: 'Помилка бази даних.' });
            }
            statsService.incrementDailyCounter('new_registrations');
            res.status(201).json({ message: 'Реєстрація успішна! Тепер можете увійти.' });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Внутрішня помилка сервера.' });
    }
});

router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) { return res.status(400).json({ message: 'Всі поля обов\'язкові.' }); }
        const sql = `SELECT * FROM users WHERE username = ?`;
        db.get(sql, [username], async (err, user) => {
            if (err) { console.error(err.message); return res.status(500).json({ message: 'Помилка бази даних.' }); }
            if (!user) { return res.status(401).json({ message: 'Неправильне ім\'я або пароль.' }); }
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
                const token = signToken(payload)
                setAuthCookie(res, token)
                req.session = { user: payload, save() {}, destroy() {} }
                res.status(200).json({ message: 'Вхід успішний!', user: payload, token });
            } else {
                res.status(401).json({ message: 'Неправильне ім\'я або пароль.' });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Внутрішня помилка сервера.' });
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
                        if (updateErr) console.error("Помилка скидання стріку для користувача:", user.id, updateErr.message);
                        else console.log(`Стрік для користувача ${user.username} (ID: ${user.id}) скинуто через неактивність.`);
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
            req.session = { user: sessionUser, save() {}, destroy() {} };
            res.status(200).json({ isLoggedIn: true, user: sessionUser });
        });
    } else {
        res.status(200).json({ isLoggedIn: false });
    }
});

router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Ви успішно вийшли' });
});

router.post('/update-settings', (req, res) => {
    const currentUser = req.session?.user;
    if (!currentUser) { return res.status(401).json({ message: 'Не авторизовано' }); }
    const { card_back_style } = req.body;
    const userId = currentUser.id;
    const allowedStyles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
    if (!allowedStyles.includes(card_back_style)) { return res.status(400).json({ message: 'Неприпустимий стиль' }); }
    const sql = `UPDATE users SET card_back_style = ? WHERE id = ?`;
    db.run(sql, [card_back_style, userId], (err) => {
        if (err) { console.error(err.message); return res.status(500).json({ message: 'Помилка оновлення налаштувань' }); }
        if (req.session && req.session.user) {
            req.session.user.card_back_style = card_back_style;
        }
        res.status(200).json({ message: 'Налаштування збережено!' });
    });
});

module.exports = router;
