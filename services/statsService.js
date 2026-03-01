const prisma = require('../db/prisma');

async function incrementDailyCounter(counterName) {
    const today = new Date().toISOString().slice(0, 10);
    try {
        await prisma.systemStatsDaily.upsert({
            where: { date: today },
            update: { [counterName]: { increment: 1 } },
            create: { date: today, [counterName]: 1 }
        });
    } catch (err) {
        console.error(`[Stats] Error updating counter ${counterName}:`, err.message);
    }
}

module.exports = {
    incrementDailyCounter,
};