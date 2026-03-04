const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

router.get('/all', async (req, res) => {
    try {
        const rows = await prisma.achievement.findMany({
            select: { code: true, name_key: true, description_key: true, rarity: true },
            orderBy: [{ rarity: 'asc' }, { code: 'asc' }]
        });
        res.json(rows);
    } catch (err) {
        console.error("Error fetching all achievements:", err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/my', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    const userId = req.session.user.id;
    try {
        const rows = await prisma.userAchievement.findMany({
            where: { user_id: userId },
            select: { achievement_code: true, unlocked_at: true }
        });
        res.json(rows);
    } catch (err) {
        console.error(`Error fetching achievements for user ${userId}:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;