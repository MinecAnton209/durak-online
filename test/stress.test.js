import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { incrementDailyCounter } from '../services/statsService.js';
import { checkAndAwardDailyBonus } from '../services/economyService.js';
import { unlockAchievement } from '../services/achievementService.js';
import {
    db, createUser, deleteUsers, upsertAchievement, deleteAchievement,
    deleteUserAchievements, deleteInboxMessages, deleteSystemStatsDaily,
    findSystemStatsDaily, findUserById, setDailyStats, inboxMessage
} from './dbHelpers.js';

const today = new Date().toISOString().slice(0, 10);

let stressUsers = [];

beforeAll(async () => {
    await upsertAchievement('STRESS_ACH', 'a', 'b', 'common');
    stressUsers = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
            createUser(`stress_user_${i}_${Date.now()}`, { coins: 1000 })
        )
    );
});

afterAll(async () => {
    const ids = stressUsers.map(u => u.id);
    await deleteUserAchievementsFor(ids);
    await deleteInboxMessages(ids[2]);
    await deleteUsers(ids);
    await deleteAchievement('STRESS_ACH');
    await deleteSystemStatsDaily(today);
});

async function deleteUserAchievementsFor(ids) {
    for (const id of ids) {
        await deleteUserAchievements(id);
    }
}

beforeEach(async () => {
    await deleteSystemStatsDaily(today);
    for (const u of stressUsers) {
        await setUser(u.id, { coins: 1000, last_daily_bonus_claim: null });
    }
});

describe('DB Stress: high-volume concurrent inserts', () => {
    it('handles 50 concurrent statsService counter increments', async () => {
        await deleteSystemStatsDaily(today);

        const calls = Array.from({ length: 50 }, () => incrementDailyCounter('new_registrations'));
        await Promise.all(calls);

        const record = await findSystemStatsDaily(today);
        expect(record).not.toBeNull();
        expect(record.new_registrations).toBe(50);
    });

    it('handles 20 concurrent daily bonus awards without double-awarding', async () => {
        const calls = stressUsers.map(u => checkAndAwardDailyBonus(u.id, null, null));
        await Promise.all(calls);

        for (const u of stressUsers) {
            const updated = await findUserById(u.id);
            expect(updated.coins).toBe(1200);
        }
    });

    it('does not double-award if called twice concurrently for same user', async () => {
        const user = stressUsers[0];
        await setUser(user.id, { coins: 1000, last_daily_bonus_claim: new Date('2020-01-01') });

        await Promise.all(Array.from({ length: 5 }, () =>
            checkAndAwardDailyBonus(user.id, null, null)
        ));

        const updated = await findUserById(user.id);
        expect(updated.coins).toBe(1200);
    });
});

describe('DB Stress: concurrent achievement unlocking', () => {
    it('handles 20 users unlocking the same achievement simultaneously', async () => {
        const calls = stressUsers.map(u =>
            unlockAchievement(null, null, u.id, 'STRESS_ACH')
        );
        await Promise.all(calls);

        let total = 0;
        for (const u of stressUsers) {
            const rec = await db.query.userAchievement.findFirst({ where: { user_id: u.id, achievement_code: 'STRESS_ACH' } });
            if (rec) total++;
        }
        expect(total).toBe(stressUsers.length);
    });

    it('handles same user unlocking same achievement 10 times concurrently (idempotent)', async () => {
        const user = stressUsers[1];
        const calls = Array.from({ length: 10 }, () =>
            unlockAchievement(null, null, user.id, 'STRESS_ACH')
        );
        await Promise.all(calls);

        const rec = await db.query.userAchievement.findFirst({ where: { user_id: user.id, achievement_code: 'STRESS_ACH' } });
        expect(rec).not.toBeNull();
    });
});

describe('DB Stress: high-volume reads', () => {
    it('handles 100 concurrent user lookups', async () => {
        const ids = stressUsers.map(u => u.id);
        const calls = Array.from({ length: 100 }, (_, i) =>
            db.query.user.findFirst({ where: { id: ids[i % ids.length] } })
        );
        const results = await Promise.all(calls);
        expect(results.every(r => r !== null)).toBe(true);
    });

    it('handles 100 concurrent inbox message creates', async () => {
        const user = stressUsers[2];
        const calls = Array.from({ length: 100 }, (_, i) =>
            db.insert(inboxMessage).values({ user_id: user.id, content_key: `stress.key.${i}`, type: 'system' }).returning()
        );
        const results = await Promise.all(calls);
        expect(results.length).toBe(100);
        expect(results.every(r => r[0].id > 0)).toBe(true);
    });
});
