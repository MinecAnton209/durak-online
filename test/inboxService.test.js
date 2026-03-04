/**
 * Integration tests for services/inboxService.js using real test SQLite DB.
 * 
 * inboxService imports telegramBot which tries to send messages to Telegram IDs.
 * We mock it so no real network calls happen.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import prisma from './prismaClient.js';

// Mock telegramBot BEFORE importing inboxService
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

const ts = Date.now();
let user1, user2;

beforeAll(async () => {
    init(null); // No socket.io needed for tests
    user1 = await prisma.user.create({ data: { username: `inbox_u1_${ts}`, password: 'hashed' } });
    user2 = await prisma.user.create({ data: { username: `inbox_u2_${ts}`, password: 'hashed' } });
});

afterAll(async () => {
    await prisma.inboxMessage.deleteMany({ where: { user_id: { in: [user1.id, user2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
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

        const msg = await prisma.inboxMessage.findUnique({ where: { id } });
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
        const noMsgUser = await prisma.user.create({ data: { username: `inbox_empty_${ts}`, password: 'hashed' } });
        const result = await getMessages(noMsgUser.id, { page: 1, limit: 10 });
        expect(result.messages.length).toBe(0);
        expect(result.pagination.total).toBe(0);
        await prisma.user.delete({ where: { id: noMsgUser.id } });
    });

    it('paginates correctly', async () => {
        // Add 5 messages for user2
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
        const msg = await prisma.inboxMessage.findUnique({ where: { id } });
        expect(msg.is_read).toBe(true);
    });
});

describe('deleteMessage', () => {
    it('removes the message', async () => {
        const id = await addMessage(user1.id, { contentKey: 'test.delete', contentParams: {} });
        await deleteMessage(user1.id, id);
        const msg = await prisma.inboxMessage.findFirst({ where: { id } });
        expect(msg).toBeNull();
    });
});

describe('broadcastMessage', () => {
    it('creates a message for every existing user', async () => {
        const userCount = await prisma.user.count();
        const beforeCount = await prisma.inboxMessage.count();
        await broadcastMessage({ contentKey: 'broadcast.test', contentParams: {} });
        const afterCount = await prisma.inboxMessage.count();
        expect(afterCount - beforeCount).toBe(userCount);
    });
});
