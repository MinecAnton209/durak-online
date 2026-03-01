/**
 * Stress / concurrency tests for the DB layer using real in-memory SQLite.
 * Tests resilience under concurrent load: parallel writes, high-volume inserts, race conditions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './prismaClient.js';
import { incrementDailyCounter } from '../services/statsService.js';
import { checkAndAwardDailyBonus } from '../services/economyService.js';
import { unlockAchievement } from '../services/achievementService.js';

const today = new Date().toISOString().slice(0, 10);

let stressUsers = [];

beforeAll(async () => {
    // Seed an achievement for stress tests
    await prisma.achievement.upsert({
        where: { code: 'STRESS_ACH' },
        update: {},
        create: { code: 'STRESS_ACH', name_key: 'a', description_key: 'b', rarity: 'common' }
    });

    // Create 20 stress test users
    stressUsers = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
            prisma.user.create({
                data: { username: `stress_user_${i}_${Date.now()}`, password: 'hashed', coins: 1000 }
            })
        )
    );
});

afterAll(async () => {
    const ids = stressUsers.map(u => u.id);
    await prisma.userAchievement.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.inboxMessage.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.achievement.deleteMany({ where: { code: 'STRESS_ACH' } });
    await prisma.systemStatsDaily.deleteMany({ where: { date: today } });
});

describe('DB Stress: high-volume concurrent inserts', () => {
    it('handles 50 concurrent statsService counter increments', async () => {
        await prisma.systemStatsDaily.deleteMany({ where: { date: today } });

        const calls = Array.from({ length: 50 }, () => incrementDailyCounter('new_registrations'));
        await Promise.all(calls);

        const record = await prisma.systemStatsDaily.findUnique({ where: { date: today } });
        expect(record).not.toBeNull();
        expect(record.new_registrations).toBe(50);
    });

    it('handles 20 concurrent daily bonus awards without double-awarding', async () => {
        // Each user gets their bonus exactly once even if called concurrently
        const calls = stressUsers.map(u => checkAndAwardDailyBonus(u.id, null, null));
        await Promise.all(calls);

        for (const u of stressUsers) {
            const updated = await prisma.user.findUnique({ where: { id: u.id } });
            expect(updated.coins).toBe(1200); // 1000 + 200 once
        }
    });

    it('does not double-award if called twice concurrently for same user', async () => {
        const user = stressUsers[0];
        // Reset last_daily_bonus_claim so it can be awarded again
        await prisma.user.update({
            where: { id: user.id },
            data: { coins: 1000, last_daily_bonus_claim: new Date('2020-01-01') }
        });

        // Fire 5 concurrent calls for the same user
        await Promise.all(Array.from({ length: 5 }, () =>
            checkAndAwardDailyBonus(user.id, null, null)
        ));

        const updated = await prisma.user.findUnique({ where: { id: user.id } });
        // Should only get 200 bonus once (subsequent calls see today's date)
        expect(updated.coins).toBe(1200);
    });
});

describe('DB Stress: concurrent achievement unlocking', () => {
    it('handles 20 users unlocking the same achievement simultaneously', async () => {
        const calls = stressUsers.map(u =>
            unlockAchievement(null, null, u.id, 'STRESS_ACH')
        );
        await Promise.all(calls);

        const records = await prisma.userAchievement.findMany({
            where: { achievement_code: 'STRESS_ACH' }
        });
        // Each user should have it exactly once
        expect(records.length).toBe(stressUsers.length);
        const userIds = records.map(r => r.user_id).sort();
        const expected = stressUsers.map(u => u.id).sort();
        expect(userIds).toEqual(expected);
    });

    it('handles same user unlocking same achievement 10 times concurrently (idempotent)', async () => {
        const user = stressUsers[1];
        const calls = Array.from({ length: 10 }, () =>
            unlockAchievement(null, null, user.id, 'STRESS_ACH')
        );
        await Promise.all(calls);

        const records = await prisma.userAchievement.findMany({
            where: { user_id: user.id, achievement_code: 'STRESS_ACH' }
        });
        expect(records.length).toBe(1); // exactly once despite 10 concurrent calls
    });
});

describe('DB Stress: high-volume reads', () => {
    it('handles 100 concurrent user lookups', async () => {
        const ids = stressUsers.map(u => u.id);
        const calls = Array.from({ length: 100 }, (_, i) =>
            prisma.user.findUnique({ where: { id: ids[i % ids.length] } })
        );
        const results = await Promise.all(calls);
        expect(results.every(r => r !== null)).toBe(true);
    });

    it('handles 100 concurrent inbox message creates', async () => {
        const user = stressUsers[2];
        const calls = Array.from({ length: 100 }, (_, i) =>
            prisma.inboxMessage.create({
                data: { user_id: user.id, content_key: `stress.key.${i}`, type: 'system' }
            })
        );
        const results = await Promise.all(calls);
        expect(results.length).toBe(100);
        expect(results.every(r => r.id > 0)).toBe(true);
    });
});
