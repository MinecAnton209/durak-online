const db = require('./index');

async function saveSubscription(userId, subscriptionData) {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO push_subscriptions (user_id, subscription_data)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                subscription_data = excluded.subscription_data;
        `;

        const dataString = JSON.stringify(subscriptionData);

        db.run(query, [userId, dataString], (err) => {
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

            try {
                const data = typeof row.subscription_data === 'string'
                    ? JSON.parse(row.subscription_data)
                    : row.subscription_data;
                resolve(data);
            } catch (parseError) {
                console.error(`Error parsing subscription for user ${userId}:`, parseError);
                resolve(null);
            }
        });
    });
}

async function getAllSubscriptions() {
    return new Promise((resolve, reject) => {
        const query = `SELECT user_id, subscription_data FROM push_subscriptions;`;
        db.all(query, [], (err, rows) => {
            if (err) return reject(err);
            const results = rows.map(row => {
                try {
                    return {
                        userId: row.user_id,
                        subscription: typeof row.subscription_data === 'string'
                            ? JSON.parse(row.subscription_data)
                            : row.subscription_data
                    };
                } catch (e) {
                    return null;
                }
            }).filter(sub => sub !== null);
            resolve(results);
        });
    });
}

module.exports = {
    saveSubscription,
    deleteSubscription,
    findSubscriptionByUserId,
    getAllSubscriptions
};
