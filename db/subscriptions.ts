import { eq } from 'drizzle-orm';
import db from './drizzle.js';
import { pushSubscription } from './schema.ts';

async function saveSubscription(userId: number, subscription: any): Promise<any> {
  const endpoint = subscription.endpoint;
  const keys = JSON.stringify(subscription.keys);

  try {
    return await db
      .insert(pushSubscription)
      .values({ user_id: userId, endpoint, keys })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { user_id: userId, keys, updated_at: new Date() },
      })
      .returning();
  } catch (err: any) {
    console.error(`[Push] Error saving subscription:`, err.message);
    throw err;
  }
}

async function deleteSubscription(endpoint: string): Promise<any> {
  try {
    return await db
      .delete(pushSubscription)
      .where(eq(pushSubscription.endpoint, endpoint))
      .returning();
  } catch (err: any) {
    console.error(`[Push] Error deleting subscription:`, err.message);
    throw err;
  }
}

async function getSubscriptionsForUser(userId: number): Promise<any[]> {
  try {
    const rows = await db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.user_id, userId));

    return rows.map((s: any) => ({
      endpoint: s.endpoint,
      keys: JSON.parse(s.keys),
    }));
  } catch (err: any) {
    console.error(`[Push] Error getting subscriptions:`, err.message);
    throw err;
  }
}

async function findSubscriptionByUserId(userId: number): Promise<any | null> {
  try {
    const [row] = await db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.user_id, userId))
      .limit(1);
    if (!row) return null;
    return { endpoint: row.endpoint, keys: JSON.parse(row.keys) };
  } catch (err: any) {
    console.error(`[Push] Error finding subscription for user ${userId}:`, err.message);
    throw err;
  }
}

async function getAllSubscriptions(): Promise<any[]> {
  try {
    const rows = await db.select().from(pushSubscription);

    return rows.map((s: any) => ({
      endpoint: s.endpoint,
      keys: JSON.parse(s.keys),
    }));
  } catch (err: any) {
    console.error(`[Push] Error getting all subscriptions:`, err.message);
    throw err;
  }
}

export {
  saveSubscription,
  deleteSubscription,
  findSubscriptionByUserId,
  getSubscriptionsForUser,
  getAllSubscriptions,
};

export default {
  saveSubscription,
  deleteSubscription,
  findSubscriptionByUserId,
  getSubscriptionsForUser,
  getAllSubscriptions,
};
