const webpush = require('web-push');
const subscriptionsDB = require('../db/subscriptions.js');


async function sendNotification(userId, payload) {
    const subscription = await subscriptionsDB.findSubscriptionByUserId(userId);

    if (!subscription) {
        console.log(`[Push Service] Не знайдено підписки для користувача ${userId}.`);
        return false;
    }

    const notificationPayload = JSON.stringify(payload);

    try {
        await webpush.sendNotification(subscription, notificationPayload);
        console.log(`[Push Service] Сповіщення для користувача ${userId} успішно надіслано.`);
        return true;
    } catch (error) {
        console.error(`[Push Service] Помилка відправки сповіщення для user ${userId}:`, error.statusCode, error.body);
        if (error.statusCode === 410) {
            await subscriptionsDB.deleteSubscription(userId);
            console.log(`[Push Service] Застарілу підписку для користувача ${userId} видалено.`);
        }
        return false;
    }
}

module.exports = {
    sendNotification
};