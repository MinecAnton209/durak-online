import i18next from 'i18next';
import notificationService from '../services/notificationService.js';
import inboxService from '../services/inboxService.js';

export default function registerFriendHandlers(io: any, socket: any, sharedContext: any) {
    const { games, onlineUsers } = sharedContext;

    socket.on('friend:invite', async ({ toUserId, gameId }: any) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.id) {
            console.warn(`[Invites] Invite attempt from unauthenticated user. Socket: ${socket.id}`);
            return;
        }
        if (!toUserId || !gameId) {
            console.warn(`[Invites] Invalid invite from ${sessionUser.username}. Missing toUserId or gameId.`);
            return;
        }

        const game: any = (games as Record<string, any>)[gameId];
        if (!game) {
            console.warn(`[Invites] Invite sent to a non-existent game: ${gameId}.`);
            socket.emit('systemMessage', { i18nKey: 'error_invite_game_not_found', type: 'error' });
            return;
        }

        const targetUserId = parseInt(toUserId, 10) as number;
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

            await inboxService.addMessage(targetUserId, {
                type: 'game_invite',
                titleKey: 'inbox.game_invite_title',
                contentKey: 'inbox.game_invite_content',
                contentParams: {
                    fromUserId: sessionUser.id,
                    fromUsername: sessionUser.username,
                    lobbyId: gameId
                }
            } as any);
        } catch (error) {
            console.error(`[Invites] Failed to send push/inbox notification for user ${targetUserId}:`, error);
        }
    });
};
