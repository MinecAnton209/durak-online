const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_AVATARS = ['default','bear','cat','dog','fox','owl','penguin','rabbit','tiger','wolf','dragon','snake'];

router.get('/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                wins: true,
                losses: true,
                rating: true,
                streak_count: true,
                win_streak: true,
                is_verified: true,
                created_at: true,
                profile: { select: { bio: true, avatar_id: true } }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isOwner = req.user && req.user.id === userId;

        res.json({
            user,
            profile: user.profile || { bio: '', avatar_id: 'default' },
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
            const existing = await prisma.user.findFirst({
                where: { username: trimmed, id: { not: userId } }
            });
            if (existing) {
                return res.status(400).json({ error: 'Nickname already taken' });
            }
            await prisma.user.update({ where: { id: userId }, data: { username: trimmed } });
        }

        if (bio !== undefined) {
            if (bio.length > 200) {
                return res.status(400).json({ error: 'Bio must be 200 characters or less' });
            }
        }

        if (avatarId !== undefined && !VALID_AVATARS.includes(avatarId)) {
            return res.status(400).json({ error: 'Invalid avatar' });
        }

        await prisma.profile.upsert({
            where: { user_id: userId },
            update: {
                ...(bio !== undefined && { bio }),
                ...(avatarId !== undefined && { avatar_id: avatarId })
            },
            create: {
                user_id: userId,
                bio: bio || '',
                avatar_id: avatarId || 'default'
            }
        });

        const updatedUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, username: true, wins: true, losses: true,
                rating: true, streak_count: true, win_streak: true,
                is_verified: true, created_at: true,
                profile: { select: { bio: true, avatar_id: true } }
            }
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

module.exports = router;
