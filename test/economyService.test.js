import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { checkAndAwardDailyBonus } from '../services/economyService.js';
import {
    createUser, deleteUser, findUserById, setUser
} from './dbHelpers.js';

const DAILY_BONUS = 200;
const ts = Date.now();
let testUser;

beforeAll(async () => {
    testUser = await createUser(`eco_test_${ts}`, { coins: 500 });
});

afterAll(async () => {
    await deleteUser(testUser.id);
});

beforeEach(async () => {
    await setUser(testUser.id, { coins: 500, last_daily_bonus_claim: null });
});

describe('checkAndAwardDailyBonus', () => {
    it('awards bonus if never claimed', async () => {
        await checkAndAwardDailyBonus(testUser.id, null, null);
        const updated = await findUserById(testUser.id);
        expect(updated.coins).toBe(500 + DAILY_BONUS);
        expect(updated.last_daily_bonus_claim).not.toBeNull();
    });

    it('does not award bonus if already claimed today', async () => {
        await setUser(testUser.id, { last_daily_bonus_claim: new Date() });
        await checkAndAwardDailyBonus(testUser.id, null, null);
        const updated = await findUserById(testUser.id);
        expect(updated.coins).toBe(500);
    });

    it('awards bonus if last claimed yesterday', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await setUser(testUser.id, { coins: 500, last_daily_bonus_claim: yesterday });
        await checkAndAwardDailyBonus(testUser.id, null, null);
        const updated = await findUserById(testUser.id);
        expect(updated.coins).toBe(500 + DAILY_BONUS);
    });

    it('handles non-existent user gracefully (returns undefined)', async () => {
        await expect(checkAndAwardDailyBonus(999999, null, null)).resolves.toBeUndefined();
    });

    it('emits dailyBonusAwarded socket event and updates session', async () => {
        let emittedData = null;
        const mockSocket = {
            request: {
                session: {
                    user: { id: testUser.id, coins: 500 },
                    save: () => { }
                }
            }
        };
        const io = {
            to: () => ({ emit: (event, data) => { emittedData = { event, data }; } }),
            sockets: { sockets: { get: (sid) => sid === 'sid1' ? mockSocket : undefined } }
        };

        await checkAndAwardDailyBonus(testUser.id, io, 'sid1');

        expect(emittedData).not.toBeNull();
        expect(emittedData.event).toBe('dailyBonusAwarded');
        expect(emittedData.data.amount).toBe(DAILY_BONUS);
        expect(emittedData.data.newBalance).toBe(700);
    });
});
