import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import db from './drizzle.js';
import { achievement } from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seedAchievements() {
  const achievementsPath = path.join(__dirname, '../data/achievements.json');
  let achievementsData;

  try {
    const fileContent = fs.readFileSync(achievementsPath, 'utf8');
    achievementsData = JSON.parse(fileContent);
  } catch (error) {
    console.error('[Seed] Error reading or parsing achievements.json:', error);
    return;
  }

  if (!achievementsData || achievementsData.length === 0) {
    console.log('[Seed] achievements.json is empty. Skipping seeding.');
    return;
  }

  console.log('[Seed] Starting achievement seeding...');

  try {
    for (const ach of achievementsData) {
      await db
        .insert(achievement)
        .values({
          code: ach.code,
          name_key: ach.name_key,
          description_key: ach.description_key,
          rarity: ach.rarity || 'common',
        })
        .onConflictDoUpdate({
          target: achievement.code,
          set: {
            name_key: ach.name_key,
            description_key: ach.description_key,
            rarity: ach.rarity || 'common',
          },
        });
    }
    console.log(`✅ [Seed] Successfully loaded/updated ${achievementsData.length} achievements.`);
  } catch (err) {
    console.error('[Seed] Error seeding achievements:', err.message);
  }
}

export { seedAchievements };
