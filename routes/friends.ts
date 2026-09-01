import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import friendsDB from '../db/friends.js';
import inboxService from '../services/inboxService.js';

const router = express.Router();

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
        return res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
    next();
};

router.use(isAuthenticated);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.session!.user!.id;
        const friendships = await friendsDB.getFriendships(userId);

        const onlineUsers = req.app.get('onlineUsers');
        if (onlineUsers && friendships.accepted) {
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

router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
    const { nickname } = req.query as { nickname?: string };
    if (!nickname || nickname.length < 2) {
        return res.status(400).json({ i18nKey: 'error_search_nickname_too_short' });
    }
    try {
        const users = await friendsDB.findUsersByNickname(nickname, req.session!.user!.id);
        res.json(users);
    } catch (error) {
        console.error("Error searching users:", error);
        next(error);
    }
});

router.post('/request', async (req: Request, res: Response, next: NextFunction) => {
    const { toUserId } = req.body as { toUserId: number };
    const fromUserId = req.session!.user!.id;

    if (!toUserId || fromUserId === toUserId) {
        return res.status(400).json({ i18nKey: 'error_invalid_user_id' });
    }

    try {
        await friendsDB.sendFriendRequest(fromUserId, toUserId);

        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');
        const userSocketId = onlineUsers?.get(toUserId);

        if (userSocketId) {
            io.to(userSocketId).emit('newFriendRequest', {
                from: {
                    id: req.session!.user!.id,
                    nickname: req.session!.user!.username
                }
            });
        }

        await inboxService.addMessage(toUserId, {
            type: 'friend_request',
            titleKey: 'inbox.friend_request_title',
            contentKey: 'inbox.friend_request_content',
            contentParams: {
                fromUserId: fromUserId,
                fromUsername: req.session!.user!.username
            }
        });

        res.status(201).json({ success: true, i18nKey: 'friends_request_sent' });
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({ i18nKey: 'error_friend_request_already_exists' });
        }
        console.error("Error sending friend request:", error);
        next(error);
    }
});

router.post('/accept', async (req: Request, res: Response, next: NextFunction) => {
    const { fromUserId } = req.body as { fromUserId: number };
    const toUserId = req.session!.user!.id;

    try {
        await friendsDB.updateFriendshipStatus(fromUserId, toUserId, 'accepted', toUserId);

        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');
        const userSocketId = onlineUsers?.get(fromUserId);

        if (userSocketId) {
            io.to(userSocketId).emit('friendRequestAccepted', {
                by: {
                    id: req.session!.user!.id,
                    nickname: req.session!.user!.username
                }
            });
        }

        res.json({ success: true, i18nKey: 'friends_request_accepted' });
    } catch (error) {
        console.error("Error accepting friend request:", error);
        next(error);
    }
});

router.delete('/remove', async (req: Request, res: Response, next: NextFunction) => {
    const { otherUserId } = req.body as { otherUserId: number };
    const currentUserId = req.session!.user!.id;

    try {
        await friendsDB.removeFriendship(currentUserId, otherUserId);

        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');
        const userSocketId = onlineUsers?.get(otherUserId);

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

export default router;
