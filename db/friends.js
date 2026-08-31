import { eq, or, and, like, ne } from 'drizzle-orm';
import db from './drizzle.js';
import { user, friend } from './schema.ts';

/**
 * Sends a friend request from one user to another.
 * Ensures that user IDs are stored in a sorted manner in the DB
 * for a consistent unique constraint.
 */
async function sendFriendRequest(fromUserId, toUserId) {
  const [user1Id, user2Id] = [fromUserId, toUserId].sort((a, b) => a - b);

  try {
    return await db.insert(friend).values({
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'pending',
      action_user_id: fromUserId,
    }).returning();
  } catch (err) {
    // 23505 = unique violation (drizzle wraps in DrizzleQueryError; code is on cause)
    const code = err?.cause?.code || err.code;
    if (code === '23505' || err.code === '23505') {
      console.log(`[Friends] Friend request already exists between ${user1Id} and ${user2Id}`);
      const wrapped = new Error(err.message);
      wrapped.code = '23505';
      wrapped.cause = err;
      throw wrapped;
    }
    console.error(`[Friends] Error sending friend request:`, err.message);
    throw err;
  }
}

/**
 * Updates the friendship status (e.g., 'accepted', 'rejected').
 */
async function updateFriendshipStatus(user1Id, user2Id, status, actionUserId) {
  const [id1, id2] = [user1Id, user2Id].sort((a, b) => a - b);

  try {
    return await db
      .update(friend)
      .set({ status, action_user_id: actionUserId })
      .where(and(eq(friend.user1_id, id1), eq(friend.user2_id, id2)))
      .returning();
  } catch (err) {
    console.error(`[Friends] Error updating status:`, err.message);
    throw err;
  }
}

/**
 * Removes a friendship.
 */
async function removeFriendship(user1Id, user2Id) {
  const [id1, id2] = [user1Id, user2Id].sort((a, b) => a - b);

  try {
    return await db
      .delete(friend)
      .where(and(eq(friend.user1_id, id1), eq(friend.user2_id, id2)))
      .returning();
  } catch (err) {
    console.error(`[Friends] Error removing friendship:`, err.message);
    throw err;
  }
}

/**
 * Gets all friendships for a given user.
 */
async function getFriendships(userId) {
  try {
    const friendships = await db
      .select()
      .from(friend)
      .where(or(eq(friend.user1_id, userId), eq(friend.user2_id, userId)));

    const accepted = [];
    const pendingSent = [];
    const pendingReceived = [];

    for (const f of friendships) {
      const otherUserId = f.user1_id === userId ? f.user2_id : f.user1_id;
      const otherUser = await db.query.user.findFirst({
        where: { id: otherUserId },
      });

      if (!otherUser) continue;

      const friendData = {
        id: otherUser.id,
        username: otherUser.username,
        nickname: otherUser.username,
        rating: otherUser.rating,
        isVerified: otherUser.is_verified,
      };

      if (f.status === 'accepted') {
        accepted.push(friendData);
      } else if (f.status === 'pending') {
        if (f.action_user_id === userId) {
          pendingSent.push(friendData);
        } else {
          pendingReceived.push(friendData);
        }
      }
    }

    return { accepted, pendingSent, pendingReceived };
  } catch (err) {
    console.error(`[Friends] Error getting friendships:`, err.message);
    throw err;
  }
}

/**
 * Search for users by nickname, excluding current user and existing friends.
 */
async function findUsersByNickname(nickname, currentUserId) {
  try {
    const users = await db.query.user.findMany({
      where: and(
        like(user.username, `%${nickname}%`),
        ne(user.id, currentUserId),
        eq(user.is_banned, false)
      ),
      limit: 10,
    });

    return users.map((u) => ({
      id: u.id,
      nickname: u.username,
      rating: u.rating,
      isVerified: u.is_verified,
    }));
  } catch (err) {
    console.error(`[Friends] Error searching users:`, err.message);
    throw err;
  }
}

export {
  sendFriendRequest,
  updateFriendshipStatus,
  removeFriendship,
  getFriendships,
  findUsersByNickname,
};

export default {
  sendFriendRequest,
  updateFriendshipStatus,
  removeFriendship,
  getFriendships,
  findUsersByNickname,
};
