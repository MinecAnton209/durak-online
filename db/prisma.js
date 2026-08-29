import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from './schema.ts';
import 'dotenv/config';

let _db;

export function initializeDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set before DB init');
  }
  if (!_db) {
    const client = postgres(connectionString, { max: 10 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export function getDb() {
  return initializeDb();
}

// Lazy default: the connection opens on FIRST REAL USE (after the env/container
// URL is set), not at module import. A Proxy avoids eagerly calling getDb()
// when a module imports `db` and only touches it later.
export default new Proxy(
  {},
  {
    get: (_t, prop) => (typeof prop === 'symbol' ? undefined : getDb()[prop]),
    has: (_t, prop) => prop in getDb(),
  }
);
