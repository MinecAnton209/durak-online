const db = require('./index');

async function saveSubscription(userId, subscriptionData) {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO push_subscriptions (user_id, subscription_data)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                subscription_data = excluded.subscription_data;
        `;
        db.run(query, [userId, subscriptionData], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function deleteSubscription(userId) {
    return new Promise((resolve, reject) => {
        const query = `DELETE FROM push_subscriptions WHERE user_id = ?;`;
        db.run(query, [userId], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function findSubscriptionByUserId(userId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT subscription_data FROM push_subscriptions WHERE user_id = ?;`;
        db.get(query, [userId], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(null);

            const data = typeof row.subscription_data === 'string' 
                ? JSON.parse(row.subscription_data) 
                : row.subscription_data;
            
            resolve(data);
        });
    });
}

module.exports = {
    saveSubscription,
    deleteSubscription,
    findSubscriptionByUserId
};
