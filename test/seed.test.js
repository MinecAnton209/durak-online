/**
 * Integration tests for db/seed.js using real in-memory SQLite DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './prismaClient.js';
import { seedAchievements } from '../db/seed.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';

const TEST_ACH_PATH = path.resolve('./test/test_achievements.json');

// Point seed to our custom test file by temporarily swapping
const REAL_PATH = path.resolve('./data/achievements.json');
const REAL_BACKUP = path.resolve('./data/achievements.json.bak');

const sampleAchievements = [
    { code: 'SEED_TEST_1', name_key: 'ach.seed1', description_key: 'desc.seed1', rarity: 'common' },
    { code: 'SEED_TEST_2', name_key: 'ach.seed2', description_key: 'desc.seed2', rarity: 'rare' }
];

beforeAll(async () => {
    // Backup real achievements file and replace with test ones
    if (existsSync(REAL_PATH)) {
        const content = await import('fs').then(fs => fs.readFileSync(REAL_PATH, 'utf8'));
        writeFileSync(REAL_BACKUP, content);
    }
    writeFileSync(REAL_PATH, JSON.stringify(sampleAchievements));
});

afterAll(async () => {
    // Restore real file
    if (existsSync(REAL_BACKUP)) {
        const content = await import('fs').then(fs => fs.readFileSync(REAL_BACKUP, 'utf8'));
        writeFileSync(REAL_PATH, content);
        unlinkSync(REAL_BACKUP);
    }
    await prisma.achievement.deleteMany({
        where: { code: { in: ['SEED_TEST_1', 'SEED_TEST_2'] } }
    });
});

describe('seedAchievements', () => {
    it('creates achievements from JSON file', async () => {
        await seedAchievements();
        const ach1 = await prisma.achievement.findUnique({ where: { code: 'SEED_TEST_1' } });
        const ach2 = await prisma.achievement.findUnique({ where: { code: 'SEED_TEST_2' } });
        expect(ach1).not.toBeNull();
        expect(ach2).not.toBeNull();
        expect(ach1.rarity).toBe('common');
        expect(ach2.rarity).toBe('rare');
    });

    it('upserts existing achievements without error', async () => {
        // Update JSON to change rarity
        const updated = sampleAchievements.map(a => ({ ...a, rarity: 'legendary' }));
        writeFileSync(REAL_PATH, JSON.stringify(updated));
        await seedAchievements();
        const ach1 = await prisma.achievement.findUnique({ where: { code: 'SEED_TEST_1' } });
        expect(ach1.rarity).toBe('legendary');
    });

    it('does not crash on empty achievements file', async () => {
        writeFileSync(REAL_PATH, JSON.stringify([]));
        await expect(seedAchievements()).resolves.toBeUndefined();
        writeFileSync(REAL_PATH, JSON.stringify(sampleAchievements));
    });
});
