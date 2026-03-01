const prisma = require('./prisma');

/**
 * Saves or updates a push subscription for a user.
 */
async function saveSubscription(userId, subscription) {
    const endpoint = subscription.endpoint;
    const keys = JSON.stringify(subscription.keys);

    try {
        return await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: {
                user_id: userId,
                keys,
                updated_at: new Date()
            },
            create: {
                user_id: userId,
                endpoint,
                keys
            }
        });
    } catch (err) {
        console.error(`[Push] Error saving subscription:`, err.message);
        throw err;
    }
}

/**
 * Deletes a push subscription by endpoint.
 */
async function deleteSubscription(endpoint) {
    try {
        return await prisma.pushSubscription.delete({
            where: { endpoint }
        });
    } catch (err) {
        console.error(`[Push] Error deleting subscription:`, err.message);
        throw err;
    }
}

/**
 * Retrieves all push subscriptions for a user.
 */
async function getSubscriptionsForUser(userId) {
    try {
        const rows = await prisma.pushSubscription.findMany({
            where: { user_id: userId }
        });

        return rows.map(s => ({
            endpoint: s.endpoint,
            keys: JSON.parse(s.keys)
        }));
    } catch (err) {
        console.error(`[Push] Error getting subscriptions:`, err.message);
        throw err;
    }
}

/**
 * Retrieves all subscriptions in the system.
 */
async function getAllSubscriptions() {
    try {
        const rows = await prisma.pushSubscription.findMany();

        return rows.map(s => ({
            endpoint: s.endpoint,
            keys: JSON.parse(s.keys)
        }));
    } catch (err) {
        console.error(`[Push] Error getting all subscriptions:`, err.message);
        throw err;
    }
}

module.exports = {
    saveSubscription,
    deleteSubscription,
    getSubscriptionsForUser,
    getAllSubscriptions
};
