const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();
const saltRounds = 10;

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
                    return res.status(403).json({
                        i18nKey: 'error_account_banned_with_reason',
                        options: { reason: user.ban_reason || i18next.t('ban_reason_not_specified', { ns: 'translation'}) }
                    });
                }
                req.session.user = { id: user.id, username: user.username, wins: user.wins, losses: user.losses, streak: user.streak_count, is_admin: user.is_admin, is_banned: user.is_banned, ban_reason: user.ban_reason };
                res.status(200).json({ message: 'Вхід успішний!', user: req.session.user });
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
    if (req.session && req.session.user) {
        const sql = `SELECT * FROM users WHERE id = ?`;
        db.get(sql, [req.session.user.id], (err, user) => {
            if (err || !user) { return res.status(200).json({ isLoggedIn: false }); }
            req.session.user = {
                id: user.id,
                username: user.username,
                wins: user.wins,
                losses: user.losses,
                streak: user.streak_count,
                card_back_style: user.card_back_style,
                isVerified: user.is_verified,
                is_admin: user.is_admin,
                is_banned: user.is_banned,
                ban_reason: user.ban_reason
            };
            req.session.save();
            res.status(200).json({ isLoggedIn: true, user: req.session.user });
        });
    } else {
        res.status(200).json({ isLoggedIn: false });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.status(500).json({ message: 'Не вдалося вийти' }); }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Ви успішно вийшли' });
    });
});

router.post('/update-settings', (req, res) => {
    if (!req.session.user) { return res.status(401).json({ message: 'Не авторизовано' }); }
    const { card_back_style } = req.body;
    const userId = req.session.user.id;
    const allowedStyles = ['default', 'red', 'blue', 'green', 'purple', 'gold'];
    if (!allowedStyles.includes(card_back_style)) { return res.status(400).json({ message: 'Неприпустимий стиль' }); }
    const sql = `UPDATE users SET card_back_style = ? WHERE id = ?`;
    db.run(sql, [card_back_style, userId], (err) => {
        if (err) { console.error(err.message); return res.status(500).json({ message: 'Помилка оновлення налаштувань' }); }
        req.session.user.card_back_style = card_back_style;
        req.session.save();
        res.status(200).json({ message: 'Налаштування збережено!' });
    });
});

module.exports = router;