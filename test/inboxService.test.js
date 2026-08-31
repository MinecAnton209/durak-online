import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../services/telegramBot.js', () => ({
    sendMessage: vi.fn().mockResolvedValue(null),
    init: vi.fn(),
    stop: vi.fn()
}));

import {
    init,
    addMessage,
    getMessages,
    getUnreadCount,
    markAsRead,
    deleteMessage,
    broadcastMessage
} from '../services/inboxService.js';
import {
    createUser, deleteUser, deleteInboxMessages,
    findInboxMessage, countInboxMessages
} from './dbHelpers.js';

const ts = Date.now();
let user1, user2;

beforeAll(async () => {
    init(null);
    user1 = await createUser(`inbox_u1_${ts}`);
    user2 = await createUser(`inbox_u2_${ts}`);
});

afterAll(async () => {
    await deleteInboxMessages(user1.id);
    await deleteInboxMessages(user2.id);
    await deleteUser(user1.id);
    await deleteUser(user2.id);
});

describe('addMessage', () => {
    it('creates an inbox message and returns its id', async () => {
        const id = await addMessage(user1.id, {
            type: 'system',
            contentKey: 'inbox.welcome',
            contentParams: {}
        });
        expect(typeof id).toBe('number');
        expect(id).toBeGreaterThan(0);

        const msg = await findInboxMessage(id);
        expect(msg).not.toBeNull();
        expect(msg.type).toBe('system');
        expect(msg.is_read).toBe(false);
    });
});

describe('getMessages', () => {
    it('returns messages with pagination metadata', async () => {
        const result = await getMessages(user1.id, { page: 1, limit: 10 });
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.pagination).toHaveProperty('total');
        expect(result.pagination).toHaveProperty('totalPages');
        expect(result.pagination.page).toBe(1);
    });

    it('returns empty for user with no messages', async () => {
        const noMsgUser = await createUser(`inbox_empty_${ts}`);
        const result = await getMessages(noMsgUser.id, { page: 1, limit: 10 });
        expect(result.messages.length).toBe(0);
        expect(result.pagination.total).toBe(0);
        await deleteUser(noMsgUser.id);
    });

    it('paginates correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await addMessage(user2.id, { contentKey: `test.key.${i}`, contentParams: {} });
        }
        const page1 = await getMessages(user2.id, { page: 1, limit: 3 });
        const page2 = await getMessages(user2.id, { page: 2, limit: 3 });
        expect(page1.messages.length).toBe(3);
        expect(page1.pagination.totalPages).toBe(2);
        expect(page2.messages.length).toBeGreaterThanOrEqual(2);
    });

    it('content_params is parsed back to object', async () => {
        const id = await addMessage(user1.id, { contentKey: 'test.params', contentParams: { foo: 'bar' } });
        const result = await getMessages(user1.id, { page: 1, limit: 20 });
        const msg = result.messages.find(m => m.id === id);
        expect(msg).toBeDefined();
        expect(typeof msg.content_params).toBe('object');
    });
});

describe('getUnreadCount', () => {
    it('returns correct unread count', async () => {
        const count = await getUnreadCount(user1.id);
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThan(0);
    });
});

describe('markAsRead', () => {
    it('marks a specific message as read', async () => {
        const id = await addMessage(user1.id, { contentKey: 'test.read', contentParams: {} });
        await markAsRead(user1.id, id);
        const msg = await findInboxMessage(id);
        expect(msg.is_read).toBe(true);
    });
});

describe('deleteMessage', () => {
    it('removes the message', async () => {
        const id = await addMessage(user1.id, { contentKey: 'test.delete', contentParams: {} });
        await deleteMessage(user1.id, id);
        const msg = await findInboxMessage(id);
        expect(msg).toBeNull();
    });
});

describe('broadcastMessage', () => {
    it('creates a message for every existing user', async () => {
        const before = await countInboxMessages(user1.id);
        await broadcastMessage({ contentKey: 'broadcast.test', contentParams: {} });
        const after = await countInboxMessages(user1.id);
        expect(after - before).toBe(1);
    });
});
