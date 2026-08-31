import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { initializeDb, getDb } from '../db/drizzle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '.test-env.json');
if (fs.existsSync(envPath)) {
    const { DATABASE_URL } = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    process.env.DATABASE_URL = DATABASE_URL;
}

initializeDb(process.env.DATABASE_URL);

/**
 * Deletes all rows from the given Drizzle tables. Call in beforeEach/afterEach
 * to keep tests isolated on the shared container DB.
 */
export async function truncateTables(dbInstance, tables) {
    for (const table of tables) {
        await dbInstance.delete(table);
    }
}

export { db, getDb };

export async function closeDb() {
    await getDb().$client.end();
}
