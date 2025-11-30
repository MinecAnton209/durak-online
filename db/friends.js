const db = require('./index');

const getSortedUserIds = (userId1, userId2) => {
    return [userId1, userId2].sort((a, b) => a - b);
};

async function sendFriendRequest(fromUserId, toUserId) {
    return new Promise((resolve, reject) => {
        const checkSql = "SELECT is_banned FROM users WHERE id = ?";

        db.get(checkSql, [toUserId], (err, user) => {
            if (err) return reject(err);
            if (!user) return reject(new Error("User not found"));
            if (user.is_banned) return reject(new Error("Cannot add banned user"));

            const [user1_id, user2_id] = getSortedUserIds(fromUserId, toUserId);
            const query = `
                INSERT INTO friends (user1_id, user2_id, action_user_id, status)
                VALUES (?, ?, ?, 'pending');
            `;

            db.run(query, [user1_id, user2_id, fromUserId], function(err) {
                if (err) return reject(err);
                resolve({ success: true, id: this.lastID });
            });
        });
    });
}

async function updateFriendshipStatus(user1Id, user2Id, newStatus, actionUserId) {
    return new Promise((resolve, reject) => {
        const [user1_id, user2_id] = getSortedUserIds(user1Id, user2Id);
        const query = `
            UPDATE friends
            SET status = ?, action_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user1_id = ? AND user2_id = ? AND status = 'pending';
        `;
        db.run(query, [newStatus, actionUserId, user1_id, user2_id], function(err) {
            if (err) return reject(err);
            resolve({ success: true, changes: this.changes });
        });
    });
}

async function removeFriendship(user1Id, user2Id) {
    return new Promise((resolve, reject) => {
        const [user1_id, user2_id] = getSortedUserIds(user1Id, user2Id);
        const query = `DELETE FROM friends WHERE user1_id = ? AND user2_id = ?;`;
        db.run(query, [user1_id, user2_id], function(err) {
            if (err) return reject(err);
            resolve({ success: true });
        });
    });
}

async function getFriendships(userId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT
                f.status,
                f.action_user_id,
                CASE WHEN f.user1_id = ? THEN f.user2_id ELSE f.user1_id END AS friend_id,
                u.username,
                u.rating
            FROM friends f
                     JOIN users u ON u.id = (CASE WHEN f.user1_id = ? THEN f.user2_id ELSE f.user1_id END)
            WHERE (f.user1_id = ? OR f.user2_id = ?)
              AND (u.is_banned = 0 OR u.is_banned = FALSE);
        `;

        db.all(query, [userId, userId, userId, userId], (err, rows) => {
            if (err) return reject(err);

            const accepted = [];
            const incoming = [];
            const outgoing = [];

            for (const row of rows) {
                const friendData = {
                    id: row.friend_id,
                    nickname: row.username,
                    rating: row.rating,
                };
                if (row.status === 'accepted') accepted.push(friendData);
                else if (row.status === 'pending') {
                    if (row.action_user_id === userId) outgoing.push(friendData);
                    else incoming.push(friendData);
                }
            }
            resolve({ accepted, incoming, outgoing });
        });
    });
}

async function findUsersByNickname(searchTerm, currentUserId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT u.id, u.username AS nickname, u.rating
            FROM users u
                     LEFT JOIN friends f ON
                (f.user1_id = u.id AND f.user2_id = ?) OR (f.user1_id = ? AND f.user2_id = u.id)
            WHERE
                LOWER(u.username) LIKE LOWER(?)
              AND u.id != ?
                AND f.id IS NULL
                AND (u.is_banned = 0 OR u.is_banned = FALSE)
            LIMIT 10;
        `;

        db.all(query, [currentUserId, currentUserId, `%${searchTerm}%`, currentUserId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

module.exports = {
    sendFriendRequest,
    updateFriendshipStatus,
    removeFriendship,
    getFriendships,
    findUsersByNickname,
};