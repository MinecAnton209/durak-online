import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { updateRatingsAfterGame } from '../services/ratingService.js';
import {
    db, createUser, deleteUser, setUser, findUserById, rawUser
} from './dbHelpers.js';

const ts = Date.now();
let winnerUser, loserUser;

beforeAll(async () => {
    winnerUser = await createUser(`rat_win_${ts}`, { rating: 0, rd: 150, vol: 0.06 });
    loserUser = await createUser(`rat_los_${ts}`, { rating: 0, rd: 150, vol: 0.06 });
});

afterAll(async () => {
    await deleteUser(winnerUser.id);
    await deleteUser(loserUser.id);
});

beforeEach(async () => {
    await setUser(winnerUser.id, { rating: 0, rd: 150, vol: 0.06 });
    await setUser(loserUser.id, { rating: 0, rd: 150, vol: 0.06 });
});

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

        const w = await rawUser(winnerUser.id);
        const l = await rawUser(loserUser.id);
        expect(w.rating).toBeGreaterThan(0);
        expect(l.rating).toBeLessThan(0);
    });

    it('winner gains rating and loser loses roughly symmetrically', async () => {
        const game = makeGame(winnerUser, loserUser);
        await updateRatingsAfterGame(game);

        const w = await findUserById(winnerUser.id);
        const l = await findUserById(loserUser.id);
        const wGain = w.rating - 0;
        const lLoss = 0 - l.rating;
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
        const w = await findUserById(winnerUser.id);
        expect(w.rating).toBe(0);
    });

    it('returns early for null or incomplete game data', async () => {
        await expect(updateRatingsAfterGame(null)).resolves.toBeUndefined();
        await expect(updateRatingsAfterGame({ id: 'bad', winner: null })).resolves.toBeUndefined();
        await expect(updateRatingsAfterGame({ id: 'bad2', winner: { winners: [], loser: null } })).resolves.toBeUndefined();
    });

    it('updates last_game_timestamp for registered players', async () => {
        const game = makeGame(winnerUser, loserUser);
        await updateRatingsAfterGame(game);
        const w = await findUserById(winnerUser.id);
        expect(w.last_game_timestamp).not.toBeNull();
    });
});
