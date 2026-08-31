import { sql } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { getDb } from '../db/drizzle.js';
import { systemStatsDaily } from '../db/schema.ts';

async function incrementDailyCounter(counterName, executor = getDb()) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    await executor
      .insert(systemStatsDaily)
      .values({ date: today, [counterName]: 1 })
      .onConflictDoUpdate({
        target: systemStatsDaily.date,
        set: { [counterName]: sql`${systemStatsDaily[counterName]} + 1` },
      });
  } catch (err) {
    console.error(`[Stats] Error updating counter ${counterName}:`, err.message);
  }
}

export { incrementDailyCounter };

export default { incrementDailyCounter };
