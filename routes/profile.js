import express from 'express';
import { and, eq, not } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { user, profile } from '../db/schema.ts';

const router = express.Router();
const VALID_AVATARS = ['default','bear','cat','dog','fox','owl','penguin','rabbit','tiger','wolf','dragon','snake'];

router.get('/by-username/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const found = await db.query.user.findFirst({
            where: { username },
            with: { profile: true }
        });

        if (!found) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isOwner = req.user && req.user.id === found.id;

        res.json({
            user: found,
            profile: found.profile || { bio: '', avatar_id: 'default' },
            isOwner
        });
    } catch (error) {
        console.error('[Profile] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const found = await db.query.user.findFirst({
            where: { id: userId },
            with: { profile: true }
        });

        if (!found) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isOwner = req.user && req.user.id === userId;

        res.json({
            user: found,
            profile: found.profile || { bio: '', avatar_id: 'default' },
            isOwner
        });
    } catch (error) {
        console.error('[Profile] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { nickname, bio, avatarId } = req.body;
        const userId = req.user.id;

        if (nickname !== undefined) {
            const trimmed = nickname.trim();
            if (trimmed.length < 3 || trimmed.length > 20) {
                return res.status(400).json({ error: 'Nickname must be 3-20 characters' });
            }
            const existing = (await db.select({ id: user.id }).from(user)
                .where(and(eq(user.username, trimmed), not(eq(user.id, userId))))).length > 0;
            if (existing) {
                return res.status(400).json({ error: 'Nickname already taken' });
            }
            await db.update(user).set({ username: trimmed }).where(eq(user.id, userId));
        }

        if (bio !== undefined) {
            if (bio.length > 200) {
                return res.status(400).json({ error: 'Bio must be 200 characters or less' });
            }
        }

        if (avatarId !== undefined && !VALID_AVATARS.includes(avatarId)) {
            return res.status(400).json({ error: 'Invalid avatar' });
        }

        await db.insert(profile).values({
            user_id: userId,
            bio: bio || '',
            avatar_id: avatarId || 'default'
        }).onConflictDoUpdate({
            target: profile.user_id,
            set: {
                ...(bio !== undefined && { bio }),
                ...(avatarId !== undefined && { avatar_id: avatarId })
            }
        });

        const updatedUser = await db.query.user.findFirst({
            where: { id: userId },
            with: { profile: true }
        });

        res.json({
            user: updatedUser,
            profile: updatedUser.profile || { bio: '', avatar_id: 'default' }
        });
    } catch (error) {
        console.error('[Profile] Update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
