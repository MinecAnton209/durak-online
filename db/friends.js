const prisma = require('./prisma');

/**
 * Sends a friend request from one user to another.
 * Ensures that user IDs are stored in a sorted manner in the DB
 * for a consistent unique constraint.
 */
async function sendFriendRequest(fromUserId, toUserId) {
    const [user1Id, user2Id] = [fromUserId, toUserId].sort((a, b) => a - b);

    try {
        return await prisma.friend.create({
            data: {
                user1_id: user1Id,
                user2_id: user2Id,
                status: 'pending',
                action_user_id: fromUserId
            }
        });
    } catch (err) {
        // P2002 = unique constraint violation
        if (err.code === 'P2002') {
            console.log(`[Friends] Friend request already exists between ${user1Id} and ${user2Id}`);
            throw err;
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
        return await prisma.friend.update({
            where: {
                user1_id_user2_id: {
                    user1_id: id1,
                    user2_id: id2
                }
            },
            data: {
                status,
                action_user_id: actionUserId
            }
        });
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
        return await prisma.friend.delete({
            where: {
                user1_id_user2_id: {
                    user1_id: id1,
                    user2_id: id2
                }
            }
        });
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
        const friendships = await prisma.friend.findMany({
            where: {
                OR: [
                    { user1_id: userId },
                    { user2_id: userId }
                ]
            }
        });

        const accepted = [];
        const pendingSent = [];
        const pendingReceived = [];

        for (const f of friendships) {
            const otherUserId = f.user1_id === userId ? f.user2_id : f.user1_id;
            const otherUser = await prisma.user.findUnique({
                where: { id: otherUserId },
                select: { id: true, username: true, rating: true, is_verified: true }
            });

            if (!otherUser) continue;

            const friendData = {
                id: otherUser.id,
                username: otherUser.username,
                nickname: otherUser.username, // Client might expect 'nickname'
                rating: otherUser.rating,
                isVerified: otherUser.is_verified
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
        const users = await prisma.user.findMany({
            where: {
                username: {
                    contains: nickname,
                    // mode: 'insensitive' // Optional if using PostgreSQL/etc.
                },
                id: { not: currentUserId },
                is_banned: false
            },
            select: { id: true, username: true, rating: true, is_verified: true },
            take: 10
        });

        // Optionally filter out those who are already friends/requested
        // For simplicity, we just return the users and let the client handle request status
        return users.map(u => ({
            id: u.id,
            nickname: u.username,
            rating: u.rating,
            isVerified: u.is_verified
        }));
    } catch (err) {
        console.error(`[Friends] Error searching users:`, err.message);
        throw err;
    }
}

module.exports = {
    sendFriendRequest,
    updateFriendshipStatus,
    removeFriendship,
    getFriendships,
    findUsersByNickname
};
