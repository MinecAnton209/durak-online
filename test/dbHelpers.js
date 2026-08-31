import { eq, and, inArray, sql, or } from 'drizzle-orm';
import db, { getDb } from '../db/drizzle.js';
import { user, achievement, userAchievement, systemStatsDaily, inboxMessage, pushSubscription, adminAuditLog, friend } from '../db/schema.ts';

export { inboxMessage };

export { db, eq, and, inArray, sql, getDb };

export async function createUser(username, extra = {}) {
    const [row] = await db.insert(user).values({ username, password: 'hashed', ...extra }).returning();
    return row;
}

export async function deleteUser(id) {
    await db.delete(user).where(eq(user.id, id));
}

export async function deleteUsers(ids) {
    await db.delete(user).where(inArray(user.id, ids));
}

export async function upsertAchievement(code, name_key = 'a', description_key = 'b', rarity = 'common') {
    await db.insert(achievement).values({ code, name_key, description_key, rarity })
        .onConflictDoUpdate({ target: achievement.code, set: { name_key, description_key, rarity } });
}

export async function deleteAchievement(code) {
    await db.delete(achievement).where(eq(achievement.code, code));
}

export async function findUserById(id) {
    return db.query.user.findFirst({ where: { id } });
}

export async function findUserAchievement(userId, code) {
    const rows = await db.select().from(userAchievement).where(and(eq(userAchievement.user_id, userId), eq(userAchievement.achievement_code, code)));
    return rows[0] || null;
}

export async function findInboxMessage(id) {
    const [row] = await db.select().from(inboxMessage).where(eq(inboxMessage.id, id)).limit(1);
    return row ?? null;
}

export async function findPushSubscriptionByUser(userId) {
    const [row] = await db.select().from(pushSubscription).where(eq(pushSubscription.user_id, userId)).limit(1);
    return row ?? null;
}

export async function findPushSubscriptionsByUser(userId) {
    return db.select().from(pushSubscription).where(eq(pushSubscription.user_id, userId));
}

export async function findPushSubscriptionByEndpoint(endpoint) {
    const [row] = await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)).limit(1);
    return row ?? null;
}

export async function countPushSubscriptionsByUser(userId) {
    const rows = await db.select({ value: sql`count(*)` }).from(pushSubscription).where(eq(pushSubscription.user_id, userId));
    return Number(rows[0]?.value ?? 0);
}

export async function findAdminAuditLog(adminId, actionType) {
    const [row] = await db.select().from(adminAuditLog).where(and(eq(adminAuditLog.admin_id, adminId), eq(adminAuditLog.action_type, actionType))).limit(1);
    return row ?? null;
}

export async function countAdminAuditLog(adminId) {
    const rows = await db.select({ value: sql`count(*)` }).from(adminAuditLog).where(eq(adminAuditLog.admin_id, adminId));
    return Number(rows[0]?.value ?? 0);
}

export async function findFriend(user1Id, user2Id) {
    const [lo, hi] = [user1Id, user2Id].sort((a, b) => a - b);
    const [row] = await db.select().from(friend).where(and(eq(friend.user1_id, lo), eq(friend.user2_id, hi))).limit(1);
    return row ?? null;
}

export async function findSystemStatsDaily(date) {
    const [row] = await db.select().from(systemStatsDaily).where(eq(systemStatsDaily.date, date)).limit(1);
    return row ?? null;
}

export async function deleteSystemStatsDaily(date) {
    await db.delete(systemStatsDaily).where(eq(systemStatsDaily.date, date));
}

export async function deleteUserAchievements(userId) {
    await db.delete(userAchievement).where(eq(userAchievement.user_id, userId));
}

export async function deleteInboxMessages(userId) {
    await db.delete(inboxMessage).where(eq(inboxMessage.user_id, userId));
}

export async function deletePushSubscriptions(ids) {
    await db.delete(pushSubscription).where(inArray(pushSubscription.user_id, ids));
}

export async function setUser(userId, data) {
    await db.update(user).set(data).where(eq(user.id, userId));
}

export async function rawUser(id) {
    const rows = await db.$client.unsafe(`SELECT id, rating FROM "User" WHERE id = $1`, [id]);
    return rows[0];
}

export async function countUsers() {
    const rows = await db.select({ value: sql`count(*)` }).from(user);
    return Number(rows[0]?.value ?? 0);
}

export async function countInboxMessages(userId) {
    const rows = await db.select({ value: sql`count(*)` }).from(inboxMessage).where(eq(inboxMessage.user_id, userId));
    return Number(rows[0]?.value ?? 0);
}

export async function createInboxMessage(userId, contentKey, contentParams = {}, type = 'system') {
    const [row] = await db.insert(inboxMessage).values({ user_id: userId, content_key: contentKey, content_params: JSON.stringify(contentParams), type }).returning();
    return row;
}

export async function setDailyStats(date, data) {
    await db.insert(systemStatsDaily).values({ date, ...data })
        .onConflictDoUpdate({ target: systemStatsDaily.date, set: data });
}

export async function addAchievementForUser(userId, code) {
    const [row] = await db.insert(userAchievement).values({ user_id: userId, achievement_code: code }).returning();
    return row;
}

export async function deleteFriendshipsFor(ids) {
    await db.delete(friend).where(
        or(
            inArray(friend.user1_id, ids),
            inArray(friend.user2_id, ids)
        )
    );
}
