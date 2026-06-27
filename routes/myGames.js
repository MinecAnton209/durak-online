const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const userId = req.user.id;
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const participations = await prisma.gameParticipant.findMany({
            where: {
                user_id: userId,
                game: {
                    end_time: { not: null, gte: oneWeekAgo }
                }
            },
            include: {
                game: {
                    include: {
                        participants: {
                            include: {
                                user: {
                                    select: { id: true, username: true, rating: true }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { game: { end_time: 'desc' } },
            take: 25
        });

        const games = participations.map(p => ({
            id: p.game.id,
            gameType: p.game.game_type,
            startTime: p.game.start_time,
            endTime: p.game.end_time,
            durationSeconds: p.game.duration_seconds,
            myOutcome: p.outcome,
            cardsAtEnd: p.cards_at_end,
            wasBot: p.is_bot,
            participants: p.game.participants.map(part => ({
                username: part.user?.username || (part.is_bot ? 'Bot' : 'Guest'),
                rating: part.user?.rating,
                outcome: part.outcome,
                cardsAtEnd: part.cards_at_end,
                isBot: part.is_bot
            }))
        }));

        res.json(games);
    } catch (error) {
        console.error('[MyGames] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
