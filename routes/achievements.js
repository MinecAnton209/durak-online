import express from 'express';
import { eq } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { achievement, userAchievement } from '../db/schema.ts';

const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const rows = await db.select().from(achievement).orderBy(achievement.rarity, achievement.code);
        res.json(rows.map(r => ({
            code: r.code, name_key: r.name_key, description_key: r.description_key, rarity: r.rarity
        })));
    } catch (err) {
        console.error("Error fetching all achievements:", err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/my', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    const userId = req.session.user.id;
    try {
        const rows = await db.select().from(userAchievement).where(eq(userAchievement.user_id, userId));
        res.json(rows.map(r => ({
            achievement_code: r.achievement_code, unlocked_at: r.unlocked_at
        })));
    } catch (err) {
        console.error(`Error fetching achievements for user ${userId}:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
