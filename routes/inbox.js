const express = require('express');
const router = express.Router();
const inboxService = require('../services/inboxService');
const friendsDB = require('../db/friends');
const prisma = require('../db/prisma');

const isAuthenticated = (req, res, next) => {
    if (!req.user) return res.status(401).json({ i18nKey: 'error_unauthorized' });
    next();
};

router.use(isAuthenticated);

router.get('/unread/count', async (req, res) => {
    try {
        const count = await inboxService.getUnreadCount(req.user.id);
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const result = await inboxService.getMessages(req.user.id, { page, limit });
    res.json(result);
});

router.post('/:id/read', async (req, res) => {
    const success = await inboxService.markAsRead(req.user.id, parseInt(req.params.id));
    res.json({ success });
});

router.delete('/:id', async (req, res) => {
    const success = await inboxService.deleteMessage(req.user.id, parseInt(req.params.id));
    res.json({ success });
});

router.post('/:id/action', async (req, res) => {
    const userId = req.user.id;
    const messageId = parseInt(req.params.id);
    const { action } = req.body;

    try {
        const { messages } = await inboxService.getMessages(userId, { page: 1, limit: 1000 });
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
                    io.to(fromSocketId).emit('friendRequestAccepted', { by: { id: userId, nickname: req.user.username } });
                }
            } else if (action === 'decline') {
                await friendsDB.removeFriendship(fromUserId, userId);
            }
        } else if (msg.type === 'login_alert') {
            const targetSessionId = msg.content_params.sessionId;
            const currentSessionId = req.user.sessionId;

            if (targetSessionId === currentSessionId) {
                return res.status(403).json({ error: 'Cannot take action on current session' });
            }

            const [currentSession, targetSession] = await Promise.all([
                prisma.activeSession.findUnique({ where: { id: currentSessionId } }),
                prisma.activeSession.findUnique({ where: { id: targetSessionId } })
            ]);

            if (currentSession && targetSession) {
                if (new Date(currentSession.created_at) > new Date(targetSession.created_at)) {
                    return res.status(403).json({ error: 'Newer sessions cannot take actions on older ones.', i18nKey: 'error_session_terminate_too_new' });
                }
            }

            if (action === 'not_me' || action === 'terminate_legacy') {
                if (targetSessionId) {
                    try {
                        await prisma.activeSession.delete({ where: { id: targetSessionId } });
                        msg.content_params.action_result = 'terminated';

                        const io = req.app.get('socketio');
                        if (io) io.to(`user_${userId}`).emit('sessionTerminated', { sessionId: targetSessionId });
                    } catch (err) {
                        console.error('[Inbox Action] Session terminate failed:', err);
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
