import { eq, desc, and, isNotNull, count } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { user, inboxMessage } from '../db/schema.ts';
import telegramBot from './telegramBot.js';
import locales from './locales.js';

let io: any = null;

function init(socketio: any) {
  io = socketio;
}

function translate(key: any, params: any = {}) {
  const selectedLang: any = (locales as any)['ru'] || (locales as any)['en'];
  const keys = key.split('.');
  let value = selectedLang;
  for (const k of keys) value = value && value[k];
  return value ? (value as any).replace(/{(\w+)}/g, (_: any, v: any) => (params[v] !== undefined ? params[v] : `{${v}}`)) : key;
}

/**
 * Add a message to the user's inbox
 */
async function addMessage(userId: number, { type = 'system', titleKey = null, contentKey, contentParams = {} }: { type?: string; titleKey?: string | null; contentKey?: string; contentParams?: Record<string, any> }) {
  try {
    const paramsJson = JSON.stringify(contentParams);
    const created = await db
      .insert(inboxMessage)
      .values({
        user_id: userId,
        type,
        title_key: titleKey,
        content_key: contentKey,
        content_params: paramsJson
      })
      .returning();
    const messageId = created[0].id;

    if (io) {
      io.to(`user_${userId}`).emit('newInboxMessage', { id: messageId, type, titleKey, contentKey, contentParams });
    }

    const foundUser = await db.query.user.findFirst({
      where: { id: userId }
    });

    if (foundUser && foundUser.telegram_id) {
      const title = translate(titleKey || 'inbox.system_message');
      const content = translate(contentKey, contentParams);

      const extra = {};
      if (type === 'friend_request') {
        (extra as any).reply_markup = {
          inline_keyboard: [[
            { text: `✅ ${translate('inbox.btn_accept')}`, callback_data: `inbox_act_${messageId}_accept` },
            { text: `❌ ${translate('inbox.btn_decline')}`, callback_data: `inbox_act_${messageId}_decline` }
          ]]
        };
      } else if (type === 'login_alert') {
        (extra as any).reply_markup = {
          inline_keyboard: [[
            { text: `✅ ${translate('inbox.btn_it_was_me')}`, callback_data: `inbox_read_${messageId}` }
          ]]
        };
      }

      const sentMsg = await telegramBot.sendMessage(foundUser.telegram_id, `📩 *${title}*\n\n${content}`, extra) as { message_id: number } | null | undefined;
      if (sentMsg && sentMsg.message_id) {
        await db
          .update(inboxMessage)
          .set({ telegram_message_id: sentMsg.message_id })
          .where(eq(inboxMessage.id, messageId));
      }
    }

    return messageId;
  } catch (error) {
    console.error('[Inbox Service] Error adding message:', error);
  }
}

async function getMessages(userId: any, { page = 1, limit = 10 }: any = {}) {
  try {
    const offset = (page - 1) * limit;
    const [messages, totalRows] = await Promise.all([
      db
        .select()
        .from(inboxMessage)
        .where(eq(inboxMessage.user_id, userId))
        .orderBy(desc(inboxMessage.created_at))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(inboxMessage)
        .where(eq(inboxMessage.user_id, userId))
    ]);

    const total = totalRows[0]?.value ?? 0;

    return {
      messages: messages.map((m: any) => ({
        ...m,
        content_params:
          typeof m.content_params === 'string' ? JSON.parse(m.content_params) : (m.content_params || {})
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  } catch (error) {
    console.error('[Inbox Service] Error getting messages:', error);
    return { messages: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }
}

async function markAsRead(userId: any, messageId: any) {
  try {
    await db
      .update(inboxMessage)
      .set({ is_read: true })
      .where(and(eq(inboxMessage.id, messageId), eq(inboxMessage.user_id, userId)));
    return true;
  } catch (error) {
    console.error('[Inbox Service] Error marking as read:', error);
    return false;
  }
}

async function getUnreadCount(userId: any) {
  try {
    const rows = await db
      .select({ value: count() })
      .from(inboxMessage)
      .where(and(eq(inboxMessage.user_id, userId), eq(inboxMessage.is_read, false)));
    return rows[0]?.value ?? 0;
  } catch (error) {
    console.error('[Inbox Service] Error getting unread count:', error);
    return 0;
  }
}

async function deleteMessage(userId: any, messageId: any) {
  try {
    await db
      .delete(inboxMessage)
      .where(and(eq(inboxMessage.id, messageId), eq(inboxMessage.user_id, userId)));
    return true;
  } catch (error) {
    console.error('[Inbox Service] Error deleting message:', error);
    return false;
  }
}

async function broadcastMessage({ type = 'system', titleKey = null, contentKey, contentParams = {} }: { type?: string; titleKey?: string | null; contentKey?: string; contentParams?: Record<string, any> }) {
  try {
    const paramsJson = JSON.stringify(contentParams);

    // Insert message for ALL users
    const allUsers = await db.select({ id: user.id }).from(user);

    for (const u of allUsers) {
      await db.insert(inboxMessage).values({
        user_id: u.id,
        type,
        title_key: titleKey,
        content_key: contentKey,
        content_params: paramsJson
      });
    }

    if (io) {
      io.emit('newInboxMessage', { isBroadcast: true, type, titleKey, contentKey, contentParams });
    }

    try {
      const usersWithTelegram = await db
        .select({ telegram_id: user.telegram_id })
        .from(user)
        .where(isNotNull(user.telegram_id));

      if (usersWithTelegram.length > 0) {
        const title = translate(titleKey || 'inbox.system_message');
        const content = translate(contentKey, contentParams);
        const messageText = `📩 *${title}*\n\n${content}`;

        for (const u of usersWithTelegram) {
          if (!u.telegram_id) continue;
          telegramBot.sendMessage(u.telegram_id, messageText).catch((e) => {
            console.warn(`Failed to send Telegram broadcast to ${u.telegram_id}:`, e.message);
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

async function updateMessageParams(userId: any, messageId: any, contentParams: any) {
  try {
    await db
      .update(inboxMessage)
      .set({ content_params: JSON.stringify(contentParams) })
      .where(and(eq(inboxMessage.id, messageId), eq(inboxMessage.user_id, userId)));
    return true;
  } catch (error) {
    console.error('[Inbox Service] Error updating message params:', error);
    return false;
  }
}

export {
  init,
  addMessage,
  getMessages,
  getUnreadCount,
  markAsRead,
  updateMessageParams,
  deleteMessage,
  broadcastMessage
};

export default {
  init,
  addMessage,
  getMessages,
  getUnreadCount,
  markAsRead,
  updateMessageParams,
  deleteMessage,
  broadcastMessage
};
