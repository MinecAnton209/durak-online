import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import subscriptionsDB from '../db/subscriptions.js';

const router = express.Router();

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
        return res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
    next();
};

router.use(isAuthenticated);

router.post('/subscribe', async (req: Request, res: Response) => {
    const userId = req.session!.user!.id;
    const subscription = req.body;

    try {
        await subscriptionsDB.saveSubscription(userId, subscription);
        res.status(201).json({ success: true });
        console.log(`[Push Sub] User ${userId} subscribed successfully.`);
    } catch (error) {
        console.error('Failed to save subscription:', error);
        res.status(500).json({ success: false, error: 'Failed to save subscription' });
    }
});

router.post('/unsubscribe', async (req: Request, res: Response) => {
    const userId = req.session!.user!.id;

    try {
        const subs = await subscriptionsDB.getSubscriptionsForUser(userId);
        for (const sub of subs) {
            await subscriptionsDB.deleteSubscription(sub.endpoint);
        }
        res.status(200).json({ success: true });
        console.log(`[Push Sub] User ${userId} unsubscribed successfully.`);
    } catch (error) {
        console.error('Failed to delete subscription:', error);
        res.status(500).json({ success: false, error: 'Failed to delete subscription' });
    }
});

export default router;
