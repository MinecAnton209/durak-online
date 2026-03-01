/**
 * Integration tests for services/ratingService.js using real test SQLite DB.
 *
 * The ratingService expects game.winner.winners = [{ dbId, isGuest }]
 * and game.winner.loser = { dbId, isGuest }.
 * Both must have isGuest: false to be processed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from './prismaClient.js';
import { updateRatingsAfterGame } from '../services/ratingService.js';

const ts = Date.now();
let winnerUser, loserUser;

beforeAll(async () => {
    winnerUser = await prisma.user.create({
        data: { username: `rat_win_${ts}`, password: 'hashed', rating: 1500, rd: 150, vol: 0.06 }
    });
    loserUser = await prisma.user.create({
        data: { username: `rat_los_${ts}`, password: 'hashed', rating: 1500, rd: 150, vol: 0.06 }
    });
});

afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [winnerUser.id, loserUser.id] } } });
});

beforeEach(async () => {
    await prisma.user.update({ where: { id: winnerUser.id }, data: { rating: 1500, rd: 150, vol: 0.06 } });
    await prisma.user.update({ where: { id: loserUser.id }, data: { rating: 1500, rd: 150, vol: 0.06 } });
});

// Helper to build a valid game object with registered (non-guest) players
function makeGame(winner, loser, gameId = `test-game-${Date.now()}`) {
    return {
        id: gameId,
        winner: {
            winners: [{ dbId: winner.id, isGuest: false }],
            loser: { dbId: loser.id, isGuest: false }
        }
    };
}

describe('updateRatingsAfterGame', () => {
    it('changes ratings for winner and loser', async () => {
        const game = makeGame(winnerUser, loserUser);
        await updateRatingsAfterGame(game);

        // Force a fresh read by bypassing any Prisma-level query cache
        const [w] = await prisma.$queryRawUnsafe(
            `SELECT id, rating FROM "User" WHERE id = ?`, winnerUser.id
        );
        const [l] = await prisma.$queryRawUnsafe(
            `SELECT id, rating FROM "User" WHERE id = ?`, loserUser.id
        );
        expect(w.rating).toBeGreaterThan(1500);
        expect(l.rating).toBeLessThan(1500);
    });

    it('winner gains rating and loser loses roughly symmetrically', async () => {
        const game = makeGame(winnerUser, loserUser);
        await updateRatingsAfterGame(game);

        const w = await prisma.user.findUnique({ where: { id: winnerUser.id } });
        const l = await prisma.user.findUnique({ where: { id: loserUser.id } });
        const wGain = w.rating - 1500;
        const lLoss = 1500 - l.rating;
        // Glicko-2 is not exactly symmetric but should be within 30%
        expect(Math.abs(wGain - lLoss) / Math.max(lLoss, 1)).toBeLessThan(0.3);
    });

    it('skips update when all players are guests', async () => {
        const guestGame = {
            id: `guest-game-${ts}`,
            winner: {
                winners: [{ dbId: winnerUser.id, isGuest: true }],
                loser: { dbId: loserUser.id, isGuest: true }
            }
        };
        await updateRatingsAfterGame(guestGame);
        const w = await prisma.user.findUnique({ where: { id: winnerUser.id } });
        expect(w.rating).toBe(1500); // unchanged
    });

    it('returns early for null or incomplete game data', async () => {
        await expect(updateRatingsAfterGame(null)).resolves.toBeUndefined();
        await expect(updateRatingsAfterGame({ id: 'bad', winner: null })).resolves.toBeUndefined();
        await expect(updateRatingsAfterGame({ id: 'bad2', winner: { winners: [], loser: null } })).resolves.toBeUndefined();
    });

    it('updates last_game_timestamp for registered players', async () => {
        const game = makeGame(winnerUser, loserUser);
        await updateRatingsAfterGame(game);
        const w = await prisma.user.findUnique({ where: { id: winnerUser.id } });
        expect(w.last_game_timestamp).not.toBeNull();
    });
});
