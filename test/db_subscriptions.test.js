/**
 * Integration tests for db/subscriptions.js using real test SQLite DB.
 * Note: pushSubscription.upsert uses 'endpoint' as the unique key.
 * The Prisma client must be regenerated after the schema change for this to work.
 * These tests use the test prisma client which reads from test.db.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from './prismaClient.js';
import {
    saveSubscription,
    deleteSubscription,
    getSubscriptionsForUser,
    getAllSubscriptions
} from '../db/subscriptions.js';

let testUser, user2, user3;
const ts = Date.now();
const endpoint1 = `https://push.example.com/ep1_${ts}`;
const endpoint2 = `https://push.example.com/ep2_${ts}`;
const keys = { auth: 'auth123', p256dh: 'key456' };

beforeAll(async () => {
    testUser = await prisma.user.create({ data: { username: `subs_u1_${ts}`, password: 'hashed' } });
    user2 = await prisma.user.create({ data: { username: `subs_u2_${ts}`, password: 'hashed' } });
    user3 = await prisma.user.create({ data: { username: `subs_u3_${ts}`, password: 'hashed' } });
});

afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { user_id: { in: [testUser.id, user2.id, user3.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [testUser.id, user2.id, user3.id] } } });
});

describe('saveSubscription', () => {
    it('creates a new subscription', async () => {
        await saveSubscription(testUser.id, { endpoint: endpoint1, keys });
        const record = await prisma.pushSubscription.findFirst({ where: { user_id: testUser.id } });
        expect(record).not.toBeNull();
        expect(record.endpoint).toBe(endpoint1);
        expect(JSON.parse(record.keys)).toEqual(keys);
    });

    it('upserts on duplicate endpoint (updates keys)', async () => {
        const newKeys = { auth: 'newauth', p256dh: 'newkey' };
        await saveSubscription(testUser.id, { endpoint: endpoint1, keys: newKeys });
        const records = await prisma.pushSubscription.findMany({ where: { endpoint: endpoint1 } });
        // Should only have ONE record with the new keys
        expect(records.length).toBe(1);
        expect(JSON.parse(records[0].keys)).toEqual(newKeys);
    });
});

describe('getSubscriptionsForUser', () => {
    it('returns subscriptions for user', async () => {
        const subs = await getSubscriptionsForUser(testUser.id);
        expect(subs.length).toBeGreaterThan(0);
        expect(subs[0]).toHaveProperty('endpoint');
        expect(subs[0]).toHaveProperty('keys');
        expect(subs[0].keys).toBeTypeOf('object'); // keys is parsed back to object
    });

    it('returns empty array for user with no subs', async () => {
        const subs = await getSubscriptionsForUser(user3.id);
        expect(subs).toEqual([]);
    });
});

describe('deleteSubscription', () => {
    it('removes the subscription by endpoint', async () => {
        await saveSubscription(user2.id, { endpoint: endpoint2, keys });
        await deleteSubscription(endpoint2);
        const record = await prisma.pushSubscription.findFirst({ where: { endpoint: endpoint2 } });
        expect(record).toBeNull();
    });
});

describe('getAllSubscriptions', () => {
    it('returns an array of parsed subscription objects', async () => {
        const all = await getAllSubscriptions();
        expect(Array.isArray(all)).toBe(true);
        for (const sub of all) {
            expect(sub).toHaveProperty('endpoint');
            expect(sub).toHaveProperty('keys');
            expect(typeof sub.keys).toBe('object');
        }
    });
});
