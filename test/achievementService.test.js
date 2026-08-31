import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unlockAchievement } from '../services/achievementService.js';
import {
    createUser, deleteUser, deleteUserAchievements, deleteAchievement,
    upsertAchievement, findUserAchievement
} from './dbHelpers.js';

const ts = Date.now();
let testUser;

beforeAll(async () => {
    testUser = await createUser(`ach_u_${ts}`);
    await upsertAchievement('TEST_ACH_A', 'ach.test_a', 'desc.test_a', 'common');
    await upsertAchievement('TEST_ACH_B', 'ach.test_b', 'desc.test_b', 'rare');
});

afterAll(async () => {
    await deleteUserAchievements(testUser.id);
    await deleteAchievement('TEST_ACH_A');
    await deleteAchievement('TEST_ACH_B');
    await deleteUser(testUser.id);
});

describe('unlockAchievement', () => {
    it('creates a user achievement record on first unlock', async () => {
        await unlockAchievement(null, null, testUser.id, 'TEST_ACH_A');
        const record = await findUserAchievement(testUser.id, 'TEST_ACH_A');
        expect(record).not.toBeNull();
    });

    it('does not throw on duplicate unlock (idempotent via P2002 catch)', async () => {
        await expect(unlockAchievement(null, null, testUser.id, 'TEST_ACH_A')).resolves.toBeUndefined();
        const records = await findUserAchievement(testUser.id, 'TEST_ACH_A');
        expect(records).not.toBeNull();
    });

    it('creates separate achievements for different codes', async () => {
        await unlockAchievement(null, null, testUser.id, 'TEST_ACH_B');
        const a = await findUserAchievement(testUser.id, 'TEST_ACH_A');
        const b = await findUserAchievement(testUser.id, 'TEST_ACH_B');
        const codes = [a?.achievement_code, b?.achievement_code].filter(Boolean);
        expect(codes).toContain('TEST_ACH_A');
        expect(codes).toContain('TEST_ACH_B');
    });

    it('emits achievementUnlocked event when io is provided', async () => {
        const freshUser = await createUser(`ach_emit_${ts}`);
        let emitted = null;
        const mockSocket = {
            request: { session: { user: { id: freshUser.id } } }
        };
        const mockNamespace = {
            sockets: new Map([['sid1', mockSocket]])
        };
        const io = {
            of: () => mockNamespace,
            to: (sid) => ({ emit: (event, data) => { emitted = { sid, event, data }; } })
        };

        await unlockAchievement(io, 'sid1', freshUser.id, 'TEST_ACH_A');

        expect(emitted).not.toBeNull();
        expect(emitted.event).toBe('achievementUnlocked');
        expect(emitted.data.code).toBe('TEST_ACH_A');
        expect(emitted.sid).toBe('sid1');

        await deleteUserAchievements(freshUser.id);
        await deleteUser(freshUser.id);
    });
});
