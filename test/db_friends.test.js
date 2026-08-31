import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
    sendFriendRequest,
    updateFriendshipStatus,
    removeFriendship,
    getFriendships,
    findUsersByNickname
} from '../db/friends.js';
import {
    createUser, deleteUsers, deleteFriendshipsFor, findFriend
} from './dbHelpers.js';

let user1, user2, user3;

function sortedPair(a, b) {
    return [a, b].sort((x, y) => x - y);
}

beforeAll(async () => {
    user1 = await createUser(`fr_u1_${Date.now()}`);
    user2 = await createUser(`fr_u2_${Date.now()}`);
    user3 = await createUser(`fr_u3_${Date.now()}`);
});

afterAll(async () => {
    await deleteFriendshipsFor([user1.id, user2.id, user3.id]);
    await deleteUsers([user1.id, user2.id, user3.id]);
});

beforeEach(async () => {
    await deleteFriendshipsFor([user1.id, user2.id, user3.id]);
});

describe('sendFriendRequest', () => {
    it('creates a pending friendship with sorted IDs', async () => {
        await sendFriendRequest(user2.id, user1.id);
        const [lo, hi] = sortedPair(user1.id, user2.id);
        const record = await findFriend(lo, hi);
        expect(record).not.toBeNull();
        expect(record.status).toBe('pending');
        expect(record.action_user_id).toBe(user2.id);
    });

    it('throws 23505 on duplicate request', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await expect(sendFriendRequest(user1.id, user2.id)).rejects.toMatchObject({ code: '23505' });
    });
});

describe('updateFriendshipStatus', () => {
    it('changes status to accepted', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await updateFriendshipStatus(user1.id, user2.id, 'accepted', user2.id);
        const [lo, hi] = sortedPair(user1.id, user2.id);
        const record = await findFriend(lo, hi);
        expect(record.status).toBe('accepted');
    });
});

describe('removeFriendship', () => {
    it('deletes the friendship record', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await removeFriendship(user1.id, user2.id);
        const [lo, hi] = sortedPair(user1.id, user2.id);
        const record = await findFriend(lo, hi);
        expect(record).toBeNull();
    });
});

describe('getFriendships', () => {
    it('returns pendingSent and pendingReceived correctly', async () => {
        await sendFriendRequest(user1.id, user2.id);
        await sendFriendRequest(user3.id, user1.id);

        const result = await getFriendships(user1.id);
        expect(result.accepted.length).toBe(0);
        expect(result.pendingSent.some(u => u.id === user2.id)).toBe(true);
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
        const prefix = user1.username.slice(0, 5);
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
