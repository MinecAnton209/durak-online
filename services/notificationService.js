const webpush = require('web-push');
const subscriptionsDB = require('../db/subscriptions.js');


async function sendNotification(userId, payload) {
    const subscription = await subscriptionsDB.findSubscriptionByUserId(userId);

    if (!subscription) {
        console.log(`[Push Service] No subscription found for user ${userId}.`);
        return false;
    }

    const notificationPayload = JSON.stringify(payload);

    try {
        await webpush.sendNotification(subscription, notificationPayload);
        console.log(`[Push Service] Notification successfully sent to user ${userId}.`);
        return true;
    } catch (error) {
        console.error(`[Push Service] Error sending notification to user ${userId}:`, error.statusCode, error.body);
        if (error.statusCode === 410) {
            await subscriptionsDB.deleteSubscription(userId);
            console.log(`[Push Service] Deleted expired subscription for user ${userId}.`);
        }
        return false;
    }
}


async function sendBroadcastNotification(payload) {
    const allSubs = await subscriptionsDB.getAllSubscriptions();
    let successCount = 0;
    let failureCount = 0;

    const notificationPayload = JSON.stringify(payload);

    const sendPromises = allSubs.map(async (subInfo) => {
        try {
            await webpush.sendNotification(subInfo.subscription, notificationPayload);
            successCount++;
        } catch (error) {
            failureCount++;
            if (error.statusCode === 410) {
                await subscriptionsDB.deleteSubscription(subInfo.userId);
            }
        }
    });

    await Promise.all(sendPromises);
    return { successCount, failureCount };
}

module.exports = {
    sendNotification,
    sendBroadcastNotification
};
