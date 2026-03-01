const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

// Get match history for current user (limited to 50 total, 15 per page)
router.get('/history', async (req, res) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const skip = parseInt(req.query.skip) || 0;
    const take = Math.min(parseInt(req.query.take) || 15, 15);

    if (skip >= 50) return res.json([]);

    try {
        const matches = await prisma.gameParticipant.findMany({
            where: { user_id: user.id },
            include: {
                game: {
                    include: {
                        participants: {
                            include: {
                                user: {
                                    select: { username: true, is_verified: true }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { game: { start_time: 'desc' } },
            skip: skip,
            take: Math.min(take, 50 - skip)
        });

        const result = matches.map(mp => {
            const g = mp.game;
            return {
                id: g.id,
                startTime: g.start_time,
                endTime: g.end_time,
                duration: g.duration_seconds,
                outcome: mp.outcome,
                gameType: g.game_type,
                players: g.participants.map(p => ({
                    username: p.user?.username || (p.is_bot ? 'Bot' : 'Unknown'),
                    isVerified: p.user?.is_verified || false,
                    isWinner: g.winner_user_id === p.user_id,
                    isLoser: g.loser_user_id === p.user_id
                }))
            };
        });

        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// Get individual match summary
router.get('/:id', async (req, res) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const game = await prisma.game.findUnique({
            where: { id: req.params.id },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { username: true, is_verified: true }
                        }
                    }
                }
            }
        });

        if (!game) return res.status(404).json({ message: 'Match not found' });

        // Check if user participated
        const isParticipant = game.participants.some(p => p.user_id === user.id);
        if (!isParticipant && !user.is_admin) return res.status(403).json({ message: 'Forbidden' });

        res.json({
            id: game.id,
            startTime: game.start_time,
            endTime: game.end_time,
            duration: game.duration_seconds,
            winners: game.participants.filter(p => p.game_id === game.id && p.user_id === game.winner_user_id).map(p => p.user?.username),
            loser: game.participants.find(p => p.game_id === game.id && p.user_id === game.loser_user_id)?.user?.username,
            players: game.participants.map(p => ({
                username: p.user?.username || (p.is_bot ? 'Bot' : 'Unknown'),
                isVerified: p.user?.is_verified || false,
                outcome: p.outcome,
                cardsTaken: p.cards_taken_total
            }))
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching match info' });
    }
});

const analysisService = require('../services/analysisService');

// Purchase match analysis for 250 coins (Max 15 per user)
router.post('/:id/analyze', async (req, res) => {
    const userSession = req.session?.user;
    if (!userSession) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const matchId = req.params.id;
        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userSession.id } });
            if (!user || user.coins < 250) throw new Error('Insufficient coins');

            const game = await tx.game.findUnique({ where: { id: matchId } });
            if (!game || !game.history) throw new Error('Analysis unavailable for this match');

            // Check if match is within the last 15
            const recentMatches = await tx.gameParticipant.findMany({
                where: { user_id: user.id },
                orderBy: { game: { start_time: 'desc' } },
                take: 15,
                select: { game_id: true }
            });

            if (!recentMatches.some(m => m.game_id === matchId)) {
                throw new Error('Analysis only available for the 15 most recent matches');
            }

            // Deduct coins
            await tx.user.update({
                where: { id: user.id },
                data: { coins: { decrement: 250 } }
            });

            // Return analysis data
            const participants = await tx.gameParticipant.findMany({
                where: { game_id: matchId }
            });

            const initialHands = Object.fromEntries(
                participants.map(p => [p.user_id, JSON.parse(p.cards_at_start || '[]')])
            );
            const rawHistory = JSON.parse(game.history);

            // Enhance history with evaluations
            return {
                history: rawHistory,
                analysis: analysisService.analyzeMatch(rawHistory, initialHands),
                initialHands: initialHands
            };
        });

        res.json(result);
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
});

module.exports = router;
