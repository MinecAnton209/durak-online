const express = require('express');
const router = express.Router();
const inboxService = require('../services/inboxService');
const friendsDB = require('../db/friends');

const isAuthenticated = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
    next();
};

router.use(isAuthenticated);

router.get('/unread/count', async (req, res) => {
    try {
        const userId = req.user.id;
        const count = await inboxService.getUnreadCount(userId);
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

router.get('/', async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await inboxService.getMessages(userId, { page, limit });
    res.json(result);
});

router.post('/:id/read', async (req, res) => {
    const userId = req.user.id;
    const messageId = req.params.id;

    const success = await inboxService.markAsRead(userId, messageId);
    res.json({ success });
});

router.delete('/:id', async (req, res) => {
    const userId = req.user.id;
    const messageId = req.params.id;

    const success = await inboxService.deleteMessage(userId, messageId);
    res.json({ success });
});

router.post('/:id/action', async (req, res) => {
    const userId = req.user.id;
    const messageId = req.params.id;
    const { action } = req.body;

    try {
        // Fetch message to get type and params
        const { messages } = await inboxService.getMessages(userId, { page: 1, limit: 1000 }); // Simple fetch for now
        const msg = messages.find(m => m.id == messageId);

        if (!msg) return res.status(404).json({ error: 'Message not found' });

        if (msg.type === 'friend_request') {
            const fromUserId = msg.content_params.fromUserId;
            if (action === 'accept') {
                await friendsDB.updateFriendshipStatus(fromUserId, userId, 'accepted', userId);
                const io = req.app.get('socketio');
                const onlineUsers = req.app.get('onlineUsers');
                const fromSocketId = onlineUsers.get(fromUserId);
                if (fromSocketId) {
                    io.to(fromSocketId).emit('friendRequestAccepted', {
                        by: { id: userId, nickname: req.user.username }
                    });
                }
            } else if (action === 'decline') {
                await friendsDB.removeFriendship(fromUserId, userId);
            }
        } else if (msg.type === 'login_alert') {
            const targetSessionId = msg.content_params.sessionId;
            const currentSessionId = req.user.sessionId;
            const db = require('../db');
            const dbGet = require('util').promisify(db.get.bind(db));

            if (targetSessionId === currentSessionId) {
                return res.status(403).json({ error: 'Cannot take action on current session' });
            }

            const currentSession = await dbGet('SELECT * FROM active_sessions WHERE id = ?', [currentSessionId]);
            const targetSession = await dbGet('SELECT * FROM active_sessions WHERE id = ?', [targetSessionId]);

            if (currentSession && targetSession) {
                const currentCreated = new Date(currentSession.created_at);
                const targetCreated = new Date(targetSession.created_at);
                if (currentCreated > targetCreated) {
                    return res.status(403).json({
                        error: 'Newer sessions cannot take actions on older ones.',
                        i18nKey: 'error_session_terminate_too_new'
                    });
                }
            }

            if (action === 'not_me' || action === 'terminate_legacy') {
                if (targetSessionId) {
                    const dbRun = require('util').promisify(db.run.bind(db));
                    try {
                        await dbRun('DELETE FROM active_sessions WHERE id = ?', [targetSessionId]);
                        msg.content_params.action_result = 'terminated';

                        const io = req.app.get('socketio');
                        if (io) {
                            io.to(`user_${userId}`).emit('sessionTerminated', { sessionId: targetSessionId });
                        }
                    } catch (err) {
                        console.error('[Inbox Action] Terminate fail:', err);
                    }
                }
            } else if (action === 'it_was_me') {
                msg.content_params.action_result = 'it_was_me';
            }

            await inboxService.updateMessageParams(userId, messageId, msg.content_params);
        }

        // Mark as read or delete after action
        await inboxService.markAsRead(userId, messageId);

        res.json({ success: true });
    } catch (error) {
        console.error('[Inbox Action] Error:', error);
        res.status(500).json({ error: 'Failed to perform action' });
    }
});

module.exports = router;
