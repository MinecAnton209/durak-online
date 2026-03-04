/**
 * Integration tests for services/achievementService.js using real test SQLite DB.
 * unlockAchievement uses prisma.userAchievement.create and catches P2002 silently.
 * Socket emit is done via ioInstance.of('/').sockets iteration.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './prismaClient.js';
import { unlockAchievement } from '../services/achievementService.js';

const ts = Date.now();
let testUser;

beforeAll(async () => {
    testUser = await prisma.user.create({ data: { username: `ach_u_${ts}`, password: 'hashed' } });

    // Seed test achievements
    await prisma.achievement.upsert({
        where: { code: 'TEST_ACH_A' },
        update: {},
        create: { code: 'TEST_ACH_A', name_key: 'ach.test_a', description_key: 'desc.test_a', rarity: 'common' }
    });
    await prisma.achievement.upsert({
        where: { code: 'TEST_ACH_B' },
        update: {},
        create: { code: 'TEST_ACH_B', name_key: 'ach.test_b', description_key: 'desc.test_b', rarity: 'rare' }
    });
});

afterAll(async () => {
    await prisma.userAchievement.deleteMany({ where: { user_id: testUser.id } });
    await prisma.achievement.deleteMany({ where: { code: { in: ['TEST_ACH_A', 'TEST_ACH_B'] } } });
    await prisma.user.delete({ where: { id: testUser.id } });
});

describe('unlockAchievement', () => {
    it('creates a user achievement record on first unlock', async () => {
        await unlockAchievement(null, null, testUser.id, 'TEST_ACH_A');
        const record = await prisma.userAchievement.findFirst({
            where: { user_id: testUser.id, achievement_code: 'TEST_ACH_A' }
        });
        expect(record).not.toBeNull();
    });

    it('does not throw on duplicate unlock (idempotent via P2002 catch)', async () => {
        // Already unlocked from the previous test — should not throw
        await expect(unlockAchievement(null, null, testUser.id, 'TEST_ACH_A')).resolves.toBeUndefined();
        // Still only one record
        const records = await prisma.userAchievement.findMany({
            where: { user_id: testUser.id, achievement_code: 'TEST_ACH_A' }
        });
        expect(records.length).toBe(1);
    });

    it('creates separate achievements for different codes', async () => {
        await unlockAchievement(null, null, testUser.id, 'TEST_ACH_B');
        const records = await prisma.userAchievement.findMany({ where: { user_id: testUser.id } });
        const codes = records.map(r => r.achievement_code);
        expect(codes).toContain('TEST_ACH_A');
        expect(codes).toContain('TEST_ACH_B');
    });

    it('emits achievementUnlocked event when io is provided', async () => {
        // Create a fresh user so the achievement can be unlocked
        const freshUser = await prisma.user.create({ data: { username: `ach_emit_${ts}`, password: 'hashed' } });

        let emitted = null;

        // achievementService does: ioRef.of('/').sockets → Map, iterates [sid, socket]
        const mockSocket = {
            request: { session: { user: { id: freshUser.id } } }
        };
        const mockNamespace = {
            sockets: new Map([['sid1', mockSocket]])
        };
        const io = {
            of: (ns) => mockNamespace,
            to: (sid) => ({ emit: (event, data) => { emitted = { sid, event, data }; } })
        };

        await unlockAchievement(io, 'sid1', freshUser.id, 'TEST_ACH_A');

        expect(emitted).not.toBeNull();
        expect(emitted.event).toBe('achievementUnlocked');
        expect(emitted.data.code).toBe('TEST_ACH_A');
        expect(emitted.sid).toBe('sid1');

        await prisma.userAchievement.deleteMany({ where: { user_id: freshUser.id } });
        await prisma.user.delete({ where: { id: freshUser.id } });
    });
});
