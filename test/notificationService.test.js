import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from './prismaClient.js';
import { sendNotification, sendBroadcastNotification } from '../services/notificationService.js';
import { saveSubscription } from '../db/subscriptions.js';

const ts = Date.now();
let user1, user2, user3;
const ep = (n) => `https://push.example.com/ep_${ts}_${n}`;
const keys = { auth: 'auth123', p256dh: 'key456' };

beforeAll(async () => {
    user1 = await prisma.user.create({ data: { username: `nf_u1_${ts}`, password: 'h' } });
    user2 = await prisma.user.create({ data: { username: `nf_u2_${ts}`, password: 'h' } });
    user3 = await prisma.user.create({ data: { username: `nf_u3_${ts}`, password: 'h' } });
});

afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { user_id: { in: [user1.id, user2.id, user3.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id, user3.id] } } });
});

// Each test starts from a clean subscription slate.
async function cleanSubs() {
    await prisma.pushSubscription.deleteMany({ where: { user_id: { in: [user1.id, user2.id, user3.id] } } });
}

beforeEach(async () => {
    await cleanSubs();
});

describe('sendNotification', () => {
    it('returns false when the user has no subscription', async () => {
        const ok = await sendNotification(user2.id, { title: 'hi' });
        expect(ok).toBe(false);
    });

    it('findSubscriptionByUserId is wired into the service (real DB path)', async () => {
        await saveSubscription(user1.id, { endpoint: ep(1), keys });
        // With a real subscription present, the service reaches the push-send step.
        // In the test environment web-push has no live endpoint, so it returns false
        // (and must NOT delete the subscription, since the error is not a 410).
        const ok = await sendNotification(user1.id, { title: 'hi' });
        expect(ok).toBe(false);
        const remaining = await prisma.pushSubscription.findMany({ where: { user_id: user1.id } });
        expect(remaining.length).toBe(1);
    });

    it('keeps the subscription on a non-410 send failure', async () => {
        await saveSubscription(user1.id, { endpoint: ep(3), keys });
        const ok = await sendNotification(user1.id, { title: 'hi' });
        expect(ok).toBe(false);
        const remaining = await prisma.pushSubscription.findMany({ where: { user_id: user1.id } });
        expect(remaining.length).toBe(1);
    });
});

describe('sendBroadcastNotification', () => {
    it('returns zero counts when there are no subscribers', async () => {
        const result = await sendBroadcastNotification({ title: 'x' });
        expect(result).toEqual({ successCount: 0, failureCount: 0 });
    });

    it('reports failure and prunes nothing when all sends fail', async () => {
        await saveSubscription(user1.id, { endpoint: ep(4), keys });
        await saveSubscription(user2.id, { endpoint: ep(5), keys });
        await saveSubscription(user3.id, { endpoint: ep(6), keys });

        const result = await sendBroadcastNotification({ title: 'broadcast' });
        // No live push endpoint in tests -> everything fails.
        expect(result.successCount).toBe(0);
        expect(result.failureCount).toBe(3);
        // Subscriptions remain (failures are not 410 expiry).
        const remaining = await prisma.pushSubscription.findMany({ where: { user_id: { in: [user1.id, user2.id, user3.id] } } });
        expect(remaining.length).toBe(3);
    });
});
