const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

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
            await prisma.achievement.upsert({
                where: { code: ach.code },
                update: {
                    name_key: ach.name_key,
                    description_key: ach.description_key,
                    rarity: ach.rarity || 'common'
                },
                create: {
                    code: ach.code,
                    name_key: ach.name_key,
                    description_key: ach.description_key,
                    rarity: ach.rarity || 'common'
                }
            });
        }
        console.log(`✅ [Seed] Successfully loaded/updated ${achievementsData.length} achievements.`);
    } catch (err) {
        console.error('[Seed] Error seeding achievements:', err.message);
    }
}

module.exports = { seedAchievements };