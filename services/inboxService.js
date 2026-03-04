const prisma = require('../db/prisma');
const telegramBot = require('./telegramBot');

let io = null;

function init(socketio) {
    io = socketio;
}

/**
 * Add a message to the user's inbox
 */
async function addMessage(userId, { type = 'system', titleKey = null, contentKey, contentParams = {} }) {
    try {
        const paramsJson = JSON.stringify(contentParams);
        const created = await prisma.inboxMessage.create({
            data: {
                user_id: userId,
                type,
                title_key: titleKey,
                content_key: contentKey,
                content_params: paramsJson
            }
        });
        const messageId = created.id;

        if (io) {
            io.to(`user_${userId}`).emit('newInboxMessage', { id: messageId, type, titleKey, contentKey, contentParams });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { telegram_id: true, username: true }
        });

        if (user && user.telegram_id) {
            const lang = 'ru';
            const t = (key, params = {}) => {
                const locales = require('./locales');
                const selectedLang = locales[lang] || locales['en'];
                const keys = key.split('.');
                let value = selectedLang;
                for (const k of keys) value = value && value[k];
                return value ? value.replace(/{(\w+)}/g, (_, v) => params[v] !== undefined ? params[v] : `{${v}}`) : key;
            };

            const title = t(titleKey || 'inbox.system_message');
            const content = t(contentKey, contentParams);

            const extra = {};
            if (type === 'friend_request') {
                extra.reply_markup = {
                    inline_keyboard: [[
                        { text: `✅ ${t('inbox.btn_accept')}`, callback_data: `inbox_act_${messageId}_accept` },
                        { text: `❌ ${t('inbox.btn_decline')}`, callback_data: `inbox_act_${messageId}_decline` }
                    ]]
                };
            } else if (type === 'login_alert') {
                extra.reply_markup = {
                    inline_keyboard: [[
                        { text: `✅ ${t('inbox.btn_it_was_me')}`, callback_data: `inbox_read_${messageId}` }
                    ]]
                };
            }

            const sentMsg = await telegramBot.sendMessage(user.telegram_id, `📩 *${title}*\n\n${content}`, extra);
            if (sentMsg && sentMsg.message_id) {
                await prisma.inboxMessage.update({
                    where: { id: messageId },
                    data: { telegram_message_id: sentMsg.message_id }
                });
            }
        }

        return messageId;
    } catch (error) {
        console.error('[Inbox Service] Error adding message:', error);
    }
}

async function getMessages(userId, { page = 1, limit = 10 } = {}) {
    try {
        const offset = (page - 1) * limit;
        const [messages, total] = await Promise.all([
            prisma.inboxMessage.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                skip: offset,
                take: limit
            }),
            prisma.inboxMessage.count({ where: { user_id: userId } })
        ]);

        return {
            messages: messages.map(m => ({
                ...m,
                content_params: typeof m.content_params === 'string' ? JSON.parse(m.content_params) : (m.content_params || {})
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    } catch (error) {
        console.error('[Inbox Service] Error getting messages:', error);
        return { messages: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
}

async function markAsRead(userId, messageId) {
    try {
        await prisma.inboxMessage.updateMany({
            where: { id: messageId, user_id: userId },
            data: { is_read: true }
        });
        return true;
    } catch (error) {
        console.error('[Inbox Service] Error marking as read:', error);
        return false;
    }
}

async function getUnreadCount(userId) {
    try {
        return await prisma.inboxMessage.count({ where: { user_id: userId, is_read: false } });
    } catch (error) {
        console.error('[Inbox Service] Error getting unread count:', error);
        return 0;
    }
}

async function deleteMessage(userId, messageId) {
    try {
        await prisma.inboxMessage.deleteMany({ where: { id: messageId, user_id: userId } });
        return true;
    } catch (error) {
        console.error('[Inbox Service] Error deleting message:', error);
        return false;
    }
}

async function broadcastMessage({ type = 'system', titleKey = null, contentKey, contentParams = {} }) {
    try {
        const paramsJson = JSON.stringify(contentParams);

        // Insert message for ALL users
        const allUsers = await prisma.user.findMany({ select: { id: true } });

        // Use sequential loop to avoid SQLite "Database is locked" errors
        for (const u of allUsers) {
            await prisma.inboxMessage.create({
                data: {
                    user_id: u.id,
                    type,
                    title_key: titleKey,
                    content_key: contentKey,
                    content_params: paramsJson
                }
            });
        }

        if (io) {
            io.emit('newInboxMessage', { isBroadcast: true, type, titleKey, contentKey, contentParams });
        }

        try {
            const usersWithTelegram = await prisma.user.findMany({
                where: { telegram_id: { not: null } },
                select: { telegram_id: true }
            });

            if (usersWithTelegram.length > 0) {
                const lang = 'ru';
                const t = (key, params = {}) => {
                    const locales = require('./locales');
                    const selectedLang = locales[lang] || locales['en'];
                    const keys = key.split('.');
                    let value = selectedLang;
                    for (const k of keys) value = value && value[k];
                    return value ? value.replace(/{(\w+)}/g, (_, v) => params[v] !== undefined ? params[v] : `{${v}}`) : key;
                };

                const title = t(titleKey || 'inbox.system_message');
                const content = t(contentKey, contentParams);
                const messageText = `📩 *${title}*\n\n${content}`;

                for (const user of usersWithTelegram) {
                    telegramBot.sendMessage(user.telegram_id, messageText).catch(e => {
                        console.warn(`Failed to send Telegram broadcast to ${user.telegram_id}:`, e.message);
                    });
                }
            }
        } catch (tgError) {
            console.error('[Inbox Service] Telegram broadcast error:', tgError);
        }

        return true;
    } catch (error) {
        console.error('[Inbox Service] Error broadcasting message:', error);
        return false;
    }
}

async function updateMessageParams(userId, messageId, contentParams) {
    try {
        await prisma.inboxMessage.updateMany({
            where: { id: messageId, user_id: userId },
            data: { content_params: JSON.stringify(contentParams) }
        });
        return true;
    } catch (error) {
        console.error('[Inbox Service] Error updating message params:', error);
        return false;
    }
}

module.exports = {
    init,
    addMessage,
    getMessages,
    getUnreadCount,
    markAsRead,
    updateMessageParams,
    deleteMessage,
    broadcastMessage
};
