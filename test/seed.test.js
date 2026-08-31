import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seedAchievements } from '../db/seed.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { findUserAchievement, upsertAchievement, deleteAchievement, db, eq } from './dbHelpers.js';
import { achievement } from '../db/schema.ts';

const TEST_ACH_PATH = path.resolve('./test/test_achievements.json');
const REAL_PATH = path.resolve('./data/achievements.json');
const REAL_BACKUP = path.resolve('./data/achievements.json.bak');

const sampleAchievements = [
    { code: 'SEED_TEST_1', name_key: 'ach.seed1', description_key: 'desc.seed1', rarity: 'common' },
    { code: 'SEED_TEST_2', name_key: 'ach.seed2', description_key: 'desc.seed2', rarity: 'rare' }
];

async function findAchievement(code) {
    const [row] = await db.select().from(achievement).where(eq(achievement.code, code)).limit(1);
    return row ?? null;
}

beforeAll(async () => {
    if (existsSync(REAL_PATH)) {
        const content = await import('node:fs').then(fs => fs.readFileSync(REAL_PATH, 'utf8'));
        writeFileSync(REAL_BACKUP, content);
    }
    writeFileSync(REAL_PATH, JSON.stringify(sampleAchievements));
});

afterAll(async () => {
    if (existsSync(REAL_BACKUP)) {
        const content = await import('node:fs').then(fs => fs.readFileSync(REAL_BACKUP, 'utf8'));
        writeFileSync(REAL_PATH, content);
        unlinkSync(REAL_BACKUP);
    }
    await deleteAchievement('SEED_TEST_1');
    await deleteAchievement('SEED_TEST_2');
});

describe('seedAchievements', () => {
    it('creates achievements from JSON file', async () => {
        await seedAchievements();
        const ach1 = await findAchievement('SEED_TEST_1');
        const ach2 = await findAchievement('SEED_TEST_2');
        expect(ach1).not.toBeNull();
        expect(ach2).not.toBeNull();
        expect(ach1.rarity).toBe('common');
        expect(ach2.rarity).toBe('rare');
    });

    it('upserts existing achievements without error', async () => {
        const updated = sampleAchievements.map(a => ({ ...a, rarity: 'legendary' }));
        writeFileSync(REAL_PATH, JSON.stringify(updated));
        await seedAchievements();
        const ach1 = await findAchievement('SEED_TEST_1');
        expect(ach1.rarity).toBe('legendary');
    });

    it('does not crash on empty achievements file', async () => {
        writeFileSync(REAL_PATH, JSON.stringify([]));
        await expect(seedAchievements()).resolves.toBeUndefined();
        writeFileSync(REAL_PATH, JSON.stringify(sampleAchievements));
    });
});
