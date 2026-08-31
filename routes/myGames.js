import express from 'express';
import { and, isNotNull, gte, eq, inArray, sql } from 'drizzle-orm';
import { user } from '../db/schema.ts';
import db from '../db/drizzle.js';
import { game, gameParticipant } from '../db/schema.ts';

const router = express.Router();

router.get('/', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const userId = req.user.id;
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const games = await db.select({
            id: game.id,
            game_type: game.game_type,
            start_time: game.start_time,
            end_time: game.end_time,
            duration_seconds: game.duration_seconds,
            my_outcome: gameParticipant.outcome,
            cards_at_end: gameParticipant.cards_at_end,
            is_bot: gameParticipant.is_bot,
        })
            .from(gameParticipant)
            .innerJoin(game, eq(gameParticipant.game_id, game.id))
            .where(and(
                eq(gameParticipant.user_id, userId),
                isNotNull(game.end_time),
                gte(game.end_time, oneWeekAgo)
            ))
            .orderBy(sql`end_time desc`)
            .limit(25);

        const gameIds = [...new Set(games.map(g => g.id))];

        let participantsByGame = {};
        if (gameIds.length > 0) {
            const participants = await db.select({
                game_id: gameParticipant.game_id,
                username: user.username,
                rating: user.rating,
                outcome: gameParticipant.outcome,
                cards_at_end: gameParticipant.cards_at_end,
                is_bot: gameParticipant.is_bot,
            })
                .from(gameParticipant)
                .leftJoin(user, eq(gameParticipant.user_id, user.id))
                .where(inArray(gameParticipant.game_id, gameIds));
            for (const p of participants) {
                (participantsByGame[p.game_id] = participantsByGame[p.game_id] || []).push(p);
            }
        }

        const result = games.map(g => ({
            id: g.id,
            gameType: g.game_type,
            startTime: g.start_time,
            endTime: g.end_time,
            durationSeconds: g.duration_seconds,
            myOutcome: g.my_outcome,
            cardsAtEnd: g.cards_at_end,
            wasBot: g.is_bot,
            participants: (participantsByGame[g.id] || []).map(part => ({
                username: part.username || (part.is_bot ? 'Bot' : 'Guest'),
                rating: part.rating,
                outcome: part.outcome,
                cardsAtEnd: part.cards_at_end,
                isBot: part.is_bot
            }))
        }));

        res.json(result);
    } catch (error) {
        console.error('[MyGames] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
