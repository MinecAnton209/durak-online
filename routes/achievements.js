const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/all', (req, res) => {
    const sql = `
        SELECT code, name_key, description_key, rarity 
        FROM achievements 
        ORDER BY rarity, code
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error fetching all achievements:", err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
    });
});

router.get('/my', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.session.user.id;

    const sql = `
        SELECT achievement_code, unlocked_at 
        FROM user_achievements 
        WHERE user_id = ?
    `;

    db.all(sql, [userId], (err, rows) => {
        if (err) {
            console.error(`Error fetching achievements for user ${userId}:`, err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
    });
});

module.exports = router;