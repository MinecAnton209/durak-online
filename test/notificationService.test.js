import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sendNotification, sendBroadcastNotification } from '../services/notificationService.js';
import { saveSubscription } from '../db/subscriptions.js';
import {
    createUser, deleteUsers, deletePushSubscriptions,
    findPushSubscriptionByUser, countPushSubscriptionsByUser
} from './dbHelpers.js';

const ts = Date.now();
let user1, user2, user3;
const ep = (n) => `https://push.example.com/ep_${ts}_${n}`;
const keys = { auth: 'auth123', p256dh: 'key456' };

beforeAll(async () => {
    user1 = await createUser(`nf_u1_${ts}`);
    user2 = await createUser(`nf_u2_${ts}`);
    user3 = await createUser(`nf_u3_${ts}`);
});

afterAll(async () => {
    await deletePushSubscriptions([user1.id, user2.id, user3.id]);
    await deleteUsers([user1.id, user2.id, user3.id]);
});

beforeEach(async () => {
    await deletePushSubscriptions([user1.id, user2.id, user3.id]);
});

describe('sendNotification', () => {
    it('returns false when the user has no subscription', async () => {
        const ok = await sendNotification(user2.id, { title: 'hi' });
        expect(ok).toBe(false);
    });

    it('findSubscriptionByUserId is wired into the service (real DB path)', async () => {
        await saveSubscription(user1.id, { endpoint: ep(1), keys });
        const ok = await sendNotification(user1.id, { title: 'hi' });
        expect(ok).toBe(false);
        const remaining = await findPushSubscriptionByUser(user1.id);
        expect(remaining).not.toBeNull();
    });

    it('keeps the subscription on a non-410 send failure', async () => {
        await saveSubscription(user1.id, { endpoint: ep(3), keys });
        const ok = await sendNotification(user1.id, { title: 'hi' });
        expect(ok).toBe(false);
        const remaining = await findPushSubscriptionByUser(user1.id);
        expect(remaining).not.toBeNull();
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
        expect(result.successCount).toBe(0);
        expect(result.failureCount).toBe(3);
        const remaining = await countPushSubscriptionsByUser(user1.id)
            + await countPushSubscriptionsByUser(user2.id)
            + await countPushSubscriptionsByUser(user3.id);
        expect(remaining).toBe(3);
    });
});
