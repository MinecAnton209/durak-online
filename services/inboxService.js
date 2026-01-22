const db = require('../db');
const util = require('util');
const dbRun = util.promisify(db.run.bind(db));
const dbGet = util.promisify(db.get.bind(db));
const dbAll = util.promisify(db.all.bind(db));
const telegramBot = require('./telegramBot');

let io = null;

function init(socketio) {
    io = socketio;
}

/**
 * Add a message to the user's inbox
 * @param {number} userId - The local user ID
 * @param {object} message - { type, titleKey, contentKey, contentParams }
 */
async function addMessage(userId, { type = 'system', titleKey = null, contentKey, contentParams = {} }) {
    try {
        const paramsJson = JSON.stringify(contentParams);
        const result = await dbRun(
            `INSERT INTO inbox_messages (user_id, type, title_key, content_key, content_params) VALUES (?, ?, ?, ?, ?)`,
            [userId, type, titleKey, contentKey, paramsJson]
        );

        // Get the last inserted ID (SQLite vs PostgreSQL handling)
        let messageId;
        if (db.constructor.name === 'Pool' || db.pool) { // PostgreSQL
            const rows = await dbAll(`SELECT id FROM inbox_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId]);
            messageId = rows[0]?.id;
        } else { // SQLite
            const res = await dbGet(`SELECT last_insert_rowid() as id`);
            messageId = res.id;
        }

        // Notify via Socket.io if the user is online
        if (io) {
            io.to(`user_${userId}`).emit('newInboxMessage', { id: messageId, type, titleKey, contentKey, contentParams });
        }

        // Notify via Telegram if linked
        const user = await dbGet(`SELECT telegram_id, (SELECT username FROM users WHERE id = ?) as username FROM users WHERE id = ?`, [userId, userId]);
        if (user && user.telegram_id) {
            const lang = 'ru'; // Default to RU for now since we don't store user lang yet
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

            await telegramBot.sendMessage(user.telegram_id, `📩 *${title}*\n\n${content}`);
        }

        return messageId;
    } catch (error) {
        console.error('[Inbox Service] Error adding message:', error);
    }
}

async function getMessages(userId, { page = 1, limit = 10 } = {}) {
    try {
        const offset = (page - 1) * limit;
        const messages = await dbAll(
            `SELECT * FROM inbox_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const totalRows = await dbGet(`SELECT COUNT(*) as count FROM inbox_messages WHERE user_id = ?`, [userId]);
        const total = totalRows ? totalRows.count : 0;

        return {
            messages: messages.map(m => ({
                ...m,
                content_params: m.content_params ? JSON.parse(m.content_params) : {}
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error('[Inbox Service] Error getting messages:', error);
        return { messages: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
}

async function markAsRead(userId, messageId) {
    try {
        await dbRun(`UPDATE inbox_messages SET is_read = TRUE WHERE id = ? AND user_id = ?`, [messageId, userId]);
        return true;
    } catch (error) {
        console.error('[Inbox Service] Error marking as read:', error);
        return false;
    }
}

async function getUnreadCount(userId) {
    try {
        const result = await dbGet(`SELECT COUNT(*) as count FROM inbox_messages WHERE user_id = ? AND is_read = false`, [userId]);
        return result ? result.count : 0;
    } catch (error) {
        console.error('[Inbox Service] Error getting unread count:', error);
        return 0;
    }
}

async function deleteMessage(userId, messageId) {
    try {
        await dbRun(`DELETE FROM inbox_messages WHERE id = ? AND user_id = ?`, [messageId, userId]);
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
        await dbRun(
            `INSERT INTO inbox_messages (user_id, type, title_key, content_key, content_params) 
             SELECT id, ?, ?, ?, ? FROM users`,
            [type, titleKey, contentKey, paramsJson]
        );

        // Notify all connected clients to update their inbox
        if (io) {
            io.emit('newInboxMessage', {
                isBroadcast: true,
                type,
                titleKey,
                contentKey,
                contentParams
            });
        }

        // Notify via Telegram for users who have it linked
        // Optimizing by fetching only users with telegram_id
        try {
            const usersWithTelegram = await dbAll(`SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL`);

            if (usersWithTelegram && usersWithTelegram.length > 0) {
                const lang = 'ru'; // Default to RU for now
                const t = (key, params = {}) => {
                    const locales = require('./locales');
                    const selectedLang = locales[lang] || locales['en'];
                    // contentKey might be raw text sometimes if used internally, but here we assume keys
                    // actually if contentKey is not found, return it as is?
                    // The t function in addMessage implementation does this logic.
                    const keys = key.split('.');
                    let value = selectedLang;
                    for (const k of keys) value = value && value[k];
                    return value ? value.replace(/{(\w+)}/g, (_, v) => params[v] !== undefined ? params[v] : `{${v}}`) : key;
                };

                const title = t(titleKey || 'inbox.system_message');
                const content = t(contentKey, contentParams);
                const messageText = `📩 *${title}*\n\n${content}`;

                // Send in chunks to be nice to rate limits (basic implementation)
                // Telegram broadcast limits: ~30 msg/sec. Loop should be fine for <1000 users.
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
        const paramsJson = JSON.stringify(contentParams);
        await dbRun(
            `UPDATE inbox_messages SET content_params = ? WHERE id = ? AND user_id = ?`,
            [paramsJson, messageId, userId]
        );
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
