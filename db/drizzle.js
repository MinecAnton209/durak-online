import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from './schema.ts';
import 'dotenv/config';
import { eq, and, or, inArray, sql } from 'drizzle-orm';

import { user, profile, achievement, userAchievement, activeSession, donation, game, gameParticipant, friend, pushSubscription, inboxMessage, adminAuditLog, chatMessage, chatFilter, bannedDevice, knownDevice, systemStatsDaily, userDevice } from './schema.ts';

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

const TABLES = {
  user, profile, achievement, userAchievement, activeSession, donation, game,
  gameParticipant, friend, pushSubscription, inboxMessage, adminAuditLog,
  chatMessage, chatFilter, bannedDevice, knownDevice, systemStatsDaily, userDevice,
};

function buildCondition(table, key, value) {
  if (key === 'AND' || key === 'and') {
    const parts = (Array.isArray(value) ? value : [value]).map(v => buildWhere(table, v));
    return parts.length ? and(...parts) : undefined;
  }
  if (key === 'OR' || key === 'or') {
    const parts = (Array.isArray(value) ? value : [value]).map(v => buildWhere(table, v));
    return parts.length ? or(...parts) : undefined;
  }
  if (key === 'NOT' || key === 'not') {
    return sql`not (${buildWhere(table, value)})`;
  }
  const col = table[key];
  if (value && typeof value === 'object' && !Array.isArray(value) && !('queryChunks' in value) && !('sql' in value)) {
    if ('in' in value) return inArray(col, value.in);
    if ('notIn' in value) return sql`${col} not in ${value.notIn}`;
    if ('gt' in value) return sql`${col} > ${value.gt}`;
    if ('gte' in value) return sql`${col} >= ${value.gte}`;
    if ('lt' in value) return sql`${col} < ${value.lt}`;
    if ('lte' in value) return sql`${col} <= ${value.lte}`;
    if ('contains' in value) return sql`${col}::text ilike ${'%' + value.contains + '%'}`;
    if ('equals' in value) return eq(col, value.equals);
    if ('not' in value && value.not === null) return sql`${col} is not null`;
  }
  if (value === null) return sql`${col} is null`;
  return eq(col, value);
}

function buildWhere(table, where) {
  if (where === undefined || where === null) return undefined;
  if (where && typeof where === 'object' && ('queryChunks' in where || 'sql' in where)) {
    return where;
  }
  const conditions = [];
  for (const [key, value] of Object.entries(where)) {
    const cond = buildCondition(table, key, value);
    if (cond !== undefined) conditions.push(cond);
  }
  return conditions.length ? and(...conditions) : undefined;
}

function buildOrderBy(table, orderBy) {
  if (!orderBy) return [];
  const result = [];
  for (const [key, dir] of Object.entries(orderBy)) {
    if (typeof dir === 'object' && dir !== null) {
      for (const [subKey, subDir] of Object.entries(dir)) {
        const col = table[subKey];
        if (col) result.push(subDir === 'desc' ? sql`${col} desc` : sql`${col} asc`);
      }
    } else {
      const col = table[key];
      if (col) result.push(dir === 'desc' ? sql`${col} desc` : sql`${col} asc`);
    }
  }
  return result;
}

function pickColumns(table, columns) {
  if (!columns) return undefined;
  const selected = {};
  for (const [col, keep] of Object.entries(columns)) {
    if (keep && table[col]) selected[col] = table[col];
  }
  return Object.keys(selected).length ? selected : undefined;
}

async function runFindFirst(table, { where, columns, orderBy, limit: lim } = {}) {
  const db = getDb();
  let q = db.select(pickColumns(table, columns) || table).from(table);
  const w = buildWhere(table, where);
  if (w) q = q.where(w);
  const obs = buildOrderBy(table, orderBy);
  for (const ob of obs) q = q.orderBy(ob);
  if (lim) q = q.limit(lim);
  const rows = await q;
  return rows[0] || null;
}

async function runFindMany(table, { where, columns, orderBy, limit: lim } = {}) {
  const db = getDb();
  let q = db.select(pickColumns(table, columns) || table).from(table);
  const w = buildWhere(table, where);
  if (w) q = q.where(w);
  const obs = buildOrderBy(table, orderBy);
  for (const ob of obs) q = q.orderBy(ob);
  if (lim) q = q.limit(lim);
  const rows = await q;
  return rows;
}

const query = new Proxy({}, {
  get: (_t, tableName) => {
    const table = TABLES[tableName];
    if (!table) return undefined;
    return {
      findFirst: (opts) => runFindFirst(table, opts),
      findMany: (opts) => runFindMany(table, opts),
    };
  }
});

export default new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'query') return query;
      if (prop === '$client') return getDb().$client;
      if (typeof prop === 'symbol') return undefined;
      return getDb()[prop];
    },
    has: (_t, prop) => prop === 'query' || (typeof prop === 'string' && prop in getDb()),
  }
);

export { sql };
