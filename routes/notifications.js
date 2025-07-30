const express = require('express');
const router = express.Router();
const subscriptionsDB = require('../db/subscriptions.js');

const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
    next();
};

router.use(isAuthenticated);

router.get('/vapid-public-key', (req, res) => {
    res.send(process.env.VAPID_PUBLIC_KEY);
});

router.post('/subscribe', async (req, res) => {
    const subscription = req.body;
    const userId = req.session.user.id;

    try {
        await subscriptionsDB.saveSubscription(userId, subscription);
        res.status(201).json({ success: true });
        console.log(`[Push Sub] User ${userId} subscribed successfully.`);
    } catch (error) {
        console.error('Failed to save subscription:', error);
        res.status(500).json({ success: false, error: 'Failed to save subscription' });
    }
});

router.post('/unsubscribe', async (req, res) => {
    const userId = req.session.user.id;

    try {
        await subscriptionsDB.deleteSubscription(userId);
        res.status(200).json({ success: true });
        console.log(`[Push Sub] User ${userId} unsubscribed successfully.`);
    } catch (error) {
        console.error('Failed to delete subscription:', error);
        res.status(500).json({ success: false, error: 'Failed to delete subscription' });
    }
});

module.exports = router;