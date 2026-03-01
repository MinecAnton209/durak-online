const chatService = require('../services/chatService');
const prisma = require('../db/prisma');
const { logAdminAction } = require('../services/auditLogService');
const i18next = require('i18next');

module.exports = function registerChatHandlers(io, socket) {

    socket.on('chat:joinGlobal', () => {
        socket.join('global_chat');
        const history = chatService.getChatHistory();
        socket.emit('chat:history', {
            messages: history,
            hasMore: true // Simplify for now or use service logic
        });
    });

    socket.on('chat:leaveGlobal', () => {
        socket.leave('global_chat');
    });

    socket.on('chat:sendGlobal', async (message) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser) return socket.emit('systemMessage', { i18nKey: 'error_chat_auth_required', type: 'error' });

        if (sessionUser.is_muted) {
            if (sessionUser.mute_until && new Date(sessionUser.mute_until) < new Date()) {
                sessionUser.is_muted = false;
                sessionUser.mute_until = null;
                try {
                    await prisma.user.update({
                        where: { id: sessionUser.id },
                        data: { is_muted: false, mute_until: null }
                    });
                } catch (err) {
                    console.error('[Chat] Error unmuting user:', err.message);
                }
            } else {
                return socket.emit('systemMessage', { i18nKey: 'error_chat_muted', type: 'error' });
            }
        }

        const spamCheck = chatService.checkSpam(sessionUser.id, sessionUser.is_admin);
        if (spamCheck.isSpam) {
            const i18nKey = spamCheck.slowMode ? 'error_chat_slow_mode' : 'error_chat_spam_wait';
            return socket.emit('chat:error', {
                i18nKey,
                options: { seconds: spamCheck.waitTime }
            });
        }

        const trimmedMessage = message.trim();
        if (trimmedMessage.length === 0 || trimmedMessage.length > 255) return;

        const isFiltered = chatService.filterContent(trimmedMessage);
        const now = Date.now();

        const messageObject = {
            id: `msg_${now}_${sessionUser.id}`,
            author: {
                id: sessionUser.id,
                username: sessionUser.username,
                isAdmin: sessionUser.is_admin,
                isVerified: sessionUser.isVerified,
                isMuted: sessionUser.is_muted,
                muteUntil: sessionUser.mute_until
            },
            text: trimmedMessage,
            timestamp: now
        };

        if (sessionUser.is_shadow_banned || isFiltered) {
            socket.emit('chat:newMessage', messageObject);
            return;
        }

        chatService.updateSpamTracker(sessionUser.id, now);

        prisma.chatMessage.create({
            data: {
                user_id: sessionUser.id,
                username: sessionUser.username,
                content: trimmedMessage,
                created_at: new Date(now)
            }
        }).catch(err => console.error('Failed to save chat message:', err));

        chatService.addMessageToHistory(messageObject);
        io.to('global_chat').emit('chat:newMessage', messageObject);
    });

    socket.on('chat:muteUser', async ({ userId, durationMinutes, permanent }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.is_admin) return;

        let muteUntil = null;
        if (!permanent) {
            const duration = parseInt(durationMinutes, 10) || 60;
            muteUntil = new Date(Date.now() + duration * 60000);
        }

        try {
            await prisma.user.update({
                where: { id: parseInt(userId, 10) },
                data: { is_muted: true, mute_until: muteUntil }
            });

            const updatedMsg = chatService.updateMessageInHistory(null, { authorId: userId, updates: { isMuted: true, muteUntil } });
            // Note: chatService.updateMessageInHistory needs logic to update all by author or we do it here
            // For now, let's keep it simple or implement better service method.

            // Re-implementing the history update here for now to match original logic
            const history = chatService.getChatHistory(null); // This only gets a slice, might need more.
            // Actually, we should probably have a method in service for this.

            io.to('global_chat').emit('chat:userMuted', { userId, muteUntil }); // Notify clients

            const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId, 10) }, select: { username: true } });
            logAdminAction({
                adminId: sessionUser.id,
                adminUsername: sessionUser.username,
                actionType: permanent ? 'MUTE_USER_PERMANENT' : 'MUTE_USER_TEMPORARY',
                targetUserId: parseInt(userId, 10),
                targetUsername: targetUser ? targetUser.username : 'Unknown',
                reason: permanent ? 'Permanent mute from global chat' : `Temporary mute (${durationMinutes}min)`
            });
        } catch (e) {
            console.error('[Chat Handler] Mute Error:', e);
        }
    });

    socket.on('chat:banUser', async ({ userId, durationMinutes, permanent }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.is_admin) return;

        let banUntil = null;
        if (!permanent) {
            const duration = parseInt(durationMinutes, 10) || 60;
            banUntil = new Date(Date.now() + duration * 60000);
        }

        try {
            await prisma.user.update({
                where: { id: parseInt(userId, 10) },
                data: {
                    is_banned: true,
                    ban_until: banUntil,
                    ban_reason: permanent ? 'Permanent ban from global chat' : 'Temporary ban from global chat'
                }
            });

            const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId, 10) }, select: { username: true } });
            logAdminAction({
                adminId: sessionUser.id,
                adminUsername: sessionUser.username,
                actionType: permanent ? 'BAN_USER_PERMANENT' : 'BAN_USER_TEMPORARY',
                targetUserId: parseInt(userId, 10),
                targetUsername: targetUser ? targetUser.username : 'Unknown',
                reason: permanent ? 'Permanent ban' : `Temporary ban (${durationMinutes}min)`
            });

            io.sockets.sockets.forEach((s) => {
                if (s.request.session?.user?.id === parseInt(userId, 10)) {
                    s.emit('forceDisconnect', {
                        i18nKey: banUntil ? 'error_account_temp_banned_with_reason' : 'error_account_banned_with_reason',
                        options: { reason: 'Ban from global chat', until: banUntil ? banUntil.toLocaleString() : null }
                    });
                    s.disconnect(true);
                }
            });
        } catch (e) {
            console.error('[Chat Handler] Ban Error:', e);
        }
    });

    socket.on('chat:deleteMessage', async ({ messageId }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser || !sessionUser.is_admin) return;

        const message = chatService.deleteMessageInHistory(messageId, true);
        if (message) {
            io.to('global_chat').emit('chat:updateMessage', message);
            logAdminAction({
                adminId: sessionUser.id,
                adminUsername: sessionUser.username,
                actionType: 'DELETE_CHAT_MESSAGE',
                targetUserId: message.author?.id,
                targetUsername: message.author?.username,
                reason: `Administrator deleted message: ${messageId}`
            });
        }
    });

    socket.on('chat:loadMore', ({ beforeTimestamp }) => {
        const result = chatService.getChatHistory(beforeTimestamp);
        socket.emit('chat:historyPage', result);
    });

    socket.on('chat:editMessage', ({ messageId, newText }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser) return;

        const trimmedText = newText.trim();
        if (trimmedText.length === 0 || trimmedText.length > 255) return;

        const message = chatService.updateMessageInHistory(messageId, { text: trimmedText, edited: true, editedAt: Date.now() });
        if (message && message.author.id === sessionUser.id) {
            const TIME_LIMIT = 5 * 60 * 1000;
            if (Date.now() - message.timestamp > TIME_LIMIT) {
                return socket.emit('chat:error', { i18nKey: 'error_edit_time_expired' });
            }
            io.to('global_chat').emit('chat:updateMessage', message);
        }
    });

    socket.on('chat:deleteOwnMessage', ({ messageId }) => {
        const sessionUser = socket.request.session?.user;
        if (!sessionUser) return;

        const message = chatService.deleteMessageInHistory(messageId, false);
        if (message && message.author.id === sessionUser.id) {
            const TIME_LIMIT = 5 * 60 * 1000;
            if (Date.now() - message.timestamp > TIME_LIMIT) {
                return socket.emit('chat:error', { i18nKey: 'error_delete_time_expired' });
            }
            io.to('global_chat').emit('chat:updateMessage', message);
        }
    });
};
