/**
 * Integration tests for db/friends.js using real test SQLite DB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from './prismaClient.js';
import {
    sendFriendRequest,
    updateFriendshipStatus,
    removeFriendship,
    getFriendships,
    findUsersByNickname
} from '../db/friends.js';

let user1, user2, user3;

// Helper to clean all friendships for our 3 test users
async function cleanFriendships() {
    const ids = [user1.id, user2.id, user3.id];
    await prisma.friend.deleteMany({
        where: {
            OR: [
                { user1_id: { in: ids } },
                { user2_id: { in: ids } }
            ]
        }
    });
}

beforeAll(async () => {
    user1 = await prisma.user.create({ data: { username: `fr_u1_${Date.now()}`, password: 'hashed' } });
    user2 = await prisma.user.create({ data: { username: `fr_u2_${Date.now()}`, password: 'hashed' } });
    user3 = await prisma.user.create({ data: { username: `fr_u3_${Date.now()}`, password: 'hashed' } });
});

afterAll(async () => {
    await cleanFriendships();
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id, user3.id] } } });
});

beforeEach(async () => {
    await cleanFriendships();
});

// Pair IDs as they will be sorted/stored
function sortedPair(a, b) {
    return [a, b].sort((x, y) => x - y);
}

describe('sendFriendRequest', () => {
    it('creates a pending friendship with sorted IDs', async () => {
        await sendFriendRequest(user2.id, user1.id); // higher first → should be sorted
        const [lo, hi] = sortedPair(user1.id, user2.id);
        const record = await prisma.friend.findFirst({ where: { user1_id: lo, user2_id: hi } });
        expect(record).not.toBeNull();
        expect(record.status).toBe('pending');
        expect(record.action_user_id).toBe(user2.id); // action_user_id = the requester
    });

    it('throws P2002 on duplicate request', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await expect(sendFriendRequest(user1.id, user2.id)).rejects.toMatchObject({ code: 'P2002' });
    });
});

describe('updateFriendshipStatus', () => {
    it('changes status to accepted', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await updateFriendshipStatus(user1.id, user2.id, 'accepted', user2.id);
        const [lo, hi] = sortedPair(user1.id, user2.id);
        const record = await prisma.friend.findFirst({ where: { user1_id: lo, user2_id: hi } });
        expect(record.status).toBe('accepted');
    });
});

describe('removeFriendship', () => {
    it('deletes the friendship record', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await removeFriendship(user1.id, user2.id);
        const [lo, hi] = sortedPair(user1.id, user2.id);
        const record = await prisma.friend.findFirst({ where: { user1_id: lo, user2_id: hi } });
        expect(record).toBeNull();
    });
});

describe('getFriendships', () => {
    it('returns pendingSent and pendingReceived correctly', async () => {
        // user1 → user2: pending (user1 sent)
        await sendFriendRequest(user1.id, user2.id);
        // user3 → user1: pending (user3 sent, user1 received)
        await sendFriendRequest(user3.id, user1.id);

        const result = await getFriendships(user1.id);
        expect(result.accepted.length).toBe(0);

        // user1 sent to user2 → pendingSent for user1
        expect(result.pendingSent.some(u => u.id === user2.id)).toBe(true);
        // user3 sent to user1 → pendingReceived for user1
        expect(result.pendingReceived.some(u => u.id === user3.id)).toBe(true);
    });

    it('moves to accepted list after update', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await updateFriendshipStatus(user1.id, user2.id, 'accepted', user2.id);
        const result = await getFriendships(user1.id);
        expect(result.accepted.some(u => u.id === user2.id)).toBe(true);
        expect(result.pendingSent.length).toBe(0);
    });

    it('returns empty for user with no friendships', async () => {
        const result = await getFriendships(user3.id);
        expect(result.accepted).toEqual([]);
        expect(result.pendingSent).toEqual([]);
        expect(result.pendingReceived).toEqual([]);
    });
});

describe('findUsersByNickname', () => {
    it('finds users by partial nickname, excludes self', async () => {
        const prefix = user1.username.slice(0, 5); // 'fr_u1'
        // Search for 'fr_u' which should match all three, but exclude user1 (self)
        const results = await findUsersByNickname('fr_u', user1.id);
        const ids = results.map(u => u.id);
        expect(ids).not.toContain(user1.id);
        expect(ids).toContain(user2.id);
        expect(ids).toContain(user3.id);
    });

    it('returns empty for no match', async () => {
        const results = await findUsersByNickname('zzznomatch_xyz_987', user1.id);
        expect(results.length).toBe(0);
    });

    it('returned objects have id and nickname', async () => {
        const results = await findUsersByNickname('fr_u', user1.id);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]).toHaveProperty('id');
        expect(results[0]).toHaveProperty('nickname');
    });
});
