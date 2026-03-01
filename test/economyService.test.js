/**
 * Integration tests for services/economyService.js using real test SQLite DB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from './prismaClient.js';
import { checkAndAwardDailyBonus } from '../services/economyService.js';

const DAILY_BONUS = 200;
const ts = Date.now();
let testUser;

beforeAll(async () => {
    testUser = await prisma.user.create({ data: { username: `eco_test_${ts}`, password: 'hashed', coins: 500 } });
});

afterAll(async () => {
    await prisma.user.delete({ where: { id: testUser.id } });
});

beforeEach(async () => {
    // Reset user state before each test
    await prisma.user.update({
        where: { id: testUser.id },
        data: { coins: 500, last_daily_bonus_claim: null }
    });
});

describe('checkAndAwardDailyBonus', () => {
    it('awards bonus if never claimed', async () => {
        await checkAndAwardDailyBonus(testUser.id, null, null);
        const updated = await prisma.user.findUnique({ where: { id: testUser.id } });
        expect(updated.coins).toBe(500 + DAILY_BONUS);
        expect(updated.last_daily_bonus_claim).not.toBeNull();
    });

    it('does not award bonus if already claimed today', async () => {
        // Set last_daily_bonus_claim to now (today)
        await prisma.user.update({
            where: { id: testUser.id },
            data: { last_daily_bonus_claim: new Date() }
        });
        await checkAndAwardDailyBonus(testUser.id, null, null);
        const updated = await prisma.user.findUnique({ where: { id: testUser.id } });
        expect(updated.coins).toBe(500); // unchanged
    });

    it('awards bonus if last claimed yesterday', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await prisma.user.update({
            where: { id: testUser.id },
            data: { coins: 500, last_daily_bonus_claim: yesterday }
        });
        await checkAndAwardDailyBonus(testUser.id, null, null);
        const updated = await prisma.user.findUnique({ where: { id: testUser.id } });
        expect(updated.coins).toBe(500 + DAILY_BONUS);
    });

    it('handles non-existent user gracefully (returns undefined)', async () => {
        await expect(checkAndAwardDailyBonus(999999, null, null)).resolves.toBeUndefined();
    });

    it('emits dailyBonusAwarded socket event and updates session', async () => {
        let emittedData = null;
        // Mock io.to().emit() and io.sockets.sockets.get()
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
