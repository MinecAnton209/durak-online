const express = require('express');
const router = express.Router();
const friendsDB = require('../db/friends.js');

const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
    next();
};

router.use(isAuthenticated);

router.get('/', async (req, res, next) => {
    try {
        const userId = req.session.user.id;
        const friendships = await friendsDB.getFriendships(userId);

        const onlineUsers = req.app.get('onlineUsers');

        if (friendships.accepted) {
            friendships.accepted.forEach(friend => {
                friend.isOnline = onlineUsers.has(friend.id);
            });
        }

        res.json(friendships);
    } catch (error) {
        console.error("Error getting friendships:", error);
        next(error);
    }
});

router.get('/search', async (req, res, next) => {
    const { nickname } = req.query;
    if (!nickname || nickname.length < 2) {
        return res.status(400).json({ i18nKey: 'error_search_nickname_too_short' });
    }
    try {
        const users = await friendsDB.findUsersByNickname(nickname, req.session.user.id);
        res.json(users);
    } catch (error) {
        console.error("Error searching users:", error);
        next(error);
    }
});

router.post('/request', async (req, res, next) => {
    const { toUserId } = req.body;
    const fromUserId = req.session.user.id;

    if (!toUserId || fromUserId === toUserId) {
        return res.status(400).json({ i18nKey: 'error_invalid_user_id' });
    }

    try {
        await friendsDB.sendFriendRequest(fromUserId, toUserId);

        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');
        const userSocketId = onlineUsers.get(toUserId);

        if (userSocketId) {
            io.to(userSocketId).emit('newFriendRequest', {
                from: {
                    id: req.session.user.id,
                    nickname: req.session.user.username
                }
            });
        }

        res.status(201).json({ success: true, i18nKey: 'friends_request_sent' });
    } catch (error) {
        if (error.code === '23505' || (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE'))) {
            return res.status(409).json({ i18nKey: 'error_friend_request_already_exists' });
        }
        console.error("Error sending friend request:", error);
        next(error);
    }
});

router.post('/accept', async (req, res, next) => {
    const { fromUserId } = req.body;
    const toUserId = req.session.user.id;

    try {
        await friendsDB.updateFriendshipStatus(fromUserId, toUserId, 'accepted', toUserId);

        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');
        const userSocketId = onlineUsers.get(fromUserId);

        if (userSocketId) {
            io.to(userSocketId).emit('friendRequestAccepted', {
                by: {
                    id: req.session.user.id,
                    nickname: req.session.user.username
                }
            });
        }

        res.json({ success: true, i18nKey: 'friends_request_accepted' });
    } catch (error) {
        console.error("Error accepting friend request:", error);
        next(error);
    }
});

router.delete('/remove', async (req, res, next) => {
    const { otherUserId } = req.body;
    const currentUserId = req.session.user.id;

    try {
        await friendsDB.removeFriendship(currentUserId, otherUserId);

        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');
        const userSocketId = onlineUsers.get(otherUserId);

        if (userSocketId) {
            io.to(userSocketId).emit('friendshipRemoved', {
                by: {
                    id: currentUserId
                }
            });
        }

        res.json({ success: true, i18nKey: 'friends_removed' });
    } catch (error) {
        console.error("Error removing friendship:", error);
        next(error);
    }
});

module.exports = router;