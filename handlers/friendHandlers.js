const i18next = require('i18next');
const notificationService = require('../services/notificationService');
const inboxService = require('../services/inboxService');

module.exports = function registerFriendHandlers(io, socket, sharedContext) {
    const { games, onlineUsers } = sharedContext;

    socket.on('friend:invite', async ({ toUserId, gameId }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.id) {
            console.warn(`[Invites] Invite attempt from unauthenticated user. Socket: ${socket.id}`);
            return;
        }
        if (!toUserId || !gameId) {
            console.warn(`[Invites] Invalid invite from ${sessionUser.username}. Missing toUserId or gameId.`);
            return;
        }

        const game = games[gameId];
        if (!game) {
            console.warn(`[Invites] Invite sent to a non-existent game: ${gameId}.`);
            socket.emit('systemMessage', { i18nKey: 'error_invite_game_not_found', type: 'error' });
            return;
        }

        const targetUserId = parseInt(toUserId, 10);
        const friendSocketId = onlineUsers.get(targetUserId);

        if (friendSocketId) {
            const friendSocket = io.sockets.sockets.get(friendSocketId);
            if (friendSocket) {
                console.log(`[Invites] User ${sessionUser.username} invites user ID ${targetUserId} to game ${gameId}`);
                friendSocket.emit('friend:receiveInvite', {
                    fromUser: {
                        id: sessionUser.id,
                        username: sessionUser.username
                    },
                    gameId: gameId
                });
            }
        }

        try {
            const payload = {
                title: i18next.t('push_invite_title', { ns: 'translation' }),
                body: i18next.t('push_invite_body', { username: sessionUser.username, ns: 'translation' }),
                url: `/game/${gameId}`
            };

            await notificationService.sendNotification(targetUserId, payload);

            // Add to Inbox
            await inboxService.addMessage(targetUserId, {
                type: 'game_invite',
                titleKey: 'inbox.game_invite_title',
                contentKey: 'inbox.game_invite_content',
                contentParams: {
                    fromUserId: sessionUser.id,
                    fromUsername: sessionUser.username,
                    lobbyId: gameId
                }
            });
        } catch (error) {
            console.error(`[Invites] Failed to send push/inbox notification for user ${targetUserId}:`, error);
        }
    });
};
